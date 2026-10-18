import React, { useEffect, useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonButton, IonIcon, IonActionSheet,
  IonList, IonItem, IonLabel, IonToggle,
  useIonRouter, useIonViewWillEnter,
} from '@ionic/react';
import {
  chevronBackOutline, chevronDownOutline, checkmarkOutline, checkmarkCircle,
  trashOutline, pencilOutline, addOutline, settingsOutline, ellipsisVerticalOutline,
  layersOutline, reorderThreeOutline, bulbOutline, buildOutline, briefcaseOutline, albumsOutline, resizeOutline,
} from 'ionicons/icons';
import { useParams } from 'react-router-dom';
import { getProject, upsertProject, loadFabrics, loadProfiles, loadLightings, loadServices, loadAccessories, loadNiches } from '../lib/storage';
import { uuid } from '../lib/uuid';
import { Project, Room, CatalogItem, RoomProfileSegment, LightingCatalogItem, RoomLightingPath, AdditionalService, Accessory, RoomAccessoryItem, RoomServiceItem, NicheItem, RoomNicheCount, RoomNichePath } from '../types';
import {
  edgeLengthM, edgeLengthCm, edgeLabel, polygonArea, polygonPerimeter, pxToMeters, GRID_SIZE, CM_PER_GRID,
  edgeLen, pointOnArc, splitBulge, totalFabricCorners, dist, Point, vertexLabels, nextVertexLabel,
} from '../lib/geometry';
import { useT } from '../lib/i18n';
import RoomPreview from '../components/RoomPreview';
import WallSplitScreen from '../components/WallSplitScreen';
import { roomDiagonals, shapeDiagonals, reshapeByDiagonals, diagonalRangeCm, diagonalCm, makePointMapper } from '../lib/diagonals';

const lightColor = (color: string) => (color === '#ffffff' ? '#ffeb3b' : color);

// A room's first 4 corners (a plain rectangle) are free; the fabric's
// per-corner price only applies past that.
const FREE_FABRIC_CORNERS = 4;

type Section = 'diagonals' | 'fabric' | 'profile' | 'lighting' | 'niche' | 'accessories' | 'services';

const SECTION_META: Record<Section, { titleKey: string; icon: string }> = {
  diagonals:   { titleKey: 'sec.diagonals',    icon: resizeOutline },
  fabric:      { titleKey: 'sec.fabric',       icon: layersOutline },
  profile:     { titleKey: 'sec.profile',      icon: reorderThreeOutline },
  lighting:    { titleKey: 'sec.lighting',     icon: bulbOutline },
  niche:       { titleKey: 'sec.niches',       icon: albumsOutline },
  accessories: { titleKey: 'sec.accessories',  icon: buildOutline },
  services:    { titleKey: 'sec.services',     icon: briefcaseOutline },
};

