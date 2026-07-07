import React, { useState, useRef, useEffect } from 'react';
import { IonIcon, useIonToast } from '@ionic/react';
import {
  closeOutline, bluetoothOutline, scanOutline,
  arrowForwardOutline, returnDownBackOutline, refreshOutline,
  checkmarkOutline,
} from 'ionicons/icons';
import { BleDistometer, scanDistometers, stopScan, connectDistometer } from '../lib/bluetooth';
import { polygonArea, polygonPerimeter, pxToMeters } from '../lib/geometry';
import { Direction, WallEntry, DIR_LABEL, DIR_NAME, turnRight, turnLeft, buildPolygon, mToPx } from '../lib/walls';
import { Room } from '../types';

// ── Types ──────────────────────────────────────────────────────────────────

type Mode = 'rect' | 'poly';
type Phase = 'scan' | 'connecting' | 'mode' | 'measuring' | 'done';

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  room: Room;
  canvasW: number;
  canvasH: number;
  onApply: (partial: Partial<Room>) => void;
  onClose: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────

const BluetoothMeasureModal: React.FC<Props> = ({ room, canvasW, canvasH, onApply, onClose }) => {
  const [phase, setPhase] = useState<Phase>('scan');
  const [devices, setDevices] = useState<BleDistometer[]>([]);
  const [scanning, setScanning] = useState(false);
  const [connected, setConnected] = useState<BleDistometer | null>(null);
  const [mode, setMode] = useState<Mode>('rect');
  const [present] = useIonToast();

  // Rectangle mode
  const [rectW, setRectW] = useState<number | null>(null);
  const [rectH, setRectH] = useState<number | null>(null);

  // Polygon mode
  const [walls, setWalls] = useState<WallEntry[]>([]);
  const [curDir, setCurDir] = useState<Direction>('E');
  const [pending, setPending] = useState<number | null>(null); // measurement arrived, awaiting confirmation

  const abortRef = useRef<AbortController | null>(null);
  const disconnectRef = useRef<(() => void) | null>(null);

  // Cleanup on unmount
  useEffect(() => () => {
    abortRef.current?.abort();
    disconnectRef.current?.();
  }, []);

  // ── Scan ──────────────────────────────────────────────────────────────────

  const startScan = async () => {
    setDevices([]);
    setScanning(true);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      await scanDistometers((d) => setDevices(prev => [...prev, d]), ac.signal);
    } catch (e: any) {
      present({ message: e.message ?? 'Ошибка сканирования', duration: 2000, color: 'danger' });
    } finally {
      setScanning(false);
    }
  };

  const stopScanAndSelect = async (device: BleDistometer) => {
    abortRef.current?.abort();
    await stopScan();
    setScanning(false);
    setPhase('connecting');

    try {
      const cleanup = await connectDistometer(device, handleMeasurement, () => {
        setConnected(null);
        setPhase('scan');
        present({ message: 'Соединение потеряно', duration: 2000, color: 'warning' });
      });
      disconnectRef.current = cleanup;
      setConnected(device);
      setPhase('mode');
    } catch (e: any) {
      present({ message: e.message ?? 'Не удалось подключиться', duration: 2500, color: 'danger' });
      setPhase('scan');
    }
  };

  // ── Measurement handler ───────────────────────────────────────────────────

  const handleMeasurement = (m: number) => {
    setPhase(ph => {
      if (ph !== 'measuring') return ph;
      return ph;
    });
    setPending(m);
  };

  // ── Rectangle mode ────────────────────────────────────────────────────────

  const acceptRectMeasurement = (m: number) => {
    setPending(null);
    if (rectW === null) {
      setRectW(m);
    } else {
      setRectH(m);
    }
  };

  const retakeRect = () => {
    setPending(null);
    if (rectH !== null) setRectH(null);
    else if (rectW !== null) setRectW(null);
  };

  // ── Polygon mode ──────────────────────────────────────────────────────────

  const acceptWall = (dir: Direction) => {
    if (pending === null) return;
    setWalls(prev => [...prev, { lengthM: pending, dir }]);
    setCurDir(turnRight(dir));
    setPending(null);
  };

  const undoWall = () => {
    if (walls.length === 0) return;
    const last = walls[walls.length - 1];
    setWalls(prev => prev.slice(0, -1));
    setCurDir(last.dir);
    setPending(null);
  };

  // ── Apply ─────────────────────────────────────────────────────────────────

  const applyRect = () => {
    if (rectW === null || rectH === null) return;
    const wPx = mToPx(rectW, room.scale);
    const hPx = mToPx(rectH, room.scale);
    const ox = (canvasW - wPx) / 2;
    const oy = (canvasH - hPx) / 2;
    const pts = [
      { x: ox,       y: oy },
      { x: ox + wPx, y: oy },
      { x: ox + wPx, y: oy + hPx },
      { x: ox,       y: oy + hPx },
    ];
    applyPoints(pts);
  };

  const applyPoly = () => {
    if (walls.length < 3) return;
    const pts = buildPolygon(walls, room.scale, canvasW, canvasH);
    applyPoints(pts.slice(0, -1)); // last point == first
  };

  const applyPoints = (pts: { x: number; y: number }[]) => {
    const areaSqm = parseFloat((pxToMeters(Math.sqrt(polygonArea(pts)), room.scale) ** 2).toFixed(2));
    const perimeterM = parseFloat(pxToMeters(polygonPerimeter(pts), room.scale).toFixed(2));
    onApply({ points: pts, areaSqm, perimeterM, profileSegments: [], lighting: [] });
    onClose();
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  const canClosePolygon = () => {
    if (walls.length < 3) return false;
    // Check if last point ~= first point (within 5% of longest wall)
    const pts = buildPolygon(walls, room.scale, canvasW, canvasH);
    const first = pts[0], last = pts[pts.length - 1];
    const maxWall = Math.max(...walls.map(w => w.lengthM));
    const d = Math.hypot(first.x - last.x, first.y - last.y);
    return d < mToPx(maxWall * 0.05, room.scale);
  };

  const disconnect = () => {
    disconnectRef.current?.();
    disconnectRef.current = null;
    setConnected(null);
    setPhase('scan');
    setRectW(null); setRectH(null);
    setWalls([]); setPending(null);
  };

  // ── Render ────────────────────────────────────────────────────────────────

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
          <IonIcon icon={bluetoothOutline} style={{ fontSize: 20, color: '#1E88E5' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Промер дальномером</div>
            {connected && (
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>
                {connected.name}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer' }}>
            <IonIcon icon={closeOutline} style={{ fontSize: 22, color: 'rgba(255,255,255,0.5)' }} />
          </button>
        </div>

        <div style={{ padding: '20px 20px 0' }}>

          {/* ── Phase: scan ── */}
          {(phase === 'scan' || phase === 'connecting') && (
            <ScanPhase
              devices={devices}
              scanning={scanning}
              connecting={phase === 'connecting'}
              onScan={startScan}
              onSelect={stopScanAndSelect}
            />
          )}

          {/* ── Phase: mode selection ── */}
          {phase === 'mode' && (
            <div>
              <Label>Выберите способ промера</Label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                <ModeCard
                  title="Прямоугольник"
                  subtitle="2 замера — ширина и длина"
                  active={mode === 'rect'}
                  onClick={() => setMode('rect')}
                  preview={<RectPreview />}
                />
                <ModeCard
                  title="Произвольная форма"
                  subtitle="Замер каждой стены по очереди"
                  active={mode === 'poly'}
                  onClick={() => setMode('poly')}
                  preview={<PolyPreview />}
                />
              </div>
              <BigButton style={{ marginTop: 20 }} onClick={() => { setPhase('measuring'); setPending(null); }}>
                Начать промер
              </BigButton>
              <SmallButton style={{ marginTop: 10 }} onClick={disconnect}>Отключить дальномер</SmallButton>
            </div>
          )}

          {/* ── Phase: measuring ── */}
          {phase === 'measuring' && mode === 'rect' && (
            <RectMeasure
              width={rectW}
              height={rectH}
              pending={pending}
              onAccept={acceptRectMeasurement}
              onRetake={retakeRect}
              onApply={applyRect}
              onBack={() => { setPhase('mode'); setRectW(null); setRectH(null); setPending(null); }}
            />
          )}

          {phase === 'measuring' && mode === 'poly' && (
            <PolyMeasure
              walls={walls}
              curDir={curDir}
              pending={pending}
              canClose={canClosePolygon()}
              onAcceptWall={acceptWall}
              onTurnLeft={() => setCurDir(d => turnLeft(d))}
              onTurnRight={() => setCurDir(d => turnRight(d))}
              onUndo={undoWall}
              onApply={applyPoly}
              onBack={() => { setPhase('mode'); setWalls([]); setPending(null); }}
            />
          )}

        </div>
      </div>
    </div>
  );
};

// ── Sub-components ─────────────────────────────────────────────────────────

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

// ── Scan phase ─────────────────────────────────────────────────────────────

const ScanPhase: React.FC<{
  devices: BleDistometer[];
  scanning: boolean;
  connecting: boolean;
  onScan: () => void;
  onSelect: (d: BleDistometer) => void;
}> = ({ devices, scanning, connecting, onScan, onSelect }) => (
  <div>
    {connecting ? (
      <div style={{ textAlign: 'center', padding: '30px 0', color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>
        Подключение...
      </div>
    ) : (
      <>
        <BigButton onClick={onScan} disabled={scanning}>
          {scanning ? 'Поиск устройств...' : 'Найти дальномер'}
        </BigButton>

        {devices.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <Label>Найденные устройства</Label>
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {devices.map(d => (
                <button
                  key={d.id}
                  onClick={() => onSelect(d)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 16px', borderRadius: 14,
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <IonIcon icon={bluetoothOutline} style={{ fontSize: 18, color: '#1E88E5', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{d.name}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2, textTransform: 'uppercase' }}>
                      {d.profile === 'leica' ? 'Leica DISTO' : d.profile === 'bosch' ? 'Bosch GLM' : 'BLE дальномер'}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {devices.length === 0 && !scanning && (
          <div style={{
            marginTop: 20, padding: '20px 16px', borderRadius: 14,
            background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.1)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}>
              Поддерживаемые устройства:<br />
              <span style={{ color: 'rgba(255,255,255,0.55)' }}>Leica DISTO · Bosch GLM</span>
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>
              Включите Bluetooth и нажмите «Найти дальномер»
            </div>
          </div>
        )}
      </>
    )}
    <div style={{ marginBottom: 4 }} />
  </div>
);

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

// ── Rectangle measurement ──────────────────────────────────────────────────

const RectMeasure: React.FC<{
  width: number | null; height: number | null;
  pending: number | null;
  onAccept: (m: number) => void; onRetake: () => void;
  onApply: () => void; onBack: () => void;
}> = ({ width, height, pending, onAccept, onRetake, onApply, onBack }) => {
  const step = width === null ? 0 : height === null ? 1 : 2;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['Ширина A', 'Длина Б'].map((label, i) => {
          const val = i === 0 ? width : height;
          const active = i === step;
          const done = val !== null;
          return (
            <div key={i} style={{
              flex: 1, padding: '12px 10px', borderRadius: 14, textAlign: 'center',
              background: active ? 'rgba(30,136,229,0.12)' : done ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${active ? '#1E88E5' : done ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)'}`,
            }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: done ? '#fff' : 'rgba(255,255,255,0.2)', marginTop: 4 }}>
                {done ? `${val!.toFixed(3)} м` : '—'}
              </div>
            </div>
          );
        })}
      </div>

      {/* Diagram */}
      <div style={{ margin: '0 0 16px', borderRadius: 14, background: 'rgba(255,255,255,0.04)', padding: 16, textAlign: 'center' }}>
        <svg width={180} height={120} viewBox="0 0 180 120" style={{ display: 'block', margin: '0 auto' }}>
          <rect x={20} y={15} width={140} height={90} rx={3} fill="rgba(30,136,229,0.12)" stroke="rgba(30,136,229,0.5)" strokeWidth={1.5} />
          {/* Width arrow */}
          <line x1={20} y1={8} x2={160} y2={8} stroke={step === 0 ? '#F9A825' : (width !== null ? '#1E88E5' : 'rgba(255,255,255,0.2)')} strokeWidth={1.5} markerEnd="url(#arr)" />
          <text x={90} y={5} textAnchor="middle" fontSize={9} fill={step === 0 ? '#F9A825' : 'rgba(255,255,255,0.4)'}>
            {width !== null ? `${width.toFixed(2)} м` : step === 0 ? '← замерьте →' : ''}
          </text>
          {/* Height arrow */}
          <line x1={172} y1={15} x2={172} y2={105} stroke={step === 1 ? '#F9A825' : (height !== null ? '#1E88E5' : 'rgba(255,255,255,0.2)')} strokeWidth={1.5} />
          <text x={178} y={62} textAnchor="middle" fontSize={9} fill={step === 1 ? '#F9A825' : 'rgba(255,255,255,0.4)'} transform="rotate(90,178,62)">
            {height !== null ? `${height.toFixed(2)} м` : step === 1 ? '← замерьте →' : ''}
          </text>
          <defs>
            <marker id="arr" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="#1E88E5" />
            </marker>
          </defs>
        </svg>
      </div>

      {/* Pending measurement */}
      {pending !== null && step < 2 && (
        <div style={{
          padding: '14px 18px', borderRadius: 14, marginBottom: 12,
          background: 'rgba(249,168,37,0.12)', border: '1px solid rgba(249,168,37,0.3)',
        }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>
            Получено измерение:
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#F9A825', marginBottom: 12 }}>
            {pending.toFixed(3)} м
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => onAccept(pending)}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 12,
                background: '#F9A825', border: 'none',
                color: '#000', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}
            >
              ✓ Принять
            </button>
            <button
              onClick={onRetake}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 12,
                background: 'rgba(255,255,255,0.08)', border: 'none',
                color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Переснять
            </button>
          </div>
        </div>
      )}

      {step < 2 && pending === null && (
        <div style={{ textAlign: 'center', padding: '16px 0', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
          {step === 0 ? 'Замерьте ширину помещения' : 'Замерьте длину помещения'}
          <br />
          <span style={{ fontSize: 11 }}>Нажмите кнопку на дальномере</span>
        </div>
      )}

      {step === 2 && (
        <BigButton onClick={onApply}>Применить к чертежу</BigButton>
      )}

      {width !== null && (
        <SmallButton style={{ marginTop: 10 }} onClick={onRetake}>
          Переснять последнее
        </SmallButton>
      )}

      <SmallButton style={{ marginTop: 10 }} onClick={onBack}>← Назад</SmallButton>
    </div>
  );
};

// ── Polygon measurement ────────────────────────────────────────────────────

const PolyMeasure: React.FC<{
  walls: WallEntry[]; curDir: Direction;
  pending: number | null; canClose: boolean;
  onAcceptWall: (dir: Direction) => void;
  onTurnLeft: () => void; onTurnRight: () => void;
  onUndo: () => void;
  onApply: () => void; onBack: () => void;
}> = ({ walls, curDir, pending, canClose, onAcceptWall, onTurnLeft, onTurnRight, onUndo, onApply, onBack }) => {

  return (
    <div>
      {/* Wall list */}
      <div style={{ marginBottom: 12 }}>
        <Label>Стены ({walls.length})</Label>
        {walls.length === 0 ? (
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', marginTop: 6 }}>
            Начните с первой стены
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
                <span style={{ color: '#fff', fontWeight: 600 }}>{w.lengthM.toFixed(3)} м</span>
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
          <div style={{
            flex: 1, textAlign: 'center', fontSize: 22,
            color: '#1E88E5', fontWeight: 700,
          }}>
            {DIR_LABEL[curDir]}
          </div>
          <button onClick={onTurnRight} style={dirBtn}>Право ↻</button>
        </div>
      </div>

      {/* Pending measurement */}
      {pending !== null && (
        <div style={{
          padding: '14px 18px', borderRadius: 14, marginBottom: 12,
          background: 'rgba(249,168,37,0.12)', border: '1px solid rgba(249,168,37,0.3)',
        }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Получено:</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#F9A825', marginBottom: 10 }}>
            {pending.toFixed(3)} м
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>
            Направление: {DIR_LABEL[curDir]} {DIR_NAME[curDir]}
          </div>
          <button
            onClick={() => onAcceptWall(curDir)}
            style={{
              width: '100%', padding: '10px 0', borderRadius: 12,
              background: '#F9A825', border: 'none',
              color: '#000', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}
          >
            ✓ Принять стену
          </button>
        </div>
      )}

      {pending === null && (
        <div style={{ textAlign: 'center', padding: '12px 0 8px', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
          Нажмите кнопку на дальномере
        </div>
      )}

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

      <div style={{ display: 'flex', gap: 8 }}>
        <SmallButton onClick={onUndo}>↩ Отменить</SmallButton>
        <SmallButton onClick={onBack}>← Назад</SmallButton>
      </div>
    </div>
  );
};

const dirBtn: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 10,
  background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
  color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};

export default BluetoothMeasureModal;
