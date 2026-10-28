export interface Point { x: number; y: number; bulge?: number; label?: string }

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

/** True if segments p1–p2 and p3–p4 properly cross (touching only at a shared endpoint doesn't count). */
function segmentsIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const d1 = crossZ(p3, p4, p1);
  const d2 = crossZ(p3, p4, p2);
  const d3 = crossZ(p1, p2, p3);
  const d4 = crossZ(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/**
 * Would bowing edge `editIndex` to `candidateBulge` make that wall cross any
 * other wall of the room (its neighbours included, further along their
 * length)? Used to stop a curvature drag right where the wall would start
 * overlapping the rest of the outline, instead of letting it pass through.
 * Segments that only touch at a shared corner don't count as crossing.
 */
export function edgeWouldCrossRoom(pts: Point[], editIndex: number, candidateBulge: number, segments = 16): boolean {
  const n = pts.length;
  if (n < 3) return false;
  const a = pts[editIndex % n];
  const b = pts[(editIndex + 1) % n];
  const candidate = [a, ...sampleArc(a, b, candidateBulge, segments)];

  for (let j = 0; j < n; j++) {
    if (j === editIndex) continue;
    const c = pts[j], d = pts[(j + 1) % n];
    const other = [c, ...sampleArc(c, d, c.bulge, segments)];
    for (let k = 0; k < candidate.length - 1; k++) {
      for (let l = 0; l < other.length - 1; l++) {
        if (segmentsIntersect(candidate[k], candidate[k + 1], other[l], other[l + 1])) return true;
      }
    }
  }
  return false;
}

const POINT_LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');

export function pointLabel(index: number): string {
  return POINT_LETTERS[index % POINT_LETTERS.length];
}

/**
 * Letters of a room's corners. Plain rooms are lettered a, b, c… by position.
 * Splitting a wall pins every corner's letter on the point and gives the new
 * point the next free one, so the existing corners keep theirs. A point
 * without a letter of its own takes the next one not in use.
 */
export function vertexLabels(pts: { label?: string }[]): string[] {
  if (!pts.some(p => p.label)) return pts.map((_, i) => pointLabel(i));
  const used = new Set(pts.map(p => p.label).filter(Boolean));
  let next = 0;
  return pts.map(p => {
    if (p.label) return p.label;
    while (used.has(pointLabel(next)) && next < POINT_LETTERS.length) next++;
    const l = pointLabel(next);
    used.add(l);
    return l;
  });
}

/** The first letter not used by any corner of the room. */
export function nextVertexLabel(pts: { label?: string }[]): string {
  const used = new Set(vertexLabels(pts));
  return POINT_LETTERS.find(l => !used.has(l)) ?? pointLabel(pts.length);
}

export function edgeLabel(pts: { label?: string }[], fromIndex: number): string {
  const l = vertexLabels(pts);
  return `${l[fromIndex]} – ${l[(fromIndex + 1) % pts.length]}`;
}

/**
 * Number of *geometric* corners in a room outline — vertices where the wall
 * actually turns. Splitting a wall (e.g. to assign a different profile to
 * part of it) or a measuring tool dropping an extra checkpoint adds a vertex
 * to `points` without adding a real corner, so plain `points.length`
 * overcounts for anything priced per corner (the fabric's free-first-4 rule
 * in particular). This walks the outline and drops straight-through points —
 * a curved edge on either side always counts as a genuine corner.
 */
export function countRealCorners(pts: Point[]): number {
  const n = pts.length;
  if (n < 3) return n;
  return cornerIndices(pts).length;
}

/**
 * Indices of the points where the wall actually turns — everything except
 * straight-through points (a split on a straight wall). Falls back to all
 * points if fewer than 3 would remain.
 */
export function cornerIndices(pts: Point[]): number[] {
  const n = pts.length;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const curr = pts[i];
    const next = pts[(i + 1) % n];
    if (prev.bulge || curr.bulge) { out.push(i); continue; }
    const ax = curr.x - prev.x, ay = curr.y - prev.y;
    const bx = next.x - curr.x, by = next.y - curr.y;
    const cross = ax * by - ay * bx;
    const collinear = Math.abs(cross) < 1e-6 && (ax * bx + ay * by) > 0;
    if (!collinear) out.push(i);
  }
  return out.length >= 3 ? out : pts.map((_, i) => i);
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
 * Inner angle at corner `v` between walls prev→v and v→next. `winding` is the
 * outline's signed shoelace sum — its sign says which side is inside, so a
 * 270° corner reads as 270°, not 90°. `start`/`sweep` (degrees, canvas y-down,
 * clockwise) span that inner side, ready for a Konva Wedge/Arc.
 */
export function cornerWedge(prev: Point, v: Point, next: Point, winding: number): { deg: number; start: number; sweep: number } {
  const inX = v.x - prev.x, inY = v.y - prev.y;
  const outX = next.x - v.x, outY = next.y - v.y;
  const turn = Math.atan2(inX * outY - inY * outX, inX * outX + inY * outY) * 180 / Math.PI;
  const sign = winding < 0 ? -1 : 1;
  const deg = 180 - turn * sign;
  const toPrev = Math.atan2(prev.y - v.y, prev.x - v.x) * 180 / Math.PI;
  const toNext = Math.atan2(outY, outX) * 180 / Math.PI;
  return { deg, start: sign > 0 ? toNext : toPrev, sweep: deg };
}

/**
 * Inner angle at the last placed point of an unfinished outline, between the
 * last wall and the one being drawn to `cursor`. The winding comes from the
 * outline so far, cursor included, closed back to the first point.
 */
export function liveCornerAngle(pts: Point[], cursor: Point): { deg: number; start: number; sweep: number } | null {
  if (pts.length < 2) return null;
  const all = [...pts, cursor];
  let s = 0;
  for (let i = 0; i < all.length; i++) {
    const a = all[i], b = all[(i + 1) % all.length];
    s += a.x * b.y - b.x * a.y;
  }
  return cornerWedge(pts[pts.length - 2], pts[pts.length - 1], cursor, s);
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

/** Real-world size a grid cell represents — fixes the canvas-px ↔ cm ratio for every room */
export const CM_PER_GRID = 50;

/** Convert canvas px distance to real meters */
export function pxToMeters(px: number): number {
  return (px * CM_PER_GRID) / (GRID_SIZE * 100);
}

/** Convert canvas px distance to real centimeters */
export function pxToCm(px: number): number {
  return (px * CM_PER_GRID) / GRID_SIZE;
}

/** Length of edge i (from point[i] to point[i+1]) in meters — arc-aware via point[i].bulge */
export function edgeLengthM(pts: Point[], edgeIndex: number): number {
  const n = pts.length;
  if (n < 2) return 0;
  const a = pts[edgeIndex % n];
  const b = pts[(edgeIndex + 1) % n];
  return pxToMeters(edgeLen(a, b, a.bulge));
}

/** Length of edge i (from point[i] to point[i+1]) in centimeters — arc-aware via point[i].bulge */
export function edgeLengthCm(pts: Point[], edgeIndex: number): number {
  const n = pts.length;
  if (n < 2) return 0;
  const a = pts[edgeIndex % n];
  const b = pts[(edgeIndex + 1) % n];
  return pxToCm(edgeLen(a, b, a.bulge));
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

/** Closest point on segment a–b to p, plus the squared distance to it. */
function closestOnSegment(p: Point, a: Point, b: Point): { point: Point; distSq: number } {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const point = { x: a.x + dx * t, y: a.y + dy * t };
  const distSq = (p.x - point.x) ** 2 + (p.y - point.y) ** 2;
  return { point, distSq };
}

/**
 * Closest point on a closed outline (consecutive segments, wrapping from the
 * last point back to the first) to `p`, with the distance to it. Used to snap
 * niche-line taps onto the room's walls regardless of the drawing grid.
 */
export function nearestPointOnOutline(p: Point, outline: Point[]): { point: Point; distance: number } {
  const n = outline.length;
  let best = { point: outline[0], distSq: Infinity };
  for (let i = 0; i < n; i++) {
    const a = outline[i], b = outline[(i + 1) % n];
    const cand = closestOnSegment(p, a, b);
    if (cand.distSq < best.distSq) best = cand;
  }
  return { point: best.point, distance: Math.sqrt(best.distSq) };
}

/** Index of the room edge (i.e. edge i runs from pts[i] to pts[(i+1)%n]) closest to `p`. */
function nearestEdgeIndex(p: Point, pts: Point[]): number {
  const n = pts.length;
  let best = 0, bestDistSq = Infinity;
  for (let i = 0; i < n; i++) {
    const { distSq } = closestOnSegment(p, pts[i], pts[(i + 1) % n]);
    if (distSq < bestDistSq) { bestDistSq = distSq; best = i; }
  }
  return best;
}

/**
 * Splices a niche's own path into the room outline in place of whichever
 * side lies between its two wall touch-points, so a niche that wraps one
 * corner or several is spliced the same way regardless of how many it
 * spans. Picks the shorter side to replace — a niche shortcuts a local
 * detour, not most of the room.
 */
function spliceNicheIntoOutline(roomPoints: Point[], path: Point[]): Point[] {
  const n = roomPoints.length;
  const startEdge = nearestEdgeIndex(path[0], roomPoints);
  const endEdge = nearestEdgeIndex(path[path.length - 1], roomPoints);

  if (startEdge === endEdge) {
    // Same wall: insert the niche's own points as new vertices right there.
    return [
      ...roomPoints.slice(0, startEdge + 1),
      ...path,
      ...roomPoints.slice(startEdge + 1),
    ];
  }

  // Rotate so startEdge becomes index 0, making the replaced range a plain
  // (non-wrapping) slice.
  const rotated = [...roomPoints.slice(startEdge), ...roomPoints.slice(0, startEdge)];
  const end = (endEdge - startEdge + n) % n;
  const forwardLen = end; // vertices rotated[1..end] would be replaced
  const backwardLen = n - end;

  if (forwardLen <= backwardLen) {
    return [rotated[0], ...path, ...rotated.slice(end + 1)];
  }
  // Replace the other side instead: keep rotated[end+1..n-1] then rotated[0],
  // with the path reversed so it still runs in the kept winding direction.
  return [...rotated.slice(end + 1), rotated[0], ...[...path].reverse()];
}

/**
 * Merges consecutive (and wrap-around) points that are practically the same
 * point, so a niche anchored right at an existing room corner doesn't leave
 * a near-zero-length edge that fools the collinearity check into treating
 * it as an extra corner.
 */
function mergeCoincidentPoints(pts: Point[]): Point[] {
  const EPS_SQ = 1e-6; // floating-point noise only — real gaps are always far bigger
  const out: Point[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || (p.x - last.x) ** 2 + (p.y - last.y) ** 2 > EPS_SQ) out.push(p);
  }
  while (out.length > 1) {
    const first = out[0], last = out[out.length - 1];
    if ((first.x - last.x) ** 2 + (first.y - last.y) ** 2 > EPS_SQ) break;
    out.pop();
  }
  return out;
}

/**
 * Total corners billable for fabric pricing. Each niche's own drawn path is
 * spliced into the room outline in place of the wall section it runs
 * against, then the combined shape's real corners are counted as one —
 * so a niche that wraps one existing corner, several, or none (a plain
 * wall-to-wall line, or a box against a single wall) all fall out of the
 * same rule instead of needing special-cased overlap bookkeeping.
 */
export function totalFabricCorners(roomPoints: Point[], nichePaths: Point[][]): number {
  if (roomPoints.length < 3) return 0;
  let combined = roomPoints;
  for (const path of nichePaths) {
    if (path.length < 2) continue;
    combined = spliceNicheIntoOutline(combined, path);
  }
  return countRealCorners(mergeCoincidentPoints(combined));
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
