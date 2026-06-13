import React, { useEffect, useState, useRef } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonButton, IonIcon, IonSegment,
  IonSegmentButton, IonLabel, IonText,
  IonRange,
} from '@ionic/react';
import { chevronBackOutline, checkmarkOutline } from 'ionicons/icons';
import { useParams } from 'react-router-dom';
import { getProject, upsertProject, loadFabrics, loadProfiles } from '../lib/storage';
import { Project, Room, CatalogItem } from '../types';
import CeilingCanvas from '../components/CeilingCanvas';

type Tab = 'draw' | 'materials';

const roomCorners = (room: Room) => room.points.length;

const clientPrice = (room: Room) => {
  const corners = roomCorners(room);
  const f = room.fabric ? room.fabric.price * room.areaSqm + room.fabric.priceCorner * corners : 0;
  const p = room.profile ? room.profile.price * room.perimeterM + room.profile.priceCorner * corners : 0;
  return f + p;
};

const workerPrice = (room: Room) => {
  const corners = roomCorners(room);
  const f = room.fabric ? room.fabric.priceInstall * room.areaSqm + room.fabric.priceInstallCorner * corners : 0;
  const p = room.profile ? room.profile.priceInstall * room.perimeterM : 0;
  return f + p;
};

const RoomEditor: React.FC = () => {
  const { projectId, roomId } = useParams<{ projectId: string; roomId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [tab, setTab] = useState<Tab>('draw');
  const [fabrics, setFabrics] = useState<CatalogItem[]>([]);
  const [profiles, setProfiles] = useState<CatalogItem[]>([]);
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
    const updated: Room = { ...room, ...partial };
    setRoom(updated);
    const updatedProject = { ...project, rooms: project.rooms.map(r => r.id === roomId ? updated : r), updatedAt: new Date().toISOString() };
    setProject(updatedProject);
    upsertProject(updatedProject);
  };

  const selectFabric = (item: CatalogItem) => {
    if (room.fabricId === item.id) {
      updateRoom({ fabricId: null, fabric: null });
    } else {
      updateRoom({ fabricId: item.id, fabric: { ...item } });
    }
  };

  const selectProfile = (item: CatalogItem) => {
    if (room.profileId === item.id) {
      updateRoom({ profileId: null, profile: null });
    } else {
      updateRoom({ profileId: item.id, profile: { ...item } });
    }
  };

  const corners = roomCorners(room);
  const client = clientPrice(room);
  const worker = workerPrice(room);

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
          <IonSegmentButton value="draw">
            <IonLabel>Чертёж</IonLabel>
          </IonSegmentButton>
          <IonSegmentButton value="materials">
            <IonLabel>Материалы</IonLabel>
          </IonSegmentButton>
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
              <IonText color="medium"><small>Нет позиций в каталоге — добавьте в разделе Ценники → Полотна</small></IonText>
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
                    <IonText color="medium"><small>{item.price} ₽ · угол {item.priceCorner} ₽</small></IonText>
                  </div>
                  {room.fabricId === item.id && <IonIcon icon={checkmarkOutline} color="primary" />}
                </div>
              ))
            )}

            {/* Профиль */}
            <div style={{ padding: '12px 4px 6px' }}>
              <IonText color="medium"><small style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Профиль</small></IonText>
            </div>
            {profiles.length === 0 ? (
              <IonText color="medium"><small>Нет позиций в каталоге — добавьте в разделе Ценники → Профили</small></IonText>
            ) : (
              profiles.map(item => (
                <div
                  key={item.id}
                  onClick={() => selectProfile(item)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '12px 16px', marginBottom: 8, borderRadius: 14,
                    border: room.profileId === item.id ? '2px solid var(--ion-color-primary)' : '2px solid transparent',
                    background: room.profileId === item.id ? 'rgba(56,128,255,0.08)' : 'var(--ion-color-light)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 8, background: item.color, border: '1px solid rgba(0,0,0,0.1)', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>{item.title}</div>
                    <IonText color="medium"><small>{item.price} ₽/м · угол {item.priceCorner} ₽</small></IonText>
                  </div>
                  {room.profileId === item.id && <IonIcon icon={checkmarkOutline} color="primary" />}
                </div>
              ))
            )}

            {/* Итого по помещению */}
            {room.areaSqm > 0 && (room.fabric || room.profile) && (
              <div style={{ padding: 16, background: 'var(--ion-color-light)', borderRadius: 12, marginTop: 8 }}>
                {room.fabric && (
                  <>
                    <PriceRow label={`Полотно (${room.areaSqm.toFixed(2)} м²)`} value={Math.round(room.fabric.price * room.areaSqm)} />
                    {corners > 0 && <PriceRow label={`Углы × ${corners}`} value={Math.round(room.fabric.priceCorner * corners)} />}
                  </>
                )}
                {room.profile && (
                  <>
                    <PriceRow label={`Профиль (${room.perimeterM.toFixed(2)} м)`} value={Math.round(room.profile.price * room.perimeterM)} />
                    {corners > 0 && <PriceRow label={`Углы × ${corners}`} value={Math.round(room.profile.priceCorner * corners)} />}
                  </>
                )}
                <div style={{ borderTop: '1px solid var(--ion-border-color)', marginTop: 8, paddingTop: 8 }}>
                  <PriceRow label="Итого клиенту" value={Math.round(client)} bold primary />
                  {worker > 0 && <PriceRow label="Зарплата бригаде" value={Math.round(worker)} bold />}
                </div>
              </div>
            )}
          </div>
        )}
      </IonContent>
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
