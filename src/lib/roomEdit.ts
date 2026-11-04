import { Room, CatalogItem, RoomProfileSegment, RoomNicheElement, WallPoint } from '../types';
import { nicheSpan } from './nicheGeometry';
import {
  Point, polygonArea, polygonPerimeter, pxToMeters, edgeLengthM, edgeLengthCm, edgeLen, dist,
  pointOnArc, splitBulge, vertexLabels, nextVertexLabel, edgeWouldCrossRoom, GRID_SIZE, CM_PER_GRID,
} from './geometry';
import { shapeDiagonals, makePointMapper, diagonalKey } from './diagonals';
import { pickFrame, frameCoords, framePoint } from './lightScales';

// Edits of a room's outline shared by the drawing (element card) and the
// materials pages. Each returns the fields of the room that change.

export const cmToPx = (cm: number) => (cm * GRID_SIZE) / CM_PER_GRID;

export const roomMetrics = (pts: Point[]) => ({
  areaSqm: parseFloat((pxToMeters(Math.sqrt(polygonArea(pts))) ** 2).toFixed(2)),
  perimeterM: parseFloat(pxToMeters(polygonPerimeter(pts)).toFixed(2)),
});

/**
 * Hidden diagonal keys are point index pairs — renumber them after points are
 * inserted or removed. `move` gives a point's new index, or null when it's gone
 * (a diagonal through it goes too, as does one that has become a wall).
 */
const remapHiddenDiagonals = (room: Room, n: number, move: (k: number) => number | null): Partial<Room> => {
  if (!room.hiddenDiagonals?.length) return {};
  const keys = room.hiddenDiagonals.flatMap(key => {
    const [i, j] = key.split('-').map(Number).map(move);
    if (i == null || j == null) return [];
    const gap = Math.abs(i - j);
    return gap === 1 || gap === n - 1 ? [] : [diagonalKey(i, j)];
  });
  return { hiddenDiagonals: keys };
};

const pathM = (ps: { x: number; y: number }[]) =>
  pxToMeters(ps.slice(1).reduce((sum, p, i) => sum + dist(ps[i], p), 0));

/**
 * Everything that follows a change of outline (same corners, new positions):
 * area, perimeter, profile lengths — and lights and niche lines carried along
 * with the walls around them.
 */
export function reshapedRoom(room: Room, newPts: Point[], diags = shapeDiagonals(room.points)): Partial<Room> {
  const move = makePointMapper(room.points, newPts, diags);
  return {
    points: newPts,
    ...roomMetrics(newPts),
    profileSegments: (room.profileSegments ?? []).map(s => ({ ...s, lengthM: edgeLengthM(newPts, s.edgeIndex) })),
    lighting: (room.lighting ?? []).map(e => {
      if (e.kind === 'point') return { ...e, ...move(e) };
      const ps = e.points.map(move);
      return { ...e, points: ps, lengthM: pathM(ps) };
    }),
    selectedNiches: (room.selectedNiches ?? []).map(n => {
      if (n.kind !== 'path') return n;
      const ps = n.points.map(move);
      return { ...n, points: ps, lengthM: pathM(ps) };
    }),
  };
}

/**
 * Outline after setting wall `edgeIndex` to `newLenCm`: its end corner slides
 * along the wall and the next wall follows. Arc length scales linearly with
 * chord length for a fixed bulge (the arc's included angle stays the same),
 * so scaling the chord by the same ratio as a straight edge keeps a curved
 * wall's shape and reaches the new length.
 */
export function resizedPoints(pts: Point[], edgeIndex: number, newLenCm: number): Point[] | null {
  const n = pts.length;
  const a = pts[edgeIndex % n];
  const b = pts[(edgeIndex + 1) % n];
  const currentPx = edgeLen(a, b, a.bulge);
  if (!(newLenCm > 0) || currentPx === 0) return null;
  const ratio = cmToPx(newLenCm) / currentPx;
  const newPts = [...pts];
  newPts[(edgeIndex + 1) % n] = { ...b, x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio };
  return newPts;
}

export const wallCm = (pts: Point[], i: number) => Math.round(edgeLengthCm(pts, i));

/**
 * Wall niches renumbered after corners are added or removed: `mapEdge` gives
 * the new wall(s) each old wall becomes. Each keeps its gaps to the chain's
 * end corners as they were; a niche across the room keeps its ends where
 * they stood (`mapPoint`).
 */
