import React, { useMemo, useState } from 'react';
import { IonIcon } from '@ionic/react';
import { chevronBackOutline, closeOutline } from 'ionicons/icons';
import { polygonArea, polygonPerimeter, pxToMeters, pointLabel } from '../lib/geometry';
import {
  Direction, WallEntry, turnRight, turnLeft, mToPx,
  wallPathCm, SHAPE_TEMPLATES, ShapeTemplate, rotatePts, mirrorPts,
} from '../lib/walls';
import { Room } from '../types';
import { NumInput, PadAction, useNumPadOpen } from './NumPad';

type Pt = { x: number; y: number };
type Step = 'pick' | 'custom' | string; // shape picker, wall-by-wall, or template id

interface Props {
  room: Room;
  canvasW: number;
  canvasH: number;
  onApply: (partial: Partial<Room>) => void;
  onClose: () => void;
}

const ACCENT = '#1E88E5';
const GREEN = '#43A047';
// Same colours as on the drawing (CeilingCanvas): walls and diagonals
const WALL = '#3880ff';
const DIAG = '#F9A825';

const parseNum = (s: string): number => parseFloat(s.replace(',', '.'));

// Shoelace area in cm² (positive = clockwise on screen)
const signedAreaCm = (pts: Pt[]) => {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
};

// Closed outline with no wall crossing, touching or running over another one
const isSimpleRing = (pts: Pt[]) => {
  const n = pts.length;
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const onSeg = (p: Pt, a: Pt, b: Pt) =>
    Math.min(a.x, b.x) - 0.5 <= p.x && p.x <= Math.max(a.x, b.x) + 0.5 && Math.min(a.y, b.y) - 0.5 <= p.y && p.y <= Math.max(a.y, b.y) + 0.5;
  const hits = (a: Pt, b: Pt, c: Pt, d: Pt) => {
    const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
    return (Math.abs(d1) < 1 && onSeg(a, c, d)) || (Math.abs(d2) < 1 && onSeg(b, c, d))
      || (Math.abs(d3) < 1 && onSeg(c, a, b)) || (Math.abs(d4) < 1 && onSeg(d, a, b));
  };
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    // the next wall must not fold back onto this one
    const c = pts[(i + 2) % n];
    if (Math.abs(cross(a, b, c)) < 1 && (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) < 0) return false;
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // first and last walls meet at the start
      if (hits(a, b, pts[j], pts[(j + 1) % n])) return false;
    }
  }
  return true;
};

const perimeterCm = (pts: Pt[]) =>
  pts.reduce((s, p, i) => s + Math.hypot(pts[(i + 1) % pts.length].x - p.x, pts[(i + 1) % pts.length].y - p.y), 0);

const fmtArea = (cm2: number) => (Math.abs(cm2) / 1e4).toFixed(2).replace('.', ',');
const fmtM = (cm: number) => String(+(cm / 100).toFixed(2)).replace('.', ',');

const sizesCount = (n: number) => `${n} ${n === 1 ? 'размер' : n < 5 ? 'размера' : 'размеров'}`;

const ManualMeasureModal: React.FC<Props> = ({ canvasW, canvasH, onApply, onClose }) => {
  const [step, setStep] = useState<Step>('pick');
  const tpl = SHAPE_TEMPLATES.find(t => t.id === step);

  // Outline in cm → canvas pixels, centred
  const applyOutline = (cm: Pt[]) => {
    const xs = cm.map(p => p.x), ys = cm.map(p => p.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const pts = cm.map(p => ({ x: canvasW / 2 + mToPx((p.x - cx) / 100), y: canvasH / 2 + mToPx((p.y - cy) / 100) }));
    const areaSqm = parseFloat((pxToMeters(Math.sqrt(polygonArea(pts))) ** 2).toFixed(2));
    const perimeterM = parseFloat(pxToMeters(polygonPerimeter(pts)).toFixed(2));
    onApply({ points: pts, areaSqm, perimeterM, profileSegments: [], lighting: [], hiddenDiagonals: [] });
    onClose();
  };

  const closeBtn = (
    <button onClick={onClose} style={{
      width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', flexShrink: 0,
      border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
    }}>
      <IonIcon icon={closeOutline} style={{ fontSize: 20, color: 'rgba(255,255,255,0.6)' }} />
    </button>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9100, display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)' }} />
      <div style={{
        position: 'relative', zIndex: 1, width: '100%',
        background: '#16182a',
        borderRadius: '20px 20px 0 0',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.7)',
        paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))',
        maxHeight: '92vh', overflowY: 'auto',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 2px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)' }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px 12px' }}>
          {step === 'pick' ? (
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>Форма помещения</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
                Выберите похожую — размеры введёте дальше
              </div>
            </div>
          ) : (
            <>
              <button onClick={() => setStep('pick')} aria-label="Назад" style={{
                width: 34, height: 34, borderRadius: 10, border: 'none', cursor: 'pointer', flexShrink: 0,
                background: 'rgba(255,255,255,0.07)', color: '#64b5f6',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <IonIcon icon={chevronBackOutline} style={{ fontSize: 22 }} />
              </button>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                {tpl ? <ShapeThumb pts={tpl.build(defaults(tpl))!.pts} active size={[30, 22]} /> : <CustomThumb active size={[30, 22]} />}
                <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)' }}>Форма помещения</span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {tpl ? tpl.name : 'Своя форма'}
                  </span>
                </div>
              </div>
            </>
          )}
          {closeBtn}
        </div>

        <div style={{ padding: '0 16px' }}>
          {step === 'pick' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
              {SHAPE_TEMPLATES.map(t => (
                <ShapeTile key={t.id} title={t.name} sub={sizesCount(t.params.length)} onClick={() => setStep(t.id)}>
                  <ShapeThumb pts={t.build(defaults(t))!.pts} />
                </ShapeTile>
              ))}
              <ShapeTile title="Своя форма" sub="стена за стеной" dashed onClick={() => setStep('custom')}>
                <CustomThumb />
              </ShapeTile>
            </div>
          )}
          {step === 'custom' && <StepForm onApply={applyOutline} />}
          {tpl && <TemplateForm key={tpl.id} tpl={tpl} onApply={applyOutline} />}
        </div>
      </div>
    </div>
  );
};

