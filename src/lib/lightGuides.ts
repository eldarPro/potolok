import { Point, pxToCm } from './geometry';

/** sin of the angle off a wall's direction within which two lights still stand in a row */
const ROW_TOLERANCE = Math.sin(8 * Math.PI / 180);

/** A dimension line from a selected light: where it ends and its length in cm */
export interface LightGuide { from: Point; to: Point; cm: number; kind: 'wall' | 'light' }

const sub = (a: Point, b: Point) => ({ x: a.x - b.x, y: a.y - b.y });
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;

/** Do segments p1–p2 and q1–q2 cross (touching at an end doesn't count)? */
const segmentsCross = (p1: Point, p2: Point, q1: Point, q2: Point) => {
  const r = sub(p2, p1), s = sub(q2, q1);
  const den = cross(r, s);
  if (Math.abs(den) < 1e-9) return false;
  const qp = sub(q1, p1);
  const t = cross(qp, s) / den, u = cross(qp, r) / den;
  const eps = 1e-6;
  return t > eps && t < 1 - eps && u > eps && u < 1 - eps;
};

/**
 * Where a marker sets out a point light: square distances to the two nearest
 * walls running different ways (so the light is fixed by two numbers), and
 * to the nearest other point light. A wall only counts when the square
 * line to it stays inside the room, and arcs are skipped — there is no
 * single square distance to a curve.
 */
export function pointLightGuides(
  walls: (Point & { bulge?: number })[],
  at: Point,
  others: Point[] = [],
): LightGuide[] {
  const n = walls.length;
  const feet: { i: number; foot: Point; d: number; dir: Point }[] = [];
  for (let i = 0; i < n; i++) {
    const a = walls[i], b = walls[(i + 1) % n];
    if (a.bulge) continue;
    const ab = sub(b, a);
    const len2 = ab.x * ab.x + ab.y * ab.y;
    if (len2 < 1e-9) continue;
    const t = ((at.x - a.x) * ab.x + (at.y - a.y) * ab.y) / len2;
    if (t < 0 || t > 1) continue;
    const foot = { x: a.x + ab.x * t, y: a.y + ab.y * t };
    const blocked = walls.some((c, j) => j !== i && segmentsCross(at, foot, c, walls[(j + 1) % n]));
    if (blocked) continue;
    const len = Math.sqrt(len2);
    feet.push({ i, foot, d: Math.hypot(at.x - foot.x, at.y - foot.y), dir: { x: ab.x / len, y: ab.y / len } });
  }
  feet.sort((p, q) => p.d - q.d);
  const out: LightGuide[] = [];
  const first = feet[0];
  if (first) {
    out.push({ from: at, to: first.foot, cm: pxToCm(first.d), kind: 'wall' });
    // the second wall must run across the first, or the two numbers say the same thing
    const second = feet.find(f => Math.abs(cross(f.dir, first.dir)) > 0.5);
    if (second) out.push({ from: at, to: second.foot, cm: pxToCm(second.d), kind: 'wall' });
  }
  // the nearest light in the same row or column — along one of the walls just measured to
  const axes = out.map(g => feet.find(f => f.foot === g.to)!.dir);
  const inLine = (o: Point, d: number) => axes.some(ax => Math.abs(cross({ x: (o.x - at.x) / d, y: (o.y - at.y) / d }, ax)) < ROW_TOLERANCE);
  let best: Point | null = null, bestD = Infinity;
  for (const o of others) {
    const d = Math.hypot(o.x - at.x, o.y - at.y);
    if (d > 1e-6 && d < bestD && inLine(o, d)) { best = o; bestD = d; }
  }
  if (best) out.push({ from: at, to: best, cm: pxToCm(bestD), kind: 'light' });
  return out;
}

/** Direction (degrees) of the nearest path segment within reach — a track spot turns across its track */
export function nearestSegmentAngle(paths: Point[][], at: Point, reach: number): number | null {
  let best: number | null = null, bestD = reach;
  for (const ps of paths) {
    for (let i = 0; i + 1 < ps.length; i++) {
      const a = ps[i], b = ps[i + 1], ab = sub(b, a);
      const len2 = ab.x * ab.x + ab.y * ab.y;
      if (len2 < 1e-9) continue;
      const t = Math.max(0, Math.min(1, ((at.x - a.x) * ab.x + (at.y - a.y) * ab.y) / len2));
      const d = Math.hypot(at.x - (a.x + ab.x * t), at.y - (a.y + ab.y * t));
      if (d <= bestD) { bestD = d; best = Math.atan2(ab.y, ab.x) * 180 / Math.PI; }
    }
  }
  return best;
}

/** Where a path light's length label goes: the middle of its longest run, and that run's direction */
export function pathLabelAnchor(ps: Point[]): { at: Point; dir: Point } | null {
  let best = -1, bi = -1;
  for (let i = 0; i + 1 < ps.length; i++) {
    const d = Math.hypot(ps[i + 1].x - ps[i].x, ps[i + 1].y - ps[i].y);
    if (d > best) { best = d; bi = i; }
  }
  if (bi < 0 || best < 1e-9) return null;
  const a = ps[bi], b = ps[bi + 1];
  return { at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dir: { x: (b.x - a.x) / best, y: (b.y - a.y) / best } };
}
