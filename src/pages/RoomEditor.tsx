import React, { useEffect, useState, useRef } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle,
  IonButtons, IonBackButton, IonButton, IonIcon, IonRange, IonActionSheet, IonAlert,
  useIonToast, useIonViewWillEnter, useIonRouter,
} from '@ionic/react';
import {
  chevronBackOutline,
  layersOutline, reorderThreeOutline, bulbOutline, buildOutline, briefcaseOutline,
  closeOutline, ellipsisVerticalOutline,
} from 'ionicons/icons';
import { useParams } from 'react-router-dom';
import { getProject, upsertProject, loadProfiles, loadLightings } from '../lib/storage';
import { Project, Room, CatalogItem, RoomProfileSegment, LightingCatalogItem, RoomLightingPoint, RoomLightingPath } from '../types';
import CeilingCanvas from '../components/CeilingCanvas';
import { edgeLengthM, dist, pxToMeters } from '../lib/geometry';

const MAT_TABS = [
  { section: 'fabric',      label: 'Полотна',  icon: layersOutline,       color: '#1E88E5' },
  { section: 'profile',     label: 'Профили',  icon: reorderThreeOutline, color: '#8E24AA' },
  { section: 'lighting',    label: 'Свет',     icon: bulbOutline,         color: '#F9A825' },
  { section: 'accessories', label: 'Компл.',   icon: buildOutline,        color: '#2E7D32' },
  { section: 'services',    label: 'Доп. услуги', icon: briefcaseOutline, color: '#C62828', noWrap: true },
];

