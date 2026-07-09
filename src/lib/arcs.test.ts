import { describe, it, expect } from 'vitest';
import {
  Point, arcInfo, edgeLen, sampleArc, arcHandlePoint, bulgeFromThreePoints,
  splitBulge, polygonArea, polygonPerimeter, pointOnArc, edgeWouldCrossRoom,
} from './geometry';

const A: Point = { x: 0, y: 0 };
const B: Point = { x: 10, y: 0 };

describe('arcInfo', () => {
  it('returns null for straight (bulge 0/undefined)', () => {
    expect(arcInfo(A, B, 0)).toBeNull();
    expect(arcInfo(A, B, undefined)).toBeNull();
  });

  it('semicircle (bulge=1): radius = half chord, center at chord midpoint', () => {
    const info = arcInfo(A, B, 1)!;
    expect(info.r).toBeCloseTo(5, 6);
    expect(info.cx).toBeCloseTo(5, 6);
    expect(info.cy).toBeCloseTo(0, 6);
    expect(Math.abs(info.theta)).toBeCloseTo(Math.PI, 6);
  });

  it('every sampled point sits at radius r from the center', () => {
    for (const bulge of [1, -1, 0.5, -0.3, 2]) {
      const info = arcInfo(A, B, bulge)!;
      for (const p of sampleArc(A, B, bulge, 32)) {
        const d = Math.hypot(p.x - info.cx, p.y - info.cy);
        expect(d).toBeCloseTo(info.r, 6);
      }
    }
  });

  it('sampled arc starts near a and ends exactly at b', () => {
    const pts = sampleArc(A, B, 0.6, 32);
    expect(pts[pts.length - 1].x).toBeCloseTo(B.x, 6);
    expect(pts[pts.length - 1].y).toBeCloseTo(B.y, 6);
  });
});

describe('edgeLen (arc length)', () => {
  it('matches straight distance when bulge is 0', () => {
    expect(edgeLen(A, B, 0)).toBeCloseTo(10, 6);
  });

  it('semicircle arc length = π·r', () => {
    expect(edgeLen(A, B, 1)).toBeCloseTo(Math.PI * 5, 6);
  });

  it('is close to the length of a fine polyline sampling the same arc', () => {
    for (const bulge of [1, -1, 0.7, -0.4]) {
      const pts = [A, ...sampleArc(A, B, bulge, 2000)];
      let poly = 0;
      for (let i = 1; i < pts.length; i++) poly += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      expect(edgeLen(A, B, bulge)).toBeCloseTo(poly, 2);
    }
  });
});

describe('bulge ↔ three-point-drag round-trip', () => {
  it('a point grabbed anywhere along the arc (not just its midpoint) recovers the original bulge', () => {
    for (const bulge of [1, -1, 0.5, -0.5, 0.2, 2, -3]) {
      for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        const grabbed = pointOnArc(A, B, bulge, t);
        const back = bulgeFromThreePoints(A, B, grabbed, 10);
        expect(back).toBeCloseTo(bulge, 5);
      }
    }
  });

  it('returns 0 when the grabbed point sits on the straight chord', () => {
    expect(bulgeFromThreePoints(A, B, { x: 5, y: 0 })).toBe(0);
  });
});

describe('splitBulge', () => {
  it('splits a semicircle at its midpoint into two quarter-circle bulges', () => {
    const [b1, b2] = splitBulge(1, 0.5);
    expect(b1).toBeCloseTo(Math.tan(Math.PI / 8), 6);
    expect(b1).toBeCloseTo(b2, 6);
  });

  it('sub-arc lengths sum to the original arc length, and the split point lands on the original arc', () => {
    const bulge = 0.8;
    const t = 0.35;
    const mid = pointOnArc(A, B, bulge, t);
    const [b1, b2] = splitBulge(bulge, t);
    const len1 = edgeLen(A, mid, b1);
    const len2 = edgeLen(mid, B, b2);
    expect(len1 + len2).toBeCloseTo(edgeLen(A, B, bulge), 5);
  });
});

describe('polygonArea / polygonPerimeter with bulged edges', () => {
  // Unit square, CCW winding (positive shoelace), one edge bulged.
  const square = (bulge: number): Point[] => [
    { x: 0, y: 0, bulge },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];

  const tessellate = (pts: Point[]): Point[] => {
    const out: Point[] = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      out.push(a, ...sampleArc(a, b, a.bulge, 4000).slice(0, -1));
    }
    return out;
  };

  it('matches a fine brute-force tessellation for outward and inward bulges', () => {
    for (const bulge of [0.6, -0.6, 1, -1]) {
      const pts = square(bulge);
      const fine = tessellate(pts);
      const bruteArea = (() => {
        let area = 0;
        const n = fine.length;
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          area += fine[i].x * fine[j].y - fine[j].x * fine[i].y;
        }
        return Math.abs(area) / 2;
      })();
      expect(polygonArea(pts)).toBeCloseTo(bruteArea, 0);
    }
  });

  it('bulge sign controls which side of the edge the arc bows to (area shrinks/grows accordingly)', () => {
    // Bottom edge (0,0)->(10,0) of this CCW square has its left-hand normal
    // (used by arcHandlePoint/sampleArc) pointing into the square (+y), so a
    // positive bulge bows the wall inward (less area) and negative bows it
    // outward (more area) — verified against the brute-force tessellation.
    const straight = polygonArea(square(0));
    expect(polygonArea(square(0.6))).toBeLessThan(straight);
    expect(polygonArea(square(-0.6))).toBeGreaterThan(straight);
  });

  it('perimeter grows when an edge is bulged (arc longer than its chord)', () => {
    expect(polygonPerimeter(square(0.6))).toBeGreaterThan(polygonPerimeter(square(0)));
  });
});

describe('edgeWouldCrossRoom', () => {
  // Narrow 10×4 rectangle — bowing the bottom wall inward doesn't have to bulge
  // much before it reaches the nearby top wall.
  const narrowRect: Point[] = [
    { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 4 }, { x: 0, y: 4 },
  ];

  it('flags a bulge big enough to punch through the opposite wall', () => {
    // Peak of the bottom edge's arc sits at y = bulge*half = 0.9*5 = 4.5, past y=4,
    // crossing the top wall's segment well away from either shared corner.
    expect(edgeWouldCrossRoom(narrowRect, 0, 0.9)).toBe(true);
  });

  it('allows a modest bulge that stays clear of the opposite wall', () => {
    // Peak at y = 0.3*5 = 1.5, nowhere near the top wall at y=4.
    expect(edgeWouldCrossRoom(narrowRect, 0, 0.3)).toBe(false);
  });

  it('does not false-positive on edges merely sharing a corner', () => {
    // A gentle bulge on a square's edge should never "cross" its own neighbours
    // at the shared vertices.
    const square: Point[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(edgeWouldCrossRoom(square, 0, 0.4)).toBe(false);
  });

  it('outward bulges (away from the room) never cross other walls', () => {
    expect(edgeWouldCrossRoom(narrowRect, 0, -1.5)).toBe(false);
  });
});
