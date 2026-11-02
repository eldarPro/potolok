import { Project, ProjectPricing, Room, CatalogItem, LightingCatalogItem, AdditionalService, Accessory, NicheItem, MasterProfile, Fitting } from '../types';
import { uuid } from './uuid';
import { refreshLooks } from './catalogSync';
import { CM_PER_GRID } from './geometry';

const KEY = 'ceiling_projects';

// Legacy rooms stored a per-room `scale` (cm per grid cell, user-adjustable
// 10–200) that calibrated every canvas-px coordinate on that room. Now the
// px↔cm ratio is the fixed CM_PER_GRID for all rooms, so an old room drawn at
// a different scale must have its stored px coordinates rescaled once on
// load to keep the real-world size it was drawn at.
function migrateRoomScale(room: any): Room {
  const legacyScale = room.scale;
  if (typeof legacyScale !== 'number' || legacyScale === CM_PER_GRID) {
    const { scale, ...rest } = room;
    return rest;
  }
  const ratio = legacyScale / CM_PER_GRID;
  const scalePt = (p: { x: number; y: number }) => ({ ...p, x: p.x * ratio, y: p.y * ratio });
  const { scale, ...rest } = room;
  return {
    ...rest,
    points: (room.points ?? []).map(scalePt),
    lighting: (room.lighting ?? []).map((el: any) =>
      el.kind === 'point' ? { ...el, x: el.x * ratio, y: el.y * ratio } : { ...el, points: el.points.map(scalePt) }
    ),
    selectedNiches: (room.selectedNiches ?? []).map((el: any) =>
      el.kind === 'path' ? { ...el, points: el.points.map(scalePt) } : el
    ),
  };
}

export function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(KEY);
    const projects = raw ? JSON.parse(raw) : [];
    // rooms show the price list's current look of what they use (their prices stay their own)
    const fabrics = loadFabrics(), lightings = loadLightings(), profiles = loadProfiles();
    return projects.map((p: any) => ({
      ...p,
      rooms: (p.rooms ?? []).map((r: any) => refreshLooks(migrateRoomScale(r), fabrics, lightings, profiles)),
    }));
  } catch {
    return [];
  }
}

export function saveProjects(projects: Project[]): void {
  localStorage.setItem(KEY, JSON.stringify(projects));
}

export function getProject(id: string): Project | null {
  return loadProjects().find(p => p.id === id) ?? null;
}

export function upsertProject(project: Project): void {
  const all = loadProjects();
  const idx = all.findIndex(p => p.id === project.id);
  if (idx >= 0) all[idx] = project;
  else all.unshift(project);
  saveProjects(all);
}

/** Saves the project's pricing and returns the updated project */
export function saveProjectPricing(project: Project, pricing: ProjectPricing): Project {
  const updated = { ...project, pricing, updatedAt: new Date().toISOString() };
  upsertProject(updated);
  return updated;
}

export function deleteProject(id: string): void {
  saveProjects(loadProjects().filter(p => p.id !== id));
}

export function createProject(partial: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'rooms'>): Project {
  const now = new Date().toISOString();
  return {
    id: uuid(),
    createdAt: now,
    updatedAt: now,
    rooms: [],
    ...partial,
  };
}

// --- Fittings (visualizations without a project) ---

const FITTINGS_KEY = 'ceiling_fittings';

export const loadFittings  = () => loadList<Fitting>(FITTINGS_KEY);
export const getFitting    = (id: string) => loadFittings().find(f => f.id === id) ?? null;
export const deleteFitting = (id: string) => deleteListItem(FITTINGS_KEY, id);
export const upsertFitting = (item: Fitting) => upsertListItem(FITTINGS_KEY, item);

// --- Price list catalog ---

const FABRICS_KEY     = 'ceiling_fabrics';
const PROFILES_KEY    = 'ceiling_profiles';
const LIGHTINGS_KEY   = 'ceiling_lightings';
const SERVICES_KEY    = 'ceiling_services';
const ACCESSORIES_KEY = 'ceiling_accessories';
const NICHES_KEY      = 'ceiling_niches';

function loadList<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveList<T>(key: string, items: T[]): void {
  localStorage.setItem(key, JSON.stringify(items));
}