const defaults = (t: ShapeTemplate) => Object.fromEntries(t.params.map(p => [p.key, p.def]));

// ── Shared bits ───────────────────────────────────────────────────────────

const Label: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.6, ...style }}>
    {children}
  </div>
);

const BigButton: React.FC<{
  children: React.ReactNode; onClick: () => void; color?: string; disabled?: boolean; style?: React.CSSProperties;
}> = ({ children, onClick, color = ACCENT, disabled, style }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      flex: 1, minHeight: 50, borderRadius: 14, padding: '6px 10px',
      background: disabled ? 'rgba(255,255,255,0.08)' : color,
      border: 'none', color: disabled ? 'rgba(255,255,255,0.3)' : '#fff',
      fontSize: 15, fontWeight: 800, cursor: disabled ? 'default' : 'pointer',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1.2,
      ...style,
    }}
  >
    {children}
  </button>
);

const Sub: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.85 }}>{children}</span>
);

const GhostButton: React.FC<{ children: React.ReactNode; onClick: () => void; disabled?: boolean }> =
  ({ children, onClick, disabled }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        minHeight: 50, padding: '0 16px', borderRadius: 14,
        background: 'transparent', border: '1px solid rgba(255,255,255,0.14)',
        color: disabled ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.75)',
        fontSize: 14, fontWeight: 700, cursor: disabled ? 'default' : 'pointer', whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );

const WallBadge: React.FC<{ name: string; done?: boolean }> = ({ name, done }) => (
  <span style={{
    height: 26, padding: '0 8px', borderRadius: 8, flexShrink: 0,
    background: done ? WALL : 'rgba(255,255,255,0.1)', color: '#fff',
    fontSize: 13, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  }}>{name}</span>
);

// ── Shape tiles ───────────────────────────────────────────────────────────

const ShapeTile: React.FC<{ title: string; sub: string; dashed?: boolean; onClick: () => void; children: React.ReactNode }> =
  ({ title, sub, dashed, onClick, children }) => (
    <button
      onClick={onClick}
      style={{
        height: 92, padding: '6px 4px', borderRadius: 12,
        background: 'rgba(255,255,255,0.05)',
        border: dashed ? '1.5px dashed rgba(30,136,229,0.5)' : '1.5px solid rgba(255,255,255,0.08)',
        cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5,
      }}
    >
      {children}
      <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.8)', lineHeight: 1.15 }}>{title}</span>
      <span style={{ fontSize: 9.5, fontWeight: 600, color: 'rgba(255,255,255,0.35)', marginTop: -3 }}>{sub}</span>
    </button>
  );

const ShapeThumb: React.FC<{ pts: Pt[]; active?: boolean; size?: [number, number] }> = ({ pts, active, size = [56, 40] }) => {
  const [W, H] = size;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const bw = Math.max(...xs) - minX, bh = Math.max(...ys) - minY;
  const s = Math.min((W - 4) / bw, (H - 4) / bh);
  const ox = (W - bw * s) / 2, oy = (H - bh * s) / 2;
  return (
    <svg width={W} height={H} style={{ flexShrink: 0 }}>
      <polygon
        points={pts.map(p => `${(p.x - minX) * s + ox},${(p.y - minY) * s + oy}`).join(' ')}
        fill={active ? 'rgba(30,136,229,0.3)' : 'rgba(255,255,255,0.06)'}
        stroke={active ? ACCENT : 'rgba(255,255,255,0.55)'} strokeWidth={1.5} strokeLinejoin="round"
      />
    </svg>
  );
};

