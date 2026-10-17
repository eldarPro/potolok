import { describe, it, expect } from 'vitest';
import { roomDiagonals, shapeDiagonals, reshapeByDiagonals, diagonalCm, diagonalRangeCm, makePointMapper } from './diagonals';
import { Point, pxToCm, dist } from './geometry';

// GRID_SIZE px = 50 cm, so 1 cm = 0.8 px
const cm = (x: number, y: number): Point => ({ x: x * 0.8, y: y * 0.8 });
const wallsCm = (p: Point[]) => p.map((a, i) => Math.round(pxToCm(dist(a, p[(i + 1) % p.length]))));

// 400×300 cm rectangle → diagonals 500 cm
const rect = [cm(0, 0), cm(400, 0), cm(400, 300), cm(0, 300)];

describe('reshapeByDiagonals', () => {
  it('keeps the shape when the diagonal is unchanged', () => {
    const out = reshapeByDiagonals(rect, shapeDiagonals(rect, '0-2'), { '0-2': 500 })!;
    expect(wallsCm(out)).toEqual([400, 300, 400, 300]);
    expect(diagonalCm(out, 1, 3)).toBe(500);
  });

  it('quad: changing one diagonal keeps the walls and moves the other diagonal', () => {
    const out = reshapeByDiagonals(rect, shapeDiagonals(rect, '0-2'), { '0-2': 480 })!;
    expect(wallsCm(out)).toEqual([400, 300, 400, 300]);
    expect(diagonalCm(out, 0, 2)).toBe(480);
    // parallelogram law: d1² + d2² = 2(a² + b²)
    expect(diagonalCm(out, 1, 3)).toBe(Math.round(Math.sqrt(2 * (400 ** 2 + 300 ** 2) - 480 ** 2)));
  });

  it('returns null when the triangle cannot exist', () => {
    expect(reshapeByDiagonals(rect, shapeDiagonals(rect, '0-2'), { '0-2': 720 })).toBeNull();
  });

  it('pentagon: diagonals are independent — the other one keeps its length', () => {
    const pent = [cm(0, 0), cm(400, 0), cm(500, 200), cm(250, 400), cm(-100, 200)];
    const diags = shapeDiagonals(pent);
    expect(diags).toHaveLength(2);
    const [[i, j], [k, l]] = diags;
    const before = diagonalCm(pent, k, l);
    const out = reshapeByDiagonals(pent, diags, { [`${i}-${j}`]: diagonalCm(pent, i, j) - 20 })!;
    expect(wallsCm(out)).toEqual(wallsCm(pent));
    expect(diagonalCm(out, i, j)).toBe(diagonalCm(pent, i, j) - 20);
    expect(diagonalCm(out, k, l)).toBe(before);
  });

  it('keeps curved walls bulge', () => {
    const curved = rect.map((p, i) => (i === 0 ? { ...p, bulge: 0.3 } : p));
    const out = reshapeByDiagonals(curved, shapeDiagonals(curved, '0-2'), { '0-2': 490 })!;
    expect(out[0].bulge).toBe(0.3);
  });
});

it('roomDiagonals labels pairs in order', () => {
  expect(roomDiagonals(rect).map(d => d.label)).toEqual(['a–c', 'b–d']);
});

it('diagonalRangeCm gives the lengths the two neighbour triangles allow', () => {
  // a–c sits between 400/300 walls on both sides → (100, 700)
  expect(diagonalRangeCm(rect, shapeDiagonals(rect, '0-2'), {}, '0-2')).toEqual([101, 699]);
});

describe('makePointMapper', () => {
  const diags = shapeDiagonals(rect, '0-2');
  const out = reshapeByDiagonals(rect, diags, { '0-2': 480 })!;
  const move = makePointMapper(rect, out, diags);

  it('moves corners onto the new corners', () => {
    rect.forEach((p, i) => {
      const q = move(p);
      expect(q.x).toBeCloseTo(out[i].x);
      expect(q.y).toBeCloseTo(out[i].y);
    });
  });

  it('keeps a point on a wall on that wall, at the same fraction', () => {
    const mid = move(cm(100, 0)); // a quarter along a–b
    expect(mid.x).toBeCloseTo(out[0].x + (out[1].x - out[0].x) * 0.25);
    expect(mid.y).toBeCloseTo(out[0].y + (out[1].y - out[0].y) * 0.25);
  });

  it('keeps a spot inside the room', () => {
    const q = move(cm(200, 150));
    const xs = out.map(p => p.x), ys = out.map(p => p.y);
    expect(q.x).toBeGreaterThan(Math.min(...xs));
    expect(q.x).toBeLessThan(Math.max(...xs));
    expect(q.y).toBeGreaterThan(Math.min(...ys));
    expect(q.y).toBeLessThan(Math.max(...ys));
  });
});
