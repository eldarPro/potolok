import React, { useEffect, useState, useRef } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonButton, IonIcon, IonSegment,
  IonSegmentButton, IonLabel, IonText, IonRange, IonActionSheet,
} from '@ionic/react';
import { chevronBackOutline, checkmarkOutline, chevronForwardOutline } from 'ionicons/icons';
import { useParams } from 'react-router-dom';
import { getProject, upsertProject, loadFabrics, loadProfiles } from '../lib/storage';
import { Project, Room, CatalogItem, RoomProfileSegment } from '../types';
import CeilingCanvas from '../components/CeilingCanvas';
import { edgeLengthM, edgeLabel } from '../lib/geometry';

type Tab = 'draw' | 'materials';

const roomCorners = (room: Room) => room.points.length;

const clientPrice = (room: Room) => {
  const corners = roomCorners(room);
  const f = room.fabric ? room.fabric.price * room.areaSqm + room.fabric.priceCorner * corners : 0;
  const p = (room.profileSegments ?? []).reduce(
    (sum, seg) => sum + seg.profile.price * seg.lengthM + seg.profile.priceCorner,
    0,
  );
  return f + p;
};

const workerPrice = (room: Room) => {
  const corners = roomCorners(room);
  const f = room.fabric ? room.fabric.priceInstall * room.areaSqm + room.fabric.priceInstallCorner * corners : 0;
  const p = (room.profileSegments ?? []).reduce(
    (sum, seg) => sum + seg.profile.priceInstall * seg.lengthM,
    0,
  );
  return f + p;
};