function remapWallNiches(
  room: Room, mapEdge: (e: number) => number[], mapPoint: (w: WallPoint) => WallPoint,
): RoomNicheElement[] {
  return (room.selectedNiches ?? []).map(n => {
    if (n.kind === 'cross') return { ...n, a: mapPoint(n.a), b: mapPoint(n.b) };
    if (n.kind !== 'wall') return n;
    const { from, to, total } = nicheSpan(room, n);
    const edges: number[] = [];
    for (const e of n.edges.flatMap(mapEdge)) if (edges[edges.length - 1] !== e) edges.push(e);
    while (edges.length > 1 && edges[0] === edges[edges.length - 1]) edges.pop();
    return { ...n, edges, startCm: from, endCm: total - to };
  });
}

/** Split a wall `distCm` from its start. Every corner keeps its letter and the new point takes the next free one; each part gets its own profile. */
export function splitEdge(room: Room, edgeIndex: number, distCm: number, first: CatalogItem | null, second: CatalogItem | null): Partial<Room> | null {
  const pts = room.points;
  const a = pts[edgeIndex];
  const b = pts[(edgeIndex + 1) % pts.length];
  const edgeTotalCm = edgeLengthCm(pts, edgeIndex);
  if (edgeTotalCm === 0 || distCm <= 0 || distCm >= edgeTotalCm) return null;
  // Split fraction along the edge's length (arc-length fraction for a curved wall).
  const t = distCm / edgeTotalCm;
  const splitPt = pointOnArc(a, b, a.bulge, t);
  const [bulgeBefore, bulgeAfter] = splitBulge(a.bulge ?? 0, t);
  const labels = vertexLabels(pts);
  const lettered = pts.map((p, k) => ({ ...p, label: labels[k] }));
  const newPts = [
    ...lettered.slice(0, edgeIndex),
    { ...lettered[edgeIndex], bulge: bulgeBefore },
    { x: splitPt.x, y: splitPt.y, bulge: bulgeAfter, label: nextVertexLabel(pts) },
    ...lettered.slice(edgeIndex + 1),
  ];
  const part = (edgeIdx: number, item: CatalogItem | null): RoomProfileSegment[] => item
    ? [{ edgeIndex: edgeIdx, profileId: item.id, profile: { ...item }, lengthM: edgeLengthM(newPts, edgeIdx) }]
    : [];
  const profileSegments = [
    ...(room.profileSegments ?? [])
      .filter(s => s.edgeIndex !== edgeIndex)
      .map(s => {
        const newIdx = s.edgeIndex > edgeIndex ? s.edgeIndex + 1 : s.edgeIndex;
        return { ...s, edgeIndex: newIdx, lengthM: edgeLengthM(newPts, newIdx) };
      }),
    ...part(edgeIndex, first),
    ...part(edgeIndex + 1, second),
  ].sort((x, y) => x.edgeIndex - y.edgeIndex);
  const selectedNiches = remapWallNiches(
    room,
    e => e === edgeIndex ? [e, e + 1] : [e > edgeIndex ? e + 1 : e],
    w => w.edge > edgeIndex ? { edge: w.edge + 1, cm: w.cm }
      : w.edge === edgeIndex && w.cm > distCm ? { edge: edgeIndex + 1, cm: w.cm - distCm }
      : w,
  );
  return {
    points: newPts, ...roomMetrics(newPts), profileSegments, selectedNiches,
    ...remapHiddenDiagonals(room, newPts.length, k => (k > edgeIndex ? k + 1 : k)),
  };
}

/** Set a wall's curvature (0 = straight); null if the arc would run into another wall. */
export function bendEdge(room: Room, edgeIndex: number, bulge: number): Partial<Room> | null {
  const n = room.points.length;
  if (bulge !== 0 && edgeWouldCrossRoom(room.points, edgeIndex % n, bulge)) return null;
  const newPts = room.points.map((p, i) => i === edgeIndex % n ? { ...p, bulge } : p);
  return {
    points: newPts,
    ...roomMetrics(newPts),
    profileSegments: (room.profileSegments ?? []).map(s => ({ ...s, lengthM: edgeLengthM(newPts, s.edgeIndex) })),
  };
}

/** A gentle outward arc for a straight wall — the side that grows the room, or the other one if that's blocked. */
export function roundEdge(room: Room, edgeIndex: number): Partial<Room> | null {
  const area = polygonArea(room.points);
  const options = [0.3, -0.3]
    .map(b => bendEdge(room, edgeIndex, b))
    .filter((r): r is Partial<Room> => r != null)
    .sort((x, y) => polygonArea(y.points!) - polygonArea(x.points!));
  return options.find(r => polygonArea(r.points!) > area) ?? options[0] ?? null;
}

