export interface RoomProfileSegment {
  edgeIndex: number;
  profileId: string;
  profile: CatalogItem;
  lengthM: number;
}

/** How a fabric's surface looks — matte, satin (soft sheen) or gloss (mirror-like) */
export type FabricFinish = 'matte' | 'satin' | 'gloss';

/** How a wall profile shows at the canvas edge: an insert strip (standard), a
 *  dark gap (shadow), a lit gap (floating) or nothing at all (gapless) */
export type ProfileKind = 'standard' | 'shadow' | 'floating' | 'gapless';

/** A fabric or a wall profile in the price list (they share the shape) */
export interface CatalogItem {
  id: string;
  title: string;
  price: number;
  priceCorner: number;
  priceInstall: number;
  priceInstallCorner: number;
  isDefault: boolean;
  color: string;
  description: string;
  /** fabrics only; unset — guessed from the title (see fabricFinish) */
  finish?: FabricFinish;
  /** profiles only; unset — guessed from the title (see profileKind) */
  profileKind?: ProfileKind;
}

export interface AdditionalService {
  id: string;
  title: string;
  price: number;
  priceInstall: number;
  description: string;
}

export interface RoomServiceItem {
  id: string;
  serviceId: string;
  service: AdditionalService;
  quantity: number;
}

// 'perimeter' — priced per running meter, 'pcs' — per piece
export type NicheUnit = 'perimeter' | 'pcs';

// 'curtain' — a curtain-track profile (ПК-5, ПК-15, ПК-14): the niche itself
// carries the hooks, nothing else to buy; 'cornice' — a niche (timber, Sigma,
// БП-40, plasterboard) a separate cornice is hung in.
export type NicheType = 'curtain' | 'cornice';

export interface NicheItem {
  id: string;
  title: string;
  unit: NicheUnit;
  price: number;
  priceInstall: number;
  description: string;
  type?: NicheType;
  /** per end cap closing a niche end that stops short of a wall */
  priceCap?: number;
  priceInstallCap?: number;
  /** per turn of a drawn niche */
  priceCorner?: number;
  priceInstallCorner?: number;
  /** 'cornice' type only: the cornice hung in it, per meter */
  priceCornice?: number;
  priceInstallCornice?: number;
}

export interface Accessory {
  id: string;
  title: string;
  price: number;
  priceInstall: number;
  unit: string;
  description: string;
}

export interface RoomAccessoryItem {
  id: string;
  accessoryId: string;
  accessory: Accessory;
  quantity: number;
}

// A 'pcs'-unit niche is added manually with a quantity stepper; a
// 'perimeter'-unit niche is instead drawn on the canvas as a line from wall
// to wall — or stopping short of one, where an end cap closes it — so it
// carries its own geometry and a length derived from it.
export interface RoomNicheCount {
  id: string;
  kind: 'count';
  nicheId: string;
  niche: NicheItem;
  quantity: number;
}

export interface RoomNichePath {
  id: string;
  kind: 'path';
  nicheId: string;
  niche: NicheItem;
  points: { x: number; y: number }[];
  lengthM: number;
  /** end caps billed — set to the ends left free of a wall when drawn */
  caps?: number;
  /** false when the separate cornice isn't billed (the client has their own) */
  cornice?: boolean;
}

// A niche set against the room's walls: it runs along `edges` (consecutive
// walls in outline order — one wall, or several around a bay window), stops
// `startCm`/`endCm` short of the chain's first/last corner, and takes
// `depthCm` off the canvas. Kept in cm from the corners, so it stays put when
// the walls are resized.
export interface RoomNicheWall {
  id: string;
  kind: 'wall';
  nicheId: string;
  niche: NicheItem;
  edges: number[];
  depthCm: number;
  startCm: number;
  endCm: number;
  /** false when the separate cornice isn't billed (the client has their own) */
  cornice?: boolean;
}

/** A point on a wall: `cm` from the wall's start corner */
export interface WallPoint {
  edge: number;
  cm: number;
}

