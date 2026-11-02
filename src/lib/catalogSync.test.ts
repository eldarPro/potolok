import { describe, it, expect } from 'vitest';
import { CatalogItem, LightingCatalogItem, Room } from '../types';
import { refreshLooks } from './catalogSync';

const fabric = (p: Partial<CatalogItem> = {}): CatalogItem => ({
  id: 'f1', title: 'Матовое белое', price: 500, priceCorner: 150, priceInstall: 200, priceInstallCorner: 50,
  isDefault: true, color: '#f5f5f5', description: '', ...p,
});
const light = (p: Partial<LightingCatalogItem> = {}): LightingCatalogItem => ({
  id: 'l1', title: 'Спот', type: 'spot', placement: 'point', unit: 'pcs', symbol: '⊙',
  price: 150, priceInstall: 80, color: '#fff9c4', description: '', ...p,
});
const room = (): Room => ({
  id: 'r', name: 'r', points: [], fabricId: 'f1', fabric: fabric(), profileSegments: [],
  lighting: [{ id: 'e1', kind: 'point', catalogItemId: 'l1', catalogItem: light(), x: 0, y: 0 }],
  selectedAccessories: [], selectedServices: [], selectedNiches: [], areaSqm: 20, perimeterM: 18, visualization: null,
});

describe('refreshLooks', () => {
  it('takes a fabric\'s new look but keeps the room\'s price', () => {
    const r = refreshLooks(room(), [fabric({ title: 'Глянец чёрный', color: '#111111', price: 999, priceInstall: 1 })], []);
    expect(r.fabric).toMatchObject({ title: 'Глянец чёрный', color: '#111111', price: 500, priceInstall: 200 });
  });

  it('takes a light\'s new look and kind, but keeps its price and shape', () => {
    const r = refreshLooks(room(), [], [light({ title: 'Трек-спот', type: 'track_spot', color: '#ffffff', price: 1 })]);
    expect(r.lighting[0].catalogItem).toMatchObject({ title: 'Трек-спот', type: 'track_spot', color: '#ffffff', price: 150 });
    // turned into a strip in the price list: the point stays a point
    const s = refreshLooks(room(), [], [light({ type: 'strip', placement: 'path' })]);
    expect(s.lighting[0].catalogItem.type).toBe('spot');
  });

  it('takes a fabric\'s finish and a profile\'s kind and colour, keeping prices', () => {
    const r = refreshLooks(room(), [fabric({ finish: 'gloss' })], []);
    expect(r.fabric).toMatchObject({ finish: 'gloss', price: 500 });
    const prof = fabric({ id: 'p1', title: 'Стандартный', color: '#ffffff', price: 150 });
    const r0 = { ...room(), profileSegments: [{ edgeIndex: 0, profileId: 'p1', profile: prof, lengthM: 2 }] };
    const r2 = refreshLooks(r0, [], [], [{ ...prof, title: 'Теневой', color: '#000000', profileKind: 'shadow', price: 999 }]);
    expect(r2.profileSegments[0].profile).toMatchObject({ title: 'Теневой', color: '#000000', profileKind: 'shadow', price: 150 });
    expect(refreshLooks(r0, [], [], [prof])).toBe(r0);
  });

  it('leaves a room alone when nothing changed or the item is gone', () => {
    const r0 = room();
    expect(refreshLooks(r0, [fabric()], [light()])).toBe(r0);
    expect(refreshLooks(r0, [], [])).toBe(r0);
  });
});