function upsertListItem<T extends { id: string }>(key: string, item: T): void {
  const all = loadList<T>(key);
  const idx = all.findIndex(i => i.id === item.id);
  if (idx >= 0) all[idx] = item; else all.unshift(item);
  saveList(key, all);
}

function deleteListItem(key: string, id: string): void {
  saveList(key, loadList<{ id: string }>(key).filter(i => i.id !== id));
}

export const loadFabrics  = () => loadList<CatalogItem>(FABRICS_KEY);
export const deleteFabric = (id: string) => deleteListItem(FABRICS_KEY, id);
export function upsertFabric(item: CatalogItem): void {
  let all = loadFabrics();
  if (item.isDefault) all = all.map(i => ({ ...i, isDefault: false }));
  const idx = all.findIndex(i => i.id === item.id);
  if (idx >= 0) all[idx] = item; else all.unshift(item);
  saveList(FABRICS_KEY, all);
}

export const loadProfiles  = () => loadList<CatalogItem>(PROFILES_KEY);
export const deleteProfile = (id: string) => deleteListItem(PROFILES_KEY, id);
export function upsertProfile(item: CatalogItem): void {
  let all = loadProfiles();
  if (item.isDefault) all = all.map(i => ({ ...i, isDefault: false }));
  const idx = all.findIndex(i => i.id === item.id);
  if (idx >= 0) all[idx] = item; else all.unshift(item);
  saveList(PROFILES_KEY, all);
}

export const loadLightings  = () => loadList<LightingCatalogItem>(LIGHTINGS_KEY);
export const upsertLighting = (item: LightingCatalogItem) => upsertListItem(LIGHTINGS_KEY, item);
export const deleteLighting = (id: string) => deleteListItem(LIGHTINGS_KEY, id);

export const loadServices   = () => loadList<AdditionalService>(SERVICES_KEY);
export const upsertService  = (item: AdditionalService) => upsertListItem(SERVICES_KEY, item);
export const deleteService  = (id: string) => deleteListItem(SERVICES_KEY, id);

export const loadAccessories  = () => loadList<Accessory>(ACCESSORIES_KEY);
export const upsertAccessory  = (item: Accessory) => upsertListItem(ACCESSORIES_KEY, item);
export const deleteAccessory  = (id: string) => deleteListItem(ACCESSORIES_KEY, id);

export const loadNiches   = () => loadList<NicheItem>(NICHES_KEY);
export const upsertNiche  = (item: NicheItem) => upsertListItem(NICHES_KEY, item);
export const deleteNiche  = (id: string) => deleteListItem(NICHES_KEY, id);

