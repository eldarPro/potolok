import { Project, ProjectPricing, PriceOverride, Room, RoomNicheElement } from '../types';
import { totalFabricCorners } from './geometry';
import { crossCorners, nicheCutPaths, nicheMetrics } from './nicheGeometry';

// The first 4 corners of a room (a plain rectangle) are free — only extra
// corners past that add to the fabric price.
export const FREE_FABRIC_CORNERS = 4;

export type EstimateSide = 'client' | 'worker';
export type ItemKind = 'fabric' | 'profile' | 'lighting' | 'accessory' | 'service' | 'niche';
export type NichePart = 'cap' | 'cornice';

/** 'm2' | 'm' | 'pcs' are unit codes; anything else is an accessory's own unit label */
export type ItemUnit = string;

export interface ItemPrices {
  price: number;
  priceCorner: number;
  priceInstall: number;
  priceInstallCorner: number;
}

/** One price-list item as used in one room, quantities summed */
export interface EstimateItem {
  itemId: string;
  kind: ItemKind;
  title: string;
  qty: number;
  unit: ItemUnit;
  /** corners billed at the corner price: extra fabric corners, or one per profile segment */
  corners: number;
  /** a niche's add-on billed on its own line: its end caps or the cornice hung in it */
  part?: NichePart;
  /** prices copied into the room when the item was picked */
  base: ItemPrices;
  /** base with the project's override applied */
  prices: ItemPrices;
  overridden: boolean;
}

export interface RoomEstimate {
  room: Room;
  items: EstimateItem[];
  client: number;
  worker: number;
}

export interface ProjectEstimate {
  rooms: RoomEstimate[];
  pricing: ProjectPricing;
  clientSubtotal: number;
  discount: number;
  clientTotal: number;
  workerSubtotal: number;
  workerTotal: number;
}

export const emptyPricing = (): ProjectPricing => ({ overrides: {}, discountPct: 0, clientLines: [], workerLines: [] });

export const projectPricing = (project: Project): ProjectPricing => ({ ...emptyPricing(), ...project.pricing });

/** Fabric, profiles and drawn niches are also priced per corner; everything else isn't */
export const hasCorners = (item: EstimateItem) =>
  item.kind === 'fabric' || item.kind === 'profile' || (item.kind === 'niche' && item.unit === 'm' && !item.part);

const PRICE_KEYS: (keyof ItemPrices)[] = ['price', 'priceCorner', 'priceInstall', 'priceInstallCorner'];

const applyOverride = (base: ItemPrices, o: PriceOverride | undefined): ItemPrices => ({ ...base, ...o });

/** The override that turns `base` into `prices` — only fields that differ; null if none do */
export const overrideFor = (base: ItemPrices, prices: ItemPrices): PriceOverride | null => {
  const o: PriceOverride = {};
  for (const k of PRICE_KEYS) if (prices[k] !== base[k]) o[k] = prices[k];
  return Object.keys(o).length ? o : null;
};

/** Pricing with the item's project price set to `prices` (or cleared when it matches the base again) */
export const withPrices = (pricing: ProjectPricing, item: EstimateItem, prices: ItemPrices): ProjectPricing => {
  const overrides = { ...pricing.overrides };
  const o = overrideFor(item.base, prices);
  if (o) overrides[item.itemId] = o; else delete overrides[item.itemId];
  return { ...pricing, overrides };
};

/** The prices one side of the estimate is billed at */
export const sideKeys = (side: EstimateSide): (keyof ItemPrices)[] =>
  side === 'client' ? ['price', 'priceCorner'] : ['priceInstall', 'priceInstallCorner'];

/** Whether the project changed the prices this side of the estimate is billed at */
export const changedFor = (item: EstimateItem, side: EstimateSide) =>
  sideKeys(side).some(k => item.prices[k] !== item.base[k]);

/** The item's prices with one side back to the price list, the other side kept */
export const resetSide = (item: EstimateItem, side: EstimateSide): ItemPrices => {
  const next = { ...item.prices };
  for (const k of sideKeys(side)) next[k] = item.base[k];
  return next;
};

/** Every item of the project with one side back to the price list */
export const resetSideAll = (pricing: ProjectPricing, items: EstimateItem[], side: EstimateSide): ProjectPricing =>
  items.filter(i => changedFor(i, side)).reduce((p, i) => withPrices(p, i, resetSide(i, side)), pricing);

