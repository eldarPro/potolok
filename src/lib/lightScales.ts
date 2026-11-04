import { Point, pxToCm } from './geometry';

/**
 * Set-out scales for point lights: every light is fixed by its square
 * distances to two walls that meet at one corner — the numbers a tape hooked
 * on the wall reads. Each distinct distance goes on the other wall as one
 * mark, so lights in a row share a number and a light off the rows just
 * adds one.
 */

const sub = (a: Point, b: Point) => ({ x: a.x - b.x, y: a.y - b.y });
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
const unit = (a: Point) => { const l = Math.hypot(a.x, a.y); return { x: a.x / l, y: a.y / l }; };

/** The corner the numbers count from: its two walls and their directions out of it */
export interface ScaleFrame {
  corner: number;
  o: Point;
  /** along wall «u» (corner → next corner) and wall «v» (corner → previous corner) */
  eu: Point;
  ev: Point;
  /** wall lengths, px */
  lenU: number;
  lenV: number;
  /** |sin| of the corner angle */
  sin: number;
}

/** Distances (cm) of a point from the two walls of a frame: «u» = from wall v, read along wall u */
export function frameCoords(f: ScaleFrame, p: Point): { u: number; v: number } {
  const d = sub(p, f.o);
  return { u: pxToCm(Math.abs(cross(f.ev, d))), v: pxToCm(Math.abs(cross(f.eu, d))) };
}

/** The point at distances u, v (cm) from the walls of a frame, on the room's side */
export function framePoint(f: ScaleFrame, u: number, v: number): Point {
  // p = o + eu·s + ev·t; its distance to wall v is s·sin, to wall u is t·sin
  const s = u / pxToCm(1) / f.sin, t = v / pxToCm(1) / f.sin;
  return { x: f.o.x + f.eu.x * s + f.ev.x * t, y: f.o.y + f.eu.y * s + f.ev.y * t };
}

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

/** A corner within 0.1° of 90° counts as square (under 1 cm across a room) — then the earlier letter wins */
const SQUARE_SIN = Math.cos(0.1 * Math.PI / 180);

/**
 * Pick the corner to count from: both its walls straight, the corner convex
 * and near square. Best is the one from which most lights can be measured
 * square onto both walls without the tape leaving the room; then a square
 * corner over a skewed one; then the first letter (a) — so the numbers
 * don't hop to another corner over a fraction of a degree.
 */
export function pickFrame(walls: (Point & { bulge?: number })[], lights: Point[]): ScaleFrame | null {
  const n = walls.length;
  if (n < 3) return null;
  // winding: + for counter-clockwise in screen coords (y down) is negative area
  let area2 = 0;
  for (let i = 0; i < n; i++) area2 += cross(walls[i], walls[(i + 1) % n]);
  const sign = Math.sign(area2) || 1;
  let best: ScaleFrame | null = null, bestScore = -Infinity;
  for (let k = 0; k < n; k++) {
    const prev = walls[(k - 1 + n) % n], o = walls[k], next = walls[(k + 1) % n];
    if (prev.bulge || o.bulge) continue;
    const du = sub(next, o), dv = sub(prev, o);
    const lenU = Math.hypot(du.x, du.y), lenV = Math.hypot(dv.x, dv.y);
    if (lenU < 1e-6 || lenV < 1e-6) continue;
    const eu = unit(du), ev = unit(dv);
    // convex: turning from the incoming wall to the outgoing one the room's way
    if (Math.sign(cross(sub(o, prev), du)) !== sign) continue;
    const sin = Math.abs(cross(eu, ev));
    if (sin < Math.sin(60 * Math.PI / 180)) continue;
    const f: ScaleFrame = { corner: k, o, eu, ev, lenU, lenV, sin };
    let reach = 0;
    for (const p of lights) {
      const { u, v } = frameCoords(f, p);
      const fu = scaleFoot(f, 'u', u), fv = scaleFoot(f, 'v', v);
      const onU = u / pxToCm(1) / sin <= lenU + 1e-6, onV = v / pxToCm(1) / sin <= lenV + 1e-6;
      const clear = (a: Point, b: Point) => !walls.some((c, j) => segmentsCross(a, b, c, walls[(j + 1) % n]));
      if (onU && onV && clear(p, fu) && clear(p, fv)) reach++;
    }
    const score = reach * 10 + (sin >= SQUARE_SIN ? 1 : sin);
    if (score > bestScore + 1e-9) { best = f; bestScore = score; }
  }
  return best;
}

