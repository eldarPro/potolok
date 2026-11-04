import { describe, it, expect } from 'vitest';
import { pickFrame, lightScales, snapLight, frameCoords } from './lightScales';
import { pxToCm } from './geometry';

const cm = (v: number) => v / pxToCm(1);
const P = (x: number, y: number) => ({ x: cm(x), y: cm(y) });

// 420×420 cm, top wall a–b skewed: only the corner d is square
const skew = [P(0, 0), P(423, -10), P(420, 420), P(0, 420)];
const grid = [P(105, 80), P(210, 80), P(315, 80), P(105, 245), P(210, 245), P(315, 245)];

describe('light scales', () => {
  it('counts from the square corner', () => {
    const f = pickFrame(skew, grid)!;
    expect(f.corner).toBe(3);
  });

  it('gives each row and column one number, read from the walls', () => {
    const f = pickFrame(skew, grid)!;
    const marks = lightScales(f, grid);
    const along = (w: 'u' | 'v') => marks.filter(m => m.wall === w).map(m => m.cm).sort((a, b) => a - b);
    // u: along d–a, distance from d–c; v: along d–c, distance from a–d
    expect(along('u')).toEqual([175, 340]);
    expect(along('v')).toEqual([105, 210, 315]);
    expect(marks.find(m => m.wall === 'v' && m.cm === 105)!.lights).toHaveLength(2);
  });

  it('a light off the rows just adds its own numbers', () => {
    const f = pickFrame(skew, grid)!;
    const marks = lightScales(f, [...grid, P(250, 345)]);
    expect(marks.filter(m => m.wall === 'v').map(m => m.cm)).toContain(250);
    expect(marks.filter(m => m.wall === 'u').map(m => m.cm)).toContain(75);
  });

  it('picks the corner that reaches every light in an L-shaped room', () => {
    // 600×450 with the 250×200 bottom-right cut out; the light sits in the wing
    const L = [P(0, 0), P(600, 0), P(600, 250), P(350, 250), P(350, 450), P(0, 450)];
    const f = pickFrame(L, [P(500, 100), P(100, 400)])!;
    for (const m of lightScales(f, [P(500, 100), P(100, 400)])) {
      const d = frameCoords(f, m.at);
      expect(Math.min(d.u, d.v)).toBeLessThan(1); // the mark is on a wall
    }
    expect(f.corner).toBe(0); // a: from b or f a light is past the end of a wall
  });

  it('snaps a new light into its neighbour row, else to a round 5 cm', () => {
    const f = pickFrame(skew, grid)!;
    const s = snapLight(f, P(318, 252), grid, 10);
    expect([s.u, s.v]).toEqual(['light', 'light']);
    const c = frameCoords(f, s.at);
    expect(Math.round(c.u)).toBe(175);
    expect(Math.round(c.v)).toBe(315);
    const free = frameCoords(f, snapLight(f, P(43, 200), grid, 10).at);
    expect(Math.round(free.u)).toBe(220);
    expect(Math.round(free.v)).toBe(45);
  });

  it('snaps to the middle of the room', () => {
    const f = pickFrame(skew, grid)!;
    const s = snapLight(f, P(205, 300), [], 10, { u: 210, v: 210 });
    expect(s.v).toBe('centre');
    expect(Math.round(frameCoords(f, s.at).v)).toBe(210);
  });

  it('among square corners the first letter wins', () => {
    // every corner within a fraction of a degree of 90°: count from a
    const box = [P(0, 0), P(420, 0.3), P(420, 420.3), P(0, 420)];
    expect(pickFrame(box, [P(100, 100)])!.corner).toBe(0);
  });
});

describe('nudging a light', () => {
  it('changes one set-out number by 1 cm and keeps the other', async () => {
    const { nudgeLight } = await import('./roomEdit');
    const item = { id: 's', title: '', type: 'spot', placement: 'point', unit: 'pcs', symbol: '', price: 0, priceInstall: 0, color: '', description: '' } as const;
    const room = { points: skew, lighting: [{ id: 'l', kind: 'point', catalogItemId: 's', catalogItem: item, ...P(105, 80) }] } as never;
    const f = pickFrame(skew, [P(105, 80)])!;
    const before = frameCoords(f, P(105, 80));
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const moved = (nudgeLight(room, 'l', dx, dy).lighting as { x: number; y: number }[])[0];
      const c = frameCoords(f, moved);
      const du = Math.round(c.u - before.u), dv = Math.round(c.v - before.v);
      expect(Math.abs(du) + Math.abs(dv)).toBe(1);
    }
  });
});
