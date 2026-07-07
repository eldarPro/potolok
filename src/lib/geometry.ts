export interface Point { x: number; y: number }

const RU_LETTERS = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ'.split('');

export function pointLabel(index: number): string {
  return RU_LETTERS[index % RU_LETTERS.length];
}

export function edgeLabel(fromIndex: number, n: number): string {
  return `${pointLabel(fromIndex)} – ${pointLabel((fromIndex + 1) % n)}`;
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

/** Convert canvas px distance to real centimeters (scale = cm per grid cell) */
export function pxToCm(px: number, scale: number): number {
  return (px * scale) / GRID_SIZE;
}

/** Length of edge i (from point[i] to point[i+1]) in meters */
export function edgeLengthM(pts: Point[], edgeIndex: number, scale: number): number {
  const n = pts.length;
  if (n < 2) return 0;
  const a = pts[edgeIndex % n];
  const b = pts[(edgeIndex + 1) % n];
  return pxToMeters(dist(a, b), scale);
}

/** Length of edge i (from point[i] to point[i+1]) in centimeters */
export function edgeLengthCm(pts: Point[], edgeIndex: number, scale: number): number {
  const n = pts.length;
  if (n < 2) return 0;
  const a = pts[edgeIndex % n];
  const b = pts[(edgeIndex + 1) % n];
  return pxToCm(dist(a, b), scale);
}

/** Format meters nicely */
export function fmtM(m: number): string {
  return m.toFixed(2) + ' м';
}

/** Format centimeters nicely */
export function fmtCm(cm: number): string {
  return Math.round(cm) + ' см';
}

function crossZ(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** True if p lies inside or on the boundary of triangle abc */
function pointInTriangle(p: Point, a: Point, b: Point, c: Point): boolean {
  const d1 = crossZ(a, b, p);
  const d2 = crossZ(b, c, p);
  const d3 = crossZ(c, a, p);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function isConvex(pts: Point[]): boolean {
  const n = pts.length;
  let pos = false, neg = false;
  for (let i = 0; i < n; i++) {
    const c = crossZ(pts[i], pts[(i + 1) % n], pts[(i + 2) % n]);
    if (c > 0) pos = true;
    if (c < 0) neg = true;
  }
  return !(pos && neg);
}

/**
 * Diagonals that fix the polygon geometry, as vertex index pairs.
 * Convex quadrilateral: both diagonals (as on a standard замерный лист).
 * Otherwise: interior diagonals of an ear-clipping triangulation (n − 3 lines).
 */
export function polygonDiagonals(pts: Point[]): [number, number][] {
  const n = pts.length;
  if (n < 4) return [];
  if (n === 4 && isConvex(pts)) return [[0, 2], [1, 3]];

  // Polygon orientation from the shoelace sum
  let s = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    s += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  const sign = s >= 0 ? 1 : -1;

  const idx = pts.map((_, i) => i);
  const diags: [number, number][] = [];
  while (idx.length > 3) {
    let clipped = false;
    for (let k = 0; k < idx.length; k++) {
      const ip = idx[(k - 1 + idx.length) % idx.length];
      const ic = idx[k];
      const inx = idx[(k + 1) % idx.length];
      const c = crossZ(pts[ip], pts[ic], pts[inx]);
      if (c * sign < 0) continue; // reflex vertex — not an ear
      if (c !== 0) {
        let contains = false;
        for (const j of idx) {
          if (j === ip || j === ic || j === inx) continue;
          if (pointInTriangle(pts[j], pts[ip], pts[ic], pts[inx])) { contains = true; break; }
        }
        if (contains) continue;
        diags.push([ip, inx]);
      }
      // c === 0: collinear vertex — clip it without a (degenerate) diagonal
      idx.splice(k, 1);
      clipped = true;
      break;
    }
    if (!clipped) break; // self-intersecting/degenerate polygon — keep what we have
  }
  return diags;
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
