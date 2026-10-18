import React, { useRef, useState } from 'react';
import { IonIcon } from '@ionic/react';
import {
  layersOutline, reorderThreeOutline, bulbOutline, buildOutline, briefcaseOutline, albumsOutline,
  resizeOutline, checkmarkCircle, alertCircle, addOutline, chevronForwardOutline, calculatorOutline,
} from 'ionicons/icons';
import { Room } from '../types';
import { roomDiagonals, diagonalCm } from '../lib/diagonals';
import { countRealCorners } from '../lib/geometry';
import { calcRoomClientPrice } from '../lib/pricing';
import { useT } from '../lib/i18n';

export type SheetSection = 'diagonals' | 'fabric' | 'profile' | 'lighting' | 'niche' | 'accessories' | 'services';

// ok — filled in; need — required and still missing; add — optional and empty;
// none — nothing to do here (e.g. diagonals of a triangle)
type Status = 'ok' | 'need' | 'add' | 'none';

interface Row {
  section: SheetSection;
  icon: string;
  color: string;
  title: string;
  short: string;
  sub: string;
  status: Status;
}

const EXPANDED_KEY = 'room_sheet_expanded';
const SWIPE_PX = 25;

const readExpanded = () => {
  try { return localStorage.getItem(EXPANDED_KEY) === '1'; } catch { return false; }
};

interface Props {
  room: Room;
  onOpenSection: (section: SheetSection) => void;
  onOpenEstimate: () => void;
}

