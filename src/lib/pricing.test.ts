import { describe, it, expect } from 'vitest';
import { CatalogItem, NicheItem, Project, Room, RoomNichePath } from '../types';
import { changedFor, emptyPricing, lineTotal, projectEstimate, resetSide, resetSideAll, roomItems, withPrices } from './pricing';

const fabric: CatalogItem = { id: 'f1', title: 'Матовое белое', price: 500, priceCorner: 150, priceInstall: 200, priceInstallCorner: 50, isDefault: true, color: '', description: '' };
const profile: CatalogItem = { id: 'p1', title: 'ПВХ', price: 150, priceCorner: 80, priceInstall: 60, priceInstallCorner: 30, isDefault: true, color: '', description: '' };

// A w×h metre rectangle, one profile segment per wall, `spots` point lights
const rect = (id: string, w: number, h: number, spots: number): Room => ({
  id, name: id,
  points: [{ x: 0, y: 0 }, { x: w * 100, y: 0 }, { x: w * 100, y: h * 100 }, { x: 0, y: h * 100 }],
  fabricId: 'f1', fabric: { ...fabric },
  profileSegments: [w, h, w, h].map((l, i) => ({ edgeIndex: i, profileId: 'p1', profile: { ...profile }, lengthM: l })),
  lighting: Array.from({ length: spots }, (_, i) => ({
    id: `${id}-l${i}`, kind: 'point' as const, catalogItemId: 'l1', x: 0, y: 0,
    catalogItem: { id: 'l1', title: 'Спот', type: 'spot' as const, placement: 'point' as const, unit: 'pcs' as const, symbol: '', price: 150, priceInstall: 80, color: '', description: '' },
  })),
  selectedAccessories: [], selectedServices: [], selectedNiches: [],
  areaSqm: w * h, perimeterM: 2 * (w + h), visualization: null,
});

const project = (rooms: Room[], pricing = emptyPricing()): Project => ({
  id: 'p', clientName: 'Иванов', address: '', phone: '', notes: '', createdAt: '', updatedAt: '', rooms, pricing,
});

describe('roomItems', () => {
  it('groups a profile across walls and bills one corner per segment', () => {
    const items = roomItems(rect('r', 5, 4, 6));
    const p = items.find(i => i.kind === 'profile')!;
    expect(p.qty).toBe(18);
    expect(p.corners).toBe(4);
    expect(lineTotal(p, 'client')).toBe(150 * 18 + 80 * 4);
    expect(lineTotal(p, 'worker')).toBe(60 * 18 + 30 * 4);
  });

  it('bills no fabric corners for a plain rectangle', () => {
    const f = roomItems(rect('r', 5, 4, 0)).find(i => i.kind === 'fabric')!;
    expect(f.corners).toBe(0);
    expect(lineTotal(f, 'client')).toBe(10000);
  });
});

describe('projectEstimate', () => {
  it('sums rooms for the client and the crew', () => {
    const est = projectEstimate(project([rect('a', 5, 4, 6), rect('b', 4, 3.5, 4)]));
    expect(est.clientTotal).toBe((10000 + 3020 + 900) + (7000 + 2570 + 600));
    expect(est.workerTotal).toBe((4000 + 1080 + 120 + 480) + (2800 + 900 + 120 + 320));
  });

  it('applies a project price to every room using the item', () => {
    const p = project([rect('a', 5, 4, 0), rect('b', 4, 3.5, 0)]);
    const f = roomItems(p.rooms[0]).find(i => i.kind === 'fabric')!;
    const pricing = withPrices(emptyPricing(), f, { ...f.base, price: 520 });
    const est = projectEstimate(project(p.rooms, pricing));
    for (const r of est.rooms) {
      const item = r.items.find(i => i.kind === 'fabric')!;
      expect(item.overridden).toBe(true);
      expect(item.prices.price).toBe(520);
    }
    expect(est.clientSubtotal).toBe(520 * 34 + 150 * 33 + 80 * 8);
  });

  it('clears the override once prices match the price list again', () => {
    const f = roomItems(rect('a', 5, 4, 0)).find(i => i.kind === 'fabric')!;
    const changed = withPrices(emptyPricing(), f, { ...f.base, price: 520 });
    expect(withPrices(changed, f, f.base).overrides).toEqual({});
  });

  it('takes the discount off the client side only and adds custom lines', () => {
    const pricing = {
      ...emptyPricing(), discountPct: 10,
      clientLines: [{ id: '1', title: 'Вывоз мусора', amount: 500 }],
      workerLines: [{ id: '2', title: 'Выезд', amount: 1000 }],
    };
    const est = projectEstimate(project([rect('a', 5, 4, 0)], pricing));
    expect(est.discount).toBe(est.clientSubtotal * 0.1);
    expect(est.clientTotal).toBe(est.clientSubtotal * 0.9 + 500);
    expect(est.workerTotal).toBe(est.workerSubtotal + 1000);
  });
});

