import { describe, it, expect } from 'vitest';
import { NicheItem, Room, RoomNicheCross, RoomNicheWall, WallPoint } from '../types';
import { nicheShape, nicheMetrics, nicheSpan, crossCorners, crossBand, squareCmOn, snapWallCm } from './nicheGeometry';
import { setNicheSizes, changeNicheWalls, snapNicheEnd } from './nicheEdit';
import { roomCorners } from './pricing';
import { splitEdge } from './roomEdit';

// 500×400 cm (0.8 px per cm): a–b along the top, then b–c, c–d, d–a
const room = (niches: RoomNicheWall[] = []): Room => ({
  id: 'r', name: 'r',
  points: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 320 }, { x: 0, y: 320 }],
  fabricId: null, fabric: null, profileSegments: [], lighting: [], selectedAccessories: [], selectedServices: [],
  selectedNiches: niches, areaSqm: 20, perimeterM: 18, visualization: null,
});
const item: NicheItem = { id: 'n', title: 'ПК-5', unit: 'perimeter', type: 'curtain', price: 1000, priceInstall: 0, description: '' };
const niche = (p: Partial<RoomNicheWall> = {}): RoomNicheWall =>
  ({ id: 'e', kind: 'wall', nicheId: 'n', niche: item, edges: [0], depthCm: 15, startCm: 0, endCm: 0, ...p });

describe('wall niche shape', () => {
  it('runs wall to wall with no caps, its band reaching into both corners', () => {
    const s = nicheShape(room(), niche())!;
    expect(s.lengthM).toBeCloseTo(5);
    expect([s.freeStart, s.freeEnd]).toEqual([false, false]);
    expect(s.inner[0].x).toBeCloseTo(0);
    expect(s.inner[0].y).toBeCloseTo(12);
    expect(roomCorners(room([niche()]))).toBe(4);
  });

  it('stopping short of the corners takes a cap at each end and notches the canvas', () => {
    const r = room([niche({ startCm: 50, endCm: 150 })]);
    expect(nicheMetrics(r, r.selectedNiches[0])).toEqual({ lengthM: 3, turns: 0, caps: 2 });
    expect(roomCorners(r)).toBe(8);
  });

  it('keeps its ends inside its walls', () => {
    expect(nicheSpan(room(), niche({ startCm: -20, endCm: 600 }))).toEqual({ from: 0, to: 0, total: 500 });
  });

  it('wraps a corner across two walls', () => {
    const r = room();
    const m = nicheMetrics(r, niche({ edges: [3, 0] }))!;
    expect(m.lengthM).toBeCloseTo(9);
    expect(m.turns).toBe(1);
  });
});

describe('editing a wall niche', () => {
  it('a new length keeps the start and moves the far gap', () => {
    const n = setNicheSizes(room(), niche({ startCm: 50, endCm: 150 }), { length: 200 });
    expect([n.startCm, n.endCm]).toEqual([50, 250]);
  });

  it('adds the next wall, running to its far corner', () => {
    const n = changeNicheWalls(room(), niche({ endCm: 100 }), 'end', 1)!;
    expect(n.edges).toEqual([0, 1]);
    expect(n.endCm).toBe(0);
  });

  it('a dragged end sticks to a corner, else to 5 cm', () => {
    expect(snapNicheEnd(room(), niche(), 497, 6, 'угол')).toEqual({ cm: 500, label: 'угол' });
    expect(snapNicheEnd(room(), niche(), 352, 2, 'угол')).toEqual({ cm: 350, label: null });
    expect(snapNicheEnd(room(), niche({ edges: [0, 1] }), 503, 6, 'угол').cm).toBe(500);
  });

  it('splitting the wall keeps the niche in place', () => {
    const r = room([niche({ startCm: 145, endCm: 145 })]);
    const out = splitEdge(r, 0, 100, null, null)!;
    const n = out.selectedNiches![0] as RoomNicheWall;
    expect(n.edges).toEqual([0, 1]);
    expect([n.startCm, n.endCm]).toEqual([145, 145]);
  });
});

describe('niche across the room', () => {
  const cross = (a: WallPoint, b: WallPoint): RoomNicheCross => ({ id: 'x', kind: 'cross', nicheId: 'n', niche: item, a, b });
  // from the top wall at 200 cm to the bottom wall (c→d), square across
  const across = cross({ edge: 0, cm: 200 }, { edge: 2, cm: 300 });

  it('runs wall to wall and is billed by its length', () => {
    const r = { ...room(), selectedNiches: [across] };
    expect(nicheMetrics(r, across)!.lengthM).toBeCloseTo(4);
  });

  it('adds two canvas corners per end in mid-wall, one per end in a corner', () => {
    expect(roomCorners({ ...room(), selectedNiches: [across] })).toBe(8);
    expect(crossCorners(room(), cross({ edge: 0, cm: 0 }, { edge: 2, cm: 500 }))).toBe(2);
  });

  it('snaps the second end square across from the first', () => {
    const square = squareCmOn(room().points, 2, { edge: 0, cm: 200 });
    expect(square).toBeCloseTo(300);
    expect(snapWallCm(500, 297, 6, square)).toEqual({ cm: square, square: true });
    expect(snapWallCm(500, 251, 2, square)).toEqual({ cm: 250, square: false });
  });

  it('keeps its ends in place when a wall is split', () => {
    const out = splitEdge({ ...room(), selectedNiches: [across] }, 0, 100, null, null)!;
    const n = out.selectedNiches![0] as RoomNicheCross;
    expect(n.a).toEqual({ edge: 1, cm: 100 });
    expect(n.b).toEqual({ edge: 3, cm: 300 });
  });
});

describe('width of a niche across the room', () => {
  it('is a band of its width, its edges cut off at the walls', () => {
    const n: RoomNicheCross = { id: 'x', kind: 'cross', nicheId: 'n', niche: item, a: { edge: 0, cm: 200 }, b: { edge: 2, cm: 300 }, widthCm: 20 };
    const cb = crossBand(room(), n)!;
    // 20 cm = 16 px, 8 px each side of x = 160; both edges run from y = 0 to y = 320
    const xs = cb.band.map(p => Math.round(p.x)).sort((a, b) => a - b);
    expect(xs).toEqual([152, 152, 168, 168]);
    expect(cb.band.map(p => Math.round(p.y)).sort((a, b) => a - b)).toEqual([0, 0, 320, 320]);
  });
});
