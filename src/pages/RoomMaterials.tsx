import React, { useEffect, useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonButton, IonIcon, IonActionSheet,
  useIonRouter, useIonViewWillEnter,
} from '@ionic/react';
import {
  chevronBackOutline, checkmarkOutline,
  trashOutline, pencilOutline, addOutline,
  layersOutline, reorderThreeOutline, bulbOutline, buildOutline, briefcaseOutline,
} from 'ionicons/icons';
import { useParams } from 'react-router-dom';
import { getProject, upsertProject, loadFabrics, loadProfiles, loadLightings, loadServices, loadAccessories } from '../lib/storage';
import { Project, Room, CatalogItem, RoomProfileSegment, LightingCatalogItem, RoomLightingPath, AdditionalService, Accessory, RoomAccessoryItem, RoomServiceItem } from '../types';
import { edgeLengthM, edgeLabel } from '../lib/geometry';

const lightColor = (color: string) => (color === '#ffffff' ? '#ffeb3b' : color);

type Section = 'fabric' | 'profile' | 'lighting' | 'accessories' | 'services';

const SECTION_META: Record<Section, { title: string; icon: string }> = {
  fabric:      { title: 'Полотна',        icon: layersOutline },
  profile:     { title: 'Профили',         icon: reorderThreeOutline },
  lighting:    { title: 'Освещение',       icon: bulbOutline },
  accessories: { title: 'Комплектующие',   icon: buildOutline },
  services:    { title: 'Доп. услуги',     icon: briefcaseOutline },
};

