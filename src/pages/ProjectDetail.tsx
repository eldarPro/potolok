import React, { useEffect, useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonButton, IonIcon,
  IonAlert, IonItem, IonItemSliding, IonItemOptions, IonItemOption,
  useIonRouter,
} from '@ionic/react';
import {
  chevronBackOutline, addOutline, trashOutline,
  documentTextOutline, chevronForwardOutline,
} from 'ionicons/icons';
import { useParams } from 'react-router-dom';
import { getProject, upsertProject, createRoom } from '../lib/storage';
import { Project, Room } from '../types';

const AVATAR_COLORS = ['#1E88E5', '#43A047', '#FB8C00', '#8E24AA', '#E53935', '#00897B', '#3949AB', '#F4511E'];

const getInitials = (name: string) => {
  if (!name?.trim()) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
};

const getAvatarColor = (name: string) => {
  let hash = 0;
  for (const ch of (name || '')) hash = (hash * 31 + ch.charCodeAt(0)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[Math.abs(hash)];
};

const calcRoomClientPrice = (room: Room) => {
  const c = room.points.length;
  const f = room.fabric ? room.fabric.price * room.areaSqm + room.fabric.priceCorner * c : 0;
  const p = (room.profileSegments ?? []).reduce((s, seg) => s + seg.profile.price * seg.lengthM + seg.profile.priceCorner, 0);
  const l = (room.lighting ?? []).reduce((s, e) => s + (e.kind === 'point' ? e.catalogItem.price : e.catalogItem.price * (e as any).lengthM), 0);
  const a = (room.selectedAccessories ?? []).reduce((s, a) => s + a.accessory.price * a.quantity, 0);
  const sv = (room.selectedServices ?? []).reduce((s, sv) => s + sv.service.price * sv.quantity, 0);
  return f + p + l + a + sv;
};

const ProjectDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const router = useIonRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [showNewRoom, setShowNewRoom] = useState(false);

  const load = () => setProject(getProject(id));
  useEffect(() => { load(); }, [id]);

  if (!project) return null;

  const handleAddRoom = (name: string) => {
    const roomName = name.trim() || `Помещение ${project.rooms.length + 1}`;
    const room = createRoom(roomName);
    const updated = { ...project, rooms: [...project.rooms, room], updatedAt: new Date().toISOString() };
    upsertProject(updated);
    setProject(updated);
    setShowNewRoom(false);
    router.push(`/project/${id}/room/${room.id}`, 'forward', 'push');
  };

  const handleDeleteRoom = (roomId: string) => {
    const updated = { ...project, rooms: project.rooms.filter(r => r.id !== roomId), updatedAt: new Date().toISOString() };
    upsertProject(updated);
    setProject(updated);
  };

  const totalSqm = project.rooms.reduce((s, r) => s + r.areaSqm, 0);
  const totalPrice = project.rooms.reduce((s, r) => s + calcRoomClientPrice(r), 0);
  const initials = getInitials(project.clientName);
  const avatarColor = getAvatarColor(project.clientName);

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton text="" icon={chevronBackOutline} defaultHref="/" />
          </IonButtons>
          <IonTitle>{project.clientName || 'Проект'}</IonTitle>
          <IonButtons slot="end">
            <IonButton routerLink={`/project/${id}/summary`}>
              <IonIcon slot="icon-only" icon={documentTextOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent>
        {/* ── Hero ── */}
        <div style={{
          background: `linear-gradient(135deg, #1565C0 0%, ${avatarColor} 60%, #42A5F5 100%)`,
          padding: '20px 20px 26px',
          color: '#fff',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: project.address ? 12 : 16 }}>
            <div style={{
              width: 58, height: 58, borderRadius: 19,
              background: 'rgba(255,255,255,0.2)',
              border: '2px solid rgba(255,255,255,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, fontWeight: 700, flexShrink: 0, letterSpacing: 0.5,
            }}>
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.2, marginBottom: project.phone ? 4 : 0 }}>
                {project.clientName || 'Проект'}
              </div>
              {project.phone && (
                <div style={{ fontSize: 13, opacity: 0.85 }}>📞 {project.phone}</div>
              )}
            </div>
          </div>

          {project.address && (
            <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 16, display: 'flex', gap: 6 }}>
              <span>📍</span>
              <span>{project.address}</span>
            </div>
          )}

          {/* Stats row */}
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{
              flex: 1, background: 'rgba(255,255,255,0.18)', borderRadius: 14,
              padding: '10px 8px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{project.rooms.length}</div>
              <div style={{ fontSize: 11, opacity: 0.82, marginTop: 3 }}>{roomWord(project.rooms.length)}</div>
            </div>
            {totalSqm > 0 && (
              <div style={{
                flex: 1, background: 'rgba(255,255,255,0.18)', borderRadius: 14,
                padding: '10px 8px', textAlign: 'center',
              }}>
                <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{totalSqm.toFixed(1)}</div>
                <div style={{ fontSize: 11, opacity: 0.82, marginTop: 3 }}>м²</div>
              </div>
            )}
            {totalPrice > 0 && (
              <div style={{
                flex: 1.7, background: 'rgba(255,255,255,0.18)', borderRadius: 14,
                padding: '10px 8px', textAlign: 'center',
              }}>
                <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1 }}>
                  {Math.round(totalPrice).toLocaleString('ru')}
                </div>
                <div style={{ fontSize: 11, opacity: 0.82, marginTop: 3 }}>₽ ориентир.</div>
              </div>
            )}
          </div>
        </div>

        {/* ── Rooms header ── */}
        <div style={{ padding: '20px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Помещения</div>
          {project.rooms.length > 0 && (
            <div style={{ fontSize: 12, color: '#999' }}>{project.rooms.length} {roomWord(project.rooms.length)}</div>
          )}
        </div>

        {/* ── Room cards ── */}
        {project.rooms.length === 0 ? (
          <div style={{ padding: '8px 16px 16px', textAlign: 'center', color: '#bbb', fontSize: 14 }}>
            Нет помещений — добавьте первое
          </div>
        ) : (
          <div style={{ paddingBottom: 8 }}>
            {project.rooms.map(room => {
              const roomPrice = calcRoomClientPrice(room);
              const drawn = room.areaSqm > 0;
              return (
                <IonItemSliding key={room.id}>
                  <IonItem
                    button
                    detail={false}
                    routerLink={`/project/${id}/room/${room.id}`}
                    lines="none"
                    style={{
                      '--background': 'transparent',
                      '--padding-start': '0',
                      '--padding-end': '0',
                      '--inner-padding-end': '0',
                    } as any}
                  >
                    <div style={{
                      margin: '0 16px 10px',
                      padding: '14px 16px',
                      background: '#fff',
                      borderRadius: 18,
                      boxShadow: '0 2px 10px rgba(0,0,0,0.07)',
                      width: 'calc(100% - 32px)',
                      display: 'flex', alignItems: 'center', gap: 12,
                    }}>
                      <div style={{
                        width: 42, height: 42, borderRadius: 13,
                        background: drawn ? '#E3F2FD' : '#F5F5F5',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 20, flexShrink: 0,
                      }}>
                        {drawn ? '📐' : '⬜'}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 5 }}>{room.name}</div>
                        {drawn ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            <Chip text={`${room.areaSqm.toFixed(1)} м²`} primary />
                            <Chip text={`П ${room.perimeterM.toFixed(1)} м`} />
                            {room.fabric && <Chip text={room.fabric.title} />}
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: '#c0c0c0' }}>Чертёж не начерчен</span>
                        )}
                      </div>

                      {roomPrice > 0 ? (
                        <div style={{ fontWeight: 700, color: '#1E88E5', fontSize: 15, flexShrink: 0 }}>
                          {Math.round(roomPrice).toLocaleString('ru')} ₽
                        </div>
                      ) : (
                        <IonIcon icon={chevronForwardOutline} color="medium" style={{ flexShrink: 0 }} />
                      )}
                    </div>
                  </IonItem>

                  <IonItemOptions side="end">
                    <IonItemOption color="danger" onClick={() => handleDeleteRoom(room.id)}>
                      <IonIcon slot="icon-only" icon={trashOutline} />
                    </IonItemOption>
                  </IonItemOptions>
                </IonItemSliding>
              );
            })}
          </div>
        )}

        {/* ── Add room ── */}
        <div style={{ padding: '8px 16px 36px' }}>
          <button
            onClick={() => setShowNewRoom(true)}
            style={{
              width: '100%', padding: '14px',
              borderRadius: 18,
              background: '#fff',
              border: '2px dashed #1E88E5',
              color: '#1E88E5', fontWeight: 600, fontSize: 15,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <IonIcon icon={addOutline} style={{ fontSize: 20 }} />
            Добавить помещение
          </button>
        </div>

        <IonAlert
          isOpen={showNewRoom}
          header="Новое помещение"
          inputs={[{ name: 'name', type: 'text', placeholder: 'Зал, кухня, спальня...' }]}
          buttons={[
            { text: 'Отмена', role: 'cancel', handler: () => setShowNewRoom(false) },
            { text: 'Добавить', handler: (data) => handleAddRoom(data.name ?? '') },
          ]}
          onDidDismiss={() => setShowNewRoom(false)}
        />
      </IonContent>
    </IonPage>
  );
};

const Chip: React.FC<{ text: string; primary?: boolean }> = ({ text, primary }) => (
  <span style={{
    background: primary ? '#E3F2FD' : '#F5F5F5',
    color: primary ? '#1E88E5' : '#777',
    borderRadius: 8, padding: '2px 8px',
    fontSize: 11, fontWeight: primary ? 600 : 400,
  }}>
    {text}
  </span>
);

function roomWord(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return 'помещение';
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return 'помещения';
  return 'помещений';
}

export default ProjectDetail;
