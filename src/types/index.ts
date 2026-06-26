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

export interface Accessory {
  id: string;
  title: string;
  price: number;
  priceInstall: number;
  unit: string;
}

export interface RoomAccessoryItem {
  id: string;
  accessoryId: string;
  accessory: Accessory;
  quantity: number;
}

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

// --- Room & Project ---

export interface Room {
  id: string;
  name: string;
  points: { x: number; y: number }[];
  scale: number;
  fabricId: string | null;
  fabric: CatalogItem | null;
  profileSegments: RoomProfileSegment[];
  lighting: RoomLightingElement[];
  selectedAccessories: RoomAccessoryItem[];
  selectedServices: RoomServiceItem[];
  areaSqm: number;
  perimeterM: number;
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
}

export interface MasterProfile {
  name: string;
  company: string;
  phone: string;
  city: string;
  email: string;
}
