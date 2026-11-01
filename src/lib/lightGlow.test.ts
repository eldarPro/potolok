import { describe, it, expect } from 'vitest';
import { LightingCatalogItem, LightingType, RoomLightingElement } from '../types';
import { darkSpots, lightLevel, trackSpotAim, bareTracks } from './lightGlow';
import { pxToCm } from './geometry';

const cm2px = (cm: number) => cm / pxToCm(1);
const item = (type: LightingType): LightingCatalogItem => ({
  id: type, title: type, type, placement: type === 'strip' || type === 'line' || type === 'track' ? 'path' : 'point',
  unit: 'pcs', symbol: '', price: 0, priceInstall: 0, color: '#fff9c4', description: '',
});
const pt = (type: LightingType, xCm: number, yCm: number): RoomLightingElement =>
  ({ id: `${type}${xCm}${yCm}`, kind: 'point', catalogItemId: type, catalogItem: item(type), x: cm2px(xCm), y: cm2px(yCm) });
const path = (type: LightingType, ps: [number, number][]): RoomLightingElement =>
  ({ id: `${type}${ps}`, kind: 'path', catalogItemId: type, catalogItem: item(type), points: ps.map(([x, y]) => ({ x: cm2px(x), y: cm2px(y) })), lengthM: 1 });
// 600×400 cm room
const room = [[0, 0], [600, 0], [600, 400], [0, 400]].map(([x, y]) => ({ x: cm2px(x), y: cm2px(y) }));

describe('light level', () => {
  it('is full under a spot and fades with distance', () => {
    const at = (x: number, y: number) => lightLevel({ x: cm2px(x), y: cm2px(y) }, [pt('spot', 100, 100)], [], cm2px);
    expect(at(100, 100)).toBeCloseTo(1);
    expect(at(170, 100)).toBeCloseTo(Math.exp(-1));
    expect(at(400, 100)).toBeLessThan(0.01);
  });

  it('a track with spots on it leaves the light to them; a bare track shines itself', () => {
    const track = path('track', [[0, 0], [100, 0]]);
    const spot = pt('track_spot', 50, 10);
    expect(bareTracks([track, spot], cm2px).size).toBe(0);
    expect(bareTracks([track], cm2px)).toEqual(new Set([track.id]));
    const p = { x: cm2px(50), y: cm2px(0) };
    expect(lightLevel(p, [track], [], cm2px)).toBe(0);
    expect(lightLevel(p, [track], [], cm2px, [], bareTracks([track], cm2px))).toBeCloseTo(1);
  });

  it('a track spot off any track shines towards the middle of the room', () => {
    const aim = trackSpotAim({ x: cm2px(100), y: cm2px(200) }, [], cm2px, room);
    expect(pxToCm(aim.at.x)).toBeCloseTo(170);
    expect(pxToCm(aim.at.y)).toBeCloseTo(200);
  });

  it('a track spot lights across its track, the side its cone opens to', () => {
    const track = [[{ x: 0, y: 0 }, { x: cm2px(300), y: 0 }]];
    const aim = trackSpotAim({ x: cm2px(100), y: 0 }, track, cm2px);
    expect(aim.angle).toBe(0);
    expect(pxToCm(aim.at.x)).toBeCloseTo(100);
    expect(pxToCm(aim.at.y)).toBeCloseTo(-70);
  });

  it('a track spot by a wall turns into the room, not at the wall', () => {
    // track 30 cm off the top wall: the spots shine down into the room
    const track = [[{ x: cm2px(100), y: cm2px(30) }, { x: cm2px(400), y: cm2px(30) }]];
    const aim = trackSpotAim({ x: cm2px(200), y: cm2px(30) }, track, cm2px, room);
    expect(aim.angle).toBe(180);
    expect(pxToCm(aim.at.y)).toBeCloseTo(100);
    // a track along the bottom wall shines up
    const low = [[{ x: cm2px(100), y: cm2px(370) }, { x: cm2px(400), y: cm2px(370) }]];
    expect(pxToCm(trackSpotAim({ x: cm2px(200), y: cm2px(370) }, low, cm2px, room).at.y)).toBeCloseTo(300);
  });
});

describe('dark spots', () => {
  it('none without lights to judge by', () => {
    expect(darkSpots(room, [], cm2px)).toEqual([]);
    // a bare track in a corner lights only that corner — the rest is dark
    expect(darkSpots(room, [path('track', [[0, 0], [100, 0]])], cm2px).length).toBeGreaterThan(0);
  });

  it('finds the far half of a room lit from one end', () => {
    const spots = darkSpots(room, [pt('chandelier', 100, 200)], cm2px);
    expect(spots).toHaveLength(1);
    expect(pxToCm(spots[0].x)).toBeGreaterThan(400);
  });

  it('none in a well-lit room', () => {
    const lights = [pt('chandelier', 300, 200), ...[[75, 75], [300, 60], [525, 75], [75, 325], [300, 340], [525, 325], [60, 200], [540, 200]].map(([x, y]) => pt('spot', x, y))];
    expect(darkSpots(room, lights, cm2px)).toEqual([]);
  });
});