/** Profile on one wall; null clears it. */
export function setWallProfile(room: Room, edgeIndex: number, item: CatalogItem | null): Partial<Room> {
  const rest = (room.profileSegments ?? []).filter(s => s.edgeIndex !== edgeIndex);
  if (!item) return { profileSegments: rest };
  const seg: RoomProfileSegment = {
    edgeIndex, profileId: item.id, profile: { ...item }, lengthM: edgeLengthM(room.points, edgeIndex),
  };
  return { profileSegments: [...rest, seg].sort((a, b) => a.edgeIndex - b.edgeIndex) };
}

export const setAllProfiles = (room: Room, item: CatalogItem): Partial<Room> => ({
  profileSegments: room.points.map((_, i) => ({
    edgeIndex: i, profileId: item.id, profile: { ...item }, lengthM: edgeLengthM(room.points, i),
  })),
});

/** Remove a corner: its two walls merge into one straight wall that keeps the first wall's profile. */
export function deleteVertex(room: Room, i: number): Partial<Room> | null {
  const points = room.points;
  const n = points.length;
  if (n <= 3) return null;
  const newPts = [...points.slice(0, i), ...points.slice(i + 1)];
  const prevEdgeIdx = (i - 1 + n) % n;
  // A single arc can't represent the combined shape, so drop any curvature.
  const mergedIdx = i === 0 ? n - 2 : i - 1;
  if (newPts[mergedIdx]?.bulge) newPts[mergedIdx] = { ...newPts[mergedIdx], bulge: 0 };
  const profileSegments = (room.profileSegments ?? [])
    .filter(s => s.edgeIndex !== i)
    .map(s => {
      let newIdx = s.edgeIndex;
      if (s.edgeIndex === prevEdgeIdx) newIdx = mergedIdx;
      else if (s.edgeIndex > i) newIdx = s.edgeIndex - 1;
      return { ...s, edgeIndex: newIdx, lengthM: edgeLengthM(newPts, newIdx) };
    })
    .sort((a, b) => a.edgeIndex - b.edgeIndex);
  const mapEdge = (e: number) => e === i || e === prevEdgeIdx ? mergedIdx : e > i ? e - 1 : e;
  const prevLenCm = edgeLengthCm(points, prevEdgeIdx);
  const selectedNiches = remapWallNiches(
    room, e => [mapEdge(e)],
    w => ({ edge: mapEdge(w.edge), cm: w.edge === i ? w.cm + prevLenCm : w.cm }),
  );
  return {
    points: newPts, ...roomMetrics(newPts), profileSegments, selectedNiches,
    ...remapHiddenDiagonals(room, newPts.length, k => (k === i ? null : k > i ? k - 1 : k)),
  };
}

// ── Corners ──

const signedArea = (pts: Point[]) =>
  pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p.x * q.y - q.x * p.y; }, 0);

/** Inside angle at corner i in degrees (measured along the chords of curved walls). */
export function cornerAngle(pts: Point[], i: number): number {
  const n = pts.length;
  const prev = pts[(i - 1 + n) % n], curr = pts[i], next = pts[(i + 1) % n];
  const a = Math.atan2(prev.y - curr.y, prev.x - curr.x);
  const b = Math.atan2(next.y - curr.y, next.x - curr.x);
  let between = Math.abs(a - b) * 180 / Math.PI;
  if (between > 180) between = 360 - between;
  const turn = (curr.x - prev.x) * (next.y - curr.y) - (curr.y - prev.y) * (next.x - curr.x);
  const convex = Math.sign(turn) === Math.sign(signedArea(pts));
  return convex ? between : 360 - between;
}

/**
 * Make corner i exactly square (90° or 270°): it moves onto the circle over
 * its two neighbours (Thales), to the nearest point, so both walls change as
 * little as possible.
 */
export function squareCorner(room: Room, i: number): Partial<Room> | null {
  const pts = room.points;
  const n = pts.length;
  const prev = pts[(i - 1 + n) % n], curr = pts[i], next = pts[(i + 1) % n];
  const m = { x: (prev.x + next.x) / 2, y: (prev.y + next.y) / 2 };
  const r = dist(prev, next) / 2;
  const d = dist(curr, m);
  if (d < 1e-6 || r < 1e-6) return null;
  const newPts = pts.map((p, k) => k === i ? { ...p, x: m.x + (curr.x - m.x) * r / d, y: m.y + (curr.y - m.y) * r / d } : p);
  return reshapedRoom(room, newPts);
}

/**
 * Set the inside angle at corner i to `deg`. Every point that sees both
 * neighbours under that angle lies on one arc over them (inscribed angle),
 * so the corner moves to the nearest point of it: only its two walls change,
 * and as little as possible — squareCorner() is the 90° case. Null when the
 * angle can't be had without walls crossing.
 */
