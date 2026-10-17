import { Point, polygonDiagonals, pointLabel, pxToCm, dist, GRID_SIZE, CM_PER_GRID } from './geometry';

type Pair = [number, number];

export const diagonalKey = (i: number, j: number) => (i < j ? `${i}-${j}` : `${j}-${i}`);

export interface DiagonalInfo {
  i: number;
  j: number;
  key: string;
  label: string;
}

/** Diagonals shown for a room, vertex pair always in ascending order (a–c, not c–a). */
export function roomDiagonals(pts: Point[]): DiagonalInfo[] {
  return polygonDiagonals(pts).map(([p, q]) => {
    const i = Math.min(p, q), j = Math.max(p, q);
    return { i, j, key: diagonalKey(i, j), label: `${pointLabel(i)}–${pointLabel(j)}` };
  });
}

export const diagonalCm = (pts: Point[], i: number, j: number) => Math.round(pxToCm(dist(pts[i], pts[j])));

const cmToPx = (cm: number) => (cm * GRID_SIZE) / CM_PER_GRID;

/**
 * The diagonals that, together with the walls, pin down the shape: exactly
 * n − 3 of them. A convex quad lists both crossing diagonals, but only one
 * can be set freely — `driverKey` picks which; the other follows from it.
 */
export function shapeDiagonals(pts: Point[], driverKey?: string | null): Pair[] {
  const all = roomDiagonals(pts).map(d => [d.i, d.j] as Pair);
  if (all.length <= pts.length - 3) return all;
  return [all.find(([i, j]) => diagonalKey(i, j) === driverKey) ?? all[0]];
}

/** Triangles of the polygon split by `diags` (walls + diagonals as their sides). */
function triangles(n: number, diags: Pair[]): [number, number, number][] {
  const edges = new Set<string>();
  for (let i = 0; i < n; i++) edges.add(diagonalKey(i, (i + 1) % n));
  diags.forEach(([i, j]) => edges.add(diagonalKey(i, j)));
  const has = (i: number, j: number) => edges.has(diagonalKey(i, j));
  const out: [number, number, number][] = [];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      if (has(i, j))
        for (let k = j + 1; k < n; k++)
          if (has(i, k) && has(j, k)) out.push([i, j, k]);
  return out;
}

const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/**
 * Rebuild the outline so the diagonals in `targetCm` get those lengths while
 * every wall keeps its length (bulges are kept as-is, so curved walls keep
 * their shape too). The polygon is laid out triangle by triangle across the
 * triangulation, each new corner on the same side it was before. Returns null
 * when some triangle can't exist with these lengths.
 */
export function reshapeByDiagonals(pts: Point[], diags: Pair[], targetCm: Record<string, number>): Point[] | null {
  const n = pts.length;
  const len = (i: number, j: number) => {
    const t = targetCm[diagonalKey(i, j)];
    return t != null ? cmToPx(t) : dist(pts[i], pts[j]);
  };
  const tris = triangles(n, diags);
  if (tris.length !== n - 2) return null;

  const placed: (Point | null)[] = new Array(n).fill(null);
  const d01 = dist(pts[0], pts[1]);
  if (d01 === 0) return null;
  placed[0] = { x: pts[0].x, y: pts[0].y };
  placed[1] = {
    x: pts[0].x + (pts[1].x - pts[0].x) / d01 * len(0, 1),
    y: pts[0].y + (pts[1].y - pts[0].y) / d01 * len(0, 1),
  };

  for (let left = n - 2; left > 0; left--) {
    const tri = tris.find(t => t.filter(v => placed[v]).length === 2);
    if (!tri) return null;
    const [a, b] = tri.filter(v => placed[v]);
    const c = tri.find(v => !placed[v])!;
    const A = placed[a]!, B = placed[b]!;
    const d = dist(A, B);
    const ra = len(a, c), rb = len(b, c);
    const x = (ra * ra - rb * rb + d * d) / (2 * d);
    const h2 = ra * ra - x * x;
    if (!(d > 0) || !(h2 > 1e-6)) return null;
    const ex = (B.x - A.x) / d, ey = (B.y - A.y) / d;
    const side = Math.sign(cross(pts[a], pts[b], pts[c])) || 1;
    const h = Math.sqrt(h2) * side;
    placed[c] = { x: A.x + ex * x - ey * h, y: A.y + ey * x + ex * h };
  }

  // Keep the room where it was on the canvas: same centre as before.
  const cx = (ps: Point[]) => ps.reduce((s, p) => s + p.x, 0) / ps.length;
  const cy = (ps: Point[]) => ps.reduce((s, p) => s + p.y, 0) / ps.length;
  const out = placed as Point[];
  const dx = cx(pts) - cx(out), dy = cy(pts) - cy(out);
  return pts.map((p, i) => ({ ...p, x: out[i].x + dx, y: out[i].y + dy }));
}

