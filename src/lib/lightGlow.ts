import { Point, pxToCm, pointInPolygon } from './geometry';
import { RoomLightingElement, LightingType } from '../types';
import { nearestSegmentAngle } from './lightGuides';

/*
 * The glow view: how far each light reaches, in real cm, and where the
 * ceiling is left dark. A rough model — every source falls off as a
 * Gaussian — good for seeing a gap between spots, not for lux.
 * The drawing paints the same reach (CeilingCanvas glow layer), so the
 * picture and the «dark» marks agree.
 */

export interface GlowReach {
  /** distance (cm) at which the light has fallen to about a third */
  radiusCm: number;
  /** relative strength at the source */
  power: number;
  /** a track spot throws its light this far (cm) off the track, across it */
  throwCm?: number;
}

export const GLOW: Record<LightingType, GlowReach> = {
  spot:       { radiusCm: 70,  power: 1 },
  chandelier: { radiusCm: 150, power: 1.2 },
  track_spot: { radiusCm: 60,  power: 1, throwCm: 70 },
  line:       { radiusCm: 60,  power: 1.1 },
  strip:      { radiusCm: 40,  power: 1 },
  track:      { radiusCm: 0,   power: 0 }, // a rail fitted with track spots: they give the light
};
/**
 * A track nobody put track spots on — the usual case, as the stock price
 * list has a track but no track spot: it still stands for a lit track, so it
 * shines along its length, a little softer than a light line.
 */
export const BARE_TRACK: GlowReach = { radiusCm: 55, power: 1 };
/** How far (cm) from a track a track spot still counts as hanging on it */
export const TRACK_REACH_CM = 40;
/** A chandelier as the glow view draws it: lamps on arms around the body (count, arm length in cm) */
export const CHANDELIER_ARMS = { count: 6, cm: 35 };
const reachOf = (type: LightingType) => GLOW[type] ?? GLOW.spot;

/** Below this the ceiling counts as dark */
export const DARK_LEVEL = 0.22;
/** A dark patch smaller than this (m²) isn't worth a mark */
const MIN_DARK_SQM = 0.8;
const STEP_CM = 20;

const distToSeg = (p: Point, a: Point, b: Point) => {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
};

/**
 * Where a track spot shines: across the track it hangs on, into the room —
 * of the two sides, the one where the room goes on (the other is usually the
 * wall the track runs along), else the side towards the middle of the room.
 * `angle` turns the spot's mark (its beam opens towards −y in its own frame);
 * `at` is where the middle of its light lands on the ceiling (px).
 */
export function trackSpotAim(
  at: Point, tracks: Point[][], cmToPx: (cm: number) => number, outline: Point[] = [],
): { at: Point; angle: number | null } {
  let angle = nearestSegmentAngle(tracks, at, cmToPx(TRACK_REACH_CM));
  const beam = (deg: number) => { const r = (deg - 90) * Math.PI / 180; return { x: Math.cos(r), y: Math.sin(r) }; };
  const centre = () => outline.reduce((m, p) => ({ x: m.x + p.x / outline.length, y: m.y + p.y / outline.length }), { x: 0, y: 0 });
  // off any track: it shines towards the middle of the room
  if (angle === null && outline.length >= 3) {
    const c = centre();
    if (Math.hypot(c.x - at.x, c.y - at.y) > 1e-6) angle = Math.atan2(c.y - at.y, c.x - at.x) * 180 / Math.PI + 90;
    const b = beam(angle ?? 0), d = cmToPx(GLOW.track_spot.throwCm ?? 0);
    return { at: { x: at.x + b.x * d, y: at.y + b.y * d }, angle };
  }
  if (angle !== null && outline.length >= 3) {
    const probe = (deg: number) => { const b = beam(deg), d = cmToPx(40); return pointInPolygon({ x: at.x + b.x * d, y: at.y + b.y * d }, outline); };
    const here = probe(angle), there = probe(angle + 180);
    let flip = there && !here;
    if (here === there) {
      const c = centre();
      const b = beam(angle);
      flip = b.x * (c.x - at.x) + b.y * (c.y - at.y) < 0;
    }
    if (flip) angle = (angle + 180) % 360;
  }
  const b = beam(angle ?? 0), d = cmToPx(GLOW.track_spot.throwCm ?? 0);
  return { at: { x: at.x + b.x * d, y: at.y + b.y * d }, angle };
}

