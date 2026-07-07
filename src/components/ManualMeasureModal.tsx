import React, { useState } from 'react';
import { IonIcon } from '@ionic/react';
import { closeOutline, keypadOutline } from 'ionicons/icons';
import { polygonArea, polygonPerimeter, pxToMeters, fmtCm } from '../lib/geometry';
import { Direction, WallEntry, DIR_LABEL, DIR_NAME, turnRight, turnLeft, buildPolygon, mToPx } from '../lib/walls';
import { Room } from '../types';

type Mode = 'rect' | 'poly';

interface Props {
  room: Room;
  canvasW: number;
  canvasH: number;
  onApply: (partial: Partial<Room>) => void;
  onClose: () => void;
}

const parseNum = (s: string): number => parseFloat(s.replace(',', '.'));

const ManualMeasureModal: React.FC<Props> = ({ room, canvasW, canvasH, onApply, onClose }) => {
  const [mode, setMode] = useState<Mode>('rect');

  // Rectangle mode
  const [rectW, setRectW] = useState('');
  const [rectH, setRectH] = useState('');

  // Polygon mode
  const [walls, setWalls] = useState<WallEntry[]>([]);
  const [curDir, setCurDir] = useState<Direction>('E');
  const [lengthInput, setLengthInput] = useState('');

  const addWall = () => {
    const cm = parseNum(lengthInput);
    if (!(cm > 0)) return;
    setWalls(prev => [...prev, { lengthM: cm / 100, dir: curDir }]);
    setCurDir(turnRight(curDir));
    setLengthInput('');
  };

  const undoWall = () => {
    if (walls.length === 0) return;
    const last = walls[walls.length - 1];
    setWalls(prev => prev.slice(0, -1));
    setCurDir(last.dir);
  };

  const canClosePolygon = () => {
    if (walls.length < 3) return false;
    const pts = buildPolygon(walls, room.scale, canvasW, canvasH);
    const first = pts[0], last = pts[pts.length - 1];
    const maxWall = Math.max(...walls.map(w => w.lengthM));
    const d = Math.hypot(first.x - last.x, first.y - last.y);
    return d < mToPx(maxWall * 0.05, room.scale);
  };

  const applyPoints = (pts: { x: number; y: number }[]) => {
    const areaSqm = parseFloat((pxToMeters(Math.sqrt(polygonArea(pts)), room.scale) ** 2).toFixed(2));
    const perimeterM = parseFloat(pxToMeters(polygonPerimeter(pts), room.scale).toFixed(2));
    onApply({ points: pts, areaSqm, perimeterM, profileSegments: [], lighting: [] });
    onClose();
  };

  const applyRect = () => {
    const wCm = parseNum(rectW), hCm = parseNum(rectH);
    if (!(wCm > 0) || !(hCm > 0)) return;
    const wPx = mToPx(wCm / 100, room.scale);
    const hPx = mToPx(hCm / 100, room.scale);
    const ox = (canvasW - wPx) / 2;
    const oy = (canvasH - hPx) / 2;
    applyPoints([
      { x: ox, y: oy },
      { x: ox + wPx, y: oy },
      { x: ox + wPx, y: oy + hPx },
      { x: ox, y: oy + hPx },
    ]);
  };

  const applyPoly = () => {
    if (walls.length < 3) return;
    const pts = buildPolygon(walls, room.scale, canvasW, canvasH);
    applyPoints(pts.slice(0, -1)); // last point == first
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9100, display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)' }} />
      <div style={{
        position: 'relative', zIndex: 1, width: '100%',
        background: '#16182a',
        borderRadius: '20px 20px 0 0',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.7)',
        paddingBottom: 'max(28px, env(safe-area-inset-bottom, 28px))',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)' }} />
        </div>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}>
          <IonIcon icon={keypadOutline} style={{ fontSize: 20, color: '#00ACC1' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Ввод размеров</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer' }}>
            <IonIcon icon={closeOutline} style={{ fontSize: 22, color: 'rgba(255,255,255,0.5)' }} />
          </button>
        </div>

        <div style={{ padding: '20px 20px 0' }}>
          <Label>Выберите способ</Label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12, marginBottom: 20 }}>
            <ModeCard
              title="Прямоугольник"
              subtitle="Ширина и длина"
              active={mode === 'rect'}
              onClick={() => setMode('rect')}
              preview={<RectPreview />}
            />
            <ModeCard
              title="Произвольная форма"
              subtitle="Стены по очереди"
              active={mode === 'poly'}
              onClick={() => setMode('poly')}
              preview={<PolyPreview />}
            />
          </div>

          {mode === 'rect' && (
            <RectForm width={rectW} height={rectH} onWidth={setRectW} onHeight={setRectH} onApply={applyRect} />
          )}

          {mode === 'poly' && (
            <PolyForm
              walls={walls}
              curDir={curDir}
              length={lengthInput}
              canClose={canClosePolygon()}
              onLengthChange={setLengthInput}
              onAddWall={addWall}
              onTurnLeft={() => setCurDir(d => turnLeft(d))}
              onTurnRight={() => setCurDir(d => turnRight(d))}
              onUndo={undoWall}
              onApply={applyPoly}
            />
          )}
        </div>
      </div>
    </div>
  );
};

