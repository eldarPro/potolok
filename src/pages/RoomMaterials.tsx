import React, { useEffect, useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonButton, IonIcon, IonActionSheet, IonAlert,
  IonList, IonItem, IonLabel,
  useIonRouter, useIonViewWillEnter,
} from '@ionic/react';
import {
  chevronBackOutline, checkmarkOutline,
  trashOutline, pencilOutline, addOutline, settingsOutline, ellipsisVerticalOutline,
  layersOutline, reorderThreeOutline, bulbOutline, buildOutline, briefcaseOutline,
} from 'ionicons/icons';
import { useParams } from 'react-router-dom';
import { getProject, upsertProject, loadFabrics, loadProfiles, loadLightings, loadServices, loadAccessories } from '../lib/storage';
import { Project, Room, CatalogItem, RoomProfileSegment, LightingCatalogItem, RoomLightingPath, AdditionalService, Accessory, RoomAccessoryItem, RoomServiceItem } from '../types';
import { edgeLengthM, edgeLabel, polygonArea, polygonPerimeter, pxToMeters, GRID_SIZE } from '../lib/geometry';
import { useT } from '../lib/i18n';

const lightColor = (color: string) => (color === '#ffffff' ? '#ffeb3b' : color);

type Section = 'fabric' | 'profile' | 'lighting' | 'accessories' | 'services';

