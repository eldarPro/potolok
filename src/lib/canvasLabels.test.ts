import { describe, it, expect } from 'vitest';
import { cornerDirections, layoutLabels, WallIn } from './canvasLabels';
import { Point } from './geometry';

const mids = (p: Point[]) => p.map((a, i) => { const b = p[(i + 1) % p.length]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; });
const walls = (p: Point[], texts: string[]): WallIn[] => mids(p).map((mid, i) => ({ mid, text: texts[i] }));

// thin triangle as it lands on screen: 100 × 100 × 10 cm at ~3 px/cm
const tri = [{ x: 60, y: 300 }, { x: 360, y: 300 }, { x: 358, y: 330 }];
// rectangle with a 10 × 5 cm notch in the bottom wall
const notch = [
  { x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 200 }, { x: 160, y: 200 },
  { x: 160, y: 195 }, { x: 150, y: 195 }, { x: 150, y: 200 }, { x: 0, y: 200 },
];

describe('cornerDirections', () => {
  it('points every corner of a rectangle out of the room, either winding', () => {
    const rect = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }];
    for (const pts of [rect, [...rect].reverse()]) {
      cornerDirections(pts, true, mids(pts)).forEach((d, i) => {
        const p = pts[i];
        expect(Math.sign(d.x)).toBe(p.x === 0 ? -1 : 1);
        expect(Math.sign(d.y)).toBe(p.y === 0 ? -1 : 1);
      });
    }
  });

  it('splits the two close corners of a thin triangle to opposite sides', () => {
    const [, b, c] = cornerDirections(tri, true, mids(tri));
    expect(b.y).toBeLessThan(0);
    expect(c.y).toBeGreaterThan(0);
  });

  it('points a sharp corner away along its spike', () => {
    expect(cornerDirections(tri, true, mids(tri))[0].x).toBeLessThan(-0.9);
  });

  it('points a reflex corner of a notch into the notch, out of the room', () => {
    const d = cornerDirections(notch, true, mids(notch));
    expect(d[4].y).toBeGreaterThan(0);
    expect(d[5].y).toBeGreaterThan(0);
  });
});

describe('layoutLabels', () => {
  it('keeps long walls inline and moves the short one out to a callout', () => {
    const { walls: out } = layoutLabels(tri, true, walls(tri, ['100 см', '10 см', '100 см']));
    expect(out[0]?.kind).toBe('inline');
    expect(out[2]?.kind).toBe('inline');
    expect(out[1]?.kind).toBe('callout');
    if (out[1]?.kind === 'callout') {
      expect(out[1].x - out[1].w / 2).toBeGreaterThan(360); // outside, to the right
      expect(Math.abs(out[1].y - 315)).toBeLessThan(5);     // level with the wall
    }
  });

  it('puts the inline label outside the room', () => {
    const { walls: out } = layoutLabels(tri, true, walls(tri, ['100 см', '10 см', '100 см']));
    expect(out[0]!.y).toBeLessThan(300);
  });

  it('never stacks callouts on top of each other', () => {
    const texts = ['300 см', '200 см', '140 см', '5 см', '10 см', '5 см', '150 см', '200 см'];
    const out = layoutLabels(notch, true, walls(notch, texts)).walls
      .filter((w): w is Extract<typeof w, { kind: 'callout' }> => w?.kind === 'callout');
    expect(out).toHaveLength(3);
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i], b = out[j];
        const apart = Math.abs(a.x - b.x) >= (a.w + b.w) / 2 || Math.abs(a.y - b.y) >= (a.h + b.h) / 2;
        expect(apart).toBe(true);
      }
    }
  });
});
