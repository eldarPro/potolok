/** "#rgb"/"#rrggbb" → [r, g, b]; anything else is white (the usual fabric) */
export function hexRgb(hex: string | null | undefined): [number, number, number] {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((hex ?? '').trim());
  if (!m) return [255, 255, 255];
  const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
  const n = parseInt(h, 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}
