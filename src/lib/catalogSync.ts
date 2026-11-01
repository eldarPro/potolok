import { Room, CatalogItem, LightingCatalogItem } from '../types';

/**
 * A room keeps its own copy of each price-list item it uses — the copy's
 * prices are what its estimate was made at, and stay so. How an item looks
 * is another matter: a fabric renamed or recoloured in the
 * price list, or a light renamed, recoloured or turned into another kind of
 * the same placement, shows that way in every room using it. Prices,
 * install prices and units are never touched. An item gone from the price
 * list leaves the room's copy as it is.
 */
export function refreshLooks(room: Room, fabrics: CatalogItem[], lightings: LightingCatalogItem[]): Room {
  let changed = false;
  let fabric = room.fabric;
  const f = room.fabric && fabrics.find(x => x.id === (room.fabricId ?? room.fabric!.id));
  if (f && room.fabric && (f.title !== room.fabric.title || f.color !== room.fabric.color)) {
    fabric = { ...room.fabric, title: f.title, color: f.color };
    changed = true;
  }
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
  return changed ? { ...room, fabric, lighting } : room;
}