export function seedCatalog(): void {
  if (loadFabrics().length < 3) {
    saveList<CatalogItem>(FABRICS_KEY, [
      { id: uuid(), title: 'Матовое белое',   price: 500, priceCorner: 150, priceInstall: 200, priceInstallCorner: 50, isDefault: true,  color: '#f5f5f5', description: '', finish: 'matte' },
      { id: uuid(), title: 'Глянцевое белое', price: 650, priceCorner: 150, priceInstall: 220, priceInstallCorner: 50, isDefault: false, color: '#ddeeff', description: '', finish: 'gloss' },
      { id: uuid(), title: 'Сатин',           price: 600, priceCorner: 150, priceInstall: 210, priceInstallCorner: 50, isDefault: false, color: '#e8e8e8', description: '', finish: 'satin' },
    ]);
  }
  if (loadProfiles().length < 2) {
    saveList<CatalogItem>(PROFILES_KEY, [
      { id: uuid(), title: 'Стандартный ПВХ', price: 150, priceCorner:  80, priceInstall:  60, priceInstallCorner: 30, isDefault: true,  color: '#ffffff', description: '', profileKind: 'standard' },
      { id: uuid(), title: 'Алюминиевый',     price: 250, priceCorner: 120, priceInstall:  80, priceInstallCorner: 40, isDefault: false, color: '#c0c0c0', description: '', profileKind: 'standard' },
      { id: uuid(), title: 'Теневой',         price: 900, priceCorner: 300, priceInstall: 400, priceInstallCorner: 150, isDefault: false, color: '#1c1c1e', description: '', profileKind: 'shadow' },
      { id: uuid(), title: 'Парящий с подсветкой', price: 1400, priceCorner: 400, priceInstall: 600, priceInstallCorner: 200, isDefault: false, color: '#ffffff', description: '', profileKind: 'floating' },
    ]);
  }
  if (loadLightings().length < 4) {
    saveList<LightingCatalogItem>(LIGHTINGS_KEY, [
      { id: uuid(), title: 'Точечный спот',    type: 'spot',       placement: 'point', unit: 'pcs',   symbol: '⊙', price: 150, priceInstall:  80, color: '#fff9c4', description: '' },
      { id: uuid(), title: 'Люстра',           type: 'chandelier', placement: 'point', unit: 'pcs',   symbol: '✦', price: 500, priceInstall: 200, color: '#fff3e0', description: '' },
      { id: uuid(), title: 'LED-лента',        type: 'strip',      placement: 'path',  unit: 'meter', symbol: '—', price: 300, priceInstall: 120, color: '#fffde7', description: '' },
      { id: uuid(), title: 'Трек',             type: 'track',      placement: 'path',  unit: 'meter', symbol: '—', price: 400, priceInstall: 150, color: '#e3f2fd', description: '' },
    ]);
  }
  if (loadAccessories().length < 3) {
    saveList<Accessory>(ACCESSORIES_KEY, [
      { id: uuid(), title: 'Кольцо под спот',      price:  50, priceInstall:  30, unit: 'шт', description: '' },
      { id: uuid(), title: 'Ревизионный люк',      price: 800, priceInstall: 200, unit: 'шт', description: '' },
      { id: uuid(), title: 'Платформа под люстру', price: 150, priceInstall: 100, unit: 'шт', description: '' },
    ]);
  }
  if (loadNiches().length === 0) {
    const niche = (n: Omit<NicheItem, 'id' | 'unit' | 'description'>): NicheItem =>
      ({ id: uuid(), unit: 'perimeter', description: '', ...n });
    saveList<NicheItem>(NICHES_KEY, [
      niche({ title: 'Гардина ПК-5 (3 ряда)',     type: 'curtain', price: 2800, priceInstall: 700, priceCap: 300, priceInstallCap: 100, priceCorner: 500, priceInstallCorner: 300 }),
      niche({ title: 'Гардина ПК-15 (2 ряда)',    type: 'curtain', price: 2500, priceInstall: 700, priceCap: 300, priceInstallCap: 100, priceCorner: 500, priceInstallCorner: 300 }),
      niche({ title: 'Гардина ПК-14 с подсветкой', type: 'curtain', price: 2600, priceInstall: 800, priceCap: 300, priceInstallCap: 100, priceCorner: 500, priceInstallCorner: 300 }),
      niche({ title: 'Ниша из бруса под карниз',  type: 'cornice', price: 1200, priceInstall: 600, priceCap: 200, priceInstallCap: 100, priceCorner: 300, priceInstallCorner: 200, priceCornice: 700, priceInstallCornice: 300 }),
      niche({ title: 'Ниша Sigma Plus под карниз', type: 'cornice', price: 2200, priceInstall: 700, priceCap: 250, priceInstallCap: 100, priceCorner: 400, priceInstallCorner: 250, priceCornice: 700, priceInstallCornice: 300 }),
    ]);
  }
}

// --- Master profile ---

const PROFILE_KEY = 'ceiling_master_profile';

const emptyProfile = (): MasterProfile => ({ name: '', company: '', phone: '', city: '', email: '' });

export function loadMasterProfile(): MasterProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? { ...emptyProfile(), ...JSON.parse(raw) } : emptyProfile();
  } catch { return emptyProfile(); }
}

export function saveMasterProfile(profile: MasterProfile): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

// ---

export function createRoom(name: string): Room {
  const defaultFabric = loadFabrics().find(i => i.isDefault) ?? null;
  return {
    id: uuid(),
    name,
    points: [],
    fabricId: defaultFabric ? defaultFabric.id : null,
    fabric:   defaultFabric ? { ...defaultFabric } : null,
    profileSegments: [],
    lighting: [],
    selectedAccessories: [],
    selectedServices: [],
    selectedNiches: [],
    areaSqm: 0,
    perimeterM: 0,
    visualization: null,
  };
}
