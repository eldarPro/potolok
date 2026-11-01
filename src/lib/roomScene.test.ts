import { describe, it, expect } from 'vitest';
import { drawingPrompt } from './roomScene';
import { Room, LightingCatalogItem } from '../types';

const room = (lighting: Room['lighting'] = []): Room => ({
  id: 'r', name: 'Гостиная', points: [], fabricId: null, fabric: null, profileSegments: [], lighting,
  selectedAccessories: [], selectedServices: [], selectedNiches: [], areaSqm: 6, perimeterM: 10, visualization: null,
});

const spot: LightingCatalogItem = {
  id: 's', title: 'Спот GX53', type: 'spot', placement: 'point', unit: 'pcs', symbol: '⊙', price: 0, priceInstall: 0, color: '', description: '',
} as LightingCatalogItem;

describe('drawingPrompt', () => {
  it('describes a ceiling without lights as bare, lit by daylight only', () => {
    const text = drawingPrompt(room());
    expect(text).toContain('без единого светильника');
    expect(text).toContain('только дневным светом');
    expect(text).not.toMatch(/Освещение на потолке/);
  });

  it('lists the drawn lights and rules out any others', () => {
    const text = drawingPrompt(room([
      { kind: 'point', id: 'a', x: 0, y: 0, catalogItem: spot },
      { kind: 'point', id: 'b', x: 1, y: 1, catalogItem: spot },
    ] as Room['lighting']));
    expect(text).toContain('Спот GX53 (встраиваемый точечный светильник) — 2 шт.');
    expect(text).toContain('Других светильников на потолке нет');
    expect(text).not.toContain('без единого светильника');
  });
});