const RoomEditor: React.FC = () => {
  const { projectId, roomId } = useParams<{ projectId: string; roomId: string }>();
  const router = useIonRouter();
  const [presentToast] = useIonToast();
  const [project, setProject] = useState<Project | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [profiles, setProfiles] = useState<CatalogItem[]>([]);
  const [lightings, setLightings] = useState<LightingCatalogItem[]>([]);

  const [placingLighting, setPlacingLighting] = useState<LightingCatalogItem | null>(null);
  const [lightingPathPts, setLightingPathPts] = useState<{ x: number; y: number }[]>([]);
  const [lightingRedoStack, setLightingRedoStack] = useState<{ x: number; y: number }[]>([]);
  const [lightingHistory, setLightingHistory] = useState<(RoomLightingPoint | RoomLightingPath)[]>([]);
  const [lightingPickerOpen, setLightingPickerOpen] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [canvasKey, setCanvasKey] = useState(0);

  const load = () => {
    const p = getProject(projectId);
    if (!p) return;
    setProject(p);
    setRoom(p.rooms.find(r => r.id === roomId) ?? null);
    setProfiles(loadProfiles());
    setLightings(loadLightings());
  };

  useEffect(() => { load(); }, [projectId, roomId]);
  useIonViewWillEnter(() => {
    load();
    if (new URLSearchParams(window.location.search).get('pickLighting') === '1') {
      setLightingPickerOpen(true);
    }
  });

  // Set up ResizeObserver after room is loaded (ref is null until JSX renders)
  useEffect(() => {
    if (!room) return;
    const el = canvasContainerRef.current;
    if (!el) return;
    const measure = () => {
      if (el.clientWidth > 0 && el.clientHeight > 0)
        setCanvasSize({ width: el.clientWidth, height: el.clientHeight });
    };
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    measure();
    return () => obs.disconnect();
  }, [room?.id]);

  useEffect(() => { setLightingPathPts([]); setLightingRedoStack([]); setLightingHistory([]); }, [placingLighting?.id]);

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
    const proj = {
      ...project,
      rooms: project.rooms.map(r => r.id === roomId ? updated : r),
      updatedAt: new Date().toISOString(),
    };
    setProject(proj);
    upsertProject(proj);
  };

  const clearDrawing = () => {
    updateRoom({ points: [], areaSqm: 0, perimeterM: 0, profileSegments: [], lighting: [] });
    setLightingPathPts([]);
    setLightingRedoStack([]);
    setPlacingLighting(null);
    setCanvasKey(k => k + 1);
  };

  const deleteRoom = () => {
    const proj = {
      ...project,
      rooms: project.rooms.filter(r => r.id !== roomId),
      updatedAt: new Date().toISOString(),
    };
    upsertProject(proj);
    router.push(`/project/${projectId}`, 'back');
  };

  const handleLightingTap = (pt: { x: number; y: number }) => {
    if (!placingLighting) return;
    if (placingLighting.placement === 'point') {
      const newEl: RoomLightingPoint = {
        id: crypto.randomUUID(), kind: 'point',
        catalogItemId: placingLighting.id, catalogItem: { ...placingLighting },
        x: pt.x, y: pt.y,
      };
      updateRoom({ lighting: [...(room.lighting ?? []), newEl] });
      setLightingHistory(prev => [...prev, newEl]);
    } else {
      setLightingRedoStack([]);
      setLightingPathPts(prev => [...prev, pt]);
    }
  };

  const handleUndoLightingPoint = () => {
    if (lightingPathPts.length > 0) {
      const last = lightingPathPts[lightingPathPts.length - 1];
      setLightingRedoStack(prev => [...prev, last]);
      setLightingPathPts(prev => prev.slice(0, -1));
    } else if (lightingHistory.length > 0) {
      const last = lightingHistory[lightingHistory.length - 1];
      setLightingHistory(prev => prev.slice(0, -1));
      updateRoom({ lighting: (room.lighting ?? []).filter(e => e.id !== last.id) });
    }
  };

  const handleRedoLightingPoint = () => {
    if (lightingRedoStack.length === 0) return;
    const next = lightingRedoStack[lightingRedoStack.length - 1];
    setLightingRedoStack(prev => prev.slice(0, -1));
    setLightingPathPts(prev => [...prev, next]);
  };

  const handleFinishPlacingLighting = () => {
    setPlacingLighting(null);
    setLightingPathPts([]);
    setLightingRedoStack([]);
    setLightingHistory([]);
  };

  const handleCancelPlacingLighting = () => {
    const ids = new Set(lightingHistory.map(e => e.id));
    if (ids.size > 0) updateRoom({ lighting: (room.lighting ?? []).filter(e => !ids.has(e.id)) });
    setPlacingLighting(null);
    setLightingPathPts([]);
    setLightingRedoStack([]);
    setLightingHistory([]);
  };

  const finishLightingPath = () => {
    if (!placingLighting || lightingPathPts.length < 2) return;
    let totalPx = 0;
    for (let i = 0; i < lightingPathPts.length - 1; i++)
      totalPx += dist(lightingPathPts[i], lightingPathPts[i + 1]);
    const newEl: RoomLightingPath = {
      id: crypto.randomUUID(), kind: 'path',
      catalogItemId: placingLighting.id, catalogItem: { ...placingLighting },
      points: lightingPathPts, lengthM: pxToMeters(totalPx, room.scale),
    };
    updateRoom({ lighting: [...(room.lighting ?? []), newEl] });
    setPlacingLighting(null);
    setLightingPathPts([]);
    setLightingRedoStack([]);
    setLightingHistory([]);
  };

  const hasLightingTools = lightings.length > 0 && room.areaSqm > 0;
  const isPlacingPath = placingLighting?.placement === 'path';

  return (
    <IonPage style={{ display: 'flex', flexDirection: 'column' }}>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton text="" icon={chevronBackOutline} defaultHref={`/project/${projectId}`} />
          </IonButtons>
          <IonTitle>{room.name}</IonTitle>
          <IonButtons slot="end">
            <IonButton fill="clear" onClick={() => setMenuOpen(true)}>
              <IonIcon slot="icon-only" icon={ellipsisVerticalOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

          {/* ── Materials tab bar ── */}
          <div style={{
            background: 'rgba(8, 12, 22, 0.96)',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            overflowX: 'auto',
            flexShrink: 0,
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
          } as React.CSSProperties}>
            <div style={{
              display: 'flex',
              padding: '6px 8px',
            }}>
              {MAT_TABS.map((tab, idx) => (
                <React.Fragment key={tab.section}>
                  {idx > 0 && (
                    <div style={{
                      width: 1, alignSelf: 'stretch',
                      background: 'rgba(255,255,255,0.1)',
                      margin: '6px 0',
                      flexShrink: 0,
                    }} />
                  )}
                  <button
                    onClick={() => router.push(`/project/${projectId}/room/${roomId}/materials/${tab.section}`)}
                    style={{
                      flex: 1, maxWidth: 90,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      padding: '8px 4px', borderRadius: 12, border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <IonIcon icon={tab.icon} style={{ fontSize: 22, color: tab.color, display: 'block' }} />
                    <span style={{
                      fontSize: 9, fontWeight: 700,
                      textTransform: 'uppercase', letterSpacing: 0.5,
                      lineHeight: 1.2, textAlign: 'center',
                      color: 'rgba(255,255,255,0.5)',
                      whiteSpace: (tab as any).noWrap ? 'nowrap' : 'normal',
                    }}>
                      {tab.label}
                    </span>
                  </button>
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* ── Canvas ── */}
          <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
            <div
              ref={canvasContainerRef}
              style={{ position: 'absolute', inset: 0 }}
            >
            {canvasSize.width > 0 && canvasSize.height > 0 && (
              <CeilingCanvas
                key={canvasKey}
                room={room}
                onChange={updateRoom}
                width={canvasSize.width}
                height={canvasSize.height}
                placingLighting={placingLighting}
                inProgressLightingPath={lightingPathPts}
                onLightingTap={handleLightingTap}
                onUndoLightingPoint={handleUndoLightingPoint}
                onRedoLightingPoint={handleRedoLightingPoint}
                canUndoLighting={lightingPathPts.length > 0 || lightingHistory.length > 0}
                canRedoLighting={lightingRedoStack.length > 0}
                onOutOfBounds={() => presentToast({
                  message: 'Нельзя разместить за пределами помещения',
                  duration: 1500, position: 'bottom', color: 'danger',
                })}
              />
            )}


            </div>
          </div>{/* end canvas */}

          {/* ── Bottom dock ── */}
          <div style={{
            background: 'rgba(8, 12, 22, 0.94)',
            backdropFilter: 'blur(20px)',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            padding: '12px 16px',
            paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))',
          }}>

            {/* Point lighting finish bar */}
            {placingLighting?.placement === 'point' && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                marginBottom: 12, padding: '10px 14px',
                background: 'rgba(249,168,37,0.12)',
                borderRadius: 14,
                border: '1px solid rgba(249,168,37,0.3)',
              }}>
                <span style={{ flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
                  {placingLighting.title} · {lightingHistory.length} шт
                </span>
                <button
                  onClick={handleCancelPlacingLighting}
                  style={{
                    background: 'none', border: 'none', padding: 4,
                    cursor: 'pointer', color: 'rgba(255,255,255,0.35)', flexShrink: 0,
                  }}
                >
                  <IonIcon icon={closeOutline} style={{ fontSize: 20, display: 'block' }} />
                </button>
                <button
                  onClick={handleFinishPlacingLighting}
                  style={{
                    padding: '6px 14px', borderRadius: 10,
                    background: '#F9A825', border: 'none',
                    color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  Готово
                </button>
              </div>
            )}

            {/* Path lighting finish bar */}
            {isPlacingPath && lightingPathPts.length >= 2 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                marginBottom: 12, padding: '10px 14px',
                background: 'rgba(249,168,37,0.12)',
                borderRadius: 14,
                border: '1px solid rgba(249,168,37,0.3)',
              }}>
                <span style={{ flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
                  {placingLighting?.title} · {lightingPathPts.length} точек
                </span>
                <button
                  onClick={() => { setPlacingLighting(null); setLightingPathPts([]); }}
                  style={{
                    background: 'none', border: 'none', padding: 4,
                    cursor: 'pointer', color: 'rgba(255,255,255,0.35)', flexShrink: 0,
                  }}
                >
                  <IonIcon icon={closeOutline} style={{ fontSize: 20, display: 'block' }} />
                </button>
                <button
                  onClick={finishLightingPath}
                  style={{
                    padding: '6px 14px', borderRadius: 10,
                    background: '#F9A825', border: 'none',
                    color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  Готово
                </button>
              </div>
            )}

            {/* Scale row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: room.areaSqm > 0 ? 12 : 0 }}>
              <span style={{
                fontSize: 11, fontWeight: 700,
                color: 'rgba(255,255,255,0.35)',
                textTransform: 'uppercase', letterSpacing: 0.9, flexShrink: 0,
              }}>
                Масштаб
              </span>
              <div style={{ flex: 1 }}>
                <IonRange
                  min={10} max={200} step={10}
                  value={room.scale}
                  onIonChange={e => updateRoom({ scale: e.detail.value as number })}
                  style={{
                    '--bar-height': '3px',
                    '--bar-background': 'rgba(255,255,255,0.1)',
                    '--bar-background-active': '#1E88E5',
                    '--knob-background': '#1E88E5',
                    '--knob-size': '18px',
                    padding: '0',
                  } as any}
                />
              </div>
              <span style={{
                fontSize: 13, color: '#1E88E5', fontWeight: 700,
                minWidth: 50, textAlign: 'right', flexShrink: 0,
              }}>
                {room.scale} см
              </span>
            </div>

            {/* Summary stats */}
            {room.areaSqm > 0 && (
              <div style={{ display: 'flex', gap: 8 }}>
                <StatBadge label="Площадь" value={`${room.areaSqm.toFixed(2)} м²`} />
                <StatBadge label="Периметр" value={`${room.perimeterM.toFixed(2)} м`} />
                <StatBadge label="Углов" value={String(room.points.length)} />
              </div>
            )}
          </div>
        </div>

      {/* ── Right-side drawer menu ── */}
      {menuOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', justifyContent: 'flex-end' }}>
          <div
            onClick={() => setMenuOpen(false)}
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }}
          />
          <div style={{
            position: 'relative', zIndex: 1,
            width: 240,
            height: '100%',
            background: '#16182a',
            boxShadow: '-8px 0 40px rgba(0,0,0,0.6)',
            display: 'flex', flexDirection: 'column',
            paddingTop: 'max(60px, env(safe-area-inset-top, 60px))',
          }}>
            <div style={{ padding: '0 20px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 1 }}>
                Помещение
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginTop: 4 }}>{room.name}</div>
            </div>
            <div style={{ flex: 1, paddingTop: 8 }}>
              <MenuAction
                label="Редактировать название"
                color="#1E88E5"
                onClick={() => { setMenuOpen(false); setRenameOpen(true); }}
              />
              <MenuAction
                label="Очистить чертёж"
                color="#F9A825"
                onClick={() => { setMenuOpen(false); clearDrawing(); }}
              />
              <MenuAction
                label="Удалить помещение"
                color="#E53935"
                onClick={() => { setMenuOpen(false); setDeleteConfirmOpen(true); }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Rename alert ── */}
      <IonAlert
        isOpen={renameOpen}
        header="Название помещения"
        inputs={[{ name: 'name', type: 'text', value: room.name, placeholder: 'Введите название' }]}
        buttons={[
          { text: 'Отмена', role: 'cancel' },
          {
            text: 'Сохранить',
            handler: (data: { name: string }) => {
              const name = data.name?.trim();
              if (name) updateRoom({ name });
            },
          },
        ]}
        onDidDismiss={() => setRenameOpen(false)}
      />

      {/* ── Delete confirmation ── */}
      <IonAlert
        isOpen={deleteConfirmOpen}
        header="Удалить помещение?"
        message={`Помещение «${room.name}» и все его данные будут удалены.`}
        buttons={[
          { text: 'Отмена', role: 'cancel' },
          { text: 'Удалить', role: 'destructive', handler: deleteRoom },
        ]}
        onDidDismiss={() => setDeleteConfirmOpen(false)}
      />

      <IonActionSheet
        isOpen={lightingPickerOpen}
        header="Выберите элемент освещения"
        buttons={[
          ...lightings.map(l => ({
            text: `${l.symbol}  ${l.title} — ${l.price.toLocaleString('ru')} ₽/${l.placement === 'path' ? 'м' : 'шт'}`,
            handler: () => { setPlacingLighting(l); setLightingPickerOpen(false); },
          })),
          { text: 'Отмена', role: 'cancel' as const },
        ]}
        onDidDismiss={() => setLightingPickerOpen(false)}
      />
    </IonPage>
  );
};

const MenuAction: React.FC<{ label: string; color: string; onClick: () => void }> = ({ label, color, onClick }) => (
  <button
    onClick={onClick}
    style={{
      display: 'block', width: '100%', padding: '16px 24px',
      background: 'none', border: 'none', cursor: 'pointer',
      textAlign: 'left', fontSize: 16, fontWeight: 600, color,
    }}
  >
    {label}
  </button>
);

const StatBadge: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{
    flex: 1, background: 'rgba(255,255,255,0.07)', borderRadius: 12,
    padding: '8px 10px', textAlign: 'center',
  }}>
    <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', lineHeight: 1 }}>{value}</div>
    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
  </div>
);

export default RoomEditor;