const RoomMaterials: React.FC = () => {
  const { t } = useT();
  const { projectId, roomId, section } = useParams<{ projectId: string; roomId: string; section: string }>();
  const router = useIonRouter();

  const [project, setProject] = useState<Project | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [fabrics, setFabrics] = useState<CatalogItem[]>([]);
  const [profiles, setProfiles] = useState<CatalogItem[]>([]);
  const [lightings, setLightings] = useState<LightingCatalogItem[]>([]);
  const [niches, setNiches] = useState<NicheItem[]>([]);
  const [accessories, setAccessories] = useState<Accessory[]>([]);
  const [services, setServices] = useState<AdditionalService[]>([]);

  // Profiles page: the wall in focus, wall lengths being typed (cm, raw input —
  // applied together on «Применить размер»), the wall whose profile / menu is
  // open, the wall being split
  const [activeWall, setActiveWall] = useState<number | null>(null);
  const [wallDraft, setWallDraft] = useState<Record<number, string>>({});
  const [profileSheetWall, setProfileSheetWall] = useState<number | null>(null);
  const [wallMenu, setWallMenu] = useState<number | null>(null);
  const [splitEdgeIdx, setSplitEdgeIdx] = useState<number | null>(null);
  const [applyAllOpen, setApplyAllOpen] = useState(false);
  const [addNicheOpen, setAddNicheOpen] = useState(false);
  const [addAccessoryOpen, setAddAccessoryOpen] = useState(false);
  const [addServiceOpen, setAddServiceOpen] = useState(false);
  const [activeDiag, setActiveDiag] = useState<string | null>(null);
  // Diagonal lengths being typed (cm, raw input) — applied to the drawing on «Применить»
  const [diagDraft, setDiagDraft] = useState<Record<string, string>>({});
  const [diagDriver, setDiagDriver] = useState<string | null>(null);

  const load = () => {
    const p = getProject(projectId);
    if (!p) return;
    setProject(p);
    setRoom(p.rooms.find(r => r.id === roomId) ?? null);
    setFabrics(loadFabrics());
    setProfiles(loadProfiles());
    setLightings(loadLightings());
    setNiches(loadNiches());
    setAccessories(loadAccessories());
    setServices(loadServices());
  };

  useEffect(() => { load(); }, [projectId, roomId]);
  useIonViewWillEnter(() => { load(); });

  if (!project || !room) return null;

  const updateRoom = (partial: Partial<Room>) => {
    const updated: Room = { ...room, ...partial };
    setRoom(updated);
    const proj = {
      ...project,
      rooms: project.rooms.map(r => r.id === roomId ? updated : r),
      updatedAt: new Date().toISOString(),
    };
    setProject(proj);
    upsertProject(proj);
  };

  // ── Diagonals ──
  // The walls stay as they are; typing a diagonal reshapes the outline around
  // it. Only n − 3 diagonals are free — for a quad, the one typed last drives
  // and the other follows.
  const diagList = room.areaSqm > 0 ? roomDiagonals(room.points) : [];
  const diagFixing = shapeDiagonals(room.points, diagDriver);
  const diagTargets: Record<string, number> = {};
  for (const [i, j] of diagFixing) {
    const raw = diagDraft[`${i}-${j}`];
    const cm = raw == null ? NaN : Math.round(parseFloat(raw));
    if (cm > 0) diagTargets[`${i}-${j}`] = cm;
  }
  const diagPoints = Object.keys(diagTargets).length > 0
    ? reshapeByDiagonals(room.points, diagFixing, diagTargets)
    : room.points;
  const diagDirty = diagPoints != null &&
    Object.entries(diagTargets).some(([k, cm]) => {
      const [i, j] = k.split('-').map(Number);
      return cm !== diagonalCm(room.points, i, j);
    });
  const diagRange = diagPoints == null && diagDriver
    ? diagonalRangeCm(room.points, diagFixing, diagTargets, diagDriver)
    : null;

  const editDiagonal = (key: string, raw: string) => {
    setActiveDiag(key);
    setDiagDriver(key);
    // drafts for diagonals that no longer drive the shape would be stale
    const free = new Set(shapeDiagonals(room.points, key).map(([i, j]) => `${i}-${j}`));
    setDiagDraft(prev => {
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(prev)) if (free.has(k)) next[k] = v;
      next[key] = raw;
      return next;
    });
  };

  const applyDiagonals = () => {
    if (!diagPoints || !diagDirty) return;
    updateRoom(reshapedRoom(diagPoints, diagFixing));
    setDiagDraft({});
  };


  // ── Fabric ──
  const selectFabric = (item: CatalogItem) => {
    if (room.fabricId === item.id) updateRoom({ fabricId: null, fabric: null });
    else updateRoom({ fabricId: item.id, fabric: { ...item } });
  };

  // ── Profile ──
  const assignProfile = (edgeIndex: number, item: CatalogItem) => {
    const newSeg: RoomProfileSegment = {
      edgeIndex, profileId: item.id, profile: { ...item },
      lengthM: edgeLengthM(room.points, edgeIndex),
    };
    const updated = [
      ...(room.profileSegments ?? []).filter(s => s.edgeIndex !== edgeIndex),
      newSeg,
    ].sort((a, b) => a.edgeIndex - b.edgeIndex);
    updateRoom({ profileSegments: updated });
  };

  const clearProfile = (edgeIndex: number) =>
    updateRoom({ profileSegments: (room.profileSegments ?? []).filter(s => s.edgeIndex !== edgeIndex) });

  const applyToAll = (item: CatalogItem) =>
    updateRoom({
      profileSegments: room.points.map((_, i) => ({
        edgeIndex: i, profileId: item.id, profile: { ...item },
        lengthM: edgeLengthM(room.points, i),
      })),
    });

  // Outline after setting wall `edgeIndex` to `newLenCm`: its end corner slides
  // along the wall and the next wall follows. Arc length scales linearly with
  // chord length for a fixed bulge (the arc's included angle stays the same),
  // so scaling the chord by the same ratio as a straight edge keeps a curved
  // wall's shape and reaches the new length.
  const resizedPoints = (pts: Point[], edgeIndex: number, newLenCm: number) => {
    const n = pts.length;
    const a = pts[edgeIndex % n];
    const b = pts[(edgeIndex + 1) % n];
    const currentPx = edgeLen(a, b, a.bulge);
    if (!(newLenCm > 0) || currentPx === 0) return null;
    const ratio = ((newLenCm * GRID_SIZE) / CM_PER_GRID) / currentPx;
    const newPts = [...pts];
    newPts[(edgeIndex + 1) % n] = { ...b, x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio };
    return newPts;
  };

  // Everything that follows a change of outline (same corners, new positions):
  // area, perimeter, profile lengths — and lights and niche lines carried
  // along with the walls around them.
  const reshapedRoom = (newPts: Point[], diags = shapeDiagonals(room.points)): Partial<Room> => {
    const move = makePointMapper(room.points, newPts, diags);
    const pathM = (ps: { x: number; y: number }[]) =>
      pxToMeters(ps.slice(1).reduce((sum, p, i) => sum + dist(ps[i], p), 0));
    return {
      points: newPts,
      areaSqm: parseFloat((pxToMeters(Math.sqrt(polygonArea(newPts))) ** 2).toFixed(2)),
      perimeterM: parseFloat(pxToMeters(polygonPerimeter(newPts)).toFixed(2)),
      profileSegments: (room.profileSegments ?? []).map(s => ({ ...s, lengthM: edgeLengthM(newPts, s.edgeIndex) })),
      lighting: (room.lighting ?? []).map(e => {
        if (e.kind === 'point') return { ...e, ...move(e) };
        const ps = e.points.map(move);
        return { ...e, points: ps, lengthM: pathM(ps) };
      }),
      selectedNiches: (room.selectedNiches ?? []).map(n => {
        if (n.kind !== 'path') return n;
        const ps = n.points.map(move);
        return { ...n, points: ps, lengthM: pathM(ps) };
      }),
    };
  };

  // Split a wall `distCm` from its start. Every corner keeps its letter and the
  // new point takes the next free one; each part gets its own profile.
  const splitEdgeAt = (edgeIndex: number, distCm: number, first: CatalogItem | null, second: CatalogItem | null) => {
    const pts = room.points;
    const a = pts[edgeIndex];
    const b = pts[(edgeIndex + 1) % pts.length];
    const edgeTotalCm = edgeLengthCm(pts, edgeIndex);
    if (edgeTotalCm === 0 || distCm <= 0 || distCm >= edgeTotalCm) return;
    // Split fraction along the edge's length (arc-length fraction for a curved wall).
    const t = distCm / edgeTotalCm;
    const splitPt = pointOnArc(a, b, a.bulge, t);
    const [bulgeBefore, bulgeAfter] = splitBulge(a.bulge ?? 0, t);
    const labels = vertexLabels(pts);
    const lettered = pts.map((p, k) => ({ ...p, label: labels[k] }));
    const newPts = [
      ...lettered.slice(0, edgeIndex),
      { ...lettered[edgeIndex], bulge: bulgeBefore },
      { x: splitPt.x, y: splitPt.y, bulge: bulgeAfter, label: nextVertexLabel(pts) },
      ...lettered.slice(edgeIndex + 1),
    ];
    const part = (edgeIdx: number, item: CatalogItem | null): RoomProfileSegment[] => item
      ? [{ edgeIndex: edgeIdx, profileId: item.id, profile: { ...item }, lengthM: edgeLengthM(newPts, edgeIdx) }]
      : [];
    const updatedSegs = [
      ...(room.profileSegments ?? [])
        .filter(s => s.edgeIndex !== edgeIndex)
        .map(s => {
          const newIdx = s.edgeIndex > edgeIndex ? s.edgeIndex + 1 : s.edgeIndex;
          return { ...s, edgeIndex: newIdx, lengthM: edgeLengthM(newPts, newIdx) };
        }),
      ...part(edgeIndex, first),
      ...part(edgeIndex + 1, second),
    ].sort((x, y) => x.edgeIndex - y.edgeIndex);
    updateRoom({
      points: newPts,
      areaSqm: parseFloat((pxToMeters(Math.sqrt(polygonArea(newPts))) ** 2).toFixed(2)),
      perimeterM: parseFloat(pxToMeters(polygonPerimeter(newPts)).toFixed(2)),
      profileSegments: updatedSegs,
    });
  };

  const straightenEdge = (edgeIndex: number) => {
    const n = room.points.length;
    const pts = room.points;
    if (!pts[edgeIndex % n]?.bulge) return;
    const newPts = pts.map((p, i) => i === edgeIndex % n ? { ...p, bulge: 0 } : p);
    const areaPx = polygonArea(newPts);
    const perimPx = polygonPerimeter(newPts);
    const areaSqm = parseFloat((pxToMeters(Math.sqrt(areaPx)) ** 2).toFixed(2));
    const perimeterM = parseFloat(pxToMeters(perimPx).toFixed(2));
    const updatedSegments = (room.profileSegments ?? []).map(s => ({
      ...s, lengthM: edgeLengthM(newPts, s.edgeIndex),
    }));
    updateRoom({ points: newPts, areaSqm, perimeterM, profileSegments: updatedSegments });
  };

  // ── Lighting delete ──
  const deleteElement = (id: string) =>
    updateRoom({ lighting: (room.lighting ?? []).filter(e => e.id !== id) });

  // ── Accessories ──
  const roomAccessories = room.selectedAccessories ?? [];

  const addAccessory = (acc: Accessory) => {
    const existing = roomAccessories.find(a => a.accessoryId === acc.id);
    if (existing) {
      updateRoom({
        selectedAccessories: roomAccessories.map(a =>
          a.accessoryId === acc.id ? { ...a, quantity: a.quantity + 1 } : a
        ),
      });
    } else {
      const newItem: RoomAccessoryItem = {
        id: uuid(),
        accessoryId: acc.id,
        accessory: { ...acc },
        quantity: 1,
      };
      updateRoom({ selectedAccessories: [...roomAccessories, newItem] });
    }
  };

  const changeAccessoryQty = (id: string, delta: number) => {
    const updated = roomAccessories
      .map(a => a.id === id ? { ...a, quantity: a.quantity + delta } : a)
      .filter(a => a.quantity > 0);
    updateRoom({ selectedAccessories: updated });
  };

  const removeAccessory = (id: string) =>
    updateRoom({ selectedAccessories: roomAccessories.filter(a => a.id !== id) });

  const accessoryTotal = roomAccessories.reduce((s, a) => s + a.accessory.price * a.quantity, 0);
  const accessoryInstallTotal = roomAccessories.reduce((s, a) => s + a.accessory.priceInstall * a.quantity, 0);

  // ── Niches ──
  // 'pcs'-unit niches are added here with a quantity stepper; 'perimeter'-unit
  // niches are instead drawn wall-to-wall on the canvas (see RoomEditor), so
  // they arrive already-formed as RoomNichePath elements with their own length.
  const roomNiches = room.selectedNiches ?? [];

  const addNicheCount = (niche: NicheItem) => {
    const existing = roomNiches.find((n): n is RoomNicheCount => n.kind === 'count' && n.nicheId === niche.id);
    if (existing) {
      updateRoom({
        selectedNiches: roomNiches.map(n =>
          n.kind === 'count' && n.nicheId === niche.id ? { ...n, quantity: n.quantity + 1 } : n
        ),
      });
    } else {
      const newItem: RoomNicheCount = {
        id: uuid(), kind: 'count',
        nicheId: niche.id, niche: { ...niche }, quantity: 1,
      };
      updateRoom({ selectedNiches: [...roomNiches, newItem] });
    }
  };

  const changeNicheQty = (id: string, delta: number) => {
    const updated = roomNiches
      .map(n => (n.kind === 'count' && n.id === id) ? { ...n, quantity: n.quantity + delta } : n)
      .filter(n => n.kind !== 'count' || n.quantity > 0);
    updateRoom({ selectedNiches: updated });
  };

  const removeNiche = (id: string) =>
    updateRoom({ selectedNiches: roomNiches.filter(n => n.id !== id) });

  const nicheTotal = roomNiches.reduce((s, n) => s + n.niche.price * (n.kind === 'count' ? n.quantity : n.lengthM), 0);
  const nicheInstallTotal = roomNiches.reduce((s, n) => s + n.niche.priceInstall * (n.kind === 'count' ? n.quantity : n.lengthM), 0);

  // ── Services ──
  const roomServices = room.selectedServices ?? [];

  const addService = (svc: AdditionalService) => {
    const existing = roomServices.find(s => s.serviceId === svc.id);
    if (existing) {
      updateRoom({
        selectedServices: roomServices.map(s =>
          s.serviceId === svc.id ? { ...s, quantity: s.quantity + 1 } : s
        ),
      });
    } else {
      const newItem: RoomServiceItem = {
        id: uuid(),
        serviceId: svc.id,
        service: { ...svc },
        quantity: 1,
      };
      updateRoom({ selectedServices: [...roomServices, newItem] });
    }
  };

  const changeServiceQty = (id: string, delta: number) => {
    const updated = roomServices
      .map(s => s.id === id ? { ...s, quantity: s.quantity + delta } : s)
      .filter(s => s.quantity > 0);
    updateRoom({ selectedServices: updated });
  };

  const removeService = (id: string) =>
    updateRoom({ selectedServices: roomServices.filter(s => s.id !== id) });

  const serviceTotal = roomServices.reduce((s, a) => s + a.service.price * a.quantity, 0);
  const serviceInstallTotal = roomServices.reduce((s, a) => s + a.service.priceInstall * a.quantity, 0);

  // ── Derived ──
  // Splitting a wall (e.g. to assign it two different profiles) adds a point
  // without adding a real corner, so bill off the geometric corner count —
  // not the raw point count. A niche drawn as a routed box also welds in its
  // own corners, on top of the room's — unless it wraps an existing room
  // corner, in which case that corner isn't counted twice. The first 4
  // corners total are free.
  const nichePaths = roomNiches.filter((n): n is RoomNichePath => n.kind === 'path').map(n => n.points);
  const billableCorners = Math.max(0, totalFabricCorners(room.points, nichePaths) - FREE_FABRIC_CORNERS);
  const segments = room.profileSegments ?? [];
  const lighting = room.lighting ?? [];

  const profileGroups = segments.reduce((acc, seg) => {
    if (!acc[seg.profileId]) acc[seg.profileId] = { profile: seg.profile, totalLengthM: 0, count: 0 };
    acc[seg.profileId].totalLengthM += seg.lengthM;
    acc[seg.profileId].count += 1;
    return acc;
  }, {} as Record<string, { profile: CatalogItem; totalLengthM: number; count: number }>);

  const lightingGroups = lighting.reduce((acc, e) => {
    const key = e.catalogItemId;
    if (!acc[key]) acc[key] = { item: e.catalogItem, elements: [] };
    acc[key].elements.push(e);
    return acc;
  }, {} as Record<string, { item: LightingCatalogItem; elements: typeof lighting }>);

  const nicheCounts = roomNiches.filter((n): n is RoomNicheCount => n.kind === 'count');
  const nichePathGroups = roomNiches
    .filter((n): n is RoomNichePath => n.kind === 'path')
    .reduce((acc, e) => {
      if (!acc[e.nicheId]) acc[e.nicheId] = { item: e.niche, elements: [] };
      acc[e.nicheId].elements.push(e);
      return acc;
    }, {} as Record<string, { item: NicheItem; elements: RoomNichePath[] }>);

  const fabricTotal = room.fabric ? room.fabric.price * room.areaSqm + room.fabric.priceCorner * billableCorners : 0;
  const profileTotal = Object.values(profileGroups).reduce(
    (s, { profile, totalLengthM, count }) => s + profile.price * totalLengthM + profile.priceCorner * count, 0,
  );
  const lightingTotal = lighting.reduce((s, e) =>
    s + (e.kind === 'point' ? e.catalogItem.price : e.catalogItem.price * (e as RoomLightingPath).lengthM), 0);
  const workerFabric = room.fabric ? room.fabric.priceInstall * room.areaSqm + room.fabric.priceInstallCorner * billableCorners : 0;
  const workerProfile = Object.values(profileGroups).reduce(
    (s, { profile, totalLengthM }) => s + profile.priceInstall * totalLengthM, 0,
  );
  const workerLighting = lighting.reduce((s, e) =>
    s + (e.kind === 'point' ? e.catalogItem.priceInstall : e.catalogItem.priceInstall * (e as RoomLightingPath).lengthM), 0);

  const sectionTotal =
    section === 'fabric' ? fabricTotal :
    section === 'profile' ? profileTotal :
    section === 'lighting' ? lightingTotal :
    section === 'niche' ? nicheTotal :
    section === 'accessories' ? accessoryTotal :
    section === 'services' ? serviceTotal : 0;

  const sectionWorker =
    section === 'fabric' ? workerFabric :
    section === 'profile' ? workerProfile :
    section === 'lighting' ? workerLighting :
    section === 'niche' ? nicheInstallTotal :
    section === 'accessories' ? accessoryInstallTotal :
    section === 'services' ? serviceInstallTotal : 0;

  const showTotalsBar =
    (section === 'fabric' && room.fabric != null && room.areaSqm > 0) ||
    (section === 'profile' && segments.length > 0) ||
    (section === 'lighting' && lighting.length > 0) ||
    (section === 'niche' && roomNiches.length > 0) ||
    (section === 'accessories' && roomAccessories.length > 0) ||
    (section === 'services' && roomServices.length > 0);

  // ── Profiles page (derived) ──
  const nPts = room.points.length;
  const segOf = (i: number) => segments.find(s => s.edgeIndex === i);
  const wallColors = room.points.map((_, i) => segOf(i)?.profile.color ?? null);
  const wallCmOf = (pts: Point[], i: number) => Math.round(edgeLengthCm(pts, i));
  // Typed lengths go in wall order, each on top of the previous one, so the
  // preview (and every other field) shows exactly what «Применить» will save.
  let wallPreviewPts: Point[] = room.points;
  for (const [k, raw] of Object.entries(wallDraft).sort((x, y) => +x[0] - +y[0])) {
    const i = +k, cm = Math.round(parseFloat(raw));
    if (cm > 0 && cm !== wallCmOf(wallPreviewPts, i)) wallPreviewPts = resizedPoints(wallPreviewPts, i, cm) ?? wallPreviewPts;
  }
  const wallsDirty = wallPreviewPts !== room.points;
  const applyWallSizes = () => {
    if (wallsDirty) updateRoom(reshapedRoom(wallPreviewPts));
    setWallDraft({});
  };

  const meta = SECTION_META[section as Section] ?? SECTION_META.fabric;
  const backHref = `/project/${projectId}/room/${roomId}`;

  const fabAction: (() => void) | null =
    (section === 'lighting' && lightings.length > 0) ? () => router.push(`${backHref}?pickLighting=1`, 'back') :
    (section === 'niche' && niches.length > 0) ? () => setAddNicheOpen(true) :
    (section === 'accessories' && accessories.length > 0) ? () => setAddAccessoryOpen(true) :
    (section === 'services' && services.length > 0) ? () => setAddServiceOpen(true) :
    null;

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton text="" icon={chevronBackOutline} defaultHref={backHref} />
          </IonButtons>
          <IonTitle>{t(meta.titleKey)}</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent>

        {/* ═══ ПОЛОТНО ═══ */}
        {section === 'fabric' && (
          <div style={{ padding: '12px 0 100px' }}>
            {fabrics.length === 0 ? (
              <div style={{ padding: '20px 16px' }}>
                <HintText text={t('mat.noFabrics')} />
              </div>
            ) : (
              <div style={{ padding: '0 16px' }}>
                {fabrics.map(item => {
                  const selected = room.fabricId === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => selectFabric(item)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                        padding: '14px 16px', marginBottom: 8, borderRadius: 16,
                        border: `2px solid ${selected ? '#1E88E5' : 'transparent'}`,
                        background: selected ? 'rgba(30,136,229,0.07)' : '#fff',
                        cursor: 'pointer', textAlign: 'left',
                        boxShadow: '0 1px 6px rgba(0,0,0,0.07)',
                        transition: 'border-color 0.15s, background 0.15s',
                      }}
                    >
                      <div style={{
                        width: 44, height: 44, borderRadius: 12,
                        background: item.color,
                        border: '1px solid rgba(0,0,0,0.1)', flexShrink: 0,
                      }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 3 }}>{item.title}</div>
                        <div style={{ fontSize: 12, color: '#999' }}>
                          {item.price} ₽/м² · угол {item.priceCorner} ₽
                        </div>
                      </div>
                      {selected && (
                        <div style={{
                          width: 26, height: 26, borderRadius: 13,
                          background: '#1E88E5', flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <IonIcon icon={checkmarkOutline} style={{ color: '#fff', fontSize: 14 }} />
                        </div>
                      )}
                    </button>
                  );
                })}

              </div>
            )}
          </div>
        )}

        {/* ═══ ПРОФИЛЬ ═══ */}
        {section === 'profile' && (
          <div style={{ padding: '12px 16px 100px' }}>
            {nPts < 3 ? (
              <div style={{ padding: '8px 0' }}>
                <HintText text={t('mat.drawFirst')} />
                <button
                  onClick={() => router.push(backHref, 'back')}
                  style={{
                    marginTop: 8, padding: '10px 18px', borderRadius: 12,
                    border: '1.5px solid #1E88E5', background: 'transparent',
                    color: '#1E88E5', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  {t('mat.openDraft')}
                </button>
              </div>
            ) : (
              <>
                <RoomPreview
                  points={wallPreviewPts}
                  wallColors={wallColors}
                  selectedWall={activeWall}
                  onWallTap={setActiveWall}
                />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 2px 8px' }}>
                  <span style={{ fontSize: 12, color: '#999' }}>{t('prof.tapSize')}</span>
                  {profiles.length > 0 && (
                    <button
                      onClick={() => setApplyAllOpen(true)}
                      style={{ fontSize: 13, color: '#1E88E5', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}
                    >
                      {t('mat.applyAll')}
                    </button>
                  )}
                </div>

                <div className="card" style={{ overflow: 'hidden' }}>
                  {room.points.map((p, i) => {
                    const seg = segOf(i);
                    const active = activeWall === i;
                    const shownCm = wallCmOf(wallPreviewPts, i);
                    const edited = wallDraft[i] != null && Math.round(parseFloat(wallDraft[i])) !== wallCmOf(room.points, i);
                    return (
                      <div
                        key={i}
                        onClick={() => setActiveWall(i)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '9px 6px 9px 0',
                          borderTop: i > 0 ? '1px solid rgba(0,0,0,0.07)' : undefined,
                          background: active ? 'rgba(249,168,37,0.08)' : undefined,
                        }}
                      >
                        <div style={{
                          width: 4, alignSelf: 'stretch', borderRadius: '0 3px 3px 0', flexShrink: 0,
                          background: seg?.profile.color ?? '#ff6b66',
                          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.12)',
                        }} />
                        <div style={{ width: 40, flexShrink: 0, fontSize: 14, fontWeight: 800 }}>
                          {edgeLabel(room.points, i).replace(/ /g, '')}
                          {p.bulge ? <span title={t('mat.curved')} style={{ color: '#F9A825', marginLeft: 2 }}>⌒</span> : null}
                        </div>
                        <div style={{
                          width: 92, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 2, height: 38, padding: '0 8px',
                          borderRadius: 10, border: `1.5px solid ${edited || active ? '#F9A825' : 'rgba(0,0,0,0.15)'}`, background: '#fff',
                        }}>
                          <input
                            type="number" inputMode="numeric" min="1" step="1"
                            value={wallDraft[i] ?? String(shownCm)}
                            onChange={e => { const v = e.target.value; setWallDraft(d => ({ ...d, [i]: v })); }}
                            onFocus={e => { setActiveWall(i); e.target.select(); }}
                            style={{
                              width: '100%', minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
                              fontSize: 16, fontWeight: 700, color: 'inherit',
                            }}
                          />
                          <span style={{ fontSize: 12, color: '#888' }}>{t('re.cm')}</span>
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); setActiveWall(i); setProfileSheetWall(i); }}
                          style={{
                            flex: 1, minWidth: 0, height: 38, display: 'flex', alignItems: 'center', gap: 6,
                            padding: '0 10px', borderRadius: 10, border: 'none', cursor: 'pointer',
                            background: seg ? '#f2f3f7' : 'rgba(251,140,0,0.1)', color: seg ? 'inherit' : '#FB8C00',
                          }}
                        >
                          {seg && <Swatch color={seg.profile.color} size={10} />}
                          <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {seg ? seg.profile.title : t('mat.noProfile')}
                          </span>
                          <IonIcon icon={chevronDownOutline} style={{ marginLeft: 'auto', fontSize: 14, color: '#999', flexShrink: 0 }} />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); setActiveWall(i); setWallMenu(i); }}
                          style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: '#999', flexShrink: 0 }}
                        >
                          <IonIcon icon={ellipsisVerticalOutline} style={{ fontSize: 20, display: 'block' }} />
                        </button>
                      </div>
                    );
                  })}
                </div>

                <button
                  onClick={applyWallSizes}
                  disabled={!wallsDirty}
                  style={{
                    width: '100%', marginTop: 12, padding: '14px 16px', borderRadius: 14, border: 'none',
                    fontSize: 15, fontWeight: 700,
                    background: wallsDirty ? '#F9A825' : 'rgba(0,0,0,0.08)',
                    color: wallsDirty ? '#000' : 'rgba(0,0,0,0.3)',
                    cursor: wallsDirty ? 'pointer' : 'default',
                  }}
                >
                  {t('prof.applySize')}
                </button>
              </>
            )}
          </div>
        )}

        {/* ═══ ДИАГОНАЛИ ═══ */}
        {section === 'diagonals' && (
          <div style={{ padding: '12px 16px 100px' }}>
            {room.areaSqm === 0 ? (
              <div style={{ padding: '8px 0' }}>
                <HintText text={t('mat.drawFirst')} />
                <button
                  onClick={() => router.push(backHref, 'back')}
                  style={{
                    marginTop: 8, padding: '10px 18px', borderRadius: 12,
                    border: '1.5px solid #1E88E5', background: 'transparent',
                    color: '#1E88E5', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  {t('mat.openDraft')}
                </button>
              </div>
            ) : diagList.length === 0 ? (
              <HintText text={t('diag.triangle')} />
            ) : (
              <>
                <RoomPreview
                  points={diagPoints ?? room.points}
                  diagonals={diagList}
                  activeDiagonal={activeDiag}
                  invalid={diagPoints == null}
                  onDiagonalTap={setActiveDiag}
                />
                <div style={{ marginTop: 12 }}>
                  <HintText text={t('diag.hint')} />
                </div>
                <div className="card" style={{ overflow: 'hidden', marginTop: 4 }}>
                  {diagList.map((d, k) => {
                    const value = diagDraft[d.key] ?? String(diagonalCm(diagPoints ?? room.points, d.i, d.j));
                    const active = activeDiag === d.key;
                    const bad = diagPoints == null && diagDriver === d.key;
                    return (
                      <div
                        key={d.key}
                        onClick={() => setActiveDiag(d.key)}
                        style={{
                          padding: '12px 16px',
                          borderTop: k > 0 ? '1px solid rgba(0,0,0,0.07)' : undefined,
                          background: active ? 'rgba(249,168,37,0.08)' : undefined,
                          boxShadow: active ? 'inset 3px 0 0 #F9A825' : undefined,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{
                            width: 44, height: 36, borderRadius: 10, flexShrink: 0,
                            background: 'rgba(249,168,37,0.15)', color: '#F9A825',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontWeight: 800, fontSize: 14,
                          }}>
                            {d.label}
                          </div>
                          <div style={{ flex: 1 }} />
                          <div style={{
                            width: 130, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
                            borderRadius: 10, padding: '0 12px',
                            border: `1.5px solid ${bad ? '#E53935' : active ? '#F9A825' : 'rgba(0,0,0,0.15)'}`,
                          }}>
                            <input
                              type="number" inputMode="numeric" min="0" step="1"
                              value={value}
                              onChange={e => editDiagonal(d.key, e.target.value)}
                              onFocus={e => { setActiveDiag(d.key); e.target.select(); }}
                              style={{
                                width: '100%', minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
                                padding: '9px 0', fontSize: 17, fontWeight: 700, color: 'inherit',
                              }}
                            />
                            <span style={{ fontSize: 14, color: '#888', flexShrink: 0 }}>{t('re.cm')}</span>
                          </div>
                        </div>
                        {bad && diagRange && (
                          <div style={{ fontSize: 12, color: '#E53935', marginTop: 6, textAlign: 'right' }}>
                            {t('diag.range', { min: diagRange[0], max: diagRange[1] })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <button
                  onClick={applyDiagonals}
                  disabled={!diagDirty}
                  style={{
                    width: '100%', marginTop: 16, padding: '14px 16px', borderRadius: 14, border: 'none',
                    fontSize: 15, fontWeight: 700,
                    background: diagDirty ? '#F9A825' : 'rgba(0,0,0,0.08)',
                    color: diagDirty ? '#000' : 'rgba(0,0,0,0.3)',
                    cursor: diagDirty ? 'pointer' : 'default',
                  }}
                >
                  {t('diag.apply')}
                </button>
                <div className="card" style={{ marginTop: 16, overflow: 'hidden' }}>
                  <IonItem lines="none" style={{ '--background': 'transparent' } as React.CSSProperties}>
                    <IonToggle
                      checked={room.showDiagonals !== false}
                      onIonChange={e => updateRoom({ showDiagonals: e.detail.checked })}
                    >
                      {t('diag.show')}
                    </IonToggle>
                  </IonItem>
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══ ОСВЕЩЕНИЕ ═══ */}
        {section === 'lighting' && (
          lightings.length === 0 ? (
            <EmptyState
              icon={bulbOutline}
              iconColor="#F9A825"
              iconBg="#FFFDE7"
              text={t('mat.noLightCatalog')}
              sub={t('mat.noLightCatalogSub')}
              buttonLabel={t('mat.openPrices')}
              buttonColor="#1E88E5"
              onButton={() => router.push('/price-list/lightings')}
            />
          ) : lighting.length === 0 ? (
            <EmptyState
              icon={bulbOutline}
              iconColor="#F9A825"
              iconBg="#FFFDE7"
              text={t('mat.noItems')}
              sub={t('mat.addLightSub')}
            />
          ) : (
            <div style={{ padding: '12px 16px 100px' }}>
              {Object.values(lightingGroups).map(({ item, elements }) => {
                const isPath = item.placement === 'path';
                const totalLen = isPath
                  ? elements.reduce((s, e) => s + (e as RoomLightingPath).lengthM, 0)
                  : 0;
                const total = isPath ? item.price * totalLen : item.price * elements.length;

                return (
                  <div key={item.id} style={{
                    background: '#fff', borderRadius: 16, marginBottom: 10,
                    overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.07)',
                  }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 16px', borderBottom: '1px solid #F5F5F5',
                    }}>
                      {isPath ? (
                        <div style={{
                          width: 28, height: 4, borderRadius: 2,
                          background: lightColor(item.color), flexShrink: 0,
                        }} />
                      ) : (
                        <span style={{ fontSize: 22, color: lightColor(item.color), lineHeight: 1 }}>
                          {item.symbol}
                        </span>
                      )}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{item.title}</div>
                        <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
                          {isPath
                            ? `${totalLen.toFixed(2)} м · ${item.price} ₽ = ${Math.round(total).toLocaleString('ru')} ₽`
                            : `${elements.length} ${t('mc.pcs')} · ${item.price} ₽ = ${Math.round(total).toLocaleString('ru')} ₽`
                          }
                        </div>
                      </div>
                    </div>

                    {elements.map((el, idx) => (
                      <div key={el.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '9px 16px',
                        borderBottom: idx < elements.length - 1 ? '1px solid #F5F5F5' : 'none',
                      }}>
                        <span style={{ fontSize: 13, color: '#aaa' }}>
                          {isPath
                            ? `${t('mat.line')} ${idx + 1} · ${(el as RoomLightingPath).lengthM.toFixed(2)} м`
                            : `${t('mat.point')} ${idx + 1}`
                          }
                        </span>
                        <button
                          onClick={() => deleteElement(el.id)}
                          style={{
                            background: 'none', border: 'none', padding: '4px 8px',
                            cursor: 'pointer', color: '#E53935',
                          }}
                        >
                          <IonIcon icon={trashOutline} style={{ fontSize: 17, display: 'block' }} />
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })}

            </div>
          )
        )}

        {/* ═══ НИШИ ═══ */}
        {section === 'niche' && (
          niches.length === 0 ? (
            <EmptyState
              icon={albumsOutline}
              iconColor="#00838F"
              iconBg="#E0F7FA"
              text={t('mat.noNicheCatalog')}
              sub={t('mat.noNicheCatalogSub')}
              buttonLabel={t('mat.openPrices')}
              buttonColor="#1E88E5"
              onButton={() => router.push('/price-list/niches')}
            />
          ) : roomNiches.length === 0 ? (
            <EmptyState
              icon={albumsOutline}
              iconColor="#00838F"
              iconBg="#E0F7FA"
              text={t('mat.noItems')}
              sub={t('mat.addItemSub')}
            />
          ) : (
            <div style={{ padding: '12px 16px 100px' }}>
              {nicheCounts.length > 0 && (
                <div className="card" style={{ overflow: 'hidden', marginBottom: 10 }}>
                  <IonList style={{ '--background': 'transparent' } as React.CSSProperties}>
                    {nicheCounts.map((item, idx) => (
                      <IonItem
                        key={item.id}
                        lines={idx === nicheCounts.length - 1 ? 'none' : 'inset'}
                        style={{ '--background': 'transparent' } as React.CSSProperties}
                      >
                        <IonLabel>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{item.niche.title}</div>
                          <p style={{ fontSize: 12, color: '#999', margin: '2px 0 0' }}>
                            {item.quantity} {t('unit.pcs')} · {item.niche.price.toLocaleString('ru')} ₽ = {(item.niche.price * item.quantity).toLocaleString('ru')} ₽
                          </p>
                        </IonLabel>
                        <div slot="end" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <button
                            onClick={() => changeNicheQty(item.id, -1)}
                            style={{
                              width: 28, height: 28, borderRadius: 8,
                              border: '1.5px solid #ddd', background: '#fafafa',
                              fontSize: 18, lineHeight: 1, cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: '#666',
                            }}
                          >−</button>
                          <span style={{ fontWeight: 700, fontSize: 15, minWidth: 20, textAlign: 'center' }}>
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => changeNicheQty(item.id, 1)}
                            style={{
                              width: 28, height: 28, borderRadius: 8,
                              border: '1.5px solid #00838F', background: 'rgba(0,131,143,0.08)',
                              fontSize: 18, lineHeight: 1, cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: '#00838F',
                            }}
                          >+</button>
                          <button
                            onClick={() => removeNiche(item.id)}
                            style={{
                              background: 'none', border: 'none', padding: '4px 0 4px 8px',
                              cursor: 'pointer', color: '#E53935',
                            }}
                          >
                            <IonIcon icon={trashOutline} style={{ fontSize: 18, display: 'block' }} />
                          </button>
                        </div>
                      </IonItem>
                    ))}
                  </IonList>
                </div>
              )}

              {Object.values(nichePathGroups).map(({ item, elements }) => {
                const totalLen = elements.reduce((s, e) => s + e.lengthM, 0);
                const total = item.price * totalLen;
                return (
                  <div key={item.id} style={{
                    background: '#fff', borderRadius: 16, marginBottom: 10,
                    overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.07)',
                  }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 16px', borderBottom: '1px solid #F5F5F5',
                    }}>
                      <div style={{ width: 28, height: 4, borderRadius: 2, background: '#00838F', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{item.title}</div>
                        <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
                          {totalLen.toFixed(2)} м · {item.price} ₽ = {Math.round(total).toLocaleString('ru')} ₽
                        </div>
                      </div>
                    </div>
                    {elements.map((el, idx) => (
                      <div key={el.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '9px 16px',
                        borderBottom: idx < elements.length - 1 ? '1px solid #F5F5F5' : 'none',
                      }}>
                        <span style={{ fontSize: 13, color: '#aaa' }}>
                          {t('mat.line')} {idx + 1} · {el.lengthM.toFixed(2)} м
                        </span>
                        <button
                          onClick={() => removeNiche(el.id)}
                          style={{
                            background: 'none', border: 'none', padding: '4px 8px',
                            cursor: 'pointer', color: '#E53935',
                          }}
                        >
                          <IonIcon icon={trashOutline} style={{ fontSize: 17, display: 'block' }} />
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* ═══ КОМПЛЕКТУЮЩИЕ ═══ */}
        {section === 'accessories' && (
          accessories.length === 0 ? (
            <EmptyState
              icon={buildOutline}
              iconColor="#2E7D32"
              iconBg="#E8F5E9"
              text={t('mat.noAccessoryCatalog')}
              sub={t('mat.noAccessoryCatalogSub')}
              buttonLabel={t('mat.openPrices')}
              buttonColor="#1E88E5"
              onButton={() => router.push('/price-list/accessories')}
            />
          ) : roomAccessories.length === 0 ? (
            <EmptyState
              icon={buildOutline}
              iconColor="#2E7D32"
              iconBg="#E8F5E9"
              text={t('mat.noItems')}
              sub={t('mat.addItemSub')}
            />
          ) : (
            <div style={{ padding: '12px 16px 100px' }}>
              <div className="card" style={{ overflow: 'hidden' }}>
                <IonList style={{ '--background': 'transparent' } as React.CSSProperties}>
                  {roomAccessories.map((item, idx) => (
                    <IonItem
                      key={item.id}
                      lines={idx === roomAccessories.length - 1 ? 'none' : 'inset'}
                      style={{ '--background': 'transparent' } as React.CSSProperties}
                    >
                      <IonLabel>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{item.accessory.title}</div>
                        <p style={{ fontSize: 12, color: '#999', margin: '2px 0 0' }}>
                          {item.quantity} {item.accessory.unit} · {item.accessory.price.toLocaleString('ru')} ₽ = {(item.accessory.price * item.quantity).toLocaleString('ru')} ₽
                        </p>
                      </IonLabel>
                      <div slot="end" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button
                          onClick={() => changeAccessoryQty(item.id, -1)}
                          style={{
                            width: 28, height: 28, borderRadius: 8,
                            border: '1.5px solid #ddd', background: '#fafafa',
                            fontSize: 18, lineHeight: 1, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#666',
                          }}
                        >−</button>
                        <span style={{ fontWeight: 700, fontSize: 15, minWidth: 20, textAlign: 'center' }}>
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => changeAccessoryQty(item.id, 1)}
                          style={{
                            width: 28, height: 28, borderRadius: 8,
                            border: '1.5px solid #1E88E5', background: 'rgba(30,136,229,0.08)',
                            fontSize: 18, lineHeight: 1, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#1E88E5',
                          }}
                        >+</button>
                        <button
                          onClick={() => removeAccessory(item.id)}
                          style={{
                            background: 'none', border: 'none', padding: '4px 0 4px 8px',
                            cursor: 'pointer', color: '#E53935',
                          }}
                        >
                          <IonIcon icon={trashOutline} style={{ fontSize: 18, display: 'block' }} />
                        </button>
                      </div>
                    </IonItem>
                  ))}
                </IonList>
              </div>
            </div>
          )
        )}

        {/* ═══ ДОП. УСЛУГИ ═══ */}
        {section === 'services' && (
          services.length === 0 ? (
            <EmptyState
              icon={briefcaseOutline}
              iconColor="#C62828"
              iconBg="#FFF0F0"
              text={t('mat.noServiceCatalog')}
              sub={t('mat.noServiceCatalogSub')}
              buttonLabel={t('mat.openPrices')}
              buttonColor="#1E88E5"
              onButton={() => router.push('/price-list/services')}
            />
          ) : roomServices.length === 0 ? (
            <EmptyState
              icon={briefcaseOutline}
              iconColor="#C62828"
              iconBg="#FFF0F0"
              text={t('mat.noItems')}
              sub={t('mat.addServiceSub')}
            />
          ) : (
            <div style={{ padding: '12px 16px 100px' }}>
              <div className="card" style={{ overflow: 'hidden' }}>
                <IonList style={{ '--background': 'transparent' } as React.CSSProperties}>
                  {roomServices.map((item, idx) => (
                    <IonItem
                      key={item.id}
                      lines={idx === roomServices.length - 1 ? 'none' : 'inset'}
                      style={{ '--background': 'transparent' } as React.CSSProperties}
                    >
                      <IonLabel>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{item.service.title}</div>
                        {item.service.description && (
                          <p style={{ fontSize: 11, color: '#bbb', margin: '2px 0 0' }}>{item.service.description}</p>
                        )}
                        <p style={{ fontSize: 12, color: '#999', margin: '2px 0 0' }}>
                          {item.quantity} {t('mc.pcs')} · {item.service.price.toLocaleString('ru')} ₽ = {(item.service.price * item.quantity).toLocaleString('ru')} ₽
                        </p>
                      </IonLabel>
                      <div slot="end" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button
                          onClick={() => changeServiceQty(item.id, -1)}
                          style={{
                            width: 28, height: 28, borderRadius: 8,
                            border: '1.5px solid #ddd', background: '#fafafa',
                            fontSize: 18, lineHeight: 1, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#666',
                          }}
                        >−</button>
                        <span style={{ fontWeight: 700, fontSize: 15, minWidth: 20, textAlign: 'center' }}>
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => changeServiceQty(item.id, 1)}
                          style={{
                            width: 28, height: 28, borderRadius: 8,
                            border: '1.5px solid #C62828', background: '#FFF0F0',
                            fontSize: 18, lineHeight: 1, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#C62828',
                          }}
                        >+</button>
                        <button
                          onClick={() => removeService(item.id)}
                          style={{
                            background: 'none', border: 'none', padding: '4px 0 4px 8px',
                            cursor: 'pointer', color: '#E53935',
                          }}
                        >
                          <IonIcon icon={trashOutline} style={{ fontSize: 18, display: 'block' }} />
                        </button>
                      </div>
                    </IonItem>
                  ))}
                </IonList>
              </div>
            </div>
          )
        )}

      </IonContent>

      {showTotalsBar && (
        <div style={{
          position: 'fixed',
          bottom: 0, left: 0, right: 0,
          display: 'flex',
          alignItems: 'center',
          background: 'var(--color-surface)',
          borderTop: '1px solid var(--color-border)',
          padding: '10px 16px calc(10px + env(safe-area-inset-bottom))',
          zIndex: 100,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700,
            color: 'var(--color-text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.6px',
            paddingRight: 14,
            borderRight: '1px solid var(--color-border)',
            alignSelf: 'stretch',
            display: 'flex', alignItems: 'center',
          }}>
            {t('sum.total')}
          </div>
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: 2,
          }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--color-text)', lineHeight: 1 }}>
              {Math.round(sectionTotal).toLocaleString('ru')} ₽
            </span>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
              {t(meta.titleKey).toLowerCase()}
            </span>
          </div>
          {sectionWorker > 0 && (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 2,
              borderLeft: '1px solid var(--color-border)',
            }}>
              <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--color-text)', lineHeight: 1 }}>
                {Math.round(sectionWorker).toLocaleString('ru')} ₽
              </span>
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{t('mat.install')}</span>
            </div>
          )}
        </div>
      )}

      {fabAction && (
        <button
          onClick={fabAction}
          style={{
            position: 'fixed',
            right: 16,
            bottom: showTotalsBar
              ? 'calc(70px + env(safe-area-inset-bottom, 0px))'
              : 'calc(16px + env(safe-area-inset-bottom, 0px))',
            width: 56, height: 56, borderRadius: '50%',
            background: 'var(--ion-color-primary, #3880ff)',
            border: 'none', cursor: 'pointer', zIndex: 200,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
            transition: 'bottom 0.2s ease',
          }}
        >
          <IonIcon icon={addOutline} style={{ fontSize: 28, color: '#fff' }} />
        </button>
      )}

      {splitEdgeIdx !== null && splitEdgeIdx < nPts && (
        <WallSplitScreen
          points={room.points}
          edgeIndex={splitEdgeIdx}
          profiles={profiles}
          current={segOf(splitEdgeIdx)?.profile ?? null}
          wallColors={wallColors}
          onCancel={() => setSplitEdgeIdx(null)}
          onSplit={(distCm, first, second) => {
            splitEdgeAt(splitEdgeIdx, distCm, first, second);
            setWallDraft({});
            setActiveWall(splitEdgeIdx);
            setSplitEdgeIdx(null);
          }}
        />
      )}

      {/* Wall menu: split / straighten */}
      <IonActionSheet
        isOpen={wallMenu !== null}
        header={wallMenu !== null && wallMenu < nPts
          ? `${t('mat.wall')} ${edgeLabel(room.points, wallMenu)} · ${wallCmOf(room.points, wallMenu)} см`
          : undefined}
        buttons={[
          {
            text: t('mat.split'),
            handler: () => { const w = wallMenu; setWallMenu(null); setWallDraft({}); setSplitEdgeIdx(w); },
          },
          ...(wallMenu !== null && room.points[wallMenu]?.bulge ? [{
            text: t('mat.straighten'),
            handler: () => { straightenEdge(wallMenu); setWallDraft({}); setWallMenu(null); },
          }] : []),
          { text: t('common.cancel'), role: 'cancel' as const },
        ]}
        onDidDismiss={() => setWallMenu(null)}
      />

      {profileSheetWall !== null && profileSheetWall < nPts && (
        <ProfileSheet
          title={`${t('prof.sheetTitle')} ${edgeLabel(room.points, profileSheetWall).replace(/ /g, '')}`}
          wallM={edgeLengthM(room.points, profileSheetWall)}
          profiles={profiles}
          currentId={segOf(profileSheetWall)?.profileId ?? null}
          onPick={item => {
            assignProfile(profileSheetWall, item);
            setProfileSheetWall(null);
          }}
          onClear={() => { clearProfile(profileSheetWall); setProfileSheetWall(null); }}
          onClose={() => setProfileSheetWall(null)}
        />
      )}

      {/* Profile — apply all */}
      <IonActionSheet
        isOpen={applyAllOpen}
        header={t('mat.applyAllHeader')}
        buttons={[
          ...profiles.map(p => ({
            text: p.title,
            handler: () => { applyToAll(p); setApplyAllOpen(false); },
          })),
          { text: t('common.cancel'), role: 'cancel' as const },
        ]}
        onDidDismiss={() => setApplyAllOpen(false)}
      />

      {/* Niche picker — 'pcs' niches are added directly here; 'perimeter'
          niches instead send you back to the canvas to draw the wall-to-wall
          line, since their length (not a manual count) is what's priced. */}
      <IonActionSheet
        isOpen={addNicheOpen}
        header={t('mat.addNiche')}
        buttons={[
          ...niches.map(n => ({
            text: `${n.title} — ${n.price.toLocaleString('ru')} ₽/${n.unit === 'pcs' ? t('unit.pcs') : t('unit.m')}`,
            handler: () => {
              setAddNicheOpen(false);
              if (n.unit === 'pcs') addNicheCount(n);
              else router.push(`${backHref}?placeNiche=${n.id}`, 'back');
            },
          })),
          { text: t('common.cancel'), role: 'cancel' as const },
        ]}
        onDidDismiss={() => setAddNicheOpen(false)}
      />

      {/* Accessory picker */}
      <IonActionSheet
        isOpen={addAccessoryOpen}
        header={t('mat.addAccessory')}
        buttons={[
          ...accessories.map(acc => ({
            text: `${acc.title} — ${acc.price.toLocaleString('ru')} ₽/${acc.unit}`,
            handler: () => { addAccessory(acc); setAddAccessoryOpen(false); },
          })),
          { text: t('common.cancel'), role: 'cancel' as const },
        ]}
        onDidDismiss={() => setAddAccessoryOpen(false)}
      />

      {/* Service picker */}
      <IonActionSheet
        isOpen={addServiceOpen}
        header={t('mat.addService')}
        buttons={[
          ...services.map(svc => ({
            text: `${svc.title} — ${svc.price.toLocaleString('ru')} ₽`,
            handler: () => { addService(svc); setAddServiceOpen(false); },
          })),
          { text: t('common.cancel'), role: 'cancel' as const },
        ]}
        onDidDismiss={() => setAddServiceOpen(false)}
      />
    </IonPage>
  );
};

// ── UI helpers ──

const EmptyState: React.FC<{
  icon: string; iconColor: string; iconBg: string;
  text: string; sub: string;
  buttonLabel?: string; buttonColor?: string; onButton?: () => void;
}> = ({ icon, iconColor, iconBg, text, sub, buttonLabel, buttonColor, onButton }) => (
  <div style={{
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: '60px 32px', textAlign: 'center', gap: 12,
  }}>
    <div style={{
      width: 64, height: 64, borderRadius: 20,
      background: iconBg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      marginBottom: 4,
    }}>
      <IonIcon icon={icon} style={{ fontSize: 30, color: iconColor }} />
    </div>
    <div style={{ fontWeight: 700, fontSize: 16, color: '#333' }}>{text}</div>
    <div style={{ fontSize: 13, color: '#aaa', lineHeight: 1.4 }}>{sub}</div>
    {buttonLabel && onButton && (
      <button
        onClick={onButton}
        style={{
          marginTop: 8, padding: '12px 24px', borderRadius: 14,
          background: buttonColor, border: 'none',
          color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 8,
        }}
      >
        <IonIcon icon={addOutline} style={{ fontSize: 18 }} />
        {buttonLabel}
      </button>
    )}
  </div>
);

const Swatch: React.FC<{ color: string; size: number }> = ({ color, size }) => (
  <span style={{
    width: size, height: size, borderRadius: size / 3.5, flexShrink: 0,
    background: color, border: '1px solid rgba(0,0,0,0.15)',
  }} />
);

/** Bottom sheet for picking one wall's profile. */
const ProfileSheet: React.FC<{
  title: string;
  wallM: number;
  profiles: CatalogItem[];
  currentId: string | null;
  onPick: (item: CatalogItem) => void;
  onClear: () => void;
  onClose: () => void;
}> = ({ title, wallM, profiles, currentId, onPick, onClear, onClose }) => {
  const { t } = useT();
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} />
      <div style={{
        position: 'relative', width: '100%', maxHeight: '85%', overflowY: 'auto',
        background: '#fff', borderRadius: '20px 20px 0 0', padding: '10px 16px',
        paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 10 }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: '#ddd' }} />
        </div>
        <div style={{ fontSize: 17, fontWeight: 800 }}>{title}</div>
        <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>{Math.round(wallM * 100)} см</div>
        {profiles.length === 0 ? (
          <div style={{ marginTop: 14 }}><HintText text={t('mat.noProfiles')} /></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
            {profiles.map(p => {
              const on = p.id === currentId;
              return (
                <button
                  key={p.id}
                  onClick={() => onPick(p)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14,
                    border: `1.5px solid ${on ? '#1E88E5' : 'rgba(0,0,0,0.1)'}`,
                    background: on ? 'rgba(30,136,229,0.06)' : 'transparent',
                    cursor: 'pointer', textAlign: 'left', color: 'inherit',
                  }}
                >
                  <Swatch color={p.color} size={18} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{p.title}</div>
                    <div style={{ fontSize: 12, color: '#888' }}>
                      {p.price} ₽/м · {t('prof.wallCost', { sum: Math.round(p.price * wallM + p.priceCorner).toLocaleString('ru') })}
                    </div>
                  </div>
                  {on && <IonIcon icon={checkmarkCircle} style={{ fontSize: 22, color: '#1E88E5' }} />}
                </button>
              );
            })}
          </div>
        )}
        {currentId && (
          <button
            onClick={onClear}
            style={{ marginTop: 10, fontSize: 14, fontWeight: 600, color: '#E53935', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0' }}
          >
            {t('mat.noProfileBtn')}
          </button>
        )}
      </div>
    </div>
  );
};

const HintText: React.FC<{ text: string }> = ({ text }) => (
  <p style={{ fontSize: 13, color: '#c0c0c0', margin: '0 0 8px' }}>{text}</p>
);

const PriceRow: React.FC<{ label: string; value: number; bold?: boolean; primary?: boolean }> = ({ label, value, bold, primary }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
    <span style={{ fontSize: 13, fontWeight: bold ? 600 : 400, color: bold ? '#333' : '#999' }}>{label}</span>
    <span style={{ fontSize: 13, fontWeight: bold ? 700 : 400, color: primary ? '#1E88E5' : '#333' }}>
      {value.toLocaleString('ru')} ₽
    </span>
  </div>
);

export default RoomMaterials;
