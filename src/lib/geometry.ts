export interface Point { x: number; y: number; bulge?: number }

// ── Curved (bulged) edges ──
// A wall segment a→b can bow into a circular arc via a DXF-style "bulge" factor
// stored on its start point: bulge = tan(θ/4), where θ is the arc's included
// angle (signed — the side it bows to). bulge = 0 (or absent) is a straight wall.

export interface ArcInfo { cx: number; cy: number; r: number; theta: number; angleA: number }

/** Circle-arc parameters for edge a→b bowed by `bulge`. Null when the edge is straight. */
export function arcInfo(a: Point, b: Point, bulge: number | undefined): ArcInfo | null {
  if (!bulge) return null;
  const dx = b.x - a.x, dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d === 0) return null;
  const half = d / 2;
  const phi = 2 * Math.atan(bulge);   // half the included angle
  const theta = 2 * phi;              // included angle (signed)
  const rSigned = half / Math.sin(phi);
  const ux = dx / d, uy = dy / d;
  const px = -uy, py = ux;            // left-hand normal of a→b
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const apothem = rSigned * Math.cos(phi);
  const cx = mx - px * apothem;
  const cy = my - py * apothem;
  const angleA = Math.atan2(a.y - cy, a.x - cx);
  return { cx, cy, r: Math.abs(rSigned), theta, angleA };
}

/** Point on edge a→b at fraction t ∈ [0,1] of its length (arc-aware). */
export function pointOnArc(a: Point, b: Point, bulge: number | undefined, t: number): Point {
  const info = arcInfo(a, b, bulge);
  if (!info) return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  const ang = info.angleA - info.theta * t;
  return { x: info.cx + info.r * Math.cos(ang), y: info.cy + info.r * Math.sin(ang) };
}

/** Length of edge a→b — arc length when bulged, straight distance otherwise. */
export function edgeLen(a: Point, b: Point, bulge?: number): number {
  const info = arcInfo(a, b, bulge);
  return info ? info.r * Math.abs(info.theta) : Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Signed area correction to add to the vertex (chord) shoelace sum for a bulged
 * edge — twice the area between chord a–b and its arc, oriented consistently
 * with the shoelace sum's sign (add both, then halve once at the end).
 */
export function bulgeAreaCorrection(a: Point, b: Point, bulge?: number): number {
  const info = arcInfo(a, b, bulge);
  if (!info) return 0;
  return -(info.r * info.r * (info.theta - Math.sin(info.theta)));
}

/** Points sampling edge a→b (excludes a, includes b) — for rendering/hit-testing curved edges. */
export function sampleArc(a: Point, b: Point, bulge?: number, segments = 24): Point[] {
  if (!bulge) return [b];
  const pts: Point[] = [];
  for (let i = 1; i <= segments; i++) pts.push(pointOnArc(a, b, bulge, i / segments));
  return pts;
}

/** Handle point for editing an edge's curvature — sits on the arc, midway along it. */
export function arcHandlePoint(a: Point, b: Point, bulge: number | undefined): Point {
  return pointOnArc(a, b, bulge ?? 0, 0.5);
}

/**
 * Bulge for edge a→b such that its arc passes through an arbitrary point `m`
 * (grabbed anywhere along the wall, not necessarily its midpoint) — fits the
 * unique circle through a, m, b and derives the signed bulge from it.
 */
export function bulgeFromThreePoints(a: Point, b: Point, m: Point, maxBulge = 4): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d === 0) return 0;
  // Which side of the directed chord a→b does m sit on? That side's sign IS the bulge's sign
  // (positive bulge always bows toward the left-hand normal of a→b, per arcInfo's convention).
  const cross = dx * (m.y - a.y) - dy * (m.x - a.x);
  if (Math.abs(cross) < 1e-9) return 0; // m sits on the chord — straight

  // Circumcenter of a, m, b (standard determinant formula).
  const D = 2 * (a.x * (m.y - b.y) + m.x * (b.y - a.y) + b.x * (a.y - m.y));
  if (Math.abs(D) < 1e-9) return 0; // a, m, b collinear — degenerate, treat as straight
  const aa = a.x * a.x + a.y * a.y, mm = m.x * m.x + m.y * m.y, bb = b.x * b.x + b.y * b.y;
  const ux = (aa * (m.y - b.y) + mm * (b.y - a.y) + bb * (a.y - m.y)) / D;
  const uy = (aa * (b.x - m.x) + mm * (a.x - b.x) + bb * (m.x - a.x)) / D;
  const R = Math.hypot(a.x - ux, a.y - uy);

  const half = d / 2;
  const sweepMinor = 2 * Math.asin(Math.min(1, half / R)); // minor-arc included angle, in (0, π]
  // m lies on the minor arc (opposite side of the chord from the center) or the
  // major arc (same side as the center) — decides whether θ is sweepMinor or its reflex.
  const crossCenter = dx * (uy - a.y) - dy * (ux - a.x);
  const onMajorArc = Math.sign(cross) === Math.sign(crossCenter);
  const theta = onMajorArc ? 2 * Math.PI - sweepMinor : sweepMinor;
  const bulge = Math.sign(cross) * Math.tan(theta / 4);
  return Math.max(-maxBulge, Math.min(maxBulge, bulge));
}

