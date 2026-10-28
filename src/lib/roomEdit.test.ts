import { describe, it, expect } from 'vitest';
import { Room } from '../types';
import { cornerAngle, squareCorner, cornerPointsAtAngle, deleteVertex, resizedPoints, wallCm, roundEdge, nudgeVertex, cmToPx } from './roomEdit';

const room = (points: { x: number; y: number }[]): Room => ({
  id: 'r', name: 'r', points, fabricId: null, fabric: null, profileSegments: [], lighting: [],
  selectedAccessories: [], selectedServices: [], selectedNiches: [], areaSqm: 1, perimeterM: 1, visualization: null,
});

// L-shape, clockwise on screen: the corner at index 3 turns inwards
const L = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 200 }, { x: 200, y: 200 }, { x: 200, y: 400 }, { x: 0, y: 400 }];

describe('cornerAngle', () => {
  it('tells outer from inner corners', () => {
    expect(cornerAngle(L, 0)).toBeCloseTo(90);
    expect(cornerAngle(L, 3)).toBeCloseTo(270);
  });
  it('works for either winding', () => {
    expect(cornerAngle([...L].reverse(), 2)).toBeCloseTo(270);
  });
});

describe('squareCorner', () => {
  it('makes a skewed corner square', () => {
    const skew = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 410, y: 300 }, { x: 0, y: 300 }];
    expect(Math.abs(cornerAngle(skew, 2) - 90)).toBeGreaterThan(1);
    const r = squareCorner(room(skew), 2)!;
    expect(cornerAngle(r.points!, 2)).toBeCloseTo(90, 5);
    // neighbours stay put
    expect(r.points![1]).toMatchObject({ x: 400, y: 0 });
    expect(r.points![3]).toMatchObject({ x: 0, y: 300 });
  });
});

describe('cornerPointsAtAngle', () => {
  const rect = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }];

  it('sets any angle, moving only that corner', () => {
    for (const deg of [60, 89.5, 120, 150]) {
      const p = cornerPointsAtAngle(rect, 2, deg)!;
      expect(cornerAngle(p, 2)).toBeCloseTo(deg, 5);
      expect(p.filter((q, k) => k !== 2)).toEqual(rect.filter((_, k) => k !== 2));
    }
  });

  it('works for either winding', () => {
    const rev = [...rect].reverse();
    expect(cornerAngle(cornerPointsAtAngle(rev, 1, 120)!, 1)).toBeCloseTo(120, 5);
  });

  it('matches squareCorner at 90°', () => {
    const skew = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 410, y: 300 }, { x: 0, y: 300 }];
    expect(cornerPointsAtAngle(skew, 2, 90)![2].x).toBeCloseTo(squareCorner(room(skew), 2)!.points![2].x, 6);
    expect(cornerPointsAtAngle(skew, 2, 90)![2].y).toBeCloseTo(squareCorner(room(skew), 2)!.points![2].y, 6);
  });

  it('changes an inner corner, and turns a corner inside out through 180°', () => {
    expect(cornerAngle(cornerPointsAtAngle(L, 3, 240)!, 3)).toBeCloseTo(240, 5);
    const flat = cornerPointsAtAngle(L, 3, 180)!;
    expect(cornerAngle(flat, 3)).toBeCloseTo(180, 5);
    const pent = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 200, y: 400 }, { x: 0, y: 300 }];
    expect(cornerAngle(cornerPointsAtAngle(pent, 3, 200)!, 3)).toBeCloseTo(200, 5);
  });

  it('refuses angles that would make walls cross', () => {
    expect(cornerPointsAtAngle(L, 0, 300)).toBeNull();
    expect(cornerPointsAtAngle(rect, 2, 0)).toBeNull();
    expect(cornerPointsAtAngle(rect, 2, 360)).toBeNull();
  });
});

describe('deleteVertex', () => {
  it('merges two walls and keeps the profile indices in step', () => {
    const r0 = room(L);
    const prof = { id: 'p', title: 'P', price: 1, priceCorner: 0, priceInstall: 0, priceInstallCorner: 0, isDefault: false, color: '#000', description: '' };
    r0.profileSegments = L.map((_, i) => ({ edgeIndex: i, profileId: 'p', profile: prof, lengthM: 1 }));
    const r = deleteVertex(r0, 3)!;
    expect(r.points).toHaveLength(5);
    expect(r.profileSegments!.map(s => s.edgeIndex)).toEqual([0, 1, 2, 3, 4]);
  });
  it('refuses to go below a triangle', () => {
    expect(deleteVertex(room(L.slice(0, 3)), 0)).toBeNull();
  });
});

describe('wall edits', () => {
  it('resizes a wall to the typed length', () => {
    const pts = resizedPoints(L, 0, 600)!;
    expect(wallCm(pts, 0)).toBe(600);
  });
  it('rounds a wall outwards', () => {
    const r = roundEdge(room(L), 0)!;
    expect(r.points![0].bulge).not.toBe(0);
    expect(r.areaSqm!).toBeGreaterThan(0);
  });
  it('nudges a corner by centimetres', () => {
    const r = nudgeVertex(room(L), 1, 1, 0);
    expect(r.points![1].x).toBeCloseTo(400 + cmToPx(1));
  });
});
