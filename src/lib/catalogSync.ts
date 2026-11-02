import { Room, CatalogItem, LightingCatalogItem } from '../types';

/**
 * A room keeps its own copy of each price-list item it uses — the copy's
 * prices are what its estimate was made at, and stay so. How an item looks
 * is another matter: a fabric renamed, recoloured or given another finish,
 * a profile renamed, recoloured or given another kind, a light renamed,
 * recoloured or turned into another kind of the same placement — shows that
 * way in every room using it. Prices, install prices and units are never
 * touched. An item gone from the price list leaves the room's copy as it is.
 */
export function refreshLooks(
  room: Room, fabrics: CatalogItem[], lightings: LightingCatalogItem[], profiles: CatalogItem[] = [],
): Room {
  let changed = false;
  const looks = (own: CatalogItem, src: CatalogItem): CatalogItem => {
    if (own.title === src.title && own.color === src.color && own.finish === src.finish && own.profileKind === src.profileKind) return own;
    changed = true;
    const next: CatalogItem = { ...own, title: src.title, color: src.color };
    // an unset field is left out, so an old copy and the price list compare equal
    if (src.finish) next.finish = src.finish; else delete next.finish;
    if (src.profileKind) next.profileKind = src.profileKind; else delete next.profileKind;
    return next;
  };

  let fabric = room.fabric;
  const f = room.fabric && fabrics.find(x => x.id === (room.fabricId ?? room.fabric!.id));
  if (f && room.fabric) fabric = looks(room.fabric, f);

  const profById = new Map(profiles.map(p => [p.id, p]));
  const profileSegments = (room.profileSegments ?? []).map(s => {
    const p = profById.get(s.profileId);
    if (!p) return s;
    const profile = looks(s.profile, p);
    return profile === s.profile ? s : { ...s, profile };
  });

  const byId = new Map(lightings.map(l => [l.id, l]));
  const lighting = (room.lighting ?? []).map(el => {
    const l = byId.get(el.catalogItemId);
    if (!l) return el;
    const c = el.catalogItem;
    // a spot can become a track spot, but not a strip: the element's shape stays
    const type = l.placement === c.placement ? l.type : c.type;
    if (l.title === c.title && l.color === c.color && l.symbol === c.symbol && type === c.type) return el;
    changed = true;
    return { ...el, catalogItem: { ...c, title: l.title, color: l.color, symbol: l.symbol, type } };
  });
  return changed ? { ...room, fabric, profileSegments, lighting } : room;
}
