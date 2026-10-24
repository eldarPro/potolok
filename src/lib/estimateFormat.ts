import { EstimateItem, EstimateSide, ItemKind, ItemUnit, lineTotal } from './pricing';

type T = (key: string, vars?: Record<string, string | number>) => string;

export const fmtRub = (v: number) => `${Math.round(v).toLocaleString('ru')} ₽`;
export const fmtNum = (v: number) => Math.round(v).toLocaleString('ru');

export const unitLabel = (u: ItemUnit, t: T) =>
  u === 'm2' ? 'м²' : u === 'm' ? t('unit.m') : u === 'pcs' ? t('unit.pcs') : u;

export const fmtQty = (item: EstimateItem) =>
  item.unit === 'm2' || item.unit === 'm' ? item.qty.toFixed(2) : String(Math.round(item.qty * 100) / 100);

/** Estimate section each kind of item is listed under */
export const KIND_SECTION_KEY: Record<ItemKind, string> = {
  fabric: 'sum.materials', profile: 'sum.materials', lighting: 'sum.lighting',
  accessory: 'sum.accessories', service: 'sum.services', niche: 'sum.niches',
};

/** Price-list section each kind of item comes from */
export const KIND_CATALOG_KEY: Record<ItemKind, string> = {
  fabric: 'sec.fabric', profile: 'sec.profile', lighting: 'sec.lighting',
  accessory: 'sec.accessories', service: 'sec.services', niche: 'sec.niches',
};

/** «520 ₽ × 20.00 м² + 150 ₽ × 2 доп. угл.» */
export const lineCalc = (item: EstimateItem, side: EstimateSide, t: T) => {
  const rate = side === 'client' ? item.prices.price : item.prices.priceInstall;
  const cornerRate = side === 'client' ? item.prices.priceCorner : item.prices.priceInstallCorner;
  let s = `${fmtNum(rate)} ₽ × ${fmtQty(item)} ${unitLabel(item.unit, t)}`;
  if (item.corners > 0 && cornerRate > 0)
    s += ` + ${fmtNum(cornerRate)} ₽ × ${item.corners} ${t(item.kind === 'fabric' ? 'sum.extraCorners' : 'sum.cornersShort')}`;
  return s;
};

/** Items grouped under their estimate section, in order; worker side skips items with no install pay */
export const sectionedItems = (items: EstimateItem[], side: EstimateSide) => {
  const out: { key: string; items: EstimateItem[] }[] = [];
  for (const item of items) {
    if (side === 'worker' && lineTotal(item, 'worker') <= 0) continue;
    const key = KIND_SECTION_KEY[item.kind];
    const group = out.find(g => g.key === key);
    if (group) group.items.push(item); else out.push({ key, items: [item] });
  }
  return out;
};
