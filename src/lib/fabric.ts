import type { CatalogItem, FabricFinish, ProfileKind } from '../types';

/** "#rgb"/"#rrggbb" → [r, g, b]; anything else is white (the usual fabric) */
export function hexRgb(hex: string | null | undefined): [number, number, number] {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((hex ?? '').trim());
  if (!m) return [255, 255, 255];
  const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
  const n = parseInt(h, 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

/** The fabric's finish as set in the price list, else guessed from its title (all 8 languages) */
export function fabricFinish(item: Pick<CatalogItem, 'title' | 'finish'> | null | undefined): FabricFinish {
  if (item?.finish) return item.finish;
  const t = item?.title ?? '';
  if (/глян|лак|gloss|lack|brillant|brill|parlak|połysk|lakier/i.test(t)) return 'gloss';
  if (/сатин|satin|saten|satyn/i.test(t)) return 'satin';
  return 'matte';
}

/** The profile's kind as set in the price list, else guessed from its title */
export function profileKind(item: Pick<CatalogItem, 'title' | 'profileKind'> | null | undefined): ProfileKind {
  if (item?.profileKind) return item.profileKind;
  const t = item?.title ?? '';
  if (/тенев|тіньов|shadow|schatten|ombre|sombra|gölge|cieni/i.test(t)) return 'shadow';
  if (/парящ|ширяюч|float|schweb|flottant|flotante|yüzen|lewit|подсвет/i.test(t)) return 'floating';
  if (/бесщел|безщіл|gapless|fugenlos|sans fente|sin ranura|boşluksuz|bezszczel/i.test(t)) return 'gapless';
  return 'standard';
}
