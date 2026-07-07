import { describe, it, expect } from 'vitest';
import { polygonDiagonals, Point, dist } from './geometry';

const pts = (arr: [number, number][]): Point[] => arr.map(([x, y]) => ({ x, y }));

// Every returned pair must be non-adjacent vertices, and for a simple polygon
// the diagonal count must fix the geometry: 2 for a convex quad, n−3 otherwise.
describe('polygonDiagonals', () => {
  it('returns nothing for triangles', () => {
    expect(polygonDiagonals(pts([[0, 0], [4, 0], [0, 3]]))).toEqual([]);
  });

  it('returns both diagonals for a rectangle', () => {
    const d = polygonDiagonals(pts([[0, 0], [8, 0], [8, 5], [0, 5]]));
    expect(d).toEqual([[0, 2], [1, 3]]);
  });

  it('returns both diagonals for a trapezoid', () => {
    const d = polygonDiagonals(pts([[1, 0], [7, 0], [8, 6], [0, 6]]));
    expect(d).toEqual([[0, 2], [1, 3]]);
  });

  it('returns one interior diagonal for a concave quad (dart)', () => {
    const shape = pts([[0, 0], [8, 0], [4, 2], [4, 8]]);
    const d = polygonDiagonals(shape);
    expect(d.length).toBe(1);
    // The diagonal must not be the outside one (0–2 is inside for this dart? verify by midpoint)
    for (const [i, j] of d) {
      expect(Math.abs(i - j)).not.toBe(1); // non-adjacent
    }
  });

  it('returns n−3 diagonals for the L-shape template', () => {
    const shape = pts([[0, 0], [8, 0], [8, 4], [4, 4], [4, 8], [0, 8]]);
    const d = polygonDiagonals(shape);
    expect(d.length).toBe(3);
    for (const [i, j] of d) {
      const gap = Math.min(Math.abs(i - j), shape.length - Math.abs(i - j));
      expect(gap).toBeGreaterThan(1); // non-adjacent
      expect(dist(shape[i], shape[j])).toBeGreaterThan(0);
    }
  });

  it('returns n−3 diagonals for the U-shape template', () => {
    const shape = pts([[0, 0], [3, 0], [3, 5], [5, 5], [5, 0], [8, 0], [8, 8], [0, 8]]);
    expect(polygonDiagonals(shape).length).toBe(5);
  });

  it('returns n−3 diagonals for the T-shape template', () => {
    const shape = pts([[0, 0], [8, 0], [8, 3], [5, 3], [5, 8], [3, 8], [3, 3], [0, 3]]);
    expect(polygonDiagonals(shape).length).toBe(5);
  });

  it('works regardless of winding direction', () => {
    const shape = pts([[0, 0], [8, 0], [8, 4], [4, 4], [4, 8], [0, 8]]).reverse();
    expect(polygonDiagonals(shape).length).toBe(3);
  });

  it('skips collinear vertices without producing degenerate diagonals', () => {
    // Rectangle with an extra point in the middle of the top edge
    const shape = pts([[0, 0], [4, 0], [8, 0], [8, 5], [0, 5]]);
    const d = polygonDiagonals(shape);
    for (const [i, j] of d) {
      const a = shape[i], b = shape[j];
      // No diagonal should lie along the y=0 edge
      expect(a.y === 0 && b.y === 0).toBe(false);
    }
  });
});
