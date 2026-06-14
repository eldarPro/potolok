import React, { useEffect, useState, useRef } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle,
  IonButtons, IonBackButton, IonButton, IonIcon, IonRange,
  useIonToast, useIonViewWillEnter, useIonRouter,
} from '@ionic/react';
import {
  chevronBackOutline, checkmarkOutline,
  layersOutline, reorderThreeOutline, bulbOutline, buildOutline, briefcaseOutline,
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

  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const load = () => {
    const p = getProject(projectId);
    if (!p) return;
    setProject(p);
    setRoom(p.rooms.find(r => r.id === roomId) ?? null);
    setProfiles(loadProfiles());
    setLightings(loadLightings());
  };

  useEffect(() => { load(); }, [projectId, roomId]);
  useIonViewWillEnter(() => { load(); });

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
    const proj = {
      ...project,
      rooms: project.rooms.map(r => r.id === roomId ? updated : r),
      updatedAt: new Date().toISOString(),
    };
    setProject(proj);
    upsertProject(proj);
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
    } else {
      setLightingPathPts(prev => [...prev, pt]);
    }
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
    setLightingPathPts([]);
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
            <IonButton routerLink={`/project/${projectId}`} routerDirection="back">
              <IonIcon slot="icon-only" icon={checkmarkOutline} />
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
                room={room}
                onChange={updateRoom}
                width={canvasSize.width}
                height={canvasSize.height}
                placingLighting={placingLighting}
                inProgressLightingPath={lightingPathPts}
                onLightingTap={handleLightingTap}
                onOutOfBounds={() => presentToast({
                  message: 'Нельзя разместить за пределами помещения',
                  duration: 1500, position: 'bottom', color: 'danger',
                })}
              />
            )}


            {/* Empty state overlay */}
            {room.points.length === 0 && canvasSize.width > 0 && (
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                pointerEvents: 'none',
              }}>
                <div style={{
                  background: 'rgba(0,0,0,0.45)',
                  backdropFilter: 'blur(6px)',
                  borderRadius: 18, padding: '20px 28px', textAlign: 'center',
                }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>📐</div>
                  <div style={{ color: '#fff', fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
                    Нажмите на холст
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>
                    чтобы добавить точки контура
                  </div>
                </div>
              </div>
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
    </IonPage>
  );
};

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
