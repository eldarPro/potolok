import React from 'react';
import { tessellateRoom, pointOnArc, pointLabel, edgeLengthCm, Point } from '../lib/geometry';
import { DiagonalInfo, diagonalCm } from '../lib/diagonals';

const VW = 400;
const VH = 260;
const PAD = 34;

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
  diagonals: DiagonalInfo[];
  activeKey: string | null;
  /** typed lengths can't form the room — the last valid outline is shown dimmed */
  invalid?: boolean;
  onSelect: (key: string) => void;
}

/** Mini drawing of the room with its diagonals; the active one is emphasised. */
const DiagonalPreview: React.FC<Props> = ({ points: pts, diagonals, activeKey, invalid, onSelect }) => {
  if (pts.length < 3) return null;

  const outline = tessellateRoom(pts, true);
  const xs = outline.map(p => p.x), ys = outline.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const sc = Math.min((VW - PAD * 2) / (maxX - minX || 1), (VH - PAD * 2) / (maxY - minY || 1));
  const ox = (VW - (maxX - minX) * sc) / 2, oy = (VH - (maxY - minY) * sc) / 2;
  const T = (p: Point): Point => ({ x: (p.x - minX) * sc + ox, y: (p.y - minY) * sc + oy });

  const vs = pts.map(T);
  const centre = {
    x: vs.reduce((s, p) => s + p.x, 0) / vs.length,
    y: vs.reduce((s, p) => s + p.y, 0) / vs.length,
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
          fill="rgba(60,100,220,0.28)" stroke="#4f8cff" strokeWidth={2} strokeLinejoin="round"
        />

        {/* Wall lengths */}
        {pts.map((p, i) => {
          const a = vs[i], b = vs[(i + 1) % pts.length];
          const mid = T(pointOnArc(p, pts[(i + 1) % pts.length], p.bulge, 0.5));
          // shift the chord so its midpoint sits on the (possibly curved) wall
          const dx = mid.x - (a.x + b.x) / 2, dy = mid.y - (a.y + b.y) / 2;
          return (
            <text
              key={`w${i}`}
              transform={lineLabel({ x: a.x + dx, y: a.y + dy }, { x: b.x + dx, y: b.y + dy }, centre, 9)}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={10} fill="rgba(255,255,255,0.75)"
            >
              {Math.round(edgeLengthCm(pts, i))} см
            </text>
          );
        })}

        {/* Diagonals — the active one bold, the others faded */}
        {diagonals.map(d => {
          const a = vs[d.i], b = vs[d.j];
          const active = activeKey === d.key;
          const faded = activeKey != null && !active;
          const color = '#F9A825';
          return (
            <g key={d.key} opacity={faded ? 0.35 : 1} onClick={() => onSelect(d.key)} style={{ cursor: 'pointer' }}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={16} />
              <line
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={color} strokeWidth={active ? 3 : 1.8} strokeDasharray="8 6"
              />
              <text
                transform={lineLabel(a, b, { x: (a.x + b.x) / 2 - (b.y - a.y), y: (a.y + b.y) / 2 + (b.x - a.x) }, 8)}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={11} fontWeight={700} fill={color}
                style={{ paintOrder: 'stroke', stroke: '#141726', strokeWidth: 3 }}
              >
                {d.label} {diagonalCm(pts, d.i, d.j)} см
              </text>
            </g>
          );
        })}

        {vs.map((v, i) => (
          <g key={`v${i}`}>
            <circle cx={v.x} cy={v.y} r={8} fill="#4f8cff" stroke="#fff" strokeWidth={1.8} />
            <text x={v.x} y={v.y + 3.5} textAnchor="middle" fontSize={10} fontWeight={700} fill="#fff">
              {pointLabel(i)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
};

export default DiagonalPreview;
