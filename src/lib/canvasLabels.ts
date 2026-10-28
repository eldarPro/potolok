import { Point } from './geometry';

// Layout of the drawing's text — corner letters and wall lengths — done in
// screen pixels, so it keeps one size whatever the zoom and can tell when a
// wall is too short on screen to carry its own number.

export const LABEL = {
  font: 11,          // wall length
  letterFont: 13,    // corner letter
  letterGap: 13,     // corner centre → letter centre
  dot: 5,            // corner dot radius
  inlineGap: 9,      // wall → inline length label
  pillH: 18,
  pillPad: 6,
  calloutGap: 12,    // wall → nearest edge of a callout, on the first try
  calloutStep: 14,
};

export const textWidth = (text: string, font: number) => text.length * font * 0.56;

const norm = (x: number, y: number): Point => {
  const l = Math.hypot(x, y);
  return l < 1e-9 ? { x: 0, y: 0 } : { x: x / l, y: y / l };
};

const shoelace = (pts: Point[]) =>
  pts.reduce((s, p, k) => { const q = pts[(k + 1) % pts.length]; return s + p.x * q.y - q.x * p.y; }, 0);

/** Outward unit normal of the wall a→b, for an outline of the given shoelace sign */
const outward = (a: Point, b: Point, winding: number): Point => {
  const d = norm(b.x - a.x, b.y - a.y);
  return winding > 0 ? { x: d.y, y: -d.x } : { x: -d.y, y: d.x };
};

export interface WallIn {
  text: string;
  /** Midpoint of the wall as drawn (on the arc for a bowed wall) */
  mid: Point;
}

export type WallLabel =
  | { kind: 'inline'; x: number; y: number; angle: number }
  | { kind: 'callout'; x: number; y: number; w: number; h: number; anchor: Point };

export interface LabelLayout {
  /** Where each corner's letter goes */
  letters: Point[];
  /** Wall i runs from corner i to i+1; null where it isn't labelled */
  walls: (WallLabel | null)[];
}

/**
 * Direction each corner's letter sits in: out of the room along the corner's
 * bisector, so two corners close together put their letters on opposite sides
 * instead of on top of each other. `refs[i]` is what corner i looks at along
 * wall i (its midpoint) — a bowed wall leaves the corner toward its arc.
 */
export function cornerDirections(pts: Point[], closed: boolean, mids: Point[]): Point[] {
  const n = pts.length;
  const winding = shoelace(pts);
  return pts.map((v, i) => {
    const hasPrev = closed || i > 0, hasNext = closed || i < n - 1;
    const prev = hasPrev ? mids[(i - 1 + n) % n] : null;
    const next = hasNext ? mids[i] : null;
    const u1 = prev ? norm(prev.x - v.x, prev.y - v.y) : null;
    const u2 = next ? norm(next.x - v.x, next.y - v.y) : null;
    if (!u1 && !u2) return { x: 0, y: -1 };
    if (!u1) return { x: -u2!.x, y: -u2!.y };
    if (!u2) return { x: -u1.x, y: -u1.y };
    const sum = { x: u1.x + u2.x, y: u1.y + u2.y };
    if (Math.hypot(sum.x, sum.y) < 0.05) {
      // a straight run through the corner — straight out from the wall
      return closed ? outward(prev!, next!, winding) : { x: -u1.y, y: u1.x };
    }
    const into = norm(sum.x, sum.y);  // into the smaller of the two angles
    if (!closed) return { x: -into.x, y: -into.y };
    // A convex corner's smaller angle is the room; a reflex one's is outside it
    const z = (v.x - prev!.x) * (next!.y - v.y) - (v.y - prev!.y) * (next!.x - v.x);
    return z * winding > 0 ? { x: -into.x, y: -into.y } : into;
  });
}