describe('client prices and crew rates apart', () => {
  it('resets one side and keeps the other', () => {
    const f = roomItems(rect('r', 5, 4, 0)).find(i => i.kind === 'fabric')!;
    const both = withPrices(emptyPricing(), f, { ...f.base, price: 520, priceInstall: 250 });
    const edited = projectEstimate(project([rect('r', 5, 4, 0)], both)).rooms[0].items.find(i => i.kind === 'fabric')!;
    expect(changedFor(edited, 'client')).toBe(true);
    expect(changedFor(edited, 'worker')).toBe(true);
    expect(resetSide(edited, 'worker')).toEqual({ ...f.base, price: 520 });

    const ratesBack = resetSideAll(both, [edited], 'worker');
    const after = projectEstimate(project([rect('r', 5, 4, 0)], ratesBack)).rooms[0].items.find(i => i.kind === 'fabric')!;
    expect(after.prices.price).toBe(520);
    expect(after.prices.priceInstall).toBe(f.base.priceInstall);
    expect(changedFor(after, 'worker')).toBe(false);
  });
});

describe('niches', () => {
  const niche: NicheItem = {
    id: 'n1', title: 'Брус', unit: 'perimeter', type: 'cornice', description: '',
    price: 1200, priceInstall: 600, priceCap: 200, priceInstallCap: 100,
    priceCorner: 300, priceInstallCorner: 200, priceCornice: 700, priceInstallCornice: 300,
  };
  // Along the 5 m wall, 30 cm off it, stopping 1 m short of the right wall,
  // then turning back to it — one turn, one free end
  const path: RoomNichePath = {
    id: 'e1', kind: 'path', nicheId: 'n1', niche,
    points: [{ x: 0, y: 30 }, { x: 400, y: 30 }, { x: 400, y: 0 }], lengthM: 4.3, caps: 1,
  };
  const withNiche = (p: RoomNichePath) => ({ ...rect('r', 5, 4, 0), selectedNiches: [p] });

  it('bills the niche turns, its end caps and its cornice as their own lines', () => {
    const items = roomItems(withNiche(path)).filter(i => i.kind === 'niche');
    expect(items.map(i => i.part)).toEqual([undefined, 'cap', 'cornice']);
    const [main, cap, cornice] = items;
    expect(main.corners).toBe(1);
    expect(lineTotal(main, 'client')).toBe(1200 * 4.3 + 300);
    expect(lineTotal(cap, 'worker')).toBe(100);
    expect(lineTotal(cornice, 'client')).toBeCloseTo(700 * 4.3);
  });

  it('leaves the cornice out when the client has their own', () => {
    const items = roomItems(withNiche({ ...path, cornice: false }));
    expect(items.some(i => i.part === 'cornice')).toBe(false);
  });

  it('a curtain-track niche brings no cornice', () => {
    const items = roomItems(withNiche({ ...path, niche: { ...niche, type: 'curtain' } }));
    expect(items.some(i => i.part === 'cornice')).toBe(false);
  });
});
