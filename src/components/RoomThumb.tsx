import React from 'react';
import { tessellateRoom } from '../lib/geometry';

interface Props {
  points: { x: number; y: number; bulge?: number }[];
  /** Outer size of the square svg, px */
  size: number;
  /** Empty space around the outline, px */
  pad?: number;
  strokeWidth?: number;
}

/** Room outline scaled into a square — for lists and tiles. */
const RoomThumb: React.FC<Props> = ({ points, size, pad = 6, strokeWidth = 1.6 }) => {
  if (points.length < 3) return null;
  const outline = tessellateRoom(points, true);
  const xs = outline.map(p => p.x);
  const ys = outline.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = maxX - minX || 1;
  const h = maxY - minY || 1;
  const inner = size - pad * 2;
  const sc = Math.min(inner / w, inner / h);
  const ox = pad + (inner - w * sc) / 2;
  const oy = pad + (inner - h * sc) / 2;
  const poly = outline.map(p => `${(p.x - minX) * sc + ox},${(p.y - minY) * sc + oy}`).join(' ');
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ display: 'block' }}>
      <polygon
        points={poly}
        style={{ fill: 'rgba(var(--color-primary-rgb), 0.16)', stroke: 'var(--color-primary)' }}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    </svg>
  );
};

export default RoomThumb;
