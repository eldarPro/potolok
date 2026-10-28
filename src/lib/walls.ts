import { GRID_SIZE, CM_PER_GRID } from './geometry';

export type Direction = 'E' | 'S' | 'W' | 'N';

export interface WallEntry { lengthM: number; dir: Direction }

export const DIR_LABEL: Record<Direction, string> = { E: '→', S: '↓', W: '←', N: '↑' };
export const DIR_NAME:  Record<Direction, string> = { E: 'восток', S: 'юг', W: 'запад', N: 'север' };

export function turnRight(d: Direction): Direction {
  return ({ E: 'S', S: 'W', W: 'N', N: 'E' } as Record<Direction, Direction>)[d];
}
export function turnLeft(d: Direction): Direction {
  return ({ E: 'N', N: 'W', W: 'S', S: 'E' } as Record<Direction, Direction>)[d];
}

// meters → canvas pixels
export function mToPx(m: number): number {
  return (m * 100 * GRID_SIZE) / CM_PER_GRID;
}

// Build polygon points from walls (all right-angle corners assumed)
export function buildPolygon(walls: WallEntry[], canvasW: number, canvasH: number) {
  let x = 0, y = 0;
  const pts: { x: number; y: number }[] = [{ x: 0, y: 0 }];
  for (const { lengthM, dir } of walls) {
    const px = mToPx(lengthM);
    if (dir === 'E') x += px;
    else if (dir === 'W') x -= px;
    else if (dir === 'S') y += px;
    else y -= px;
    pts.push({ x, y });
  }
  // Centre on canvas
  const xs = pts.map(p => p.x);
  const ys = pts.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const ox = (canvasW - (maxX - minX)) / 2 - minX;
  const oy = (canvasH - (maxY - minY)) / 2 - minY;
  return pts.map(p => ({ x: p.x + ox, y: p.y + oy }));
}

// Wall-by-wall path in cm, starting at (0,0); no centring
export function wallPathCm(walls: WallEntry[]): { x: number; y: number }[] {
  let x = 0, y = 0;
  const pts = [{ x, y }];
  for (const { lengthM, dir } of walls) {
    const cm = lengthM * 100;
    if (dir === 'E') x += cm;
    else if (dir === 'W') x -= cm;
    else if (dir === 'S') y += cm;
    else y -= cm;
    pts.push({ x, y });
  }
  return pts;
}

// ── Parametric room shapes ───────────────────────────────────────────────
// Outlines in cm, clockwise from the top-left corner. labels[i] belongs to the edge
// pts[i] → pts[i+1]: a param key (entered by the user) or a '= …' formula (computed).

type CmPt = { x: number; y: number };

export interface ShapeParam { key: string; hint: string; def: number } // def in cm

export interface ShapeDim { from: number; to: number; key: string } // extra dimension between two vertices

export interface ShapeTemplate {
  id: string;
  name: string;
  params: ShapeParam[];
  build: (v: Record<string, number>) => { pts: CmPt[]; labels: string[]; dims?: ShapeDim[] } | null; // null = sizes don't fit
}

const w = (cm: number, dir: Direction): WallEntry => ({ lengthM: cm / 100, dir });

// Right-angle outline from walls; null if any wall comes out non-positive
const fromWalls = (walls: WallEntry[], labels: string[]) =>
  walls.every(x => x.lengthM > 0) ? { pts: wallPathCm(walls).slice(0, -1), labels } : null;

