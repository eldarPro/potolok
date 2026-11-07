import { describe, expect, it } from 'vitest';
import { Room } from '../types';
import { shrinkCm, shrinkRoom, clampShrink } from './shrink';

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
    const sr = shrinkRoom(room([[0, 0], [4, 0], [4, 3], [0, 3]]), 10)!;
    expect(sr.walls.map(w => [w.name, w.cm])).toEqual([['AB', 360], ['BC', 270], ['CD', 360], ['DA', 270]]);
    expect(sr.diagonals.map(d => d.cm)).toEqual([450, 450]);
    expect(sr.areaSqm).toBeCloseTo(12 * 0.81, 6);
    expect(sr.perimeterM).toBeCloseTo(12.6, 6);
  });

  it('joins a wall split for a profile into one length, letters the corners in a row', () => {
    const sr = shrinkRoom(room([[0, 0], [2, 0], [4, 0], [4, 3], [0, 3]]), 0)!;
    expect(sr.walls.map(w => [w.name, w.cm])).toEqual([['AB', 400], ['BC', 300], ['CD', 400], ['DA', 300]]);
    expect(sr.corners.map(c => c.label)).toEqual(['A', 'B', 'C', 'D']);
    expect(sr.diagonals.map(d => d.name)).toEqual(['AC', 'BD']);
  });

  it('puts wall sizes outside the room, the inner corner of an L included', () => {
    const sr = shrinkRoom(room([[0, 0], [5, 0], [5, 3], [3, 3], [3, 4], [0, 4]]), 7)!;
    const top = sr.walls[0], inner = sr.walls[3]; // AB, DE
    expect(top.out.y).toBeLessThan(0);
    expect(inner.out.x).toBeGreaterThan(0);
  });

  it('leaves out diagonals hidden on the drawing', () => {
    const r = room([[0, 0], [4, 0], [4, 3], [0, 3]], { hiddenDiagonals: ['1-3'] });
    expect(shrinkRoom(r, 7)!.diagonals.map(d => d.name)).toEqual(['AC']);
  });
});
