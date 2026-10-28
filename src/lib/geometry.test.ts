import { describe, it, expect } from 'vitest';
import { polygonDiagonals, Point, dist, countRealCorners, totalFabricCorners, nicheFreeEnds, pathTurns, vertexLabels, nextVertexLabel, edgeLabel, liveCornerAngle, pointInPolygon } from './geometry';

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

// A split wall (assigning two profiles to one edge) inserts a collinear
// point that must not count as a corner for anything priced per corner.
describe('countRealCorners', () => {
  it('counts a plain rectangle as 4 corners', () => {
    expect(countRealCorners(pts([[0, 0], [8, 0], [8, 5], [0, 5]]))).toBe(4);
  });

  it('ignores one collinear split point on a rectangle', () => {
    const shape = pts([[0, 0], [4, 0], [8, 0], [8, 5], [0, 5]]);
    expect(countRealCorners(shape)).toBe(4);
  });

  it('ignores every wall being split once (8 points, still a rectangle)', () => {
    const shape = pts([
      [0, 0], [4, 0], [8, 0], [8, 2.5], [8, 5], [4, 5], [0, 5], [0, 2.5],
    ]);
    expect(countRealCorners(shape)).toBe(4);
  });

  it('counts every vertex of an L-shape as a real corner', () => {
    const shape = pts([[0, 0], [8, 0], [8, 4], [4, 4], [4, 8], [0, 8]]);
    expect(countRealCorners(shape)).toBe(6);
  });

  it('treats a curved (bulged) edge endpoint as a real corner even if collinear-ish', () => {
    const shape: Point[] = [
      { x: 0, y: 0 }, { x: 4, y: 0, bulge: 0.3 }, { x: 8, y: 0 }, { x: 8, y: 5 }, { x: 0, y: 5 },
    ];
    expect(countRealCorners(shape)).toBe(5);
  });

  it('recognizes a real corner introduced by dragging a split point off-line', () => {
    const shape = pts([[0, 0], [4, 1], [8, 0], [8, 5], [0, 5]]);
    expect(countRealCorners(shape)).toBe(5);
  });
});

// A square room, corners at (0,0) (8,0) (8,8) (0,8) — edge 0: top, edge 1:
// right, edge 2: bottom, edge 3: left.
const square = pts([[0, 0], [8, 0], [8, 8], [0, 8]]);

describe('totalFabricCorners', () => {
  it('a plain room with no niches is just its own corners', () => {
    expect(totalFabricCorners(square, [])).toBe(4);
  });

  it('a straight wall-to-wall niche line adds nothing', () => {
    const line = pts([[3, 0], [3, 8]]); // top wall to bottom wall
    expect(totalFabricCorners(square, [line])).toBe(4);
  });

  it('a box niche in the middle of one wall adds its own 4 corners in full', () => {
    const box = pts([[2, 0], [2, 2], [5, 2], [5, 0]]); // both ends on the top wall
    expect(totalFabricCorners(square, [box])).toBe(4 + 4);
  });

  it('a niche wrapping a room corner does not double-count that corner', () => {
    // right wall (edge 1) -> bend -> bend -> bottom wall (edge 2); edges 1 & 2
    // share the (8,8) corner, so that corner is the niche's own, not extra.
    const wrap = pts([[8, 5], [6, 5], [6, 6], [5, 8]]);
    expect(totalFabricCorners(square, [wrap])).toBe(4 + 4 - 1);
  });

  // A hexagon with a "point" jutting out on the right (like the app's
  // hexagon2 template): A(0,0) Б(6,0) В(8,2) Г(8,4) Д(6,6) Е(0,6).
  const hexagon = pts([[0, 0], [6, 0], [8, 2], [8, 4], [6, 6], [0, 6]]);

  it('a plain hexagon is its own 6 corners', () => {
    expect(totalFabricCorners(hexagon, [])).toBe(6);
  });

  it('a niche shortcutting across the point (skipping 2 corners) nets to no change', () => {
    // starts on edge Б–В, ends on edge Г–Д, cutting off В and Г entirely.
    const shortcut = pts([[6.3, 0.5], [6.3, 5.5]]);
    expect(totalFabricCorners(hexagon, [shortcut])).toBe(6);
  });

  it('a routed niche skipping 2 corners adds only its own extra bends', () => {
    // same span as above, but routed with 2 extra interior bends
    const routed = pts([[6.3, 0.5], [6.8, 1.5], [6.8, 4.5], [6.3, 5.5]]);
    // В and Г (2 corners) are removed; the niche's own 4 points replace them
    expect(totalFabricCorners(hexagon, [routed])).toBe(6 - 2 + 4);
  });
});

