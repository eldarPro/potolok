export interface Point { x: number; y: number }

const RU_LETTERS = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ'.split('');

export function pointLabel(index: number): string {
  return RU_LETTERS[index % RU_LETTERS.length];
}

export function edgeLabel(fromIndex: number, n: number): string {
  return `${pointLabel(fromIndex)}–${pointLabel((fromIndex + 1) % n)}`;
}

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

/** Grid cell size in pixels — must match CeilingCanvas */
export const GRID_SIZE = 40;

/** Convert canvas px distance to real meters (scale = cm per grid cell) */
export function pxToMeters(px: number, scale: number): number {
  return (px * scale) / (GRID_SIZE * 100);
}

/** Length of edge i (from point[i] to point[i+1]) in meters */
export function edgeLengthM(pts: Point[], edgeIndex: number, scale: number): number {
  const n = pts.length;
  if (n < 2) return 0;
  const a = pts[edgeIndex % n];
  const b = pts[(edgeIndex + 1) % n];
  return pxToMeters(dist(a, b), scale);
}

/** Format meters nicely */
export function fmtM(m: number): string {
  return m.toFixed(2) + ' м';
}

/** Ray-casting point-in-polygon test */
export function pointInPolygon(pt: Point, polygon: Point[]): boolean {
  const n = polygon.length;
  if (n < 3) return false;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if (((yi > pt.y) !== (yj > pt.y)) &&
        (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}
