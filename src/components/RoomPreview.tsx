import React from 'react';
import { tessellateRoom, sampleArc, pointOnArc, vertexLabels, edgeLengthCm, Point } from '../lib/geometry';
import { DiagonalInfo, diagonalCm } from '../lib/diagonals';

const VW = 400;
const VH = 260;
const PAD = 34;
const ACTIVE = '#F9A825';

// Text along a line, kept upright and pushed to the side away from `away`
const lineLabel = (a: Point, b: Point, away: Point, gap: number) => {
  let deg = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
  if (deg > 90) deg -= 180;
  if (deg < -90) deg += 180;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  let nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  if ((mx + nx - away.x) ** 2 + (my + ny - away.y) ** 2 < (mx - away.x) ** 2 + (my - away.y) ** 2) {
    nx = -nx; ny = -ny;
  }
  return `translate(${mx + nx * gap},${my + ny * gap}) rotate(${deg})`;
};

interface Props {
  points: Point[];
  /** Per-wall stroke colour (the wall's profile); null draws the wall dashed red — no profile yet */
  wallColors?: (string | null)[];
  selectedWall?: number | null;
  onWallTap?: (i: number) => void;
  diagonals?: DiagonalInfo[];
  activeDiagonal?: string | null;
  onDiagonalTap?: (key: string) => void;
  /** keys of diagonals switched off — drawn faint and struck through */
  hiddenDiagonals?: string[];
  /** A point to mark on the outline, e.g. where a wall will be split */
  marker?: Point | null;
  /** typed lengths can't form the room — the last valid outline is shown dimmed */
  invalid?: boolean;
  niches?: PreviewNiche[];
  activeNiche?: string | null;
  onNicheTap?: (id: string) => void;
  /** sizes along the wall for the active niche; `out` points away from the room */
  dims?: { at: Point; out: Point; text: string; main: boolean }[];
}

/** A niche as the preview draws it, in room (canvas px) coordinates */
export interface PreviewNiche {
  id: string;
  /** the band between the wall and the canvas edge; absent for a niche drawn by points */
  band?: Point[];
  /** the canvas edge (or the drawn line) */
  line: Point[];
  caps: [Point, Point][];
}

const NICHE = '#00ACC1';