const CustomThumb: React.FC<{ active?: boolean; size?: [number, number] }> = ({ active, size = [56, 40] }) => {
  const c = active ? ACCENT : '#64b5f6';
  return (
    <svg width={size[0]} height={size[1]} viewBox="0 0 46 34" style={{ flexShrink: 0 }}>
      <path d="M7 29 V7 H27 V17" fill="none" stroke={c} strokeWidth={1.5} strokeDasharray="3 2.5" />
      <circle cx={7} cy={29} r={3} fill={WALL} />
      <circle cx={27} cy={17} r={3} fill={ACCENT} />
      <path d="M37 11 v10 M32 16 h10" stroke={c} strokeWidth={1.6} />
    </svg>
  );
};

// ── Plan preview ──────────────────────────────────────────────────────────

// Candidate label offsets [along wall, outward] in steps, cheapest first
const SLOTS = [-3, -2, -1, 0, 1, 2, 3].flatMap(ts => [0, 1, 2, 3].map(ns => [ts, ns]))
  .sort((p, q) => Math.abs(p[0]) + p[1] * 1.5 - (Math.abs(q[0]) + q[1] * 1.5));

// input = size the user types (pill: filled when entered, dashed «?» while empty);
// derived = computed from other sizes (shown once known); plain = just a number.
// done → the wall is drawn solid (as on the drawing), until then thin dashed; focus → blue halo around the wall being typed.
interface EdgeLabel { text: string; kind?: 'input' | 'derived' | 'plain'; focus?: boolean; done?: boolean; num?: number }
type DimLabel = { from: Pt; to: Pt; text: string; focus?: boolean; done?: boolean };

const pillW = (text: string) => text.length * 7.4 + 20;

