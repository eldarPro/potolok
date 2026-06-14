import React, { useEffect, useState, useRef } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonButton, IonIcon, IonSegment,
  IonSegmentButton, IonLabel, IonText, IonRange, IonActionSheet,
  useIonToast,
} from '@ionic/react';
import { chevronBackOutline, checkmarkOutline, chevronForwardOutline, trashOutline } from 'ionicons/icons';
import { useParams } from 'react-router-dom';
import { getProject, upsertProject, loadFabrics, loadProfiles, loadLightings } from '../lib/storage';
import { Project, Room, CatalogItem, RoomProfileSegment, LightingCatalogItem, RoomLightingPoint, RoomLightingPath } from '../types';
import CeilingCanvas from '../components/CeilingCanvas';
import { edgeLengthM, edgeLabel, dist, pxToMeters } from '../lib/geometry';

type Tab = 'draw' | 'materials';

const roomCorners = (r: Room) => r.points.length;

const clientPrice = (r: Room) => {
  const c = roomCorners(r);
  const f = r.fabric ? r.fabric.price * r.areaSqm + r.fabric.priceCorner * c : 0;
  const p = (r.profileSegments ?? []).reduce((s, seg) => s + seg.profile.price * seg.lengthM + seg.profile.priceCorner, 0);
  const l = (r.lighting ?? []).reduce((s, e) => s + (e.kind === 'point' ? e.catalogItem.price : e.catalogItem.price * (e as RoomLightingPath).lengthM), 0);
  return f + p + l;
};

const workerPrice = (r: Room) => {
  const c = roomCorners(r);
  const f = r.fabric ? r.fabric.priceInstall * r.areaSqm + r.fabric.priceInstallCorner * c : 0;
  const p = (r.profileSegments ?? []).reduce((s, seg) => s + seg.profile.priceInstall * seg.lengthM, 0);
  const l = (r.lighting ?? []).reduce((s, e) => s + (e.kind === 'point' ? e.catalogItem.priceInstall : e.catalogItem.priceInstall * (e as RoomLightingPath).lengthM), 0);
  return f + p + l;
};

const lightColor = (color: string) => (color === '#ffffff' ? '#ffeb3b' : color);

