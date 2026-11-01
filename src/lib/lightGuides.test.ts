import { describe, it, expect } from 'vitest';
import { pointLightGuides, nearestSegmentAngle, pathLabelAnchor } from './lightGuides';

// L-shaped room, 1 px = 1.25 cm: 600×450 cm with the 250×200 cm corner cut out at the bottom right
const L = [{ x: 0, y: 0 }, { x: 480, y: 0 }, { x: 480, y: 200 }, { x: 280, y: 200 }, { x: 280, y: 360 }, { x: 0, y: 360 }];

describe('point light guides', () => {
  it('gives the two nearest walls running different ways', () => {
    const g = pointLightGuides(L, { x: 56, y: 40 });
    expect(g.map(x => Math.round(x.cm))).toEqual([50, 70]);
    expect(g[0].to).toEqual({ x: 56, y: 0 });
    expect(g[1].to).toEqual({ x: 0, y: 40 });
  });

  it('skips a wall whose square line would leave the room', () => {
    // under the wing: the wing's bottom wall (c–d) is not reachable straight up through the wall d–e
    const g = pointLightGuides(L, { x: 260, y: 300 });
    expect(g.every(x => x.to.y !== 200)).toBe(true);
    expect(g.map(x => Math.round(x.cm))).toEqual([25, 75]); // d–e on the right, e–f below
  });

  it('skips arcs', () => {
    const arc = L.map((p, i) => i === 5 ? { ...p, bulge: 0.3 } : p); // f–a bows
    const g = pointLightGuides(arc, { x: 20, y: 100 });
    expect(g.some(x => x.to.x === 0)).toBe(false);
  });

  it('adds the nearest other light', () => {
    const g = pointLightGuides(L, { x: 56, y: 56 }, [{ x: 56, y: 56 }, { x: 224, y: 56 }, { x: 56, y: 300 }]);
    const light = g.find(x => x.kind === 'light')!;
    expect(light.to).toEqual({ x: 224, y: 56 });
    expect(Math.round(light.cm)).toBe(210);
  });

  it('ignores a nearer light that is off the row', () => {
    const g = pointLightGuides(L, { x: 56, y: 56 }, [{ x: 140, y: 140 }]);
    expect(g.some(x => x.kind === 'light')).toBe(false);
  });
});

describe('track spot direction', () => {
  it('follows the nearest track run within reach', () => {
    const tracks = [[{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]];
    expect(nearestSegmentAngle(tracks, { x: 50, y: 2 }, 10)).toBe(0);
    expect(nearestSegmentAngle(tracks, { x: 99, y: 60 }, 10)).toBe(90);
    expect(nearestSegmentAngle(tracks, { x: 50, y: 50 }, 10)).toBeNull();
  });
});

describe('path label anchor', () => {
  it('sits mid the longest run', () => {
    expect(pathLabelAnchor([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 100 }])).toEqual({ at: { x: 10, y: 50 }, dir: { x: 0, y: 1 } });
    expect(pathLabelAnchor([{ x: 0, y: 0 }])).toBeNull();
  });
});