const PlanPreview: React.FC<{
  pts: Pt[];                      // path in cm
  closed: boolean;
  labels: (EdgeLabel | null)[];   // per edge i → (pts[i], pts[i+1])
  ghost?: { to: Pt; text?: string };
  closing?: { pts: Pt[]; texts: string[] }; // straight walls «Замкнуть» will add, ending at the start
  dims?: DimLabel[];              // dashed measurement lines between vertices (not walls)
  letters?: string[];             // vertex names, as on the drawing
  height: number;
  footer?: React.ReactNode;
}> = ({ pts: path, closed, labels: rawLabels, ghost: rawGhost, closing: rawClosing, dims: rawDims, letters, height, footer }) => {
  // Sizes come in as bare numbers — show them with units, like on the drawing
  const cm = (t: string) => (/^\d+$/.test(t) ? `${t} см` : t);
  const labels = rawLabels.map(l => l && { ...l, text: cm(l.text) });
  const dims = rawDims?.map(d => ({ ...d, text: cm(d.text) }));
  const ghost = rawGhost && { ...rawGhost, text: rawGhost.text && cm(rawGhost.text) };
  const closing = rawClosing && { ...rawClosing, texts: rawClosing.texts.map(cm) };
  const pts = closed ? [...path, path[0]] : path;
  const [W, setW] = useState(360);
  const ref = (el: HTMLDivElement | null) => { if (el && el.clientWidth && el.clientWidth !== W) setW(el.clientWidth); };

  const all = [...pts, ...(ghost ? [ghost.to] : []), ...(closing?.pts ?? [])];
  const xs = all.map(p => p.x), ys = all.map(p => p.y);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const bw = Math.max(Math.max(...xs) - minX, 1), bh = Math.max(Math.max(...ys) - minY, 1);
  const pad = letters ? 30 : 40, padB = 22;
  const s = Math.min((W - 2 * pad) / bw, (height - 2 * pad - padB) / bh, all.length < 3 ? 0.5 : Infinity);
  const ox = (W - bw * s) / 2 - minX * s, oy = (height - padB - bh * s) / 2 - minY * s;
  const T = (p: Pt): Pt => ({ x: ox + p.x * s, y: oy + p.y * s });
  const P = pts.map(T);

  // outward normal = left of travel for clockwise outlines
  const poly = closed ? pts : [...pts, ...(ghost ? [ghost.to] : [])];
  const cw = poly.length < 3 || signedAreaCm(poly) >= 0;
  const normal = (a: Pt, b: Pt) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = (b.y - a.y) / len, ny = -(b.x - a.x) / len;
    return cw ? { x: nx, y: ny } : { x: -nx, y: -ny };
  };

  const last = P[P.length - 1];

  // Place edge labels outside the outline, nudging them further out when they collide on short walls
  const placed: (Pt & { w: number })[] = letters ? P.slice(0, path.length).map(p => ({ ...p, w: 10 })) : [];
  // Try sliding along the wall first, then further out; stay inside the preview, above the footer
  const place = (mx: number, my: number, n: Pt, off: number, w = 30): Pt => {
    const t = { x: -n.y, y: n.x };
    const at = ([ts, ns]: number[]) => ({ x: mx + n.x * (off + ns * 16) + t.x * ts * 18, y: my + n.y * (off + ns * 16) + t.y * ts * 18 });
    const inside = (p: Pt) => p.x > 22 && p.x < W - 22 && p.y > 14 && p.y < height - padB - 14;
    const free = (p: Pt) => !placed.some(q => Math.abs(q.x - p.x) < (q.w + w) / 2 + 3 && Math.abs(q.y - p.y) < 25);
    const cands = SLOTS.map(at);
    const p = cands.find(c => inside(c) && free(c)) ?? cands.find(inside) ?? cands[0];
    placed.push({ ...p, w });
    return p;
  };
  const dimPos = (dims ?? []).map(d => {
    const a = T(d.from), b = T(d.to);
    return place((a.x + b.x) / 2, (a.y + b.y) / 2, { x: 0, y: -1 }, 0, pillW(d.text));
  });
  const ghostPill = ghost?.text ? (() => {
    const b = T(ghost.to);
    return place((last.x + b.x) / 2, (last.y + b.y) / 2, normal(pts[pts.length - 1], ghost.to), 20, pillW(ghost.text!));
  })() : null;
  const labelPos = labels.map((l, i) => {
    if (!l || i + 1 >= P.length) return null;
    return place((P[i].x + P[i + 1].x) / 2, (P[i].y + P[i + 1].y) / 2, normal(pts[i], pts[i + 1]), l.kind === 'input' ? 0 : 14, l.kind === 'input' ? pillW(l.text) : l.text.length * 7 + 4);
  });

  return (
    <div ref={ref} style={{
      position: 'relative', height, borderRadius: 16, overflow: 'hidden',
      background: '#0f1120', border: '1px solid rgba(255,255,255,0.07)',
      backgroundImage: 'linear-gradient(rgba(255,255,255,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.045) 1px, transparent 1px)',
      backgroundSize: '16px 16px',
    }}>
      <svg width={W} height={height} style={{ position: 'absolute', inset: 0 }}>
        {closed && <polygon points={P.map(p => `${p.x},${p.y}`).join(' ')} fill="rgba(30,136,229,0.16)" />}

        {closing && closing.pts.slice(1).map((p, i) => {
          const a = T(closing.pts[i]), b = T(p);
          return (
            <g key={'c' + i}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={WALL} strokeWidth={1.5} strokeDasharray="5 4" />
              <Pill x={(a.x + b.x) / 2} y={(a.y + b.y) / 2} text={closing.texts[i]} bg={WALL} />
            </g>
          );
        })}

        {(dims ?? []).map((d, i) => {
          const a = T(d.from), b = T(d.to);
          return (
            <g key={'d' + i}>
              {d.focus && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={ACCENT} strokeWidth={5} strokeLinecap="round" opacity={0.35} />}
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={d.done ? DIAG : 'rgba(255,255,255,0.5)'} strokeWidth={1.5} strokeDasharray="5 4" />
            </g>
          );
        })}

        {P.slice(1).map((b, i) => labels[i]?.focus && (
          <line key={'h' + i} x1={P[i].x} y1={P[i].y} x2={b.x} y2={b.y} stroke={ACCENT} strokeWidth={6} strokeLinecap="round" opacity={0.35} />
        ))}
        {P.slice(1).map((b, i) => (
          labels[i]?.done
            ? <line key={i} x1={P[i].x} y1={P[i].y} x2={b.x} y2={b.y} stroke={WALL} strokeWidth={2.5} strokeLinecap="round" />
            : <line key={i} x1={P[i].x} y1={P[i].y} x2={b.x} y2={b.y} stroke="rgba(255,255,255,0.55)" strokeWidth={1.5} strokeDasharray="5 4" />
        ))}

        {(dims ?? []).map((d, i) => <InputPill key={'dp' + i} {...dimPos[i]} text={d.text} done={d.done} focus={d.focus} color={DIAG} />)}

        {ghost && (() => {
          const b = T(ghost.to);
          const ang = Math.atan2(b.y - last.y, b.x - last.x) * 180 / Math.PI;
          return (
            <g>
              {/* solid as soon as the length is typed, dashed while it's still empty */}
              {ghost.text
                ? <line x1={last.x} y1={last.y} x2={b.x} y2={b.y} stroke={WALL} strokeWidth={2.5} strokeLinecap="round" />
                : <line x1={last.x} y1={last.y} x2={b.x} y2={b.y} stroke={WALL} strokeWidth={1.5} strokeDasharray="5 4" />}
              <path d="M-2,-6 L8,0 L-2,6 z" fill={WALL} transform={`translate(${b.x},${b.y}) rotate(${ang})`} />
              {ghostPill && <Pill x={ghostPill.x} y={ghostPill.y} text={ghost.text!} bg={WALL} />}
            </g>
          );
        })()}

        {labels.map((l, i) => {
          if (!l || i + 1 >= P.length) return null;
          const a = P[i], b = P[i + 1];
          const n = normal(pts[i], pts[i + 1]);
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          const { x, y } = labelPos[i]!;
          return (
            <g key={i}>
              {l.kind === 'input' ? (
                <InputPill x={x} y={y} text={l.text} done={l.done} focus={l.focus} />
              ) : (
                <text x={x} y={y} fill={l.kind === 'derived' ? '#8fb4ff' : 'rgba(255,255,255,0.85)'}
                  fontSize={12} fontWeight={700} textAnchor="middle" dominantBaseline="central">{l.text}</text>
              )}
              {l.num != null && (
                <g>
                  <circle cx={mx - n.x * 13} cy={my - n.y * 13} r={8} fill="rgba(255,255,255,0.1)" />
                  <text x={mx - n.x * 13} y={my - n.y * 13} fill="rgba(255,255,255,0.55)" fontSize={9.5} fontWeight={700}
                    textAnchor="middle" dominantBaseline="central">{l.num}</text>
                </g>
              )}
            </g>
          );
        })}

        {letters && P.slice(0, path.length).map((p, i) => (
          <g key={'v' + i}>
            <circle cx={p.x} cy={p.y} r={9} fill={WALL} stroke="#fff" strokeWidth={1.5} />
            <text x={p.x} y={p.y} fill="#fff" fontSize={11} fontWeight={800} textAnchor="middle" dominantBaseline="central">{letters[i]}</text>
          </g>
        ))}
        {!letters && P.map((p, i) => i === 0
          ? <circle key={i} cx={p.x} cy={p.y} r={7} fill={WALL} stroke="#0f1120" strokeWidth={2} />
          : i === P.length - 1 && !closed
            ? <circle key={i} cx={p.x} cy={p.y} r={6.5} fill={WALL} stroke="#fff" strokeWidth={2} />
            : <circle key={i} cx={p.x} cy={p.y} r={4} fill="#fff" />)}
        {!closed && !letters && (
          <text x={P[0].x - 10} y={P[0].y - 12} fill="#8fb4ff" fontSize={10.5} fontWeight={700} textAnchor="end">старт</text>
        )}
      </svg>
      {footer && (
        <div style={{
          position: 'absolute', left: 10, right: 10, bottom: 7, display: 'flex', justifyContent: 'space-between',
          fontSize: 11, color: 'rgba(255,255,255,0.5)',
        }}>{footer}</div>
      )}
    </div>
  );
};

