import { Point, polygonDiagonals, vertexLabels, cornerIndices, pointInPolygon, pxToCm, dist, GRID_SIZE, CM_PER_GRID } from './geometry';

// Points on a straight wall (where a wall was split to change profile) aren't
// corners: no diagonals run to them, and reshaping keeps them on their wall.

type Pair = [number, number];

export const diagonalKey = (i: number, j: number) => (i < j ? `${i}-${j}` : `${j}-${i}`);

export interface DiagonalInfo {
  i: number;
  j: number;
  key: string;
  label: string;
}

/** Triangulation of the corner outline: n − 3 diagonals, in point indices. */
function baseDiagonals(pts: Point[]): Pair[] {
  const corners = cornerIndices(pts);
  // a convex quad comes back with both diagonals — keep one, the other is its cross
  return polygonDiagonals(corners.map(i => pts[i]))
    .slice(0, Math.max(0, corners.length - 3))
    .map(([p, q]) => [Math.min(corners[p], corners[q]), Math.max(corners[p], corners[q])] as Pair);
}

/**
 * For each triangulation diagonal whose two triangles make a convex quad, the
 * quad's other diagonal — measured as a check, like the second diagonal of a
 * plain rectangular room. Maps the cross diagonal's key to the one it crosses.
 */
function crossDiagonals(pts: Point[], base: Pair[]): Map<string, { cross: Pair; base: Pair }> {
  const tris = triangles(pts, base);
  const out = new Map<string, { cross: Pair; base: Pair }>();
  for (const [p, q] of base) {
    const apex = tris.filter(t => t.includes(p) && t.includes(q)).map(t => t.find(v => v !== p && v !== q)!);
    if (apex.length !== 2) continue;
    const [r, s] = apex;
    const P = pts[p], Q = pts[q], R = pts[r], S = pts[s];
    const convex = cross(P, Q, R) * cross(P, Q, S) < 0 && cross(R, S, P) * cross(R, S, Q) < 0;
    if (!convex) continue;
    const pair: Pair = [Math.min(r, s), Math.max(r, s)];
    out.set(diagonalKey(r, s), { cross: pair, base: [p, q] });
  }
  return out;
}

/** Corner pairs whose straight segment runs inside the room, touching no wall on the way. */
function interiorDiagonals(pts: Point[]): Pair[] {
  const c = cornerIndices(pts);
  const m = c.length;
  const poly = c.map(i => pts[i]);
  const out: Pair[] = [];
  for (let x = 0; x < m; x++)
    for (let y = x + 2; y < m; y++) {
      if (x === 0 && y === m - 1) continue; // neighbours across the wrap — a wall
      const P = poly[x], Q = poly[y];
      const hitsWall = poly.some((A, k) => {
        const k2 = (k + 1) % m;
        if (k === x || k === y || k2 === x || k2 === y) return false;
        const B = poly[k2];
        return cross(P, Q, A) * cross(P, Q, B) < 0 && cross(A, B, P) * cross(A, B, Q) < 0;
      });
      if (hitsWall || !pointInPolygon({ x: (P.x + Q.x) / 2, y: (P.y + Q.y) / 2 }, poly)) continue;
      out.push([c[x], c[y]]);
    }
  return out;
}

/**
 * Diagonals shown for a room, vertex pair always in ascending order (a–c, not
 * c–a): the triangulation and its cross checks first, then every other corner
 * pair that can be measured inside the room.
 */
export function roomDiagonals(pts: Point[]): DiagonalInfo[] {
  const labels = vertexLabels(pts);
  const base = baseDiagonals(pts);
  const crosses = [...crossDiagonals(pts, base).values()].map(c => c.cross);
  const shown = new Set([...base, ...crosses].map(d => diagonalKey(...d)));
  const rest = interiorDiagonals(pts).filter(d => !shown.has(diagonalKey(...d)));
  return [...base, ...crosses, ...rest].map(([i, j]) => ({ i, j, key: diagonalKey(i, j), label: `${labels[i]}–${labels[j]}` }));
}

/** A triangulation of the corner outline that includes the diagonal i–j: each side of it triangulated on its own. */
function triangulationThrough(pts: Point[], i: number, j: number): Pair[] {
  const c = cornerIndices(pts);
  const x = c.indexOf(i), y = c.indexOf(j);
  const half = (from: number, to: number) => {
    const ids: number[] = [];
    for (let k = from; ; k = (k + 1) % c.length) { ids.push(c[k]); if (k === to) break; }
    return polygonDiagonals(ids.map(v => pts[v]))
      .slice(0, Math.max(0, ids.length - 3))
      .map(([p, q]) => [Math.min(ids[p], ids[q]), Math.max(ids[p], ids[q])] as Pair);
  };
  return [[Math.min(i, j), Math.max(i, j)], ...half(x, y), ...half(y, x)];
}