/** Split a bulged edge at arc-length fraction t into two bulges of the same circle. */
export function splitBulge(bulge: number, t: number): [number, number] {
  if (!bulge) return [0, 0];
  const theta = 4 * Math.atan(bulge);
  return [Math.tan((theta * t) / 4), Math.tan((theta * (1 - t)) / 4)];
}

/**
 * Tessellate a room outline (straight or bulged edges) into a fine point list,
 * for rendering (Konva/SVG polylines) and for hit-testing (point-in-polygon).
 * `closed=true` also samples the wrap-around edge from the last point back to the first.
 */
export function tessellateRoom(pts: Point[], closed = true, segments = 24): Point[] {
  const n = pts.length;
  if (n === 0) return [];
  const out: Point[] = [pts[0]];
  const edges = closed ? n : n - 1;
  for (let i = 0; i < edges; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    out.push(...sampleArc(a, b, a.bulge, segments));
  }
  return out;
}

const RU_LETTERS = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ'.split('');

export function pointLabel(index: number): string {
  return RU_LETTERS[index % RU_LETTERS.length];
}

export function edgeLabel(fromIndex: number, n: number): string {
  return `${pointLabel(fromIndex)} – ${pointLabel((fromIndex + 1) % n)}`;
}

/** Polygon area in canvas px², using shoelace formula (arc-aware via per-point bulge) */
export function polygonArea(pts: Point[]): number {
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i].x * pts[j].y;
    area -= pts[j].x * pts[i].y;
    area += bulgeAreaCorrection(pts[i], pts[j], pts[i].bulge);
  }
  return Math.abs(area) / 2;
}

/** Polygon perimeter in canvas px (arc-aware via per-point bulge) */
export function polygonPerimeter(pts: Point[]): number {
  let perim = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    perim += edgeLen(pts[i], pts[j], pts[i].bulge);
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

/** Length of edge i (from point[i] to point[i+1]) in meters — arc-aware via point[i].bulge */
export function edgeLengthM(pts: Point[], edgeIndex: number, scale: number): number {
  const n = pts.length;
  if (n < 2) return 0;
  const a = pts[edgeIndex % n];
  const b = pts[(edgeIndex + 1) % n];
  return pxToMeters(edgeLen(a, b, a.bulge), scale);
}

/** Length of edge i (from point[i] to point[i+1]) in centimeters — arc-aware via point[i].bulge */
export function edgeLengthCm(pts: Point[], edgeIndex: number, scale: number): number {
  const n = pts.length;
  if (n < 2) return 0;
  const a = pts[edgeIndex % n];
  const b = pts[(edgeIndex + 1) % n];
  return pxToCm(edgeLen(a, b, a.bulge), scale);
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