// Size to enter: dashed «?» while empty, filled with the value once entered, blue ring while typing
const InputPill: React.FC<{ x: number; y: number; text: string; done?: boolean; focus?: boolean; color?: string }> = ({ x, y, text, done, focus, color = WALL }) => {
  const w = pillW(text);
  return (
    <g>
      <rect x={x - w / 2} y={y - 12} width={w} height={24} rx={12}
        fill={done ? color : '#1c1f33'}
        stroke={focus ? ACCENT : done ? 'none' : 'rgba(255,255,255,0.35)'}
        strokeWidth={focus ? 2.5 : 1.2} strokeDasharray={done || focus ? undefined : '3 3'} />
      <text x={x} y={y} fill={done ? (color === DIAG ? '#1c1f33' : '#fff') : 'rgba(255,255,255,0.6)'} fontSize={12.5} fontWeight={800}
        textAnchor="middle" dominantBaseline="central">{text}</text>
    </g>
  );
};

const Pill: React.FC<{ x: number; y: number; text: string; bg: string; fg?: string }> = ({ x, y, text, bg, fg = '#fff' }) => {
  const w = pillW(text);
  return (
    <g>
      <rect x={x - w / 2} y={y - 12} width={w} height={24} rx={12} fill={bg} />
      <text x={x} y={y} fill={fg} fontSize={12.5} fontWeight={800} textAnchor="middle" dominantBaseline="central">{text}</text>
    </g>
  );
};

// ── Template form (B) ─────────────────────────────────────────────────────

