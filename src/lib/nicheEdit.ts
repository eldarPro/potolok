import { NicheItem, Room, RoomNicheCross, RoomNicheWall, WallPoint } from '../types';
import { uuid } from './uuid';
import { DEFAULT_CROSS_WIDTH, chainLengthCm, isStraightWall, nicheSpan, wallLengthCm } from './nicheGeometry';

// Edits of wall niches shared by the element card and the canvas handles.
// Each returns the changed niche.

export const DEFAULT_NICHE_DEPTH = 15;
export const DEPTH_OPTIONS = [10, 15, 20, 25];
/** Any depth typed in — up to a metre, past that it's no longer a niche */
export const MAX_NICHE_DEPTH = 100;
export const clampDepth = (cm: number) => Math.max(1, Math.min(MAX_NICHE_DEPTH, Math.round(cm)));
/** Shortest niche the card or a handle will leave */
const MIN_NICHE_CM = 10;

/** A niche of `item` along the whole of wall `edge` — where a tap on a wall puts it */
export const newWallNiche = (item: NicheItem, edge: number): RoomNicheWall => ({
  id: uuid(), kind: 'wall', nicheId: item.id, niche: { ...item },
  edges: [edge], depthCm: DEFAULT_NICHE_DEPTH, startCm: 0, endCm: 0,
});

/** A niche of `item` across the room, from wall point `a` to `b` */
export const newCrossNiche = (item: NicheItem, a: WallPoint, b: WallPoint): RoomNicheCross => ({
  id: uuid(), kind: 'cross', nicheId: item.id, niche: { ...item }, a, b, widthCm: DEFAULT_CROSS_WIDTH,
});

/** One end of a niche across the room moved to `cm` from its wall's start corner (kept on the wall) */
export function setCrossEnd(room: Room, n: RoomNicheCross, end: 'a' | 'b', cm: number): RoomNicheCross {
  const w = n[end];
  const len = wallLengthCm(room.points, w.edge);
  return { ...n, [end]: { ...w, cm: Math.max(0, Math.min(len, Math.round(cm))) } };
}

/** Niche set by its three sizes along the chain; the one not given follows from the others */
export function setNicheSizes(
  room: Room, n: RoomNicheWall, sizes: { start?: number; length?: number; end?: number },
): RoomNicheWall {
  const { from, to, total } = nicheSpan(room, n);
  let start = from, length = to - from;
  if (sizes.start != null) {
    // keep the length, shorten it only when the new start leaves no room
    start = Math.max(0, Math.min(total - MIN_NICHE_CM, sizes.start));
    length = Math.min(length, total - start);
  } else if (sizes.length != null) {
    length = Math.max(MIN_NICHE_CM, Math.min(total - start, sizes.length));
  } else if (sizes.end != null) {
    const end = Math.max(0, Math.min(total - start - MIN_NICHE_CM, sizes.end));
    length = total - start - end;
  }
  return { ...n, startCm: start, endCm: Math.max(0, total - start - length) };
}

/**
 * One more wall at an end of the niche (or one less): the niche keeps its
 * other end and runs to the far corner of the added wall. Null when there's
 * no wall to add — it would close the loop or meet a curved one.
 */
export function changeNicheWalls(room: Room, n: RoomNicheWall, side: 'start' | 'end', delta: 1 | -1): RoomNicheWall | null {
  const pts = room.points, count = pts.length;
  const { from, to, total } = nicheSpan(room, n);
  const base = { ...n, startCm: from, endCm: total - to };
  const edges = [...base.edges];
  if (delta === 1) {
    const e = side === 'start' ? (edges[0] - 1 + count) % count : (edges[edges.length - 1] + 1) % count;
    if (edges.includes(e) || !isStraightWall(pts, e)) return null;
    if (side === 'start') edges.unshift(e); else edges.push(e);
    return { ...base, edges, ...(side === 'start' ? { startCm: 0 } : { endCm: 0 }) };
  }
  if (edges.length < 2) return null;
  const dropped = side === 'start' ? edges.shift()! : edges.pop()!;
  const len = wallLengthCm(pts, dropped);
  // the end on the dropped wall moves to the corner it shared with the rest
  return side === 'start'
    ? { ...base, edges, startCm: Math.max(0, base.startCm - len) }
    : { ...base, edges, endCm: Math.max(0, base.endCm - len) };
}

export interface Snap { cm: number; label: string | null }

/**
 * Where a dragged niche end settles, in cm along its chain: a corner of its
 * walls when within `tolCm` — otherwise the nearest 5 cm. `label` is set when
 * it stuck to a corner.
 */
export function snapNicheEnd(room: Room, n: RoomNicheWall, cm: number, tolCm: number, cornerLabel: string): Snap {
  const pts = room.points;
  const total = chainLengthCm(pts, n.edges);
  const corners = [0, total];
  let before = 0;
  for (const e of n.edges) {
    if (before > 0) corners.push(before);
    before += wallLengthCm(pts, e);
  }
  let best: Snap | null = null, bestD = tolCm;
  for (const c of corners) {
    const d = Math.abs(c - cm);
    if (d <= bestD) { best = { cm: c, label: cornerLabel }; bestD = d; }
  }
  return best ?? { cm: Math.max(0, Math.min(total, Math.round(cm / 5) * 5)), label: null };
}