export function cornerPointsAtAngle(pts: Point[], i: number, deg: number): Point[] | null {
  const n = pts.length;
  if (n < 3 || !(deg > 0 && deg < 360)) return null;
  const prev = pts[(i - 1 + n) % n], curr = pts[i], next = pts[(i + 1) % n];
  const L = dist(prev, next);
  if (L < 1e-6) return null;
  const m = { x: (prev.x + next.x) / 2, y: (prev.y + next.y) / 2 };
  // Unit normal to the chord on the side a convex corner sits on: the left
  // normal n gives n·(c − prev) = cross(next − prev, c − prev), whose sign is
  // opposite to the winding's there.
  const flip = (signedArea(pts) > 0 ? -1 : 1) * (deg < 180 ? 1 : -1);
  const sx = -(next.y - prev.y) / L * flip, sy = (next.x - prev.x) / L * flip; // the side the corner must end up on
  const phi = (deg < 180 ? deg : 360 - deg) * Math.PI / 180;
  let target: Point;
  if (Math.abs(deg - 180) < 1e-9) {
    target = m;
  } else {
    const R = L / (2 * Math.sin(phi));
    const h = L / (2 * Math.tan(phi));           // centre's offset from the chord, towards the corner
    const o = { x: m.x + sx * h, y: m.y + sy * h };
    // Corner on the wrong side (crossing 180°) — mirror it over the chord first
    const off = (curr.x - m.x) * sx + (curr.y - m.y) * sy;
    const c = off >= 0 ? curr : { x: curr.x - 2 * off * sx, y: curr.y - 2 * off * sy };
    const d = dist(c, o);
    target = d < 1e-6 ? { x: o.x + sx * R, y: o.y + sy * R } : { x: o.x + (c.x - o.x) * R / d, y: o.y + (c.y - o.y) * R / d };
    // the nearest circle point may fall on the other arc — take the arc's apex
    if ((target.x - m.x) * sx + (target.y - m.y) * sy <= 0) target = { x: o.x + sx * R, y: o.y + sy * R };
  }
  const newPts = pts.map((p, k) => k === i ? { ...p, x: target.x, y: target.y } : p);
  const before = (i - 1 + n) % n;
  if (edgeWouldCrossRoom(newPts, before, newPts[before].bulge ?? 0) || edgeWouldCrossRoom(newPts, i, newPts[i].bulge ?? 0)) return null;
  // walls folding back over each other without a proper crossing turn the outline inside out
  if (Math.sign(signedArea(newPts)) !== Math.sign(signedArea(pts))) return null;
  return newPts;
}

/** Shift corner i by (dx, dy) cm in drawing axes. */
/**
 * Move a point light 1 cm (or `stepCm`) the way of an arrow (dx, dy on the
 * drawing). A light on the set-out scales steps along the scale nearest that
 * way, so one of its two numbers changes by exactly the step and the other
 * stays; a track spot simply moves.
 */
export function nudgeLight(room: Room, id: string, dx: number, dy: number, stepCm = 1): Partial<Room> {
  const lights = room.lighting ?? [];
  const el = lights.find(e => e.id === id);
  if (el?.kind !== 'point') return {};
  const onScales = (e: typeof el) => e.kind === 'point' && e.catalogItem.type !== 'track_spot';
  const f = onScales(el) && room.points.length >= 3
    ? pickFrame(room.points, lights.flatMap(e => e.kind === 'point' && onScales(e) ? [{ x: e.x, y: e.y }] : []))
    : null;
  let at = { x: el.x + cmToPx(dx * stepCm), y: el.y + cmToPx(dy * stepCm) };
  if (f) {
    const c = frameCoords(f, el);
    const du = dx * f.eu.x + dy * f.eu.y, dv = dx * f.ev.x + dy * f.ev.y;
    at = Math.abs(du) >= Math.abs(dv)
      ? framePoint(f, Math.max(0, Math.round(c.u) + Math.sign(du) * stepCm), c.v)
      : framePoint(f, c.u, Math.max(0, Math.round(c.v) + Math.sign(dv) * stepCm));
  }
  return { lighting: lights.map(e => e.id === id ? { ...e, x: at.x, y: at.y } : e) };
}

export function nudgeVertex(room: Room, i: number, dxCm: number, dyCm: number): Partial<Room> {
  const newPts = room.points.map((p, k) => k === i ? { ...p, x: p.x + cmToPx(dxCm), y: p.y + cmToPx(dyCm) } : p);
  return reshapedRoom(room, newPts);
}