/** Tracks with no track spot on them (ids) — they light up themselves, see BARE_TRACK */
export function bareTracks(lights: RoomLightingElement[], cmToPx: (cm: number) => number): Set<string> {
  const spots = lights.filter(e => e.kind === 'point' && e.catalogItem.type === 'track_spot') as { x: number; y: number }[];
  const out = new Set<string>();
  for (const e of lights) {
    if (e.kind !== 'path' || e.catalogItem.type !== 'track') continue;
    if (!spots.some(sp => nearestSegmentAngle([e.points], sp, cmToPx(TRACK_REACH_CM)) !== null)) out.add(e.id);
  }
  return out;
}

/** Light level at a point (px coords), the sum of every source */
export function lightLevel(
  p: Point, lights: RoomLightingElement[], tracks: Point[][], cmToPx: (cm: number) => number,
  outline: Point[] = [], bare: Set<string> = new Set(),
): number {
  let sum = 0;
  for (const el of lights) {
    const g = bare.has(el.id) ? BARE_TRACK : reachOf(el.catalogItem.type);
    if (!g.power) continue;
    let dPx: number;
    if (el.kind === 'point') {
      const src = el.catalogItem.type === 'track_spot' ? trackSpotAim(el, tracks, cmToPx, outline).at : el;
      dPx = Math.hypot(p.x - src.x, p.y - src.y);
    } else {
      dPx = Infinity;
      for (let i = 0; i + 1 < el.points.length; i++) dPx = Math.min(dPx, distToSeg(p, el.points[i], el.points[i + 1]));
      if (el.points.length === 1) dPx = Math.hypot(p.x - el.points[0].x, p.y - el.points[0].y);
    }
    const d = pxToCm(dPx) / g.radiusCm;
    sum += g.power * Math.exp(-d * d);
  }
  return sum;
}

/**
 * Dark patches of the ceiling: the room is sampled on a 20 cm grid, the
 * samples below DARK_LEVEL grouped into patches, and each big enough
 * patch gets one mark at its darkest sample.
 */
export function darkSpots(outline: Point[], lights: RoomLightingElement[], cmToPx: (cm: number) => number): Point[] {
  const bare = bareTracks(lights, cmToPx);
  if (outline.length < 3 || !lights.some(l => bare.has(l.id) || reachOf(l.catalogItem.type).power)) return [];
  const tracks = lights.flatMap(e => e.kind === 'path' && e.catalogItem.type === 'track' ? [e.points] : []);
  const xs = outline.map(p => p.x), ys = outline.map(p => p.y);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  const step = cmToPx(STEP_CM);
  const cols = Math.ceil((Math.max(...xs) - x0) / step), rows = Math.ceil((Math.max(...ys) - y0) / step);
  const level: (number | null)[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const p = { x: x0 + (c + 0.5) * step, y: y0 + (r + 0.5) * step };
    level.push(pointInPolygon(p, outline) ? lightLevel(p, lights, tracks, cmToPx, outline, bare) : null);
  }
  const seen = new Uint8Array(level.length);
  const minCells = Math.ceil(MIN_DARK_SQM / ((STEP_CM / 100) ** 2));
  const out: Point[] = [];
  for (let i = 0; i < level.length; i++) {
    if (seen[i] || level[i] === null || level[i]! >= DARK_LEVEL) continue;
    // flood the patch, keeping its darkest cell
    const stack = [i];
    seen[i] = 1;
    let n = 0, darkest = i;
    while (stack.length) {
      const k = stack.pop()!;
      n++;
      if (level[k]! < level[darkest]!) darkest = k;
      const r = Math.floor(k / cols), c = k % cols;
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const rr = r + dr, cc = c + dc, kk = rr * cols + cc;
        if (rr < 0 || rr >= rows || cc < 0 || cc >= cols || seen[kk]) continue;
        if (level[kk] === null || level[kk]! >= DARK_LEVEL) continue;
        seen[kk] = 1;
        stack.push(kk);
      }
    }
    if (n >= minCells) out.push({ x: x0 + (darkest % cols + 0.5) * step, y: y0 + (Math.floor(darkest / cols) + 0.5) * step });
  }
  return out;
}