type Box = { x: number; y: number; w: number; h: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const boxAt = (c: Point, w: number, h: number): Box => ({ x: c.x - w / 2, y: c.y - h / 2, w, h });

/**
 * Lay out corner letters and wall lengths for an outline already in screen
 * pixels. A length that doesn't fit between its corners leaves the wall as a
 * callout — a pill pushed out from the wall's middle, clear of every other
 * label.
 */
export function layoutLabels(pts: Point[], closed: boolean, walls: (WallIn | null)[]): LabelLayout {
  const n = pts.length;
  const winding = shoelace(pts);
  const mids = pts.map((p, i) => walls[i]?.mid ?? (closed || i < n - 1
    ? { x: (p.x + pts[(i + 1) % n].x) / 2, y: (p.y + pts[(i + 1) % n].y) / 2 } : p));
  const dirs = cornerDirections(pts, closed, mids);
  const taken: Box[] = pts.map(p => boxAt(p, LABEL.dot * 2 + 4, LABEL.dot * 2 + 4));

  const letters = pts.map((p, i) => {
    const at = { x: p.x + dirs[i].x * LABEL.letterGap, y: p.y + dirs[i].y * LABEL.letterGap };
    taken.push(boxAt(at, 10, 14));
    return at;
  });

  const out: (WallLabel | null)[] = walls.map(() => null);
  const tooShort: number[] = [];
  walls.forEach((w, i) => {
    if (!w) return;
    const a = pts[i], b = pts[(i + 1) % n];
    const chord = Math.hypot(b.x - a.x, b.y - a.y);
    const tw = textWidth(w.text, LABEL.font);
    if (chord < tw + 2 * (LABEL.dot + 5)) { tooShort.push(i); return; }
    const nrm = closed ? outward(a, b, winding) : outward(a, b, winding || 1);
    let angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
    if (angle > 90) angle -= 180; else if (angle < -90) angle += 180; // upright
    const x = w.mid.x + nrm.x * LABEL.inlineGap, y = w.mid.y + nrm.y * LABEL.inlineGap;
    out[i] = { kind: 'inline', x, y, angle };
    // its screen footprint, as the box around the turned text
    const r = angle * Math.PI / 180, c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r));
    taken.push(boxAt({ x, y }, tw * c + LABEL.font * s, tw * s + LABEL.font * c));
  });

  for (const i of tooShort) {
    const w = walls[i]!;
    const a = pts[i], b = pts[(i + 1) % n];
    const nrm = outward(a, b, winding || 1);
    const t = norm(b.x - a.x, b.y - a.y);
    const pw = textWidth(w.text, LABEL.font) + LABEL.pillPad * 2, ph = LABEL.pillH;
    const along = Math.abs(t.x) * (pw + 4) + Math.abs(t.y) * (ph + 4);
    // half the pill's depth off the wall, so its near edge clears the wall
    const from = LABEL.calloutGap + Math.abs(nrm.x) * pw / 2 + Math.abs(nrm.y) * ph / 2;
    let best: Point | null = null;
    search: for (let k = 0; k < 10; k++) {
      const d = from + k * LABEL.calloutStep;
      for (const sh of [0, 1, -1, 2, -2]) {
        const c = { x: w.mid.x + nrm.x * d + t.x * sh * along, y: w.mid.y + nrm.y * d + t.y * sh * along };
        if (!taken.some(o => overlaps(boxAt(c, pw + 4, ph + 4), o))) { best = c; break search; }
      }
    }
    best ??= { x: w.mid.x + nrm.x * from, y: w.mid.y + nrm.y * from };
    taken.push(boxAt(best, pw + 4, ph + 4));
    out[i] = { kind: 'callout', x: best.x, y: best.y, w: pw, h: ph, anchor: w.mid };
  }

  return { letters, walls: out };
}

/** Where a callout's leader line meets its pill — the pill edge nearest the wall */
export function calloutJoin(l: Extract<WallLabel, { kind: 'callout' }>): Point {
  return {
    x: Math.max(l.x - l.w / 2, Math.min(l.anchor.x, l.x + l.w / 2)),
    y: Math.max(l.y - l.h / 2, Math.min(l.anchor.y, l.y + l.h / 2)),
  };
}