export const diagonalCm = (pts: Point[], i: number, j: number) => Math.round(pxToCm(dist(pts[i], pts[j])));

const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

const cmToPx = (cm: number) => (cm * GRID_SIZE) / CM_PER_GRID;

/**
 * The diagonals that, together with the walls, pin down the shape: exactly
 * n − 3 of them. The rest follow from these, so `driverKey` swaps in the one
 * being typed: a cross diagonal in place of the one it crosses, any other by
 * triangulating around it.
 */
export function shapeDiagonals(pts: Point[], driverKey?: string | null): Pair[] {
  const base = baseDiagonals(pts);
  if (!driverKey || base.some(d => diagonalKey(...d) === driverKey)) return base;
  const flip = crossDiagonals(pts, base).get(driverKey);
  if (!flip) {
    // any other diagonal: re-triangulate around it
    const [i, j] = driverKey.split('-').map(Number);
    if (!interiorDiagonals(pts).some(d => diagonalKey(...d) === driverKey)) return base;
    return triangulationThrough(pts, i, j);
  }
  const baseKey = diagonalKey(...flip.base);
  return base.map(d => (diagonalKey(...d) === baseKey ? flip.cross : d));
}

/** Triangles of the corner outline split by `diags` (corner-to-corner walls + diagonals as sides). */
function triangles(pts: Point[], diags: Pair[]): [number, number, number][] {
  const c = cornerIndices(pts);
  const m = c.length;
  const edges = new Set<string>();
  for (let k = 0; k < m; k++) edges.add(diagonalKey(c[k], c[(k + 1) % m]));
  diags.forEach(([i, j]) => edges.add(diagonalKey(i, j)));
  const has = (i: number, j: number) => edges.has(diagonalKey(i, j));
  const out: [number, number, number][] = [];
  for (let x = 0; x < m; x++)
    for (let y = x + 1; y < m; y++)
      if (has(c[x], c[y]))
        for (let z = y + 1; z < m; z++)
          if (has(c[x], c[z]) && has(c[y], c[z])) out.push([c[x], c[y], c[z]]);
  return out;
}

/**
 * Rebuild the outline so the diagonals in `targetCm` get those lengths while
 * every wall keeps its length (bulges are kept as-is, so curved walls keep
 * their shape too). The polygon is laid out triangle by triangle across the
 * triangulation, each new corner on the same side it was before. Returns null
 * when some triangle can't exist with these lengths.
 */
export function reshapeByDiagonals(pts: Point[], diags: Pair[], targetCm: Record<string, number>): Point[] | null {
  const n = pts.length;
  const corners = cornerIndices(pts);
  const len = (i: number, j: number) => {
    const t = targetCm[diagonalKey(i, j)];
    return t != null ? cmToPx(t) : dist(pts[i], pts[j]);
  };
  const tris = triangles(pts, diags);
  if (tris.length !== corners.length - 2) return null;

  const placed: (Point | null)[] = new Array(n).fill(null);
  const [c0, c1] = corners;
  const d01 = dist(pts[c0], pts[c1]);
  if (d01 === 0) return null;
  placed[c0] = { x: pts[c0].x, y: pts[c0].y };
  placed[c1] = {
    x: pts[c0].x + (pts[c1].x - pts[c0].x) / d01 * len(c0, c1),
    y: pts[c0].y + (pts[c1].y - pts[c0].y) / d01 * len(c0, c1),
  };

  for (let left = corners.length - 2; left > 0; left--) {
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

  // A point on a straight wall stays on it, at the same fraction of the wall.
  corners.forEach((from, k) => {
    const to = corners[(k + 1) % corners.length];
    const span = dist(pts[from], pts[to]);
    for (let i = (from + 1) % n; i !== to; i = (i + 1) % n) {
      const f = span > 0 ? dist(pts[from], pts[i]) / span : 0;
      const A = placed[from]!, B = placed[to]!;
      placed[i] = { x: A.x + (B.x - A.x) * f, y: A.y + (B.y - A.y) * f };
    }
  });

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
  for (const tri of triangles(pts, diags)) {
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
  const tris = triangles(oldPts, diags);
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