/**
 * Lengths `key` could take with everything else fixed: each of the two
 * triangles it borders needs |s1 − s2| < d < s1 + s2.
 */
export function diagonalRangeCm(pts: Point[], diags: Pair[], targetCm: Record<string, number>, key: string): [number, number] | null {
  const len = (i: number, j: number) => {
    const t = targetCm[diagonalKey(i, j)];
    return t != null ? cmToPx(t) : dist(pts[i], pts[j]);
  };
  let lo = 0, hi = Infinity;
  for (const tri of triangles(pts.length, diags)) {
    const k = tri.findIndex((_, m) => diagonalKey(tri[m], tri[(m + 1) % 3]) === key);
    if (k < 0) continue;
    const [p, q, r] = [tri[k], tri[(k + 1) % 3], tri[(k + 2) % 3]];
    const s1 = len(p, r), s2 = len(q, r);
    lo = Math.max(lo, Math.abs(s1 - s2));
    hi = Math.min(hi, s1 + s2);
  }
  if (!isFinite(hi)) return null;
  return [Math.ceil(pxToCm(lo)) + 1, Math.floor(pxToCm(hi)) - 1];
}

type XY = { x: number; y: number };

function barycentric(p: XY, a: XY, b: XY, c: XY): [number, number, number] | null {
  const det = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
  if (Math.abs(det) < 1e-9) return null;
  const u = ((b.y - c.y) * (p.x - c.x) + (c.x - b.x) * (p.y - c.y)) / det;
  const v = ((c.y - a.y) * (p.x - c.x) + (a.x - c.x) * (p.y - c.y)) / det;
  return [u, v, 1 - u - v];
}

/**
 * Carry things drawn inside the room (lights, niche lines) along when the
 * outline is reshaped: each point keeps its barycentric position in the
 * triangle that holds it — or the nearest one, for a point out on a curved
 * wall — so a spot in a corner stays in that corner and a point on a wall
 * stays on that wall.
 */
export function makePointMapper(oldPts: Point[], newPts: Point[], diags: Pair[]): (p: XY) => XY {
  const tris = triangles(oldPts.length, diags);
  return p => {
    let best: { t: [number, number, number]; bc: [number, number, number] } | null = null;
    let bestScore = -Infinity;
    for (const t of tris) {
      const bc = barycentric(p, oldPts[t[0]], oldPts[t[1]], oldPts[t[2]]);
      if (!bc) continue;
      const score = Math.min(...bc); // ≥ 0 inside; the least negative is the nearest
      if (score > bestScore) { bestScore = score; best = { t, bc }; }
    }
    if (!best) return { x: p.x, y: p.y };
    const [i, j, k] = best.t;
    const [u, v, w] = best.bc;
    return {
      x: u * newPts[i].x + v * newPts[j].x + w * newPts[k].x,
      y: u * newPts[i].y + v * newPts[j].y + w * newPts[k].y,
    };
  };
}
