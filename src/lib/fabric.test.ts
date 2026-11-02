import { describe, it, expect } from 'vitest';
import { hexRgb, fabricFinish, profileKind } from './fabric';

describe('hexRgb', () => {
  it('reads both hex forms, white otherwise', () => {
    expect(hexRgb('#ff8000')).toEqual([255, 128, 0]);
    expect(hexRgb('#f80')).toEqual([255, 136, 0]);
    expect(hexRgb('')).toEqual([255, 255, 255]);
  });
});

describe('fabricFinish / profileKind', () => {
  it('takes the price list field first, else guesses from the title', () => {
    expect(fabricFinish({ title: 'Глянцевое белое' })).toBe('gloss');
    expect(fabricFinish({ title: 'Чёрный лак' })).toBe('gloss');
    expect(fabricFinish({ title: 'Сатин' })).toBe('satin');
    expect(fabricFinish({ title: 'Матовое белое' })).toBe('matte');
    expect(fabricFinish({ title: 'Глянцевое', finish: 'satin' })).toBe('satin');
    expect(fabricFinish(null)).toBe('matte');
    expect(profileKind({ title: 'Теневой EuroKraab' })).toBe('shadow');
    expect(profileKind({ title: 'Парящий с подсветкой' })).toBe('floating');
    expect(profileKind({ title: 'Бесщелевой' })).toBe('gapless');
    expect(profileKind({ title: 'Стандартный ПВХ' })).toBe('standard');
    expect(profileKind({ title: 'Стандартный', profileKind: 'shadow' })).toBe('shadow');
  });
});