const RoomSheet: React.FC<Props> = ({ room, onOpenSection, onOpenEstimate }) => {
  const { t } = useT();
  const [expanded, setExpandedState] = useState(readExpanded);
  const touchY = useRef<number | null>(null);

  const setExpanded = (v: boolean) => {
    setExpandedState(v);
    try { localStorage.setItem(EXPANDED_KEY, v ? '1' : '0'); } catch { /* storage unavailable */ }
  };

  const drawn = room.areaSqm > 0;
  const pts = room.points;

  // ── Diagonals ──
  const diags = drawn ? roomDiagonals(pts) : [];
  const diagText = diags
    .slice(0, 2)
    .map(d => `${d.label} ${diagonalCm(pts, d.i, d.j)} см`)
    .join(' · ') + (diags.length > 2 ? ' …' : '');

  // ── Profiles ──
  const segs = room.profileSegments ?? [];
  const wallsWithoutProfile = drawn ? pts.filter((_, i) => !segs.some(s => s.edgeIndex === i)).length : 0;
  const profileLen = segs.reduce((s, seg) => s + seg.lengthM, 0);

  const lightingCount = (room.lighting ?? []).length;
  const nicheCount = (room.selectedNiches ?? []).reduce((s, n) => s + (n.kind === 'count' ? n.quantity : 1), 0);
  const accCount = (room.selectedAccessories ?? []).length;
  const svcCount = (room.selectedServices ?? []).length;

  const rows: Row[] = [
    {
      section: 'diagonals', icon: resizeOutline, color: '#F9A825',
      title: t('sec.diagonals'), short: t('mat.tabDiag'),
      sub: !drawn ? '—' : diags.length === 0 ? t('rs.diagNone') : diagText,
      status: diags.length === 0 ? 'none' : 'ok',
    },
    {
      section: 'fabric', icon: layersOutline, color: '#1E88E5',
      title: t('sec.fabric'), short: t('mat.tabFabric'),
      sub: room.fabric ? room.fabric.title : t('rs.notSelected'),
      status: room.fabric ? 'ok' : 'need',
    },
    {
      section: 'profile', icon: reorderThreeOutline, color: '#8E24AA',
      title: t('sec.profile'), short: t('mat.tabProfile'),
      sub: !drawn ? '—'
        : segs.length === 0 ? t('rs.notSelected')
        : wallsWithoutProfile > 0 ? t('rs.noProfileWalls', { n: wallsWithoutProfile })
        : t('rs.walls', { n: segs.length, m: profileLen.toFixed(2) }),
      status: !drawn ? 'none' : wallsWithoutProfile > 0 ? 'need' : 'ok',
    },
    {
      section: 'lighting', icon: bulbOutline, color: '#F9A825',
      title: t('sec.lighting'), short: t('mat.tabLight'),
      sub: lightingCount ? t('rs.pcs', { n: lightingCount }) : t('rs.notAdded'),
      status: lightingCount ? 'ok' : 'add',
    },
    {
      section: 'niche', icon: albumsOutline, color: '#00838F',
      title: t('sec.niches'), short: t('mat.tabNiche'),
      sub: nicheCount ? t('rs.pcs', { n: nicheCount }) : t('rs.notAdded'),
      status: nicheCount ? 'ok' : 'add',
    },
    {
      section: 'accessories', icon: buildOutline, color: '#2E7D32',
      title: t('sec.accessories'), short: t('mat.tabAccess'),
      sub: accCount ? t('rs.positions', { n: accCount }) : t('rs.notAdded'),
      status: accCount ? 'ok' : 'add',
    },
    {
      section: 'services', icon: briefcaseOutline, color: '#C62828',
      title: t('sec.services'), short: t('mat.tabServices'),
      sub: svcCount ? t('rs.positions', { n: svcCount }) : t('rs.notAdded'),
      status: svcCount ? 'ok' : 'add',
    },
  ];

  const missing = rows.filter(r => r.status === 'need').map(r => r.title.toLowerCase());
  const total = calcRoomClientPrice(room);
  const totalText = `≈ ${Math.round(total).toLocaleString('ru')} ₽`;

  const hint = !drawn
    ? { text: t('rs.drawFirst'), color: 'rgba(255,255,255,0.45)' }
    : missing.length > 0
      ? { text: t('rs.left', { list: missing.join(', ') }), color: '#ff6b66' }
      : { text: t('rs.allSet'), color: '#2dd36f' };

  // Swipe up/down on the grab area toggles the sheet; a plain tap toggles too.
  const grabHandlers = {
    onTouchStart: (e: React.TouchEvent) => { touchY.current = e.touches[0].clientY; },
    onTouchEnd: (e: React.TouchEvent) => {
      if (touchY.current == null) return;
      const dy = e.changedTouches[0].clientY - touchY.current;
      touchY.current = null;
      if (dy < -SWIPE_PX) setExpanded(true);
      else if (dy > SWIPE_PX) setExpanded(false);
    },
    onClick: () => setExpanded(!expanded),
  };

  const summary = (
    <div {...grabHandlers} style={{ cursor: 'pointer' }}>
      <div style={{ display: 'flex', justifyContent: 'center', padding: '9px 0 3px' }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 16px 10px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {drawn && (
            <div style={{ fontSize: 17, fontWeight: 700, color: '#fff' }}>
              {room.areaSqm.toFixed(2)} м²
              <span style={{ fontSize: 13, fontWeight: 400, color: 'rgba(255,255,255,0.45)' }}>
                {' '}· {room.perimeterM.toFixed(2)} м · {t('re.corners')}: {countRealCorners(pts)}
              </span>
            </div>
          )}
          <div style={{
            fontSize: 12, marginTop: drawn ? 3 : 0, color: hint.color,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {hint.text}
          </div>
        </div>
        <button
          onClick={e => { e.stopPropagation(); onOpenEstimate(); }}
          style={{
            flexShrink: 0, border: 'none', cursor: 'pointer',
            background: '#1E88E5', color: '#fff', borderRadius: 14,
            padding: '8px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center',
            lineHeight: 1.15,
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.8 }}>{t('rs.estimate')}</span>
          <span style={{ fontSize: 15, fontWeight: 800 }}>{totalText}</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* ── Collapsed: summary + one icon per section ── */}
      <div style={{
        position: 'relative', zIndex: 2, flexShrink: 0,
        marginTop: -18,
        background: '#16182a',
        borderRadius: '20px 20px 0 0',
        boxShadow: '0 -8px 30px rgba(0,0,0,0.5)',
        paddingBottom: 'max(14px, env(safe-area-inset-bottom, 14px))',
      }}>
        {summary}
        <div style={{ display: 'flex', padding: '0 6px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          {rows.map(r => (
            <button
              key={r.section}
              onClick={() => onOpenSection(r.section)}
              style={{
                flex: 1, minWidth: 0, position: 'relative',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                padding: '10px 0 0', border: 'none', background: 'none', cursor: 'pointer',
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: `${r.color}26`, color: r.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: r.status === 'need' ? '0 0 0 1.5px #ff6b66' : undefined,
              }}>
                <IonIcon icon={r.icon} style={{ fontSize: 21, display: 'block' }} />
              </div>
              <StatusDot status={r.status} />
              <span style={{
                fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap',
                maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis',
                color: r.status === 'ok' || r.status === 'need' ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.4)',
              }}>
                {r.short}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Expanded: full list over the drawing ── */}
      {expanded && (
        <div
          onClick={() => setExpanded(false)}
          style={{ position: 'absolute', inset: 0, zIndex: 3, background: 'rgba(0,0,0,0.45)' }}
        />
      )}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 4,
        maxHeight: '85%', overflowY: 'auto',
        background: '#16182a',
        borderRadius: '20px 20px 0 0',
        boxShadow: '0 -8px 30px rgba(0,0,0,0.5)',
        transform: expanded ? 'translateY(0)' : 'translateY(105%)',
        transition: 'transform 0.25s ease',
        pointerEvents: expanded ? 'auto' : 'none',
        paddingBottom: 'max(14px, env(safe-area-inset-bottom, 14px))',
      }}>
        {summary}
        {rows.map(r => (
          <button
            key={r.section}
            onClick={() => onOpenSection(r.section)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, width: '100%',
              padding: '9px 16px', border: 'none', cursor: 'pointer', textAlign: 'left',
              background: 'none', borderTop: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: `${r.color}26`, color: r.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <IonIcon icon={r.icon} style={{ fontSize: 20, display: 'block' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{r.title}</div>
              <div style={{
                fontSize: 12, marginTop: 2, color: 'rgba(255,255,255,0.45)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {r.sub}
              </div>
            </div>
            {r.status === 'ok' && (
              <IonIcon icon={checkmarkCircle} style={{ fontSize: 20, color: '#2dd36f', flexShrink: 0 }} />
            )}
            {r.status === 'need' && (
              <span style={{
                flexShrink: 0, fontSize: 12, fontWeight: 700, color: '#ff6b66',
                background: 'rgba(229,57,53,0.14)', borderRadius: 999, padding: '4px 10px',
              }}>
                {t('rs.choose')}
              </span>
            )}
            {r.status === 'add' && (
              <div style={{
                width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <IonIcon icon={addOutline} style={{ fontSize: 18 }} />
              </div>
            )}
            <IonIcon icon={chevronForwardOutline} style={{ fontSize: 16, color: 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
          </button>
        ))}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 16px 4px', borderTop: '1px solid rgba(255,255,255,0.07)',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {t('rs.total')}
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{totalText}</div>
          </div>
          <button
            onClick={onOpenEstimate}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: '#1E88E5', color: '#fff', border: 'none', borderRadius: 14,
              padding: '11px 18px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
            }}
          >
            <IonIcon icon={calculatorOutline} style={{ fontSize: 18 }} />
            {t('rs.estimate')}
          </button>
        </div>
      </div>
    </>
  );
};

const StatusDot: React.FC<{ status: Status }> = ({ status }) => {
  if (status !== 'ok' && status !== 'need') return null;
  return (
    <IonIcon
      icon={status === 'ok' ? checkmarkCircle : alertCircle}
      style={{
        position: 'absolute', top: 5, left: '50%', marginLeft: 11,
        fontSize: 16, borderRadius: '50%', background: '#16182a',
        color: status === 'ok' ? '#2dd36f' : '#ff6b66',
      }}
    />
  );
};

export default RoomSheet;
