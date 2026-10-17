import { Room } from '../types';
import { totalFabricCorners } from './geometry';

// The first 4 corners of a room (a plain rectangle) are free — only extra
// corners past that add to the fabric price.
const FREE_FABRIC_CORNERS = 4;

/** Client price of everything selected for a room. */
export const calcRoomClientPrice = (room: Room) => {
  // Splitting a wall (e.g. to assign it two different profiles) adds a point
  // without adding a real corner, so bill off the geometric corner count. A
  // niche drawn as a routed box also welds in its own corners — unless it
  // wraps an existing room corner, which then isn't counted twice.
  const nichePaths = (room.selectedNiches ?? []).filter(n => n.kind === 'path').map(n => n.points);
  const billableCorners = Math.max(0, totalFabricCorners(room.points, nichePaths) - FREE_FABRIC_CORNERS);
  const f = room.fabric ? room.fabric.price * room.areaSqm + room.fabric.priceCorner * billableCorners : 0;
  const p = (room.profileSegments ?? []).reduce((s, seg) => s + seg.profile.price * seg.lengthM + seg.profile.priceCorner, 0);
  const l = (room.lighting ?? []).reduce((s, e) => s + (e.kind === 'point' ? e.catalogItem.price : e.catalogItem.price * e.lengthM), 0);
  const a = (room.selectedAccessories ?? []).reduce((s, a) => s + a.accessory.price * a.quantity, 0);
  const sv = (room.selectedServices ?? []).reduce((s, sv) => s + sv.service.price * sv.quantity, 0);
  const n = (room.selectedNiches ?? []).reduce((s, n) => s + n.niche.price * (n.kind === 'count' ? n.quantity : n.lengthM), 0);
  return f + p + l + a + sv + n;
};