const TemplateForm: React.FC<{ tpl: ShapeTemplate; onApply: (pts: Pt[]) => void }> = ({ tpl, onApply }) => {
  const [values, setValues] = useState<Record<string, string>>({});
  const [focus, setFocus] = useState<string | null>(null);
  const [rot, setRot] = useState(0);
  const [mirrored, setMirrored] = useState(false);

  const filled = tpl.params.every(p => parseNum(values[p.key] ?? '') > 0);

  const orient = (pts: Pt[]) => {
    for (let i = 0; i < rot; i++) pts = rotatePts(pts);
    return mirrored ? mirrorPts(pts) : pts;
  };

  // A blank size stands in at its default scaled like the sizes already
  // entered (geometric mean of entered / default), so one small wall doesn't
  // clash with full-size defaults — «не сходятся» only when entries clash
  const blankDef = useMemo(() => {
    const ratios = tpl.params.map(p => parseNum(values[p.key] ?? '') / p.def).filter(r => r > 0);
    const k = ratios.length ? Math.exp(ratios.reduce((s, r) => s + Math.log(r), 0) / ratios.length) : 1;
    return Object.fromEntries(tpl.params.map(p => [p.key, Math.max(1, Math.round(p.def * k))]));
  }, [tpl, values]);

  // Entered sizes (blank → scaled default), and the template as drawn on the schematic
  const shape = useMemo(() => {
    const v = Object.fromEntries(tpl.params.map(p => {
      const n = parseNum(values[p.key] ?? '');
      return [p.key, n > 0 ? n : blankDef[p.key]];
    }));
    return tpl.build(v);
  }, [tpl, values, blankDef]);
  const schematic = useMemo(() => tpl.build(defaults(tpl))!, [tpl]);

  const shown = shape ?? schematic;
  const pts = orient(shown.pts);
  const isParam = (l: string) => tpl.params.some(p => p.key === l);
  const isSet = (k: string) => parseNum(values[k] ?? '') > 0;
  // a computed wall ('= a−c') is known once every size it uses is entered
  const known = (l: string) => isParam(l) ? isSet(l) : (l.match(/[a-e]/g) ?? []).every(isSet) && /[a-e]/.test(l);

  // Name sizes by the corners they join, like walls on the drawing («a–b»)
  const letters = pts.map((_, i) => pointLabel(i));
  const n = pts.length;
  const fields = tpl.params.map(p => {
    const e = shown.labels.indexOf(p.key);
    const dim = shown.dims?.find(d => d.key === p.key);
    return e >= 0
      ? { ...p, name: `${letters[e]}–${letters[(e + 1) % n]}`, order: e, hint: '' }
      : { ...p, name: `${letters[dim!.from]}–${letters[dim!.to]}`, order: n + 1, hint: p.hint };
  }).sort((a, b) => a.order - b.order);
  const lenCm = (i: number) => String(Math.round(Math.hypot(pts[(i + 1) % n].x - pts[i].x, pts[(i + 1) % n].y - pts[i].y)));

  const fieldStyle = (k: string): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 10, height: 50, padding: '0 12px', borderRadius: 13,
    background: 'rgba(255,255,255,0.06)',
    border: `1.5px solid ${focus === k ? ACCENT : 'rgba(255,255,255,0.1)'}`,
  });

  return (
    <div>
      <PlanPreview
        pts={pts}
        closed
        height={260}
        letters={letters}
        labels={shown.labels.map((l, i): EdgeLabel | null => {
          const done = !!shape && known(l);
          if (isParam(l)) return { kind: 'input', text: done ? lenCm(i) : '?', focus: focus === l, done };
          return done ? { kind: 'derived', text: lenCm(i), done } : null;
        })}
        dims={shown.dims?.map(d => {
          const done = !!shape && isSet(d.key);
          const a = pts[d.from], b = pts[d.to];
          return { from: a, to: b, text: done ? String(Math.round(Math.hypot(b.x - a.x, b.y - a.y))) : '?', focus: focus === d.key, done };
        })}
        footer={<>
          <span>{shape
            ? `${fmtArea(signedAreaCm(pts))} м² · периметр ${fmtM(perimeterCm(pts))} м`
            : <span style={{ color: '#ff6b66', fontWeight: 700 }}>Размеры не сходятся</span>}</span>
          <span style={{ display: 'flex', gap: 12 }}>
            <a onClick={() => setRot(r => (r + 1) % 4)} style={{ color: '#64b5f6', fontWeight: 700, cursor: 'pointer' }}>⟳ Повернуть</a>
            {tpl.id !== 'rect' && (
              <a onClick={() => setMirrored(m => !m)} style={{ color: '#64b5f6', fontWeight: 700, cursor: 'pointer' }}>⇅ Отразить</a>
            )}
          </span>
        </>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginTop: 12 }}>
        {fields.map(p => (
          <label key={p.key} style={fieldStyle(p.key)}>
            <WallBadge name={p.name} done={isSet(p.key)} />
            <NumInput
              decimal label={`Стена ${p.name}${p.hint ? ` · ${p.hint}` : ''}, см`}
              value={values[p.key] ?? ''} placeholder={String(blankDef[p.key])}
              onChange={v => setValues(vs => ({ ...vs, [p.key]: v }))}
              onFocus={() => setFocus(p.key)}
              onBlur={() => setFocus(f => (f === p.key ? null : f))}
              onEnter={() => { if (filled && shape) onApply(pts); }}
              style={{
                flex: 1, width: 0, minWidth: 0, background: 'none', border: 'none', outline: 'none',
                color: '#fff', fontSize: 19, fontWeight: 800, padding: 0,
              }}
            />
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600, textAlign: 'right', lineHeight: 1.15 }}>
              {p.hint && <>{p.hint}<br /></>}см
            </span>
          </label>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <GhostButton onClick={() => onApply(orient(schematic.pts))}>
          <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
            Без размеров<span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.4)' }}>как на схеме</span>
          </span>
        </GhostButton>
        <BigButton onClick={() => onApply(pts)} disabled={!filled || !shape}>
          {filled ? 'Построить чертёж' : 'Введите размеры'}
        </BigButton>
      </div>
    </div>
  );
};