// A niche straight across the room, from one wall to another — a curtain
// zoning off a bed or a wardrobe. It splits the ceiling: the canvas stays one
// (no area lost), but each end adds corners where it meets the wall.
export interface RoomNicheCross {
  id: string;
  kind: 'cross';
  nicheId: string;
  niche: NicheItem;
  a: WallPoint;
  b: WallPoint;
  /** how wide the profile or niche is across the ceiling, between the two canvas edges */
  widthCm?: number;
  /** false when the separate cornice isn't billed (the client has their own) */
  cornice?: boolean;
}

export type RoomNicheElement = RoomNicheCount | RoomNichePath | RoomNicheWall | RoomNicheCross;

// --- Lighting catalog ---

export type LightingType = 'spot' | 'strip' | 'line' | 'chandelier' | 'track' | 'track_spot';
export type LightingPlacement = 'point' | 'path';
export type LightingUnit = 'pcs' | 'meter';

export interface LightingCatalogItem {
  id: string;
  title: string;
  type: LightingType;
  placement: LightingPlacement;
  unit: LightingUnit;
  symbol: string;
  price: number;
  priceInstall: number;
  color: string;
  description: string;
}

// --- Room lighting elements ---

export interface RoomLightingPoint {
  id: string;
  kind: 'point';
  catalogItemId: string;
  catalogItem: LightingCatalogItem;
  x: number;
  y: number;
}

export interface RoomLightingPath {
  id: string;
  kind: 'path';
  catalogItemId: string;
  catalogItem: LightingCatalogItem;
  points: { x: number; y: number }[];
  lengthM: number;
}

export type RoomLightingElement = RoomLightingPoint | RoomLightingPath;

// --- AI photo visualization ---

export interface VisualizationVersion {
  id: string;
  image: string; // data URL (base64 JPEG)
  prompt: string; // '' for the original, unedited photo
  createdAt: string;
  /** A 3D sketch, not a photo: the next edit has to turn it into a photo first */
  sketch?: boolean;
}

export interface RoomVisualization {
  // [0] is the original photo; each later entry is a generated edit of the
  // one before it, so the last entry is always the current image.
  versions: VisualizationVersion[];
}

/** A quick visualization on a client's photo, made before there is a project for it */
export interface Fitting {
  id: string;
  createdAt: string;
  updatedAt: string;
  visualization: RoomVisualization;
}

// --- Room & Project ---

export interface Room {
  id: string;
  name: string;
  /** label — the corner's letter, set once a wall has been split (see vertexLabels) */
  points: { x: number; y: number; bulge?: number; label?: string }[];
  fabricId: string | null;
  fabric: CatalogItem | null;
  profileSegments: RoomProfileSegment[];
  lighting: RoomLightingElement[];
  selectedAccessories: RoomAccessoryItem[];
  selectedServices: RoomServiceItem[];
  selectedNiches: RoomNicheElement[];
  areaSqm: number;
  perimeterM: number;
  visualization: RoomVisualization | null;
  /** Diagonal hints on the drawing; undefined = shown */
  showDiagonals?: boolean;
  /** Diagonals hidden one by one (diagonalKey) */
  hiddenDiagonals?: string[];
}

// --- Project pricing (layered over the price list) ---

/** Project-wide price for one price-list item; unset fields keep the price-list value */
export interface PriceOverride {
  price?: number;
  priceCorner?: number;
  priceInstall?: number;
  priceInstallCorner?: number;
}

/** A free-form estimate line: positive adds, negative subtracts */
export interface EstimateAdjustment {
  id: string;
  title: string;
  amount: number;
}

export interface ProjectPricing {
  /** keyed by price-list item id */
  overrides: Record<string, PriceOverride>;
  discountPct: number;
  clientLines: EstimateAdjustment[];
  workerLines: EstimateAdjustment[];
}

export interface Project {
  id: string;
  clientName: string;
  address: string;
  phone: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  rooms: Room[];
  pricing?: ProjectPricing;
}

export interface MasterProfile {
  name: string;
  company: string;
  phone: string;
  city: string;
  email: string;
}