// ── Shared bits ───────────────────────────────────────────────────────────

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 1 }}>
    {children}
  </div>
);

const BigButton: React.FC<{ children: React.ReactNode; onClick: () => void; style?: React.CSSProperties; disabled?: boolean }> =
  ({ children, onClick, style, disabled }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%', padding: '14px 0', borderRadius: 14,
        background: disabled ? 'rgba(255,255,255,0.08)' : '#1E88E5',
        border: 'none', color: disabled ? 'rgba(255,255,255,0.3)' : '#fff',
        fontSize: 15, fontWeight: 700, cursor: disabled ? 'default' : 'pointer',
        ...style,
      }}
    >
      {children}
    </button>
  );

const SmallButton: React.FC<{ children: React.ReactNode; onClick: () => void; style?: React.CSSProperties }> =
  ({ children, onClick, style }) => (
    <button
      onClick={onClick}
      style={{
        width: '100%', padding: '10px 0', borderRadius: 12,
        background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
        color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: 600,
        cursor: 'pointer', ...style,
      }}
    >
      {children}
    </button>
  );

const numberFieldStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: 14,
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
  color: '#fff', fontSize: 18, fontWeight: 700,
  outline: 'none', boxSizing: 'border-box',
};

const dirBtn: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 10,
  background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
  color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};

// ── Mode cards ─────────────────────────────────────────────────────────────

const ModeCard: React.FC<{
  title: string; subtitle: string; active: boolean;
  onClick: () => void; preview: React.ReactNode;
}> = ({ title, subtitle, active, onClick, preview }) => (
  <button
    onClick={onClick}
    style={{
      padding: '14px 10px', borderRadius: 14,
      background: active ? 'rgba(30,136,229,0.15)' : 'rgba(255,255,255,0.05)',
      border: `1px solid ${active ? '#1E88E5' : 'rgba(255,255,255,0.1)'}`,
      cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
    }}
  >
    {preview}
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: active ? '#1E88E5' : '#fff' }}>{title}</div>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 3, lineHeight: 1.3 }}>{subtitle}</div>
    </div>
  </button>
);

const RectPreview = () => (
  <svg width={60} height={42} viewBox="0 0 60 42">
    <rect x={5} y={5} width={50} height={32} rx={2} fill="rgba(30,136,229,0.2)" stroke="#1E88E5" strokeWidth={1.5} />
    <line x1={5} y1={21} x2={55} y2={21} stroke="#1E88E5" strokeWidth={1} strokeDasharray="3,2" opacity={0.5} />
    <line x1={30} y1={5} x2={30} y2={37} stroke="#1E88E5" strokeWidth={1} strokeDasharray="3,2" opacity={0.5} />
    <text x={30} y={22} textAnchor="middle" fontSize={7} fill="rgba(255,255,255,0.4)" dy="0.3em">W × H</text>
  </svg>
);

const PolyPreview = () => (
  <svg width={60} height={42} viewBox="0 0 60 42">
    <polygon points="5,37 5,10 35,10 35,22 55,22 55,37" fill="rgba(30,136,229,0.2)" stroke="#1E88E5" strokeWidth={1.5} strokeLinejoin="round" />
  </svg>
);

// ── Rectangle form ─────────────────────────────────────────────────────────

