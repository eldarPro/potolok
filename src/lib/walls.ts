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