/** Where the mark for distance d (cm) sits on wall «u» or «v» of a frame */
export function scaleFoot(f: ScaleFrame, wall: 'u' | 'v', d: number): Point {
  return wall === 'u' ? framePoint(f, d, 0) : framePoint(f, 0, d);
}

export interface ScaleMark {
  wall: 'u' | 'v';
  /** distance from the other wall, whole cm */
  cm: number;
  /** the mark on the wall */
  at: Point;
  /** the light of this row farthest from the wall — the dashed line runs from it to the mark */
  from: Point;
  /** indices of the lights on this mark */
  lights: number[];
}

/** Lights within this many cm of a row's number share it */
const SAME_ROW_CM = 1;

/** Marks on both walls for the given lights; each distinct distance once */
export function lightScales(f: ScaleFrame, lights: Point[]): ScaleMark[] {
  const coords = lights.map(p => frameCoords(f, p));
  const out: ScaleMark[] = [];
  for (const wall of ['u', 'v'] as const) {
    const other = wall === 'u' ? 'v' : 'u';
    const order = coords.map((c, i) => i).sort((a, b) => coords[a][wall] - coords[b][wall]);
    let group: number[] = [];
    const flush = () => {
      if (!group.length) return;
      const cm = Math.round(group.reduce((s, i) => s + coords[i][wall], 0) / group.length);
      const far = group.reduce((a, b) => coords[b][other] > coords[a][other] ? b : a);
      out.push({ wall, cm, at: scaleFoot(f, wall, cm), from: lights[far], lights: group });
      group = [];
    };
    for (const i of order) {
      if (group.length && coords[i][wall] - coords[group[0]][wall] > SAME_ROW_CM) flush();
      group.push(i);
    }
    flush();
  }
  return out;
}

/** The middle of the room along each scale: half its reach from the frame's walls (cm) */
export function frameCentre(f: ScaleFrame, walls: Point[]): { u: number; v: number } {
  let u = 0, v = 0;
  for (const p of walls) { const c = frameCoords(f, p); u = Math.max(u, c.u); v = Math.max(v, c.v); }
  return { u: u / 2, v: v / 2 };
}

/** What a light lined up with along one scale */
export type SnapKind = 'light' | 'centre' | null;

/**
 * Where a light lands: in line with another light when within reach (cm)
 * of its row or column, or on the middle of the room; otherwise on a whole
 * 5 cm — so the scale numbers come out round. Says what it lined up with.
 */
export function snapLight(
  f: ScaleFrame, p: Point, others: Point[], reachCm: number, centre?: { u: number; v: number },
): { at: Point; u: SnapKind; v: SnapKind } {
  const c = frameCoords(f, p);
  const near = (axis: 'u' | 'v'): { val: number; kind: SnapKind } | null => {
    let best: { val: number; kind: SnapKind } | null = null, bd = reachCm;
    for (const o of others) {
      const val = frameCoords(f, o)[axis], d = Math.abs(val - c[axis]);
      if (d <= bd) { bd = d; best = { val, kind: 'light' }; }
    }
    if (centre && Math.abs(centre[axis] - c[axis]) <= bd) best = { val: centre[axis], kind: 'centre' };
    return best;
  };
  const su = near('u'), sv = near('v');
  const u = su?.val ?? Math.round(c.u / 5) * 5, v = sv?.val ?? Math.round(c.v / 5) * 5;
  return { at: framePoint(f, u, v), u: su?.kind ?? null, v: sv?.kind ?? null };
}