export const SHAPE_TEMPLATES: ShapeTemplate[] = [
  {
    id: 'rect', name: 'Прямоугольник',
    params: [{ key: 'a', hint: 'ширина', def: 400 }, { key: 'b', hint: 'длина', def: 300 }],
    build: ({ a, b }) => fromWalls([w(a, 'E'), w(b, 'S'), w(a, 'W'), w(b, 'N')], ['a', 'b', '= a', '= b']),
  },
  {
    id: 'L', name: 'Г-образная',
    params: [
      { key: 'a', hint: 'верх', def: 400 }, { key: 'b', hint: 'правая', def: 250 },
      { key: 'c', hint: 'уступ', def: 150 }, { key: 'd', hint: 'выступ', def: 150 },
    ],
    build: ({ a, b, c, d }) => fromWalls(
      [w(a, 'E'), w(b, 'S'), w(c, 'W'), w(d, 'S'), w(a - c, 'W'), w(b + d, 'N')],
      ['a', 'b', 'c', 'd', '= a−c', '= b+d'],
    ),
  },
  {
    id: 'U', name: 'П-образная',
    params: [
      { key: 'a', hint: 'ширина', def: 400 }, { key: 'b', hint: 'длина', def: 350 },
      { key: 'c', hint: 'вырез', def: 160 }, { key: 'd', hint: 'глубина', def: 150 },
      { key: 'e', hint: 'отступ', def: 120 },
    ],
    build: ({ a, b, c, d, e }) => fromWalls(
      [w(e, 'E'), w(d, 'S'), w(c, 'E'), w(d, 'N'), w(a - e - c, 'E'), w(b, 'S'), w(a, 'W'), w(b, 'N')],
      ['e', 'd', 'c', '= d', '= a−c−e', 'b', 'a', '= b'],
    ),
  },
  {
    id: 'T', name: 'Т-образная',
    params: [
      { key: 'a', hint: 'верх', def: 400 }, { key: 'b', hint: 'боковые', def: 150 },
      { key: 'c', hint: 'низ', def: 120 }, { key: 'd', hint: 'ножка', def: 250 },
    ],
    build: ({ a, b, c, d }) => {
      const s = (a - c) / 2;
      return fromWalls(
        [w(a, 'E'), w(b, 'S'), w(s, 'W'), w(d, 'S'), w(c, 'W'), w(d, 'N'), w(s, 'W'), w(b, 'N')],
        ['a', 'b', '= (a−c)/2', 'd', 'c', '= d', '= (a−c)/2', '= b'],
      );
    },
  },
  {
    id: 'bump', name: 'Выступ',
    params: [
      { key: 'a', hint: 'ширина', def: 400 }, { key: 'b', hint: 'длина', def: 300 },
      { key: 'c', hint: 'выступ', def: 140 }, { key: 'd', hint: 'глубина', def: 60 },
      { key: 'e', hint: 'отступ', def: 130 },
    ],
    build: ({ a, b, c, d, e }) => fromWalls(
      [w(a, 'E'), w(b, 'S'), w(e, 'W'), w(d, 'N'), w(c, 'W'), w(d, 'S'), w(a - e - c, 'W'), w(b, 'N')],
      ['a', 'b', 'e', 'd', 'c', '= d', '= a−c−e', '= b'],
    ),
  },
  {
    id: 'trap', name: 'Трапеция',
    params: [
      { key: 'a', hint: 'верх', def: 280 }, { key: 'b', hint: 'низ', def: 400 },
      { key: 'c', hint: 'боковые', def: 306 },
    ],
    build: ({ a, b, c }) => {
      const dx = (b - a) / 2;
      if (!(a > 0 && b > 0 && c > Math.abs(dx))) return null;
      const h = Math.sqrt(c * c - dx * dx);
      const x0 = Math.max(0, dx);
      return {
        pts: [{ x: x0, y: 0 }, { x: x0 + a, y: 0 }, { x: x0 + a + dx, y: h }, { x: x0 - dx, y: h }],
        labels: ['a', 'c', 'b', '= c'],
      };
    },
  },
  {
    id: 'hex', name: 'Шестигранник',
    params: [
      { key: 'a', hint: 'верх/низ', def: 200 }, { key: 'c', hint: 'скосы', def: 180 },
      { key: 'b', hint: 'ширина', def: 400 },
    ],
    build: ({ a, b, c }) => {
      const dx = (b - a) / 2;
      if (!(a > 0 && dx > 0 && c > dx)) return null;
      const hh = Math.sqrt(c * c - dx * dx);
      return {
        pts: [
          { x: dx, y: 0 }, { x: dx + a, y: 0 }, { x: b, y: hh },
          { x: dx + a, y: 2 * hh }, { x: dx, y: 2 * hh }, { x: 0, y: hh },
        ],
        labels: ['a', 'c', '= c', '= a', '= c', '= c'],
        dims: [{ from: 5, to: 2, key: 'b' }],
      };
    },
  },
  {
    id: 'cut', name: 'Скос углов',
    params: [
      { key: 'a', hint: 'верх', def: 300 }, { key: 'd', hint: 'левая', def: 300 },
      { key: 'b', hint: 'правая', def: 100 }, { key: 'c', hint: 'скосы', def: 141 },
    ],
    build: ({ a, b, c, d }) => {
      const dy = (d - b) / 2;
      if (!(a > 0 && b > 0 && dy > 0 && c > dy)) return null;
      const dx = Math.sqrt(c * c - dy * dy);
      return {
        pts: [
          { x: 0, y: 0 }, { x: a, y: 0 }, { x: a + dx, y: dy },
          { x: a + dx, y: dy + b }, { x: a, y: d }, { x: 0, y: d },
        ],
        labels: ['a', 'c', 'b', '= c', '= a', 'd'],
      };
    },
  },
];

// Rotate 90° clockwise
export function rotatePts(pts: CmPt[]): CmPt[] {
  return pts.map(p => ({ x: -p.y, y: p.x }));
}

// Mirror top↔bottom (outline becomes counter-clockwise; labels stay per edge)
export function mirrorPts(pts: CmPt[]): CmPt[] {
  return pts.map(p => ({ x: p.x, y: -p.y }));
}
