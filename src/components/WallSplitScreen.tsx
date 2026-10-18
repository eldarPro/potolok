import React, { useState } from 'react';
import { IonIcon } from '@ionic/react';
import { chevronBackOutline, cutOutline } from 'ionicons/icons';
import { CatalogItem } from '../types';
import { Point, edgeLengthCm, pointOnArc, vertexLabels } from '../lib/geometry';
import { useT } from '../lib/i18n';
import RoomPreview from './RoomPreview';

interface Props {
  points: Point[];
  edgeIndex: number;
  profiles: CatalogItem[];
  current: CatalogItem | null;
  wallColors: (string | null)[];
  onCancel: () => void;
  onSplit: (distCm: number, first: CatalogItem | null, second: CatalogItem | null) => void;
}

const fieldStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4, height: 40, padding: '0 10px',
  borderRadius: 10, border: '1.5px solid rgba(0,0,0,0.15)', background: '#fff',
};
const inputStyle: React.CSSProperties = {
  width: '100%', minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
  fontSize: 16, fontWeight: 700, color: 'inherit',
};

/** Full-screen step for splitting a wall: drag or type the split point, pick a profile per part. */
const WallSplitScreen: React.FC<Props> = ({ points, edgeIndex, profiles, current, wallColors, onCancel, onSplit }) => {
  const { t } = useT();
  const n = points.length;
  const a = points[edgeIndex], b = points[(edgeIndex + 1) % n];
  const labels = vertexLabels(points);
  const la = labels[edgeIndex], lb = labels[(edgeIndex + 1) % n];
  const totalCm = Math.round(edgeLengthCm(points, edgeIndex));

  const [fromRaw, setFromRaw] = useState(String(Math.round(totalCm / 2)));
  const [toRaw, setToRaw] = useState(String(totalCm - Math.round(totalCm / 2)));
  const [firstId, setFirstId] = useState(current?.id ?? '');
  const [secondId, setSecondId] = useState(current?.id ?? '');

  const fromCm = Math.round(parseFloat(fromRaw));
  const valid = fromCm > 0 && fromCm < totalCm;
  const t01 = valid ? fromCm / totalCm : 0.5;
  const marker = pointOnArc(a, b, a.bulge, t01);

  // The two fields always add up to the wall: editing one rewrites the other.
  const setFrom = (raw: string) => {
    setFromRaw(raw);
    const v = Math.round(parseFloat(raw));
    if (v > 0 && v < totalCm) setToRaw(String(totalCm - v));
  };
  const setTo = (raw: string) => {
    setToRaw(raw);
    const v = Math.round(parseFloat(raw));
    if (v > 0 && v < totalCm) setFromRaw(String(totalCm - v));
  };

  const byId = (id: string) => profiles.find(p => p.id === id) ?? null;
  const colorOf = (id: string) => byId(id)?.color ?? '#ff6b66';

  const profileSelect = (value: string, onChange: (id: string) => void) => (
    <div style={{ ...fieldStyle, background: '#f2f3f7', border: 'none' }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, flexShrink: 0, background: colorOf(value), border: '1px solid rgba(0,0,0,0.15)' }} />
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ ...inputStyle, fontSize: 13, fontWeight: 600, appearance: 'auto' }}
      >
        <option value="">{t('split.none')}</option>
        {profiles.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
      </select>
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: '#f4f5f8', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        height: 56, flexShrink: 0, background: '#fff', borderBottom: '1px solid #e3e5ea',
        display: 'flex', alignItems: 'center', padding: '0 4px',
        paddingTop: 'env(safe-area-inset-top, 0px)', boxSizing: 'content-box',
      }}>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', padding: 10, cursor: 'pointer', color: 'inherit' }}>
          <IonIcon icon={chevronBackOutline} style={{ fontSize: 26, display: 'block' }} />
        </button>
        <div style={{ fontSize: 20, fontWeight: 500, paddingLeft: 12 }}>
          {t('mat.splitWall')} {la}–{lb}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 24px' }}>
        <RoomPreview points={points} wallColors={wallColors} selectedWall={edgeIndex} marker={marker} />

        <div className="card" style={{ marginTop: 12, padding: 14 }}>
          <div style={{ fontSize: 12, color: '#888' }}>{t('mat.wall')} {la}–{lb} · {totalCm} см</div>

          {/* The wall as a bar: part 1 | part 2, drag the knob */}
          <div style={{ position: 'relative', margin: '14px 2px 4px' }}>
            <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.2)' }}>
              <div style={{ width: `${t01 * 100}%`, background: colorOf(firstId), borderRight: '2px solid #fff' }} />
              <div style={{ flex: 1, background: colorOf(secondId) }} />
            </div>
            <input
              type="range" min={1} max={totalCm - 1} step={1}
              value={valid ? fromCm : Math.round(totalCm / 2)}
              onChange={e => setFrom(e.target.value)}
              style={{ position: 'absolute', left: 0, right: 0, top: -9, width: '100%', margin: 0, accentColor: '#F9A825' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, marginTop: 6 }}>
              <span>{la}</span><span>{lb}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            {[
              { label: t('split.from', { p: la }), raw: fromRaw, set: setFrom },
              { label: t('split.to', { p: lb }), raw: toRaw, set: setTo },
            ].map(f => (
              <div key={f.label} style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>{f.label}</div>
                <div style={{ ...fieldStyle, borderColor: valid ? 'rgba(0,0,0,0.15)' : '#E53935' }}>
                  <input
                    type="number" inputMode="numeric" min="1" step="1"
                    value={f.raw}
                    onChange={e => f.set(e.target.value)}
                    onFocus={e => e.target.select()}
                    style={inputStyle}
                  />
                  <span style={{ fontSize: 13, color: '#888' }}>{t('re.cm')}</span>
                </div>
              </div>
            ))}
          </div>

          {profiles.length > 0 && (
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>{t('split.part', { n: 1 })}</div>
                {profileSelect(firstId, setFirstId)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>{t('split.part', { n: 2 })}</div>
                {profileSelect(secondId, setSecondId)}
              </div>
            </div>
          )}
        </div>

        <button
          disabled={!valid}
          onClick={() => onSplit(fromCm, byId(firstId), byId(secondId))}
          style={{
            width: '100%', marginTop: 16, padding: '14px 16px', borderRadius: 14, border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            fontSize: 15, fontWeight: 700,
            background: valid ? '#F9A825' : 'rgba(0,0,0,0.08)',
            color: valid ? '#000' : 'rgba(0,0,0,0.3)',
            cursor: valid ? 'pointer' : 'default',
          }}
        >
          <IonIcon icon={cutOutline} style={{ fontSize: 18 }} />
          {t('mat.split')}
        </button>
      </div>
    </div>
  );
};

export default WallSplitScreen;