const SECTION_META: Record<Section, { titleKey: string; icon: string }> = {
  fabric:      { titleKey: 'sec.fabric',       icon: layersOutline },
  profile:     { titleKey: 'sec.profile',      icon: reorderThreeOutline },
  lighting:    { titleKey: 'sec.lighting',     icon: bulbOutline },
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
  const [accessories, setAccessories] = useState<Accessory[]>([]);
  const [services, setServices] = useState<AdditionalService[]>([]);

  const [editingEdge, setEditingEdge] = useState<number | null>(null);
  const [editingSizeEdge, setEditingSizeEdge] = useState<number | null>(null);
  const [splitEdgeIdx, setSplitEdgeIdx] = useState<number | null>(null);
  const [edgeMenuOpen, setEdgeMenuOpen] = useState<number | null>(null);
  const [applyAllOpen, setApplyAllOpen] = useState(false);
  const [addAccessoryOpen, setAddAccessoryOpen] = useState(false);
  const [addServiceOpen, setAddServiceOpen] = useState(false);

  const load = () => {
    const p = getProject(projectId);
    if (!p) return;
    setProject(p);
    setRoom(p.rooms.find(r => r.id === roomId) ?? null);
    setFabrics(loadFabrics());
    setProfiles(loadProfiles());
    setLightings(loadLightings());
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

  // ── Fabric ──
  const selectFabric = (item: CatalogItem) => {
    if (room.fabricId === item.id) updateRoom({ fabricId: null, fabric: null });
    else updateRoom({ fabricId: item.id, fabric: { ...item } });
  };

  // ── Profile ──
  const assignProfile = (edgeIndex: number, item: CatalogItem) => {
    const newSeg: RoomProfileSegment = {
      edgeIndex, profileId: item.id, profile: { ...item },
      lengthM: edgeLengthM(room.points, edgeIndex, room.scale),
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
        lengthM: edgeLengthM(room.points, i, room.scale),
      })),
    });

  const resizeEdge = (edgeIndex: number, newLenM: number) => {
    if (newLenM <= 0) return;
    const n = room.points.length;
    const pts = room.points;
    const a = pts[edgeIndex % n];
    const b = pts[(edgeIndex + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const currentPx = Math.sqrt(dx * dx + dy * dy);
    if (currentPx === 0) return;
    const newPx = (newLenM * GRID_SIZE * 100) / room.scale;
    const ratio = newPx / currentPx;
    const newPts = [...pts];
    newPts[(edgeIndex + 1) % n] = { x: a.x + dx * ratio, y: a.y + dy * ratio };
    const areaPx = polygonArea(newPts);
    const perimPx = polygonPerimeter(newPts);
    const areaSqm = parseFloat((pxToMeters(Math.sqrt(areaPx), room.scale) ** 2).toFixed(2));
    const perimeterM = parseFloat(pxToMeters(perimPx, room.scale).toFixed(2));
    const updatedSegments = (room.profileSegments ?? []).map(s => ({
      ...s, lengthM: edgeLengthM(newPts, s.edgeIndex, room.scale),
    }));
    updateRoom({ points: newPts, areaSqm, perimeterM, profileSegments: updatedSegments });
  };

  const splitEdgeAt = (edgeIndex: number, distM: number) => {
    const n = room.points.length;
    const pts = room.points;
    const a = pts[edgeIndex % n];
    const b = pts[(edgeIndex + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const edgePx = Math.sqrt(dx * dx + dy * dy);
    if (edgePx === 0) return;
    const edgeTotalM = edgeLengthM(pts, edgeIndex, room.scale);
    if (distM <= 0 || distM >= edgeTotalM) return;
    const splitPx = (distM * GRID_SIZE * 100) / room.scale;
    const ratio = splitPx / edgePx;
    const splitPt = { x: a.x + dx * ratio, y: a.y + dy * ratio };
    const newPts = [...pts.slice(0, edgeIndex + 1), splitPt, ...pts.slice(edgeIndex + 1)];
    const existingSegs = room.profileSegments ?? [];
    const profileAtEdge = existingSegs.find(s => s.edgeIndex === edgeIndex);
    const updatedSegs = existingSegs.map(s => {
      const newIdx = s.edgeIndex > edgeIndex ? s.edgeIndex + 1 : s.edgeIndex;
      return { ...s, edgeIndex: newIdx, lengthM: edgeLengthM(newPts, newIdx, room.scale) };
    });
    if (profileAtEdge) {
      updatedSegs.push({
        edgeIndex: edgeIndex + 1,
        profileId: profileAtEdge.profileId,
        profile: { ...profileAtEdge.profile },
        lengthM: edgeLengthM(newPts, edgeIndex + 1, room.scale),
      });
      updatedSegs.sort((a, b) => a.edgeIndex - b.edgeIndex);
    }
    const areaPx = polygonArea(newPts);
    const perimPx = polygonPerimeter(newPts);
    const areaSqm = parseFloat((pxToMeters(Math.sqrt(areaPx), room.scale) ** 2).toFixed(2));
    const perimeterM = parseFloat(pxToMeters(perimPx, room.scale).toFixed(2));
    updateRoom({ points: newPts, areaSqm, perimeterM, profileSegments: updatedSegs });
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
        id: crypto.randomUUID(),
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
        id: crypto.randomUUID(),
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
  const corners = room.points.length;
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

  const fabricTotal = room.fabric ? room.fabric.price * room.areaSqm + room.fabric.priceCorner * corners : 0;
  const profileTotal = Object.values(profileGroups).reduce(
    (s, { profile, totalLengthM, count }) => s + profile.price * totalLengthM + profile.priceCorner * count, 0,
  );
  const lightingTotal = lighting.reduce((s, e) =>
    s + (e.kind === 'point' ? e.catalogItem.price : e.catalogItem.price * (e as RoomLightingPath).lengthM), 0);
  const workerFabric = room.fabric ? room.fabric.priceInstall * room.areaSqm + room.fabric.priceInstallCorner * corners : 0;
  const workerProfile = Object.values(profileGroups).reduce(
    (s, { profile, totalLengthM }) => s + profile.priceInstall * totalLengthM, 0,
  );
  const workerLighting = lighting.reduce((s, e) =>
    s + (e.kind === 'point' ? e.catalogItem.priceInstall : e.catalogItem.priceInstall * (e as RoomLightingPath).lengthM), 0);

  const sectionTotal =
    section === 'fabric' ? fabricTotal :
    section === 'profile' ? profileTotal :
    section === 'lighting' ? lightingTotal :
    section === 'accessories' ? accessoryTotal :
    section === 'services' ? serviceTotal : 0;

  const sectionWorker =
    section === 'fabric' ? workerFabric :
    section === 'profile' ? workerProfile :
    section === 'lighting' ? workerLighting :
    section === 'accessories' ? accessoryInstallTotal :
    section === 'services' ? serviceInstallTotal : 0;

  const showTotalsBar =
    (section === 'fabric' && room.fabric != null && room.areaSqm > 0) ||
    (section === 'profile' && segments.length > 0) ||
    (section === 'lighting' && lighting.length > 0) ||
    (section === 'accessories' && roomAccessories.length > 0) ||
    (section === 'services' && roomServices.length > 0);

  const meta = SECTION_META[section as Section] ?? SECTION_META.fabric;
  const backHref = `/project/${projectId}/room/${roomId}`;

  const fabAction: (() => void) | null =
    (section === 'lighting' && lightings.length > 0) ? () => router.push(`${backHref}?pickLighting=1`, 'back') :
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
          <div style={{ padding: '12px 0 100px' }}>
            {profiles.length > 0 && room.points.length >= 3 && (
              <div style={{ padding: '0 16px 12px', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setApplyAllOpen(true)}
                  style={{
                    fontSize: 13, color: '#1E88E5', fontWeight: 600,
                    background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0',
                  }}
                >
                  {t('mat.applyAll')}
                </button>
              </div>
            )}

            {room.points.length < 3 ? (
              <div style={{ padding: '20px 16px' }}>
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
            ) : profiles.length === 0 ? (
              <div style={{ padding: '20px 16px' }}>
                <HintText text={t('mat.noProfiles')} />
              </div>
            ) : (
              <div style={{ padding: '0 16px' }}>
                <div className="card" style={{ overflow: 'hidden' }}>
                  <IonList style={{ '--background': 'transparent' } as React.CSSProperties}>
                    {room.points.map((_, i) => {
                      const seg = segments.find(s => s.edgeIndex === i);
                      const lenM = edgeLengthM(room.points, i, room.scale);
                      return (
                        <IonItem
                          key={i}
                          button
                          detail={false}
                          lines={i === room.points.length - 1 ? 'none' : 'inset'}
                          onClick={() => setEdgeMenuOpen(i)}
                          style={{ '--background': 'transparent' } as React.CSSProperties}
                        >
                          <IonLabel>
                            <div>
                              <span style={{ fontWeight: 700, fontSize: 14 }}>
                                {t('mat.wall')} {edgeLabel(i, room.points.length)}
                              </span>
                              <span style={{ fontWeight: 400, fontSize: 13, color: '#888', marginLeft: 8 }}>
                                {lenM.toFixed(2)} м
                              </span>
                            </div>
                            {seg ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                <div style={{
                                  width: 10, height: 10, borderRadius: 3,
                                  background: seg.profile.color,
                                  border: '1px solid rgba(0,0,0,0.15)', flexShrink: 0,
                                }} />
                                <span style={{ fontSize: 12, color: '#888' }}>
                                  {seg.profile.title} · {seg.profile.price} ₽/м
                                </span>
                              </div>
                            ) : (
                              <p style={{ fontSize: 12, color: '#FB8C00', fontWeight: 500, margin: '2px 0 0' }}>
                                {t('mat.noProfile')}
                              </p>
                            )}
                          </IonLabel>
                          <IonIcon icon={ellipsisVerticalOutline} slot="end" style={{ fontSize: 20, color: '#999' }} />
                        </IonItem>
                      );
                    })}
                  </IonList>
                </div>
              </div>
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

      {/* Profile picker — single wall */}
      <IonActionSheet
        isOpen={editingEdge !== null}
        header={editingEdge !== null
          ? `${t('mat.wall')} ${edgeLabel(editingEdge, room.points.length)} · ${edgeLengthM(room.points, editingEdge, room.scale).toFixed(2)} м`
          : undefined}
        buttons={[
          ...profiles.map(p => ({
            text: p.title,
            handler: () => {
              if (editingEdge !== null) { assignProfile(editingEdge, p); setEditingEdge(null); }
            },
          })),
          {
            text: t('mat.noProfileBtn'), role: 'destructive' as const,
            handler: () => { if (editingEdge !== null) { clearProfile(editingEdge); setEditingEdge(null); } },
          },
          { text: t('common.cancel'), role: 'cancel' as const },
        ]}
        onDidDismiss={() => setEditingEdge(null)}
      />

      {/* Size editor */}
      <IonAlert
        isOpen={editingSizeEdge !== null}
        header={editingSizeEdge !== null
          ? `${t('mat.wallSize')} ${edgeLabel(editingSizeEdge, room.points.length)}`
          : undefined}
        inputs={[{
          name: 'length',
          type: 'number',
          placeholder: t('mat.lengthM'),
          value: editingSizeEdge !== null
            ? edgeLengthM(room.points, editingSizeEdge, room.scale).toFixed(2)
            : '',
          min: 0.01,
        }]}
        buttons={[
          { text: t('common.cancel'), role: 'cancel' },
          {
            text: t('common.apply'),
            handler: (data: { length: string }) => {
              const val = parseFloat(data.length);
              if (editingSizeEdge !== null && !isNaN(val) && val > 0) {
                resizeEdge(editingSizeEdge, val);
              }
            },
          },
        ]}
        onDidDismiss={() => setEditingSizeEdge(null)}
      />

      {/* Split edge */}
      <IonAlert
        isOpen={splitEdgeIdx !== null}
        header={splitEdgeIdx !== null
          ? `${t('mat.splitWall')} ${edgeLabel(splitEdgeIdx, room.points.length)}`
          : undefined}
        message={splitEdgeIdx !== null
          ? `${t('mat.splitMsg', { len: edgeLengthM(room.points, splitEdgeIdx, room.scale).toFixed(2) })}`
          : undefined}
        inputs={[{
          name: 'dist',
          type: 'number',
          placeholder: t('mat.distM'),
          min: 0.01,
        }]}
        buttons={[
          { text: t('common.cancel'), role: 'cancel' },
          {
            text: t('mat.split'),
            handler: (data: { dist: string }) => {
              const val = parseFloat(data.dist);
              if (splitEdgeIdx !== null && !isNaN(val) && val > 0) {
                splitEdgeAt(splitEdgeIdx, val);
              }
            },
          },
        ]}
        onDidDismiss={() => setSplitEdgeIdx(null)}
      />

      {/* Edge context menu */}
      <IonActionSheet
        isOpen={edgeMenuOpen !== null}
        header={edgeMenuOpen !== null
          ? `${t('mat.wall')} ${edgeLabel(edgeMenuOpen, room.points.length)} · ${edgeLengthM(room.points, edgeMenuOpen, room.scale).toFixed(2)} м`
          : undefined}
        buttons={[
          {
            text: t('mat.changeProfile'),
            handler: () => { const e = edgeMenuOpen; setEdgeMenuOpen(null); setEditingEdge(e); },
          },
          {
            text: t('mat.changeSize'),
            handler: () => { const e = edgeMenuOpen; setEdgeMenuOpen(null); setEditingSizeEdge(e); },
          },
          {
            text: t('mat.split'),
            handler: () => { const e = edgeMenuOpen; setEdgeMenuOpen(null); setSplitEdgeIdx(e); },
          },
          { text: t('common.cancel'), role: 'cancel' as const },
        ]}
        onDidDismiss={() => setEdgeMenuOpen(null)}
      />

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
