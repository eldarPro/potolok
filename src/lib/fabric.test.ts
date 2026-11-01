import { describe, it, expect } from 'vitest';
import { hexRgb } from './fabric';

describe('hexRgb', () => {
  it('reads both hex forms, white otherwise', () => {
    expect(hexRgb('#ff8000')).toEqual([255, 128, 0]);
    expect(hexRgb('#f80')).toEqual([255, 136, 0]);
    expect(hexRgb('')).toEqual([255, 255, 255]);
  });
});