export const lineTotal = (item: EstimateItem, side: EstimateSide) => side === 'client'
  ? item.prices.price * item.qty + item.prices.priceCorner * item.corners
  : item.prices.priceInstall * item.qty + item.prices.priceInstallCorner * item.corners;

// Splitting a wall (e.g. to assign it two different profiles) adds a point
// without adding a real corner, so count geometric corners, not raw points.
// A niche drawn as a routed box also welds in its own corners — unless it
// wraps an existing room corner, which then isn't counted twice.
// A niche across the room splits the ceiling and adds corners at its ends.
export const roomCorners = (room: Room) => totalFabricCorners(room.points, nicheCutPaths(room))
  + (room.selectedNiches ?? []).reduce((s, n) => s + (n.kind === 'cross' ? crossCorners(room, n) : 0), 0);

export const nicheCapId = (nicheId: string) => `${nicheId}:cap`;
export const nicheCorniceId = (nicheId: string) => `${nicheId}:cornice`;

/** Whether a drawn niche gets a separate cornice billed alongside it */
export const hasCornice = (n: RoomNicheElement) => n.kind !== 'count' && n.niche.type === 'cornice' && n.cornice !== false;

export interface NicheCostPart { part: 'length' | 'corners' | 'caps' | 'cornice'; qty: number; rate: number }

/** What one drawn niche costs the client, line by line, at the project's prices */
export function nicheCost(room: Room, n: RoomNicheElement, pricing?: ProjectPricing): { parts: NicheCostPart[]; total: number } {
  const m = nicheMetrics(room, n);
  if (!m || n.kind === 'count') return { parts: [], total: 0 };
  const nc = n.niche, ov = pricing?.overrides ?? {};
  const rate = ov[n.nicheId]?.price ?? nc.price;
  const cornerRate = ov[n.nicheId]?.priceCorner ?? nc.priceCorner ?? 0;
  const capRate = ov[nicheCapId(n.nicheId)]?.price ?? nc.priceCap ?? 0;
  const corniceRate = ov[nicheCorniceId(n.nicheId)]?.price ?? nc.priceCornice ?? 0;
  const parts: NicheCostPart[] = [
    { part: 'length', qty: m.lengthM, rate },
    ...(m.turns > 0 && cornerRate > 0 ? [{ part: 'corners' as const, qty: m.turns, rate: cornerRate }] : []),
    ...(m.caps > 0 && capRate > 0 ? [{ part: 'caps' as const, qty: m.caps, rate: capRate }] : []),
    ...(hasCornice(n) && corniceRate > 0 ? [{ part: 'cornice' as const, qty: m.lengthM, rate: corniceRate }] : []),
  ];
  return { parts, total: parts.reduce((s, p) => s + p.qty * p.rate, 0) };
}

