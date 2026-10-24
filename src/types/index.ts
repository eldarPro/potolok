export interface RoomProfileSegment {
  edgeIndex: number;
  profileId: string;
  profile: CatalogItem;
  lengthM: number;
}

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

export interface NicheItem {
  id: string;
  title: string;
  unit: NicheUnit;
  price: number;
  priceInstall: number;
  description: string;
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
// 'perimeter'-unit niche is instead drawn on the canvas as a wall-to-wall
// line, so it carries its own geometry and a length derived from it.
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
}

export type RoomNicheElement = RoomNicheCount | RoomNichePath;

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
}

export interface RoomVisualization {
  // [0] is the original photo; each later entry is a generated edit of the
  // one before it, so the last entry is always the current image.
  versions: VisualizationVersion[];
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
