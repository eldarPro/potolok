import { Room, CatalogItem, RoomProfileSegment } from '../types';
import {
  Point, polygonArea, polygonPerimeter, pxToMeters, edgeLengthM, edgeLengthCm, edgeLen, dist,
  pointOnArc, splitBulge, vertexLabels, nextVertexLabel, edgeWouldCrossRoom, GRID_SIZE, CM_PER_GRID,
} from './geometry';
import { shapeDiagonals, makePointMapper } from './diagonals';

// Edits of a room's outline shared by the drawing (element card) and the
// materials pages. Each returns the fields of the room that change.

export const cmToPx = (cm: number) => (cm * GRID_SIZE) / CM_PER_GRID;

export const roomMetrics = (pts: Point[]) => ({
  areaSqm: parseFloat((pxToMeters(Math.sqrt(polygonArea(pts))) ** 2).toFixed(2)),
  perimeterM: parseFloat(pxToMeters(polygonPerimeter(pts)).toFixed(2)),
});

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
  return { points: newPts, ...roomMetrics(newPts), profileSegments };
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
  return { points: newPts, ...roomMetrics(newPts), profileSegments };
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

/** Shift corner i by (dx, dy) cm in drawing axes. */
export function nudgeVertex(room: Room, i: number, dxCm: number, dyCm: number): Partial<Room> {
  const newPts = room.points.map((p, k) => k === i ? { ...p, x: p.x + cmToPx(dxCm), y: p.y + cmToPx(dyCm) } : p);
  return reshapedRoom(room, newPts);
}
