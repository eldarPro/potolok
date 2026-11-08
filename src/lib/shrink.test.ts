import { describe, expect, it } from 'vitest';
import { Room } from '../types';
import { shrinkCm, shrinkRoom, clampShrink, loadShrink, saveShrink, roomShrink, fmtShrink, placeLabels, fitBox } from './shrink';

// 80 px = 1 m on the canvas
const room = (pts: [number, number][], extra: Partial<Room> = {}): Room => ({
  id: 'r', name: 'Зал', points: pts.map(([x, y]) => ({ x: x * 80, y: y * 80 })),
  fabricId: null, fabric: null, profileSegments: [], lighting: [], selectedAccessories: [], selectedServices: [],
  selectedNiches: [], areaSqm: 1, perimeterM: 1, visualization: null, ...extra,
});

describe('shrink', () => {
  it('takes the percentage off and rounds to the cm', () => {
    expect(shrinkCm(520, 7)).toBe(484);
    expect(shrinkCm(410, 7)).toBe(381);
    expect(shrinkCm(300, 0)).toBe(300);
  });

  it('clamps the percentage', () => {
    expect(clampShrink(-3)).toBe(0);
    expect(clampShrink(40)).toBe(20);
    expect(clampShrink(7.25)).toBe(7.3);
  });

  it('shrinks walls, diagonals and area of a rectangle', () => {
    const sr = shrinkRoom(room([[0, 0], [4, 0], [4, 3], [0, 3]]), { pct: 10 })!;
    expect(sr.walls.map(w => [w.name, w.cm])).toEqual([['AB', 360], ['BC', 270], ['CD', 360], ['DA', 270]]);
    expect(sr.diagonals.map(d => d.cm)).toEqual([450, 450]);
    expect(sr.areaSqm).toBeCloseTo(12 * 0.81, 6);
    expect(sr.perimeterM).toBeCloseTo(12.6, 6);
  });

  it('joins a wall split for a profile into one length, letters the corners in a row', () => {
    const sr = shrinkRoom(room([[0, 0], [2, 0], [4, 0], [4, 3], [0, 3]]), { pct: 0 })!;
    expect(sr.walls.map(w => [w.name, w.cm])).toEqual([['AB', 400], ['BC', 300], ['CD', 400], ['DA', 300]]);
    expect(sr.corners.map(c => c.label)).toEqual(['A', 'B', 'C', 'D']);
    expect(sr.diagonals.map(d => d.name)).toEqual(['AC', 'BD']);
  });

  it('puts wall sizes outside the room, the inner corner of an L included', () => {
    const sr = shrinkRoom(room([[0, 0], [5, 0], [5, 3], [3, 3], [3, 4], [0, 4]]), { pct: 7 })!;
    const top = sr.walls[0], inner = sr.walls[3]; // AB, DE
    expect(top.out.y).toBeLessThan(0);
    expect(inner.out.x).toBeGreaterThan(0);
  });

  it('leaves out diagonals hidden on the drawing', () => {
    const r = room([[0, 0], [4, 0], [4, 3], [0, 3]], { hiddenDiagonals: ['1-3'] });
    expect(shrinkRoom(r, { pct: 7 })!.diagonals.map(d => d.name)).toEqual(['AC']);
  });

  it('keeps the measured sizes next to the cut ones', () => {
    const sr = shrinkRoom(room([[0, 0], [4, 0], [4, 3], [0, 3]]), { pct: 10 })!;
    expect(sr.walls.map(w => w.realCm)).toEqual([400, 300, 400, 300]);
    expect(sr.diagonals.map(d => d.realCm)).toEqual([500, 500]);
    expect(sr.realAreaSqm).toBeCloseTo(12, 6);
    expect(sr.realPerimeterM).toBeCloseTo(14, 6);
  });

  it('shrinks the length and the width each by its own percent', () => {
    const sr = shrinkRoom(room([[0, 0], [4, 0], [4, 3], [0, 3]]), { pct: 7, axes: { x: 10, y: 20 } })!;
    expect(sr.walls.map(w => w.cm)).toEqual([360, 240, 360, 240]);
    expect(sr.diagonals.map(d => d.cm)).toEqual([Math.round(Math.hypot(360, 240)), Math.round(Math.hypot(360, 240))]);
    expect(sr.areaSqm).toBeCloseTo(12 * 0.9 * 0.8, 6);
    // a slanted wall takes some of each
    const slant = shrinkRoom(room([[0, 0], [3, 0], [3, 4]]), { pct: 0, axes: { x: 10, y: 20 } })!;
    expect(slant.walls[2].cm).toBe(Math.round(Math.hypot(270, 320)));
  });

  it('takes the room\'s own shrink over the order\'s', () => {
    const order = { pct: 7 };
    expect(roomShrink(room([[0, 0], [1, 0], [1, 1]]), order)).toBe(order);
    const own = { pct: 6 };
    expect(roomShrink(room([[0, 0], [1, 0], [1, 1]], { shrink: own }), order)).toBe(own);
    expect(fmtShrink({ pct: 7.5 })).toBe('7,5 %');
    expect(fmtShrink({ pct: 7, axes: { x: 7, y: 8 } })).toBe('↔7 · ↕8 %');
  });

  it('remembers the order shrink, reading the old bare number too', () => {
    localStorage.setItem('ceiling_shrink_pct', '8');
    expect(loadShrink()).toEqual({ pct: 8 });
    saveShrink({ pct: 7, axes: { x: 7, y: 9 } });
    expect(loadShrink()).toEqual({ pct: 7, axes: { x: 7, y: 9 } });
    localStorage.removeItem('ceiling_shrink_pct');
    expect(loadShrink()).toEqual({ pct: 7 });
  });

  it('keeps sizes and letters apart at an inner corner of short walls', () => {
    // an L whose notch walls are short on a small preview
    const sr = shrinkRoom(room([[0, 0], [5.2, 0], [5.2, 2.9], [3.6, 2.9], [3.6, 4.1], [0, 4.1]]), { pct: 7 })!;
    const fit = fitBox(sr.outline, 360, 220, 34);
    const sc = Math.hypot(fit({ x: 100, y: 0 }).x - fit({ x: 0, y: 0 }).x, 0) / 100;
    const walls = sr.walls.map(w => ({ mid: fit(w.mid), dir: w.dir, out: w.out, len: w.chord * sc, tw: String(w.cm).length * 7.6 + 2, th: 13 }));
    const corners = sr.corners.map(c => ({ p: fit(c.p), out: c.out, size: 11 }));
    const spots = placeLabels(walls, corners, sr.outline.map(fit), { w: 360, h: 220 }, 13);
    const boxes = [
      ...spots.walls.map((p, i) => {
        const c = Math.abs(walls[i].dir.x), s = Math.abs(walls[i].dir.y);
        return { ...p, w: c * walls[i].tw + s * 13, h: s * walls[i].tw + c * 13 };
      }),
      ...spots.corners.map(p => ({ ...p, w: 11, h: 11 })),
    ];
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        const hit = Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;
        expect(hit, `labels ${i} and ${j} overlap`).toBe(false);
      }
  });

  it('keeps the length/width pair while one percent is in use', () => {
    const s = { pct: 14, axes: { x: 16, y: 14 }, one: true };
    const sr = shrinkRoom(room([[0, 0], [4, 0], [4, 3], [0, 3]]), s)!;
    expect(sr.pct).toEqual({ x: 14, y: 14 });
    expect(fmtShrink(s)).toBe('14 %');
    saveShrink(s);
    expect(loadShrink()).toEqual(s);
    // by sides again: the pair is still there
    saveShrink({ pct: 14, axes: { x: 16, y: 14 } });
    expect(loadShrink()).toEqual({ pct: 14, axes: { x: 16, y: 14 } });
    localStorage.removeItem('ceiling_shrink_pct');
  });
});