describe('vertexLabels', () => {
  it('letters a plain room by position', () => {
    expect(vertexLabels([{}, {}, {}, {}])).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps pinned letters and gives a split point the next free one', () => {
    // a b c [new] d — the wall c–d was split
    const pts = [{ label: 'a' }, { label: 'b' }, { label: 'c' }, { label: 'e' }, { label: 'd' }];
    expect(vertexLabels(pts)).toEqual(['a', 'b', 'c', 'e', 'd']);
    expect(edgeLabel(pts, 2)).toBe('c – e');
    expect(edgeLabel(pts, 4)).toBe('d – a');
  });

  it('fills unlettered points with unused letters', () => {
    expect(vertexLabels([{ label: 'a' }, {}, { label: 'b' }])).toEqual(['a', 'c', 'b']);
    expect(nextVertexLabel([{ label: 'a' }, { label: 'b' }, { label: 'c' }, { label: 'e' }])).toBe('d');
  });
});

// The wedge must open into the room: a point along its bisector sits inside
// the outline the angle was measured on.
describe('liveCornerAngle', () => {
  const insideAlongBisector = (p: Point[], c: Point) => {
    const r = liveCornerAngle(p, c)!;
    const mid = (r.start + r.sweep / 2) * Math.PI / 180;
    const v = p[p.length - 1];
    return pointInPolygon({ x: v.x + Math.cos(mid) * 0.1, y: v.y + Math.sin(mid) * 0.1 }, [...p, c]);
  };

  it('needs two placed points', () => {
    expect(liveCornerAngle(pts([[0, 0]]), { x: 1, y: 1 })).toBeNull();
  });

  it('reads a square corner as 90° in either winding', () => {
    expect(liveCornerAngle(pts([[0, 0], [4, 0]]), { x: 4, y: 3 })!.deg).toBeCloseTo(90);
    expect(liveCornerAngle(pts([[0, 0], [4, 0]]), { x: 4, y: -3 })!.deg).toBeCloseTo(90);
    expect(insideAlongBisector(pts([[0, 0], [4, 0]]), { x: 4, y: 3 })).toBe(true);
    expect(insideAlongBisector(pts([[0, 0], [4, 0]]), { x: 4, y: -3 })).toBe(true);
  });

  it('reads an L-shaped inner corner as 270°', () => {
    // 0,0 → 6,0 → 6,3 → 3,3 → (cursor) 3,6 : the corner at 3,3 is reflex
    const p = pts([[0, 6], [0, 0], [6, 0], [6, 3], [3, 3]]);
    const c = { x: 3, y: 6 };
    expect(liveCornerAngle(p, c)!.deg).toBeCloseTo(270);
    expect(insideAlongBisector(p, c)).toBe(true);
  });

  it('reads an obtuse corner', () => {
    expect(liveCornerAngle(pts([[0, 0], [4, 0]]), { x: 8, y: 4 })!.deg).toBeCloseTo(135);
  });
});

describe('niche ends and turns', () => {
  const room: Point[] = [{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 500, y: 400 }, { x: 0, y: 400 }];

  it('finds the ends that stop short of a wall', () => {
    expect(nicheFreeEnds(room, [{ x: 0, y: 30 }, { x: 500, y: 30 }])).toEqual([false, false]);
    expect(nicheFreeEnds(room, [{ x: 0, y: 30 }, { x: 400, y: 30 }])).toEqual([false, true]);
    expect(nicheFreeEnds(room, [{ x: 100, y: 30 }, { x: 400, y: 30 }])).toEqual([true, true]);
  });

  it('counts real turns only', () => {
    expect(pathTurns([{ x: 0, y: 30 }, { x: 200, y: 30 }, { x: 400, y: 30 }])).toBe(0);
    expect(pathTurns([{ x: 100, y: 0 }, { x: 100, y: 30 }, { x: 400, y: 30 }, { x: 400, y: 0 }])).toBe(2);
  });

  it('a niche with a free end adds no fabric corners', () => {
    expect(totalFabricCorners(room, [[{ x: 0, y: 30 }, { x: 400, y: 30 }]])).toBe(4);
  });
});