const RectForm: React.FC<{
  width: string; height: string;
  onWidth: (v: string) => void; onHeight: (v: string) => void;
  onApply: () => void;
}> = ({ width, height, onWidth, onHeight, onApply }) => {
  const valid = parseNum(width) > 0 && parseNum(height) > 0;
  const handleEnter = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && valid) onApply(); };
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
            Ширина, см
          </div>
          <input
            type="number" inputMode="decimal" min="0" step="1"
            value={width} placeholder="0"
            onChange={e => onWidth(e.target.value)}
            onKeyDown={handleEnter}
            style={numberFieldStyle}
          />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
            Длина, см
          </div>
          <input
            type="number" inputMode="decimal" min="0" step="1"
            value={height} placeholder="0"
            onChange={e => onHeight(e.target.value)}
            onKeyDown={handleEnter}
            style={numberFieldStyle}
          />
        </div>
      </div>
      <BigButton onClick={onApply} disabled={!valid}>Построить чертёж</BigButton>
    </div>
  );
};

// ── Polygon form ───────────────────────────────────────────────────────────

const PolyForm: React.FC<{
  walls: WallEntry[]; curDir: Direction; length: string;
  canClose: boolean;
  onLengthChange: (v: string) => void;
  onAddWall: () => void;
  onTurnLeft: () => void; onTurnRight: () => void;
  onUndo: () => void; onApply: () => void;
}> = ({ walls, curDir, length, canClose, onLengthChange, onAddWall, onTurnLeft, onTurnRight, onUndo, onApply }) => {
  const valid = parseNum(length) > 0;

  return (
    <div>
      {/* Wall list */}
      <div style={{ marginBottom: 12 }}>
        <Label>Стены ({walls.length})</Label>
        {walls.length === 0 ? (
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', marginTop: 6 }}>
            Добавьте первую стену
          </div>
        ) : (
          <div style={{
            marginTop: 8, maxHeight: 100, overflowY: 'auto',
            display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            {walls.map((w, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 10px', borderRadius: 10,
                background: 'rgba(255,255,255,0.05)',
                fontSize: 13,
              }}>
                <span style={{ color: 'rgba(255,255,255,0.35)', minWidth: 20 }}>{i + 1}</span>
                <span style={{ fontSize: 16, minWidth: 24 }}>{DIR_LABEL[w.dir]}</span>
                <span style={{ color: '#fff', fontWeight: 600 }}>{fmtCm(w.lengthM * 100)}</span>
                <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, textTransform: 'uppercase' }}>
                  {DIR_NAME[w.dir]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Direction controls */}
      <div style={{
        padding: '12px 16px', borderRadius: 14,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        marginBottom: 12,
      }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Направление следующей стены
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={onTurnLeft} style={dirBtn}>↺ Лево</button>
          <div style={{ flex: 1, textAlign: 'center', fontSize: 22, color: '#1E88E5', fontWeight: 700 }}>
            {DIR_LABEL[curDir]}
          </div>
          <button onClick={onTurnRight} style={dirBtn}>Право ↻</button>
        </div>
      </div>

      {/* Length input */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
            Длина стены, см
          </div>
          <input
            type="number" inputMode="decimal" min="0" step="1"
            value={length} placeholder="0"
            onChange={e => onLengthChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && valid) onAddWall(); }}
            style={numberFieldStyle}
          />
        </div>
        <button
          onClick={onAddWall}
          disabled={!valid}
          style={{
            padding: '13px 18px', borderRadius: 14,
            background: valid ? '#1E88E5' : 'rgba(255,255,255,0.08)',
            border: 'none', color: valid ? '#fff' : 'rgba(255,255,255,0.3)',
            fontSize: 14, fontWeight: 700, cursor: valid ? 'pointer' : 'default',
            whiteSpace: 'nowrap',
          }}
        >
          + Стена
        </button>
      </div>

      {canClose && (
        <BigButton onClick={onApply} style={{ marginBottom: 10 }}>
          Замкнуть и применить
        </BigButton>
      )}

      {walls.length >= 3 && !canClose && (
        <BigButton onClick={onApply} style={{ marginBottom: 10 }}>
          Завершить ({walls.length} стен)
        </BigButton>
      )}

      <SmallButton onClick={onUndo}>↩ Отменить последнюю</SmallButton>
    </div>
  );
};

export default ManualMeasureModal;