// ── Step-by-step form (A) ─────────────────────────────────────────────────

// Arrow pointing where the next wall goes on screen (E = right)
const DirArrow: React.FC<{ dir: Direction }> = ({ dir }) => (
  <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"
    style={{ transform: `rotate(${{ E: 0, S: 90, W: 180, N: 270 }[dir]}deg)` }}>
    <path d="M4 12h15" /><path d="M13 6l6 6-6 6" />
  </svg>
);
const SCREEN_DIR: Record<Direction, string> = { E: 'Направо', S: 'Вниз', W: 'Налево', N: 'Вверх' };
// Screen order of the two buttons: left before right, up before down
const SCREEN_ORDER: Direction[] = ['W', 'N', 'S', 'E'];

const StepForm: React.FC<{ onApply: (ring: Pt[]) => void }> = ({ onApply }) => {
  const [walls, setWalls] = useState<WallEntry[]>([]);
  const [curDir, setCurDir] = useState<Direction>('E');
  const [input, setInput] = useState('');
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editVal, setEditVal] = useState('');

  const typedCm = parseNum(input);
  const typed = typedCm > 0;

  const commit = (turn: (d: Direction) => Direction) => {
    if (!typed) return;
    setWalls(prev => [...prev, { lengthM: typedCm / 100, dir: curDir }]);
    setCurDir(turn(curDir));
    setInput('');
  };

  const undo = () => {
    if (walls.length === 0) return;
    const last = walls[walls.length - 1];
    setWalls(prev => prev.slice(0, -1));
    setCurDir(last.dir);
    setInput(String(Math.round(last.lengthM * 100)));
    setEditIdx(null);
  };

  const saveEdit = () => {
    const cm = parseNum(editVal);
    if (editIdx == null || !(cm > 0)) return;
    setWalls(prev => prev.map((x, i) => (i === editIdx ? { ...x, lengthM: cm / 100 } : x)));
    setEditIdx(null);
  };

  // Walls that "Замкнуть" would use: entered + the one being typed
  const pending = typed ? [...walls, { lengthM: typedCm / 100, dir: curDir }] : walls;
  const path = wallPathCm(pending);
  const end = path[path.length - 1];
  // «Замкнуть» always runs one straight wall from the last point to a (none if they already meet),
  // as long as the outline doesn't cross itself
  const meets = Math.hypot(end.x, end.y) < 1;
  const ring = meets ? path.slice(0, -1) : path;
  const closeLen = Math.round(Math.hypot(end.x, end.y));
  const enough = ring.length >= 3 && Math.abs(signedAreaCm(ring)) > 100;
  const canClose = enough && isSimpleRing(ring);

  const pts = wallPathCm(walls);
  const tip = pts[pts.length - 1];
  const ghostLen = typed ? typedCm : Math.max(60, ...walls.map(x => x.lengthM * 100)) * 0.35;
  const dv = { E: [1, 0], S: [0, 1], W: [-1, 0], N: [0, -1] }[curDir];
  const ghostTo = { x: tip.x + dv[0] * ghostLen, y: tip.y + dv[1] * ghostLen };

  const n = walls.length;
  const wallName = (i: number) => `${pointLabel(i)}–${pointLabel(i + 1)}`;
  const chip = (active: boolean, dashed = false): React.CSSProperties => ({
    flexShrink: 0, height: 30, padding: '0 10px', borderRadius: 9, display: 'flex', alignItems: 'center', gap: 6,
    fontSize: 12, fontWeight: 700, cursor: 'pointer', color: dashed ? '#64b5f6' : '#fff',
    background: active || dashed ? 'rgba(30,136,229,0.12)' : 'rgba(255,255,255,0.06)',
    border: dashed ? `1.5px dashed ${ACCENT}` : `1.5px solid ${active ? ACCENT : 'transparent'}`,
  });

  const padOpen = useNumPadOpen();
  // on the pad: the two turns (= commit the wall) and undo, instead of «Назад»/«Далее»
  const turns = [turnLeft, turnRight]
    .map(turn => ({ turn, dir: turn(curDir) }))
    .sort((a, b) => SCREEN_ORDER.indexOf(a.dir) - SCREEN_ORDER.indexOf(b.dir));
  const arrow = { E: '→', S: '↓', W: '←', N: '↑' };
  const turnActions = [
    ...turns.map(({ turn, dir }) => ({ icon: arrow[dir], label: SCREEN_DIR[dir], onClick: () => commit(turn), disabled: !typed, primary: true })),
    { icon: '↩', label: 'Отменить', onClick: undo, disabled: n === 0 },
  ];

  const lenField = (
    value: string, onChange: (v: string) => void, onEnter: () => void, autoFocus = false,
    label?: string, actions?: PadAction[],
  ) => (
    <div style={{
      display: 'flex', alignItems: 'center', height: 54, padding: '0 14px', borderRadius: 14,
      background: 'rgba(255,255,255,0.06)', border: `2px solid ${ACCENT}`,
    }}>
      <NumInput
        decimal autoFocus={autoFocus} label={label} actions={actions}
        value={value} placeholder="0"
        onChange={onChange}
        onEnter={onEnter}
        style={{ flex: 1, width: 0, minWidth: 0, background: 'none', border: 'none', outline: 'none', color: '#fff', fontSize: 24, fontWeight: 800, padding: 0 }}
      />
      <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', fontWeight: 600 }}>см</span>
    </div>
  );

  return (
    <div>
      <PlanPreview
        pts={pts}
        closed={false}
        letters={pts.map((_, i) => pointLabel(i))}
        height={210}
        labels={walls.map((x, i) => ({ text: String(Math.round(x.lengthM * 100)), done: true, focus: editIdx === i }))}
        ghost={editIdx == null ? { to: ghostTo, text: typed ? String(Math.round(typedCm)) : undefined } : undefined}
        closing={editIdx == null && canClose && !meets ? { pts: [end, path[0]], texts: [String(closeLen)] } : undefined}
        footer={<span>
          {n === 0 ? 'Встаньте в угол и идите вдоль стен по часовой'
            : canClose ? `≈ ${fmtArea(signedAreaCm(ring))} м² · периметр ${fmtM(perimeterCm(ring))} м`
              : `Стен: ${n}`}
        </span>}
      />

      {n > 0 && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginTop: 10, paddingBottom: 2 }}>
          {walls.map((x, i) => (
            <div key={i} style={chip(editIdx === i)}
              onClick={() => { setEditIdx(i); setEditVal(String(Math.round(x.lengthM * 100))); }}>
              <span style={{ color: 'rgba(255,255,255,0.45)', fontWeight: 700 }}>{wallName(i)}</span>{Math.round(x.lengthM * 100)}
            </div>
          ))}
          {editIdx == null && (
            <div style={chip(false, true)}><span style={{ fontWeight: 700 }}>{wallName(n)}</span>…</div>
          )}
        </div>
      )}

      {editIdx != null ? (
        <>
          <Label style={{ margin: '14px 0 7px' }}>Стена {wallName(editIdx)} — исправить длину</Label>
          {lenField(editVal, setEditVal, saveEdit, true, `Стена ${wallName(editIdx)} — исправить, см`)}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <GhostButton onClick={() => setEditIdx(null)}>Отмена</GhostButton>
            <BigButton onClick={saveEdit} disabled={!(parseNum(editVal) > 0)}>Сохранить</BigButton>
          </div>
        </>
      ) : (
        <>
          <Label style={{ margin: '14px 0 7px' }}>Стена {wallName(n)} — длина</Label>
          {lenField(input, setInput, () => commit(turnRight), n === 0, `Стена ${wallName(n)} — длина и куда дальше`, turnActions)}

          {/* with the pad open the turns and undo are on it */}
          {!padOpen && <>
            <Label style={{ margin: '12px 0 7px' }}>Следующая стена на схеме идёт</Label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
              {turns.map(({ turn, dir }) => (
                <TurnButton key={dir} onClick={() => commit(turn)} disabled={!typed} icon={<DirArrow dir={dir} />} title={SCREEN_DIR[dir]} />
              ))}
            </div>
          </>}

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {!padOpen && <GhostButton onClick={undo} disabled={n === 0}>↩ Отменить</GhostButton>}
            <BigButton onClick={() => onApply(ring)} color={GREEN} disabled={!canClose}>
              Замкнуть
              <Sub>{canClose ? (meets ? 'контур сошёлся' : `последняя стена ${closeLen} — до точки a`)
                : enough ? 'стены пересекутся' : 'нужно ≥ 2 стены'}</Sub>
            </BigButton>
          </div>
        </>
      )}
    </div>
  );
};

const TurnButton: React.FC<{
  onClick: () => void; disabled: boolean; icon: React.ReactNode; title: string;
}> = ({ onClick, disabled, icon, title }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      height: 58, borderRadius: 14, border: 'none', cursor: disabled ? 'default' : 'pointer',
      background: ACCENT, opacity: disabled ? 0.4 : 1,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#fff',
    }}
  >
    {icon}
    <span style={{ fontSize: 15, fontWeight: 800 }}>{title}</span>
  </button>
);

export default ManualMeasureModal;