/** Mini drawing of the room: walls (optionally coloured and tappable), diagonals, corner letters. */
const RoomPreview: React.FC<Props> = ({
  points: pts, wallColors, selectedWall = null, onWallTap,
  diagonals = [], activeDiagonal = null, onDiagonalTap, hiddenDiagonals = [], marker, invalid,
  niches = [], activeNiche = null, onNicheTap, dims = [],
}) => {
  if (pts.length < 3) return null;

  const outline = tessellateRoom(pts, true);
  const xs = outline.map(p => p.x), ys = outline.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const sc = Math.min((VW - PAD * 2) / (maxX - minX || 1), (VH - PAD * 2) / (maxY - minY || 1));
  const ox = (VW - (maxX - minX) * sc) / 2, oy = (VH - (maxY - minY) * sc) / 2;
  const T = (p: Point): Point => ({ x: (p.x - minX) * sc + ox, y: (p.y - minY) * sc + oy });

  const n = pts.length;
  const vs = pts.map(T);
  const labels = vertexLabels(pts);
  const centre = {
    x: vs.reduce((s, p) => s + p.x, 0) / n,
    y: vs.reduce((s, p) => s + p.y, 0) / n,
  };
  const wallPath = (i: number) => {
    const a = pts[i], b = pts[(i + 1) % n];
    return [a, ...sampleArc(a, b, a.bulge)].map(T).map(p => `${p.x},${p.y}`).join(' ');
  };

  return (
    <div style={{
      borderRadius: 16, overflow: 'hidden',
      backgroundColor: '#141726',
      backgroundImage:
        'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px),' +
        'linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)',
      backgroundSize: '24px 24px',
    }}>
      <svg viewBox={`0 0 ${VW} ${VH}`} style={{ display: 'block', width: '100%', height: 'auto', opacity: invalid ? 0.35 : 1 }}>
        <polygon
          points={outline.map(p => { const q = T(p); return `${q.x},${q.y}`; }).join(' ')}
          fill="rgba(60,100,220,0.24)"
          stroke={wallColors ? 'none' : '#4f8cff'} strokeWidth={2} strokeLinejoin="round"
        />

        {/* Walls in their profile colour; the selected one gets a halo */}
        {wallColors && pts.map((_, i) => {
          const sel = selectedWall === i;
          const faded = selectedWall != null && !sel;
          const color = wallColors[i];
          return (
            <g key={`wall${i}`} onClick={onWallTap ? () => onWallTap(i) : undefined} style={{ cursor: onWallTap ? 'pointer' : undefined }}>
              {sel && <polyline points={wallPath(i)} fill="none" stroke={ACTIVE} strokeOpacity={0.45} strokeWidth={12} strokeLinecap="round" />}
              <polyline
                points={wallPath(i)} fill="none" strokeLinecap="round" strokeLinejoin="round"
                stroke={color ?? '#ff6b66'} strokeWidth={sel ? 4.5 : 3.5}
                strokeDasharray={color ? undefined : '6 5'}
                opacity={faded ? 0.55 : 1}
              />
              {onWallTap && <polyline points={wallPath(i)} fill="none" stroke="transparent" strokeWidth={22} />}
            </g>
          );
        })}

        {/* Wall lengths */}
        {pts.map((p, i) => {
          const a = vs[i], b = vs[(i + 1) % n];
          const mid = T(pointOnArc(p, pts[(i + 1) % n], p.bulge, 0.5));
          // shift the chord so its midpoint sits on the (possibly curved) wall
          const dx = mid.x - (a.x + b.x) / 2, dy = mid.y - (a.y + b.y) / 2;
          const sel = selectedWall === i;
          return (
            <text
              key={`w${i}`}
              transform={lineLabel({ x: a.x + dx, y: a.y + dy }, { x: b.x + dx, y: b.y + dy }, centre, 10)}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={sel ? 12 : 10} fontWeight={sel ? 800 : 400}
              fill={sel ? '#fff' : 'rgba(255,255,255,0.75)'}
              style={{ pointerEvents: 'none' }}
            >
              {Math.round(edgeLengthCm(pts, i))} см
            </text>
          );
        })}

        {/* Diagonals — the active one bold, the others faded */}
        {diagonals.map(d => {
          const a = vs[d.i], b = vs[d.j];
          const active = activeDiagonal === d.key;
          const hidden = hiddenDiagonals.includes(d.key);
          const faded = hidden || (activeDiagonal != null && !active);
          return (
            <g key={d.key} opacity={hidden ? 0.25 : faded ? 0.35 : 1} onClick={onDiagonalTap ? () => onDiagonalTap(d.key) : undefined} style={{ cursor: 'pointer' }}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={16} />
              <line
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={ACTIVE} strokeWidth={active ? 3 : 1.8} strokeDasharray="8 6"
              />
              <text
                transform={lineLabel(a, b, { x: (a.x + b.x) / 2 - (b.y - a.y), y: (a.y + b.y) / 2 + (b.x - a.x) }, 8)}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={11} fontWeight={700} fill={ACTIVE}
                textDecoration={hidden ? 'line-through' : undefined}
                style={{ paintOrder: 'stroke', stroke: '#141726', strokeWidth: 3 }}
              >
                {d.label} {diagonalCm(pts, d.i, d.j)} см
              </text>
            </g>
          );
        })}

        {/* Niches: hatched band, its canvas edge, a cap on each free end; the
            active one stands out, the rest fade back */}
        <defs>
          <pattern id="nicheHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="rgba(0,172,193,0.2)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(0,172,193,0.85)" strokeWidth="1.6" />
          </pattern>
        </defs>
        {niches.map(nc => {
          const active = activeNiche === nc.id;
          const faded = activeNiche != null && !active;
          const pl = (ps: Point[]) => ps.map(T).map(p => `${p.x},${p.y}`).join(' ');
          return (
            <g key={nc.id} opacity={faded ? 0.45 : 1} onClick={onNicheTap ? () => onNicheTap(nc.id) : undefined} style={{ cursor: onNicheTap ? 'pointer' : undefined }}>
              {nc.band && <polygon points={pl(nc.band)} fill="url(#nicheHatch)" />}
              {active && <polyline points={pl(nc.line)} fill="none" stroke={ACTIVE} strokeOpacity={0.45} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />}
              <polyline points={pl(nc.line)} fill="none" stroke={NICHE} strokeWidth={active ? 3 : 2.2} strokeLinecap="round" strokeLinejoin="round" />
              {nc.caps.map(([a, b], k) => {
                const p = T(a), q = T(b);
                return <line key={k} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={NICHE} strokeWidth={4} strokeLinecap="round" />;
              })}
              {onNicheTap && <polyline points={pl(nc.line)} fill="none" stroke="transparent" strokeWidth={22} />}
            </g>
          );
        })}

        {/* Sizes of the active niche, outside its wall */}
        {dims.map((d, k) => {
          const p = T(d.at);
          // a pill beside an upright wall is wider across it — push it further out
          const off = 24 + 12 * Math.abs(d.out.x);
          const x = p.x + d.out.x * off, y = p.y + d.out.y * off;
          const w = d.text.length * 6.6 + 12;
          return (
            <g key={`d${k}`} style={{ pointerEvents: 'none' }}>
              <rect x={x - w / 2} y={y - 9} width={w} height={18} rx={9} fill="#0c3b42" stroke={d.main ? NICHE : 'rgba(255,255,255,0.5)'} />
              <text x={x} y={y + 3.5} textAnchor="middle" fontSize={10.5} fontWeight={700} fill={d.main ? '#bff4fa' : '#fff'}>{d.text}</text>
            </g>
          );
        })}

        {vs.map((v, i) => (
          <g key={`v${i}`} style={{ pointerEvents: 'none' }}>
            <circle cx={v.x} cy={v.y} r={8} fill="#4f8cff" stroke="#fff" strokeWidth={1.8} />
            <text x={v.x} y={v.y + 3.5} textAnchor="middle" fontSize={10} fontWeight={700} fill="#fff">
              {labels[i]}
            </text>
          </g>
        ))}

        {marker && (() => {
          const m = T(marker);
          return (
            <g style={{ pointerEvents: 'none' }}>
              <circle cx={m.x} cy={m.y} r={10} fill="#fff" stroke={ACTIVE} strokeWidth={3} />
              <path d={`M${m.x - 3.5} ${m.y - 3.5}l7 7M${m.x + 3.5} ${m.y - 3.5}l-7 7`} stroke={ACTIVE} strokeWidth={2} />
            </g>
          );
        })()}
      </svg>
    </div>
  );
};

export default RoomPreview;