/** Every priced item in a room, grouped per price-list item, in estimate order */
export const roomItems = (room: Room, pricing?: ProjectPricing): EstimateItem[] => {
  const items: EstimateItem[] = [];
  const byId: Record<string, EstimateItem> = {};
  const add = (
    itemId: string, kind: ItemKind, title: string, unit: ItemUnit,
    base: Partial<ItemPrices>, qty: number, corners = 0, part?: NichePart,
  ) => {
    const existing = byId[itemId];
    if (existing) { existing.qty += qty; existing.corners += corners; return; }
    const full: ItemPrices = { price: 0, priceCorner: 0, priceInstall: 0, priceInstallCorner: 0, ...base };
    const o = pricing?.overrides[itemId];
    const item: EstimateItem = {
      itemId, kind, title, unit, qty, corners, ...(part ? { part } : {}),
      base: full, prices: applyOverride(full, o), overridden: !!o && !!overrideFor(full, applyOverride(full, o)),
    };
    byId[itemId] = item;
    items.push(item);
  };

  const niches = room.selectedNiches ?? [];
  if (room.fabric) {
    const billable = Math.max(0, roomCorners(room) - FREE_FABRIC_CORNERS);
    add(room.fabricId ?? room.fabric.id, 'fabric', room.fabric.title, 'm2', room.fabric, room.areaSqm, billable);
  }
  for (const seg of room.profileSegments ?? [])
    add(seg.profileId, 'profile', seg.profile.title, 'm', seg.profile, seg.lengthM, 1);
  for (const e of room.lighting ?? [])
    add(e.catalogItemId, 'lighting', e.catalogItem.title, e.kind === 'path' ? 'm' : 'pcs', e.catalogItem, e.kind === 'path' ? e.lengthM : 1);
  for (const a of room.selectedAccessories ?? [])
    add(a.accessoryId, 'accessory', a.accessory.title, a.accessory.unit || 'pcs', a.accessory, a.quantity);
  for (const s of room.selectedServices ?? [])
    add(s.serviceId, 'service', s.service.title, 'pcs', s.service, s.quantity);
  // A drawn niche's end caps and cornice follow it as lines of their own, under
  // their own ids so the project can reprice them apart from the niche.
  for (const n of niches) {
    const nc = n.niche;
    if (n.kind === 'count') { add(n.nicheId, 'niche', nc.title, 'pcs', nc, n.quantity); continue; }
    const m = nicheMetrics(room, n);
    if (!m) continue;
    add(n.nicheId, 'niche', nc.title, 'm', {
      price: nc.price, priceInstall: nc.priceInstall,
      priceCorner: nc.priceCorner ?? 0, priceInstallCorner: nc.priceInstallCorner ?? 0,
    }, m.lengthM, m.turns);
    if (m.caps > 0 && (nc.priceCap || nc.priceInstallCap))
      add(nicheCapId(n.nicheId), 'niche', nc.title, 'pcs', { price: nc.priceCap ?? 0, priceInstall: nc.priceInstallCap ?? 0 }, m.caps, 0, 'cap');
    if (hasCornice(n) && (nc.priceCornice || nc.priceInstallCornice))
      add(nicheCorniceId(n.nicheId), 'niche', nc.title, 'm', { price: nc.priceCornice ?? 0, priceInstall: nc.priceInstallCornice ?? 0 }, m.lengthM, 0, 'cornice');
  }
  return items.filter(i => i.qty > 0 || i.corners > 0);
};

const sum = (items: EstimateItem[], side: EstimateSide) => items.reduce((s, i) => s + lineTotal(i, side), 0);

export const roomEstimate = (room: Room, pricing?: ProjectPricing): RoomEstimate => {
  const items = roomItems(room, pricing);
  return { room, items, client: sum(items, 'client'), worker: sum(items, 'worker') };
};

/** Client price of everything selected for a room, with the project's prices */
export const calcRoomClientPrice = (room: Room, pricing?: ProjectPricing) => sum(roomItems(room, pricing), 'client');

export const projectEstimate = (project: Project): ProjectEstimate => {
  const pricing = projectPricing(project);
  const rooms = project.rooms.filter(r => r.areaSqm > 0).map(r => roomEstimate(r, pricing));
  const clientSubtotal = rooms.reduce((s, r) => s + r.client, 0);
  const workerSubtotal = rooms.reduce((s, r) => s + r.worker, 0);
  const discount = clientSubtotal * (pricing.discountPct || 0) / 100;
  const clientTotal = clientSubtotal - discount + pricing.clientLines.reduce((s, l) => s + l.amount, 0);
  const workerTotal = workerSubtotal + pricing.workerLines.reduce((s, l) => s + l.amount, 0);
  return { rooms, pricing, clientSubtotal, discount, clientTotal, workerSubtotal, workerTotal };
};

/** Every distinct item used across the project, quantities summed over rooms */
export const projectItems = (est: ProjectEstimate): EstimateItem[] => {
  const byId: Record<string, EstimateItem> = {};
  const out: EstimateItem[] = [];
  for (const r of est.rooms) for (const i of r.items) {
    if (byId[i.itemId]) { byId[i.itemId].qty += i.qty; byId[i.itemId].corners += i.corners; continue; }
    byId[i.itemId] = { ...i };
    out.push(byId[i.itemId]);
  }
  const order: ItemKind[] = ['fabric', 'profile', 'lighting', 'accessory', 'service', 'niche'];
  return out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
};

/** Rooms of the project that use a given item */
export const roomsUsing = (est: ProjectEstimate, itemId: string) =>
  est.rooms.filter(r => r.items.some(i => i.itemId === itemId)).length;