const RoomEditor: React.FC = () => {
  const { projectId, roomId } = useParams<{ projectId: string; roomId: string }>();
  const [presentToast] = useIonToast();
  const [project, setProject] = useState<Project | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [tab, setTab] = useState<Tab>('draw');
  const [fabrics, setFabrics] = useState<CatalogItem[]>([]);
  const [profiles, setProfiles] = useState<CatalogItem[]>([]);
  const [lightings, setLightings] = useState<LightingCatalogItem[]>([]);

  // Profile assignment
  const [editingEdge, setEditingEdge] = useState<number | null>(null);
  const [applyAllOpen, setApplyAllOpen] = useState(false);

  // Lighting placement
  const [placingLighting, setPlacingLighting] = useState<LightingCatalogItem | null>(null);
  const [lightingPathPts, setLightingPathPts] = useState<{ x: number; y: number }[]>([]);

  const contentRef = useRef<HTMLIonContentElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const p = getProject(projectId);
    if (!p) return;
    setProject(p);
    setRoom(p.rooms.find(r => r.id === roomId) ?? null);
    setFabrics(loadFabrics());
    setProfiles(loadProfiles());
    setLightings(loadLightings());
  }, [projectId, roomId]);

  useEffect(() => {
    const measure = () => {
      const el = canvasContainerRef.current;
      if (el && el.clientWidth > 0)
        setCanvasSize({ width: el.clientWidth, height: Math.min(el.clientWidth * 0.75, 500) });
    };
    const timer = setTimeout(measure, 300);
    window.addEventListener('resize', measure);
    return () => { clearTimeout(timer); window.removeEventListener('resize', measure); };
  }, []);

  // Clear in-progress path when switching lighting item
  useEffect(() => { setLightingPathPts([]); }, [placingLighting?.id]);

  if (!project || !room) return null;

  const updateRoom = (partial: Partial<Room>) => {
    let updated: Room = { ...room, ...partial };

    if (partial.points !== undefined) {
      const pts = partial.points;
      if (pts.length < 3) {
        updated.profileSegments = [];
      } else {
        const existing = updated.profileSegments ?? [];
        if (existing.length === 0) {
          const def = profiles.find(p => p.isDefault) ?? profiles[0] ?? null;
          if (def) {
            updated.profileSegments = pts.map((_, i) => ({
              edgeIndex: i, profileId: def.id, profile: { ...def },
              lengthM: edgeLengthM(pts, i, updated.scale),
            }));
          }
        } else {
          updated.profileSegments = existing
            .filter(s => s.edgeIndex < pts.length)
            .map(s => ({ ...s, lengthM: edgeLengthM(pts, s.edgeIndex, updated.scale) }));
        }
      }
    }

    if (partial.scale !== undefined && updated.points.length >= 3) {
      updated.profileSegments = (updated.profileSegments ?? []).map(s => ({
        ...s, lengthM: edgeLengthM(updated.points, s.edgeIndex, partial.scale!),
      }));
    }

    setRoom(updated);
    const proj = { ...project, rooms: project.rooms.map(r => r.id === roomId ? updated : r), updatedAt: new Date().toISOString() };
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

  // ── Lighting ──
  const handleLightingTap = (pt: { x: number; y: number }) => {
    if (!placingLighting) return;

    if (placingLighting.placement === 'point') {
      const newEl: RoomLightingPoint = {
        id: crypto.randomUUID(), kind: 'point',
        catalogItemId: placingLighting.id, catalogItem: { ...placingLighting },
        x: pt.x, y: pt.y,
      };
      updateRoom({ lighting: [...(room.lighting ?? []), newEl] });
    } else {
      setLightingPathPts(prev => [...prev, pt]);
    }
  };

  const finishLightingPath = () => {
    if (!placingLighting || lightingPathPts.length < 2) return;
    let totalPx = 0;
    for (let i = 0; i < lightingPathPts.length - 1; i++)
      totalPx += dist(lightingPathPts[i], lightingPathPts[i + 1]);
    const lengthM = pxToMeters(totalPx, room.scale);
    const newEl: RoomLightingPath = {
      id: crypto.randomUUID(), kind: 'path',
      catalogItemId: placingLighting.id, catalogItem: { ...placingLighting },
      points: lightingPathPts, lengthM,
    };
    updateRoom({ lighting: [...(room.lighting ?? []), newEl] });
    setLightingPathPts([]);
  };

  const deleteElement = (id: string) =>
    updateRoom({ lighting: (room.lighting ?? []).filter(e => e.id !== id) });

  // ── Derived ──
  const corners = roomCorners(room);
  const client = clientPrice(room);
  const worker = workerPrice(room);
  const segments = room.profileSegments ?? [];
  const lighting = room.lighting ?? [];

  const profileGroups = segments.reduce((acc, seg) => {
    if (!acc[seg.profileId]) acc[seg.profileId] = { profile: seg.profile, totalLengthM: 0, count: 0 };
    acc[seg.profileId].totalLengthM += seg.lengthM;
    acc[seg.profileId].count += 1;
    return acc;
  }, {} as Record<string, { profile: CatalogItem; totalLengthM: number; count: number }>);

  // Group lighting for display
  const lightingGroups = lighting.reduce((acc, e) => {
    const key = e.catalogItemId;
    if (!acc[key]) acc[key] = { item: e.catalogItem, elements: [] };
    acc[key].elements.push(e);
    return acc;
  }, {} as Record<string, { item: LightingCatalogItem; elements: typeof lighting }>);

  const lightingClientTotal = lighting.reduce((s, e) =>
    s + (e.kind === 'point' ? e.catalogItem.price : e.catalogItem.price * (e as RoomLightingPath).lengthM), 0);
  const lightingWorkerTotal = lighting.reduce((s, e) =>
    s + (e.kind === 'point' ? e.catalogItem.priceInstall : e.catalogItem.priceInstall * (e as RoomLightingPath).lengthM), 0);

  const pointLightings = lightings.filter(l => l.placement === 'point');
  const pathLightings = lightings.filter(l => l.placement === 'path');

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton text="" icon={chevronBackOutline} defaultHref={`/project/${projectId}`} />
          </IonButtons>
          <IonTitle>{room.name}</IonTitle>
          <IonButtons slot="end">
            <IonButton routerLink={`/project/${projectId}`} routerDirection="back">
              <IonIcon slot="icon-only" icon={checkmarkOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent ref={contentRef} scrollY={tab !== 'draw'}>
        <IonSegment
          value={tab}
          onIonChange={e => { setTab(e.detail.value as Tab); setPlacingLighting(null); }}
          style={{ padding: '8px 16px' }}
        >
          <IonSegmentButton value="draw"><IonLabel>Чертёж</IonLabel></IonSegmentButton>
          <IonSegmentButton value="materials"><IonLabel>Материалы</IonLabel></IonSegmentButton>
        </IonSegment>

        {/* ════ ЧЕРТЁЖ ════ */}
        {tab === 'draw' && (
          <div style={{ padding: '0 12px 12px' }}>
            <div ref={canvasContainerRef} style={{ width: '100%' }}>
              {canvasSize.width > 0 && (
                <CeilingCanvas
                  room={room}
                  onChange={updateRoom}
                  width={canvasSize.width}
                  height={canvasSize.height}
                  placingLighting={placingLighting}
                  inProgressLightingPath={lightingPathPts}
                  onLightingTap={handleLightingTap}
                  onOutOfBounds={() => presentToast({
                    message: 'Нельзя разместить за пределами помещения',
                    duration: 1500,
                    position: 'bottom',
                    color: 'danger',
                  })}
                />
              )}
            </div>

            {/* Lighting selector strip */}
            {room.areaSqm > 0 && lightings.length > 0 && (
              <div style={{ marginTop: 8, padding: '8px 0' }}>
                <div style={{ marginBottom: 6 }}>
                  <IonText color="medium"><small style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Разместить освещение</small></IonText>
                </div>
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                  {lightings.map(l => {
                    const active = placingLighting?.id === l.id;
                    return (
                      <button
                        key={l.id}
                        onClick={() => setPlacingLighting(active ? null : l)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '6px 12px', borderRadius: 20, cursor: 'pointer',
                          border: active ? `2px solid var(--ion-color-primary)` : '2px solid var(--ion-border-color, #e0e0e0)',
                          background: active ? 'var(--ion-color-primary)' : 'var(--ion-color-light)',
                          color: active ? '#fff' : 'var(--ion-text-color)',
                          whiteSpace: 'nowrap', flexShrink: 0, transition: 'all 0.15s',
                        }}
                      >
                        <span style={{ fontSize: 16 }}>{l.symbol}</span>
                        <span style={{ fontSize: 12 }}>{l.title}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Path controls */}
                {placingLighting?.placement === 'path' && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                    {lightingPathPts.length >= 2 && (
                      <IonButton size="small" onClick={finishLightingPath}>Готово</IonButton>
                    )}
                    {lightingPathPts.length > 0 && (
                      <IonButton size="small" fill="outline" color="medium" onClick={() => setLightingPathPts([])}>
                        Сбросить точки
                      </IonButton>
                    )}
                    <IonText color="medium">
                      <small>{lightingPathPts.length} точек</small>
                    </IonText>
                  </div>
                )}
              </div>
            )}

            {/* Scale slider */}
            <div style={{ marginTop: 8, padding: '0 4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <IonText color="medium"><small>Масштаб: 1 клетка = {room.scale} см</small></IonText>
                <IonText color="primary"><small>{room.scale} см</small></IonText>
              </div>
              <IonRange min={10} max={200} step={10} value={room.scale} onIonChange={e => updateRoom({ scale: e.detail.value as number })} color="primary" />
              <IonText color="medium" style={{ fontSize: 11 }}>
                <small>Задайте масштаб ДО начала чертежа</small>
              </IonText>
            </div>

            {room.areaSqm > 0 && (
              <div style={{ padding: '12px 16px', background: 'var(--ion-color-light)', borderRadius: 12, margin: '12px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <IonText color="medium"><small>Площадь полотна</small></IonText>
                  <IonText><b>{room.areaSqm.toFixed(2)} м²</b></IonText>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <IonText color="medium"><small>Периметр (профиль)</small></IonText>
                  <IonText><b>{room.perimeterM.toFixed(2)} м</b></IonText>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <IonText color="medium"><small>Углов</small></IonText>
                  <IonText><b>{corners}</b></IonText>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════ МАТЕРИАЛЫ ════ */}
        {tab === 'materials' && (
          <div style={{ padding: '0 12px 24px' }}>

            {/* Полотно */}
            <SectionHeader title="Полотно" />
            {fabrics.length === 0 ? (
              <EmptyHint text="Нет позиций — добавьте в Ценники → Полотна" />
            ) : fabrics.map(item => (
              <div
                key={item.id}
                onClick={() => selectFabric(item)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '12px 16px', marginBottom: 8, borderRadius: 14,
                  border: room.fabricId === item.id ? '2px solid var(--ion-color-primary)' : '2px solid transparent',
                  background: room.fabricId === item.id ? 'rgba(56,128,255,0.08)' : 'var(--ion-color-light)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ width: 40, height: 40, borderRadius: 8, background: item.color, border: '1px solid rgba(0,0,0,0.1)', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>{item.title}</div>
                  <IonText color="medium"><small>{item.price} ₽/м² · угол {item.priceCorner} ₽</small></IonText>
                </div>
                {room.fabricId === item.id && <IonIcon icon={checkmarkOutline} color="primary" />}
              </div>
            ))}

            {/* Профиль */}
            <div style={{ padding: '12px 4px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <IonText color="medium"><small style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Профиль по стенам</small></IonText>
              {profiles.length > 0 && room.points.length >= 3 && (
                <IonButton fill="clear" size="small" onClick={() => setApplyAllOpen(true)} style={{ margin: 0, height: 'auto' }}>
                  <small>Применить ко всем</small>
                </IonButton>
              )}
            </div>

            {room.points.length < 3 ? (
              <EmptyHint text="Сначала нарисуйте чертёж помещения" />
            ) : profiles.length === 0 ? (
              <EmptyHint text="Нет позиций — добавьте в Ценники → Профили" />
            ) : room.points.map((_, i) => {
              const seg = segments.find(s => s.edgeIndex === i);
              const lenM = edgeLengthM(room.points, i, room.scale);
              return (
                <div key={i} onClick={() => setEditingEdge(i)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', marginBottom: 8, borderRadius: 14, background: 'var(--ion-color-light)', cursor: 'pointer' }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>Стена {edgeLabel(i, room.points.length)} · {lenM.toFixed(2)} м</div>
                    {seg ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 2, background: seg.profile.color, border: '1px solid rgba(0,0,0,0.15)', flexShrink: 0 }} />
                        <IonText color="medium"><small>{seg.profile.title} · {seg.profile.price} ₽/м</small></IonText>
                      </div>
                    ) : (
                      <IonText color="warning"><small>Профиль не выбран</small></IonText>
                    )}
                  </div>
                  <IonIcon icon={chevronForwardOutline} color="medium" />
                </div>
              );
            })}

            {/* Итого по полотну и профилям */}
            {room.areaSqm > 0 && (room.fabric || segments.length > 0) && (
              <div style={{ padding: 16, background: 'var(--ion-color-light)', borderRadius: 12, marginTop: 8 }}>
                {room.fabric && (
                  <>
                    <PriceRow label={`Полотно (${room.areaSqm.toFixed(2)} м²)`} value={Math.round(room.fabric.price * room.areaSqm)} />
                    {corners > 0 && <PriceRow label={`Углы × ${corners}`} value={Math.round(room.fabric.priceCorner * corners)} />}
                  </>
                )}
                {Object.values(profileGroups).map(({ profile, totalLengthM, count }) => (
                  <PriceRow key={profile.id} label={`${profile.title} (${totalLengthM.toFixed(2)} м, ${count} угл.)`} value={Math.round(profile.price * totalLengthM + profile.priceCorner * count)} />
                ))}
                <div style={{ borderTop: '1px solid var(--ion-border-color)', marginTop: 8, paddingTop: 8 }}>
                  <PriceRow label="Итого клиенту" value={Math.round(client)} bold primary />
                  {worker > 0 && <PriceRow label="Зарплата бригаде" value={Math.round(worker)} bold />}
                </div>
              </div>
            )}

            {/* ── Освещение ── */}
            <SectionHeader title="Освещение" />
            {lighting.length === 0 ? (
              <EmptyHint text="Нет размещённых элементов — перейдите в «Чертёж»" />
            ) : (
              <>
                {/* Point elements */}
                {lighting.filter(e => e.kind === 'point').length > 0 && (
                  <>
                    <SectionHeader title="Точечные" />
                    {Object.values(lightingGroups)
                      .filter(g => g.item.placement === 'point')
                      .map(({ item, elements }) => (
                        <div key={item.id} style={{ background: 'var(--ion-color-light)', borderRadius: 14, marginBottom: 10, overflow: 'hidden' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--ion-border-color)' }}>
                            <span style={{ fontSize: 22, color: lightColor(item.color), lineHeight: 1 }}>{item.symbol}</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 600 }}>{item.title}</div>
                              <IonText color="medium"><small>{elements.length} шт · {item.price} ₽/шт = {Math.round(elements.length * item.price).toLocaleString('ru')} ₽</small></IonText>
                            </div>
                          </div>
                          {elements.map((el, idx) => (
                            <div key={el.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', borderBottom: idx < elements.length - 1 ? '1px solid var(--ion-border-color)' : 'none' }}>
                              <IonText color="medium"><small>Точка {idx + 1}</small></IonText>
                              <IonButton fill="clear" color="danger" size="small" onClick={() => deleteElement(el.id)}>
                                <IonIcon slot="icon-only" icon={trashOutline} style={{ fontSize: 16 }} />
                              </IonButton>
                            </div>
                          ))}
                        </div>
                      ))
                    }
                  </>
                )}

                {/* Path elements */}
                {lighting.filter(e => e.kind === 'path').length > 0 && (
                  <>
                    <SectionHeader title="Линейные" />
                    {Object.values(lightingGroups)
                      .filter(g => g.item.placement === 'path')
                      .map(({ item, elements }) => {
                        const totalLen = elements.reduce((s, e) => s + (e as RoomLightingPath).lengthM, 0);
                        return (
                          <div key={item.id} style={{ background: 'var(--ion-color-light)', borderRadius: 14, marginBottom: 10, overflow: 'hidden' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--ion-border-color)' }}>
                              <div style={{ width: 28, height: 4, borderRadius: 2, background: lightColor(item.color), flexShrink: 0 }} />
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600 }}>{item.title}</div>
                                <IonText color="medium"><small>{totalLen.toFixed(2)} м · {item.price} ₽/м = {Math.round(totalLen * item.price).toLocaleString('ru')} ₽</small></IonText>
                              </div>
                            </div>
                            {elements.map((el, idx) => {
                              const path = el as RoomLightingPath;
                              return (
                                <div key={el.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', borderBottom: idx < elements.length - 1 ? '1px solid var(--ion-border-color)' : 'none' }}>
                                  <IonText color="medium"><small>Линия {idx + 1} · {path.lengthM.toFixed(2)} м</small></IonText>
                                  <IonButton fill="clear" color="danger" size="small" onClick={() => deleteElement(el.id)}>
                                    <IonIcon slot="icon-only" icon={trashOutline} style={{ fontSize: 16 }} />
                                  </IonButton>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })
                    }
                  </>
                )}

                {/* Итого по освещению */}
                <div style={{ padding: 16, background: 'var(--ion-color-light)', borderRadius: 12, marginTop: 4 }}>
                  <PriceRow label="Освещение клиенту" value={Math.round(lightingClientTotal)} bold primary />
                  {lightingWorkerTotal > 0 && <PriceRow label="Зарплата за освещение" value={Math.round(lightingWorkerTotal)} bold />}
                </div>
              </>
            )}
          </div>
        )}
      </IonContent>

      {/* Profile picker — single wall */}
      <IonActionSheet
        isOpen={editingEdge !== null}
        header={editingEdge !== null ? `Стена ${edgeLabel(editingEdge, room.points.length)} · ${edgeLengthM(room.points, editingEdge, room.scale).toFixed(2)} м` : undefined}
        buttons={[
          ...profiles.map(p => ({
            text: p.title,
            handler: () => { if (editingEdge !== null) { assignProfile(editingEdge, p); setEditingEdge(null); } },
          })),
          { text: 'Без профиля', role: 'destructive' as const, handler: () => { if (editingEdge !== null) { clearProfile(editingEdge); setEditingEdge(null); } } },
          { text: 'Отмена', role: 'cancel' as const },
        ]}
        onDidDismiss={() => setEditingEdge(null)}
      />

      {/* Profile — apply all */}
      <IonActionSheet
        isOpen={applyAllOpen}
        header="Применить ко всем стенам"
        buttons={[
          ...profiles.map(p => ({ text: p.title, handler: () => { applyToAll(p); setApplyAllOpen(false); } })),
          { text: 'Отмена', role: 'cancel' as const },
        ]}
        onDidDismiss={() => setApplyAllOpen(false)}
      />
    </IonPage>
  );
};

// ── Shared UI helpers ──

const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
  <div style={{ padding: '12px 4px 6px' }}>
    <IonText color="medium">
      <small style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</small>
    </IonText>
  </div>
);

const EmptyHint: React.FC<{ text: string }> = ({ text }) => (
  <IonText color="medium"><small>{text}</small></IonText>
);

const PriceRow: React.FC<{ label: string; value: number; bold?: boolean; primary?: boolean }> = ({ label, value, bold, primary }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
    <IonText color={bold ? undefined : 'medium'}><span style={{ fontSize: 13, fontWeight: bold ? 600 : 400 }}>{label}</span></IonText>
    <IonText color={primary ? 'primary' : undefined}><span style={{ fontSize: 13, fontWeight: bold ? 600 : 400 }}>{value.toLocaleString('ru')} ₽</span></IonText>
  </div>
);

export default RoomEditor;
