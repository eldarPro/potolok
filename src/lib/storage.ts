import { Project, Room, CatalogItem, LightingCatalogItem, AdditionalService, Accessory, MasterProfile } from '../types';

const KEY = 'ceiling_projects';

export function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
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

export function deleteProject(id: string): void {
  saveProjects(loadProjects().filter(p => p.id !== id));
}

export function createProject(partial: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'rooms'>): Project {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    rooms: [],
    ...partial,
  };
}

// --- Price list catalog ---

const FABRICS_KEY     = 'ceiling_fabrics';
const PROFILES_KEY    = 'ceiling_profiles';
const LIGHTINGS_KEY   = 'ceiling_lightings';
const SERVICES_KEY    = 'ceiling_services';
const ACCESSORIES_KEY = 'ceiling_accessories';

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

export function seedCatalog(): void {
  if (loadFabrics().length < 3) {
    saveList<CatalogItem>(FABRICS_KEY, [
      { id: crypto.randomUUID(), title: 'Матовое белое',   price: 500, priceCorner: 150, priceInstall: 200, priceInstallCorner: 50, isDefault: true,  color: '#f5f5f5' },
      { id: crypto.randomUUID(), title: 'Глянцевое белое', price: 650, priceCorner: 150, priceInstall: 220, priceInstallCorner: 50, isDefault: false, color: '#ddeeff' },
      { id: crypto.randomUUID(), title: 'Сатин',           price: 600, priceCorner: 150, priceInstall: 210, priceInstallCorner: 50, isDefault: false, color: '#e8e8e8' },
    ]);
  }
  if (loadProfiles().length < 2) {
    saveList<CatalogItem>(PROFILES_KEY, [
      { id: crypto.randomUUID(), title: 'Стандартный ПВХ', price: 150, priceCorner:  80, priceInstall:  60, priceInstallCorner: 30, isDefault: true,  color: '#ffffff' },
      { id: crypto.randomUUID(), title: 'Алюминиевый',     price: 250, priceCorner: 120, priceInstall:  80, priceInstallCorner: 40, isDefault: false, color: '#c0c0c0' },
    ]);
  }
  if (loadLightings().length < 4) {
    saveList<LightingCatalogItem>(LIGHTINGS_KEY, [
      { id: crypto.randomUUID(), title: 'Точечный спот',    type: 'spot',       placement: 'point', unit: 'pcs',   symbol: '⊙', price: 150, priceInstall:  80, color: '#fff9c4' },
      { id: crypto.randomUUID(), title: 'Люстра',           type: 'chandelier', placement: 'point', unit: 'pcs',   symbol: '✦', price: 500, priceInstall: 200, color: '#fff3e0' },
      { id: crypto.randomUUID(), title: 'LED-лента',        type: 'strip',      placement: 'path',  unit: 'meter', symbol: '—', price: 300, priceInstall: 120, color: '#fffde7' },
      { id: crypto.randomUUID(), title: 'Трек',             type: 'track',      placement: 'path',  unit: 'meter', symbol: '—', price: 400, priceInstall: 150, color: '#e3f2fd' },
    ]);
  }
  if (loadAccessories().length < 3) {
    saveList<Accessory>(ACCESSORIES_KEY, [
      { id: crypto.randomUUID(), title: 'Кольцо под спот',      price:  50, priceInstall:  30, unit: 'шт' },
      { id: crypto.randomUUID(), title: 'Ревизионный люк',      price: 800, priceInstall: 200, unit: 'шт' },
      { id: crypto.randomUUID(), title: 'Платформа под люстру', price: 150, priceInstall: 100, unit: 'шт' },
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
  const defaultFabric  = loadFabrics().find(i => i.isDefault) ?? null;
  const defaultProfile = loadProfiles().find(i => i.isDefault) ?? null;
  return {
    id: crypto.randomUUID(),
    name,
    points: [],
    scale: 50,
    fabricId:  defaultFabric  ? defaultFabric.id  : null,
    fabric:    defaultFabric  ? { ...defaultFabric }  : null,
    profileId: defaultProfile ? defaultProfile.id : null,
    profile:   defaultProfile ? { ...defaultProfile } : null,
    lighting: [],
    areaSqm: 0,
    perimeterM: 0,
  };
}