const RoomEditor: React.FC = () => {
  const { projectId, roomId } = useParams<{ projectId: string; roomId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [tab, setTab] = useState<Tab>('draw');
  const [fabrics, setFabrics] = useState<CatalogItem[]>([]);
  const [profiles, setProfiles] = useState<CatalogItem[]>([]);
  const [editingEdge, setEditingEdge] = useState<number | null>(null);
  const [applyAllOpen, setApplyAllOpen] = useState(false);
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
  }, [projectId, roomId]);

  useEffect(() => {
    const measure = () => {
      const el = canvasContainerRef.current;
      if (el && el.clientWidth > 0) {
        setCanvasSize({ width: el.clientWidth, height: Math.min(el.clientWidth * 0.75, 500) });
      }
    };
    const timer = setTimeout(measure, 300);
    window.addEventListener('resize', measure);
    return () => { clearTimeout(timer); window.removeEventListener('resize', measure); };
  }, []);

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
          // First polygon close — auto-init with default profile
          const def = profiles.find(p => p.isDefault) ?? profiles[0] ?? null;
          if (def) {
            updated.profileSegments = pts.map((_, i) => ({
              edgeIndex: i,
              profileId: def.id,
              profile: { ...def },
              lengthM: edgeLengthM(pts, i, updated.scale),
            }));
          }
        } else {
          // Recalculate lengths (vertex drag or scale change)
          updated.profileSegments = existing
            .filter(s => s.edgeIndex < pts.length)
            .map(s => ({ ...s, lengthM: edgeLengthM(pts, s.edgeIndex, updated.scale) }));
        }
      }
    }

    if (partial.scale !== undefined && updated.points.length >= 3) {
      updated.profileSegments = (updated.profileSegments ?? []).map(s => ({
        ...s,
        lengthM: edgeLengthM(updated.points, s.edgeIndex, partial.scale!),
      }));
    }

    setRoom(updated);
    const updatedProject = {
      ...project,
      rooms: project.rooms.map(r => r.id === roomId ? updated : r),
      updatedAt: new Date().toISOString(),
    };
    setProject(updatedProject);
    upsertProject(updatedProject);
  };

  const selectFabric = (item: CatalogItem) => {
    if (room.fabricId === item.id) updateRoom({ fabricId: null, fabric: null });
    else updateRoom({ fabricId: item.id, fabric: { ...item } });
  };

  const assignProfile = (edgeIndex: number, item: CatalogItem) => {
    const newSeg: RoomProfileSegment = {
      edgeIndex,
      profileId: item.id,
      profile: { ...item },
      lengthM: edgeLengthM(room.points, edgeIndex, room.scale),
    };
    const updated = [
      ...(room.profileSegments ?? []).filter(s => s.edgeIndex !== edgeIndex),
      newSeg,
    ].sort((a, b) => a.edgeIndex - b.edgeIndex);
    updateRoom({ profileSegments: updated });
  };

  const clearProfile = (edgeIndex: number) => {
    updateRoom({ profileSegments: (room.profileSegments ?? []).filter(s => s.edgeIndex !== edgeIndex) });
  };

  const applyToAll = (item: CatalogItem) => {
    updateRoom({
      profileSegments: room.points.map((_, i) => ({
        edgeIndex: i,
        profileId: item.id,
        profile: { ...item },
        lengthM: edgeLengthM(room.points, i, room.scale),
      })),
    });
  };

  const corners = roomCorners(room);
  const client = clientPrice(room);
  const worker = workerPrice(room);
  const segments = room.profileSegments ?? [];

  // Group segments by profile for summary
  const profileGroups = segments.reduce((acc, seg) => {
    if (!acc[seg.profileId]) acc[seg.profileId] = { profile: seg.profile, totalLengthM: 0, count: 0 };
    acc[seg.profileId].totalLengthM += seg.lengthM;
    acc[seg.profileId].count += 1;
    return acc;
  }, {} as Record<string, { profile: CatalogItem; totalLengthM: number; count: number }>);

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
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
        <IonSegment value={tab} onIonChange={e => setTab(e.detail.value as Tab)} style={{ padding: '8px 16px' }}>
          <IonSegmentButton value="draw"><IonLabel>Чертёж</IonLabel></IonSegmentButton>
          <IonSegmentButton value="materials"><IonLabel>Материалы</IonLabel></IonSegmentButton>
        </IonSegment>

        {tab === 'draw' && (
          <div style={{ padding: '0 12px 12px' }}>
            <div ref={canvasContainerRef} style={{ width: '100%' }}>
              {canvasSize.width > 0 && (
                <CeilingCanvas room={room} onChange={updateRoom} width={canvasSize.width} height={canvasSize.height} />
              )}
            </div>

            <div style={{ marginTop: 16, padding: '0 4px' }}>
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

        {tab === 'materials' && (
          <div style={{ padding: '0 12px 24px' }}>

            {/* Полотно */}
            <div style={{ padding: '12px 4px 6px' }}>
              <IonText color="medium"><small style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Полотно</small></IonText>
            </div>
            {fabrics.length === 0 ? (
              <IonText color="medium"><small>Нет позиций — добавьте в Ценники → Полотна</small></IonText>
            ) : (
              fabrics.map(item => (
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
              ))
            )}

            {/* Профиль по стенам */}
            <div style={{ padding: '12px 4px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <IonText color="medium"><small style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Профиль по стенам</small></IonText>
              {profiles.length > 0 && room.points.length >= 3 && (
                <IonButton fill="clear" size="small" onClick={() => setApplyAllOpen(true)} style={{ margin: 0, height: 'auto' }}>
                  <small>Применить ко всем</small>
                </IonButton>
              )}
            </div>

            {room.points.length < 3 ? (
              <IonText color="medium"><small>Сначала нарисуйте чертёж помещения</small></IonText>
            ) : profiles.length === 0 ? (
              <IonText color="medium"><small>Нет позиций — добавьте в Ценники → Профили</small></IonText>
            ) : (
              room.points.map((_, i) => {
                const seg = segments.find(s => s.edgeIndex === i);
                const lenM = edgeLengthM(room.points, i, room.scale);
                return (
                  <div
                    key={i}
                    onClick={() => setEditingEdge(i)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 16px', marginBottom: 8, borderRadius: 14,
                      background: 'var(--ion-color-light)', cursor: 'pointer',
                    }}
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
              })
            )}

            {/* Итого */}
            {room.areaSqm > 0 && (room.fabric || segments.length > 0) && (
              <div style={{ padding: 16, background: 'var(--ion-color-light)', borderRadius: 12, marginTop: 8 }}>
                {room.fabric && (
                  <>
                    <PriceRow label={`Полотно (${room.areaSqm.toFixed(2)} м²)`} value={Math.round(room.fabric.price * room.areaSqm)} />
                    {corners > 0 && <PriceRow label={`Углы × ${corners}`} value={Math.round(room.fabric.priceCorner * corners)} />}
                  </>
                )}
                {Object.values(profileGroups).map(({ profile, totalLengthM, count }) => (
                  <PriceRow
                    key={profile.id}
                    label={`${profile.title} (${totalLengthM.toFixed(2)} м, ${count} угл.)`}
                    value={Math.round(profile.price * totalLengthM + profile.priceCorner * count)}
                  />
                ))}
                <div style={{ borderTop: '1px solid var(--ion-border-color)', marginTop: 8, paddingTop: 8 }}>
                  <PriceRow label="Итого клиенту" value={Math.round(client)} bold primary />
                  {worker > 0 && <PriceRow label="Зарплата бригаде" value={Math.round(worker)} bold />}
                </div>
              </div>
            )}
          </div>
        )}
      </IonContent>

      {/* Выбор профиля для одной стены */}
      <IonActionSheet
        isOpen={editingEdge !== null}
        header={editingEdge !== null
          ? `Стена ${edgeLabel(editingEdge, room.points.length)} · ${edgeLengthM(room.points, editingEdge, room.scale).toFixed(2)} м`
          : undefined}
        buttons={[
          ...profiles.map(p => ({
            text: p.title,
            handler: () => { if (editingEdge !== null) { assignProfile(editingEdge, p); setEditingEdge(null); } },
          })),
          {
            text: 'Без профиля',
            role: 'destructive' as const,
            handler: () => { if (editingEdge !== null) { clearProfile(editingEdge); setEditingEdge(null); } },
          },
          { text: 'Отмена', role: 'cancel' as const },
        ]}
        onDidDismiss={() => setEditingEdge(null)}
      />

      {/* Применить профиль ко всем стенам */}
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
    </IonPage>
  );
};

const PriceRow: React.FC<{ label: string; value: number; bold?: boolean; primary?: boolean }> = ({ label, value, bold, primary }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
    <IonText color={bold ? undefined : 'medium'}><span style={{ fontSize: 13, fontWeight: bold ? 600 : 400 }}>{label}</span></IonText>
    <IonText color={primary ? 'primary' : undefined}><span style={{ fontSize: 13, fontWeight: bold ? 600 : 400 }}>{value.toLocaleString('ru')} ₽</span></IonText>
  </div>
);

export default RoomEditor;
