export interface Point { x: number; y: number }

/** Polygon area in canvas px², using shoelace formula */
export function polygonArea(pts: Point[]): number {
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i].x * pts[j].y;
    area -= pts[j].x * pts[i].y;
  }
  return Math.abs(area) / 2;
}

/** Polygon perimeter in canvas px */
export function polygonPerimeter(pts: Point[]): number {
  let perim = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = pts[j].x - pts[i].x;
    const dy = pts[j].y - pts[i].y;
    perim += Math.sqrt(dx * dx + dy * dy);
  }
  return perim;
}

/** Distance between two points */
export function dist(a: Point, b: Point): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

/**
 * Snap angle to nearest 45° increment if within threshold degrees.
 * Returns snapped end point.
 */
export function snapAngle(start: Point, end: Point, thresholdDeg = 10): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const angle = Math.atan2(dy, dx);
  const deg = (angle * 180) / Math.PI;
  const snapped = Math.round(deg / 45) * 45;
  if (Math.abs(deg - snapped) > thresholdDeg) return end;
  const len = dist(start, end);
  const rad = (snapped * Math.PI) / 180;
  return {
    x: start.x + len * Math.cos(rad),
    y: start.y + len * Math.sin(rad),
  };
}

/** Convert canvas px distance to real cm, then to meters */
export function pxToMeters(px: number, scale: number): number {
  return (px * scale) / 100;
}

/** Format meters nicely */
export function fmtM(m: number): string {
  return m.toFixed(2) + ' м';
}