const RoomMaterials: React.FC = () => {
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

  const meta = SECTION_META[section as Section] ?? SECTION_META.fabric;
  const backHref = `/project/${projectId}/room/${roomId}`;

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton text="" icon={chevronBackOutline} defaultHref={backHref} />
          </IonButtons>
          <IonTitle>{meta.title}</IonTitle>
          <IonButtons slot="end">
            {section === 'accessories' ? (
              <IonButton onClick={() => setAddAccessoryOpen(true)} disabled={accessories.length === 0}>
                <IonIcon slot="icon-only" icon={addOutline} />
              </IonButton>
            ) : section === 'services' ? (
              <IonButton onClick={() => setAddServiceOpen(true)} disabled={services.length === 0}>
                <IonIcon slot="icon-only" icon={addOutline} />
              </IonButton>
            ) : section === 'lighting' ? (
              <IonButton onClick={() => router.push(`${backHref}?pickLighting=1`, 'back')}>
                <IonIcon slot="icon-only" icon={addOutline} />
              </IonButton>
            ) : (
              <IonButton routerLink={backHref} routerDirection="back">
                <IonIcon slot="icon-only" icon={checkmarkOutline} />
              </IonButton>
            )}
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent>

        {/* ═══ ПОЛОТНО ═══ */}
        {section === 'fabric' && (
          <div style={{ padding: '12px 0 36px' }}>
            {fabrics.length === 0 ? (
              <div style={{ padding: '20px 16px' }}>
                <HintText text="Нет позиций — добавьте в Ценники → Полотна" />
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

                {room.fabric && room.areaSqm > 0 && (
                  <div style={{
                    margin: '8px 0', padding: '12px 14px',
                    background: '#F0F4FF', borderRadius: 12,
                  }}>
                    <PriceRow label={`${room.fabric.title} · ${room.areaSqm.toFixed(2)} м²`} value={Math.round(room.fabric.price * room.areaSqm)} />
                    {corners > 0 && <PriceRow label={`Углы × ${corners}`} value={Math.round(room.fabric.priceCorner * corners)} />}
                    <div style={{ borderTop: '1px solid #D8E4FF', margin: '8px 0' }} />
                    <PriceRow label="Стоимость полотна" value={Math.round(fabricTotal)} bold primary />
                    {workerFabric > 0 && <PriceRow label="Монтаж" value={Math.round(workerFabric)} />}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══ ПРОФИЛЬ ═══ */}
        {section === 'profile' && (
          <div style={{ padding: '12px 0 36px' }}>
            {profiles.length > 0 && room.points.length >= 3 && (
              <div style={{ padding: '0 16px 12px', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setApplyAllOpen(true)}
                  style={{
                    fontSize: 13, color: '#1E88E5', fontWeight: 600,
                    background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0',
                  }}
                >
                  Применить ко всем
                </button>
              </div>
            )}

            {room.points.length < 3 ? (
              <div style={{ padding: '20px 16px' }}>
                <HintText text="Сначала нарисуйте чертёж помещения" />
                <button
                  onClick={() => router.push(backHref, 'back')}
                  style={{
                    marginTop: 8, padding: '10px 18px', borderRadius: 12,
                    border: '1.5px solid #1E88E5', background: 'transparent',
                    color: '#1E88E5', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Открыть чертёж →
                </button>
              </div>
            ) : profiles.length === 0 ? (
              <div style={{ padding: '20px 16px' }}>
                <HintText text="Нет позиций — добавьте в Ценники → Профили" />
              </div>
            ) : (
              <div style={{ padding: '0 16px' }}>
                {room.points.map((_, i) => {
                  const seg = segments.find(s => s.edgeIndex === i);
                  const lenM = edgeLengthM(room.points, i, room.scale);
                  return (
                    <button
                      key={i}
                      onClick={() => setEditingEdge(i)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                        padding: '13px 16px', marginBottom: 8, borderRadius: 16,
                        background: '#fff', border: 'none', cursor: 'pointer', textAlign: 'left',
                        boxShadow: '0 1px 6px rgba(0,0,0,0.07)',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
                          Стена {edgeLabel(i, room.points.length)} · {lenM.toFixed(2)} м
                        </div>
                        {seg ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
                          <span style={{ fontSize: 12, color: '#FB8C00', fontWeight: 500 }}>
                            Профиль не выбран
                          </span>
                        )}
                      </div>
                      <IonIcon icon={pencilOutline} color="medium" style={{ fontSize: 16, flexShrink: 0 }} />
                    </button>
                  );
                })}

                {segments.length > 0 && (
                  <div style={{ margin: '8px 0', padding: '12px 14px', background: '#F0F4FF', borderRadius: 12 }}>
                    {Object.values(profileGroups).map(({ profile, totalLengthM, count }) => (
                      <PriceRow
                        key={profile.id}
                        label={`${profile.title} · ${totalLengthM.toFixed(2)} м`}
                        value={Math.round(profile.price * totalLengthM + profile.priceCorner * count)}
                      />
                    ))}
                    <div style={{ borderTop: '1px solid #D8E4FF', margin: '8px 0' }} />
                    <PriceRow label="Стоимость профиля" value={Math.round(profileTotal)} bold primary />
                    {workerProfile > 0 && <PriceRow label="Монтаж" value={Math.round(workerProfile)} />}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══ ОСВЕЩЕНИЕ ═══ */}
        {section === 'lighting' && (
          lighting.length === 0 ? (
            <EmptyState
              icon={bulbOutline}
              iconColor="#F9A825"
              iconBg="#FFFDE7"
              text="Нет добавленных позиций"
              sub="Разместите элементы освещения на чертеже помещения"
              buttonLabel="Открыть чертёж"
              buttonColor="#1E88E5"
              onButton={() => router.push(`${backHref}?pickLighting=1`, 'back')}
            />
          ) : (
            <div style={{ padding: '12px 16px 36px' }}>
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
                            ? `${totalLen.toFixed(2)} м · ${item.price} ₽/м = ${Math.round(total).toLocaleString('ru')} ₽`
                            : `${elements.length} шт · ${item.price} ₽/шт = ${Math.round(total).toLocaleString('ru')} ₽`
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
                            ? `Линия ${idx + 1} · ${(el as RoomLightingPath).lengthM.toFixed(2)} м`
                            : `Точка ${idx + 1}`
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

              <div style={{ margin: '8px 0 12px', padding: '12px 14px', background: '#F0F4FF', borderRadius: 12 }}>
                <PriceRow label="Стоимость освещения" value={Math.round(lightingTotal)} bold primary />
                {workerLighting > 0 && <PriceRow label="Монтаж" value={Math.round(workerLighting)} />}
              </div>

              <button
                onClick={() => router.push(`${backHref}?pickLighting=1`, 'back')}
                style={{
                  width: '100%', padding: '13px', borderRadius: 16,
                  background: '#fff', border: '2px dashed #1E88E5',
                  color: '#1E88E5', fontWeight: 600, fontSize: 15,
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <IonIcon icon={addOutline} style={{ fontSize: 20 }} />
                Разместить ещё на чертеже
              </button>
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
              text="Нет комплектующих в ценнике"
              sub="Добавьте позиции в Ценники → Комплектующие"
              buttonLabel="Открыть ценники"
              buttonColor="#2E7D32"
              onButton={() => router.push('/tabs/price-list')}
            />
          ) : roomAccessories.length === 0 ? (
            <EmptyState
              icon={buildOutline}
              iconColor="#2E7D32"
              iconBg="#E8F5E9"
              text="Нет добавленных позиций"
              sub="Нажмите кнопку, чтобы добавить позиции к помещению"
              buttonLabel="Добавить комплектующее"
              buttonColor="#2E7D32"
              onButton={() => setAddAccessoryOpen(true)}
            />
          ) : (
            <div style={{ padding: '12px 16px 36px' }}>
              {roomAccessories.map(item => (
                <div key={item.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px', marginBottom: 8, borderRadius: 16,
                  background: '#fff', boxShadow: '0 1px 6px rgba(0,0,0,0.07)',
                }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 11,
                    background: '#E8F5E9',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <IonIcon icon={buildOutline} style={{ fontSize: 18, color: '#2E7D32' }} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{item.accessory.title}</div>
                    <div style={{ fontSize: 12, color: '#999' }}>
                      {item.accessory.price.toLocaleString('ru')} ₽/{item.accessory.unit}
                      {' · итого '}
                      <span style={{ color: '#2E7D32', fontWeight: 600 }}>
                        {(item.accessory.price * item.quantity).toLocaleString('ru')} ₽
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
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
                        border: '1.5px solid #2E7D32', background: '#E8F5E9',
                        fontSize: 18, lineHeight: 1, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#2E7D32',
                      }}
                    >+</button>
                  </div>

                  <button
                    onClick={() => removeAccessory(item.id)}
                    style={{
                      background: 'none', border: 'none', padding: '4px 0 4px 4px',
                      cursor: 'pointer', color: '#E53935', flexShrink: 0,
                    }}
                  >
                    <IonIcon icon={trashOutline} style={{ fontSize: 18, display: 'block' }} />
                  </button>
                </div>
              ))}

              <div style={{ padding: '10px 14px', background: '#F0F4FF', borderRadius: 12, marginBottom: 12 }}>
                <PriceRow label="Стоимость комплектующих" value={Math.round(accessoryTotal)} bold primary />
                {accessoryInstallTotal > 0 && (
                  <PriceRow label="Монтаж" value={Math.round(accessoryInstallTotal)} />
                )}
              </div>

              <button
                onClick={() => setAddAccessoryOpen(true)}
                style={{
                  width: '100%', padding: '13px', borderRadius: 16,
                  background: '#fff', border: '2px dashed #2E7D32',
                  color: '#2E7D32', fontWeight: 600, fontSize: 15,
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <IonIcon icon={addOutline} style={{ fontSize: 20 }} />
                Добавить комплектующее
              </button>
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
              text="Нет услуг в ценнике"
              sub="Добавьте позиции в Ценники → Доп. услуги"
              buttonLabel="Открыть ценники"
              buttonColor="#1E88E5"
              onButton={() => router.push('/tabs/price-list')}
            />
          ) : roomServices.length === 0 ? (
            <EmptyState
              icon={briefcaseOutline}
              iconColor="#C62828"
              iconBg="#FFF0F0"
              text="Нет добавленных позиций"
              sub="Нажмите кнопку, чтобы добавить услуги к помещению"
              buttonLabel="Добавить услугу"
              buttonColor="#C62828"
              onButton={() => setAddServiceOpen(true)}
            />
          ) : (
            <div style={{ padding: '12px 16px 36px' }}>
              {roomServices.map(item => (
                <div key={item.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px', marginBottom: 8, borderRadius: 16,
                  background: '#fff', boxShadow: '0 1px 6px rgba(0,0,0,0.07)',
                }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 11,
                    background: '#FFF0F0',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <IonIcon icon={briefcaseOutline} style={{ fontSize: 18, color: '#C62828' }} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{item.service.title}</div>
                    {item.service.description && (
                      <div style={{ fontSize: 11, color: '#bbb', marginBottom: 2 }}>{item.service.description}</div>
                    )}
                    <div style={{ fontSize: 12, color: '#999' }}>
                      {item.service.price.toLocaleString('ru')} ₽
                      {' · итого '}
                      <span style={{ color: '#C62828', fontWeight: 600 }}>
                        {(item.service.price * item.quantity).toLocaleString('ru')} ₽
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
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
                  </div>

                  <button
                    onClick={() => removeService(item.id)}
                    style={{
                      background: 'none', border: 'none', padding: '4px 0 4px 4px',
                      cursor: 'pointer', color: '#E53935', flexShrink: 0,
                    }}
                  >
                    <IonIcon icon={trashOutline} style={{ fontSize: 18, display: 'block' }} />
                  </button>
                </div>
              ))}

              <div style={{ padding: '10px 14px', background: '#F0F4FF', borderRadius: 12, marginBottom: 12 }}>
                <PriceRow label="Стоимость доп. услуг" value={Math.round(serviceTotal)} bold primary />
                {serviceInstallTotal > 0 && (
                  <PriceRow label="Монтаж" value={Math.round(serviceInstallTotal)} />
                )}
              </div>

              <button
                onClick={() => setAddServiceOpen(true)}
                style={{
                  width: '100%', padding: '13px', borderRadius: 16,
                  background: '#fff', border: '2px dashed #C62828',
                  color: '#C62828', fontWeight: 600, fontSize: 15,
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <IonIcon icon={addOutline} style={{ fontSize: 20 }} />
                Добавить услугу
              </button>
            </div>
          )
        )}

      </IonContent>

      {/* Profile picker — single wall */}
      <IonActionSheet
        isOpen={editingEdge !== null}
        header={editingEdge !== null
          ? `Стена ${edgeLabel(editingEdge, room.points.length)} · ${edgeLengthM(room.points, editingEdge, room.scale).toFixed(2)} м`
          : undefined}
        buttons={[
          ...profiles.map(p => ({
            text: p.title,
            handler: () => {
              if (editingEdge !== null) { assignProfile(editingEdge, p); setEditingEdge(null); }
            },
          })),
          {
            text: 'Без профиля', role: 'destructive' as const,
            handler: () => { if (editingEdge !== null) { clearProfile(editingEdge); setEditingEdge(null); } },
          },
          { text: 'Отмена', role: 'cancel' as const },
        ]}
        onDidDismiss={() => setEditingEdge(null)}
      />

      {/* Profile — apply all */}
      <IonActionSheet
        isOpen={applyAllOpen}
        header="Применить ко всем стенам"
        buttons={[
          ...profiles.map(p => ({
            text: p.title,
            handler: () => { applyToAll(p); setApplyAllOpen(false); },
          })),
          { text: 'Отмена', role: 'cancel' as const },
        ]}
        onDidDismiss={() => setApplyAllOpen(false)}
      />

      {/* Accessory picker */}
      <IonActionSheet
        isOpen={addAccessoryOpen}
        header="Добавить комплектующее"
        buttons={[
          ...accessories.map(acc => ({
            text: `${acc.title} — ${acc.price.toLocaleString('ru')} ₽/${acc.unit}`,
            handler: () => { addAccessory(acc); setAddAccessoryOpen(false); },
          })),
          { text: 'Отмена', role: 'cancel' as const },
        ]}
        onDidDismiss={() => setAddAccessoryOpen(false)}
      />

      {/* Service picker */}
      <IonActionSheet
        isOpen={addServiceOpen}
        header="Добавить услугу"
        buttons={[
          ...services.map(svc => ({
            text: `${svc.title} — ${svc.price.toLocaleString('ru')} ₽`,
            handler: () => { addService(svc); setAddServiceOpen(false); },
          })),
          { text: 'Отмена', role: 'cancel' as const },
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
  buttonLabel: string; buttonColor: string; onButton: () => void;
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
