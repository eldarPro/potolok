import React, { useEffect, useRef, useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonButton, IonIcon,
  IonModal, IonItem, IonItemSliding, IonItemOptions, IonItemOption,
  useIonRouter, useIonViewWillEnter,
} from '@ionic/react';
import {
  chevronBackOutline, addOutline, trashOutline,
  documentTextOutline, chevronForwardOutline,
  callOutline, locationOutline, squareOutline,
} from 'ionicons/icons';
import { useParams } from 'react-router-dom';
import { getProject, upsertProject, createRoom } from '../lib/storage';
import { Project, Room } from '../types';
import ActionButton from '../components/ActionButton';
import './ProjectDetail.css';

const AVATAR_COLORS = ['#1E88E5', '#43A047', '#FB8C00', '#8E24AA', '#E53935', '#00897B', '#3949AB', '#F4511E'];

const RoomThumbnail: React.FC<{ points: { x: number; y: number }[] }> = ({ points }) => {
  if (points.length < 3) return null;
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = maxX - minX || 1;
  const h = maxY - minY || 1;
  const PAD = 10;
  const INNER = 32;
  const sc = Math.min(INNER / w, INNER / h);
  const ox = PAD + (INNER - w * sc) / 2;
  const oy = PAD + (INNER - h * sc) / 2;
  const poly = points.map(p => `${(p.x - minX) * sc + ox},${(p.y - minY) * sc + oy}`).join(' ');
  const size = INNER + PAD * 2;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ display: 'block' }}>
      <polygon points={poly} fill="rgba(56,128,255,0.22)" stroke="#3880ff" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
};

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
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomError, setNewRoomError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const load = () => setProject(getProject(id));
  useEffect(() => { load(); }, [id]);
  useIonViewWillEnter(() => { load(); });

  if (!project) return null;

  const handleAddRoom = () => {
    const roomName = newRoomName.trim() || `Помещение ${project.rooms.length + 1}`;
    if (project.rooms.some(r => r.name.toLowerCase() === roomName.toLowerCase())) {
      setNewRoomError('Помещение с таким названием уже существует');
      return;
    }
    const room = createRoom(roomName);
    const updated = { ...project, rooms: [...project.rooms, room], updatedAt: new Date().toISOString() };
    upsertProject(updated);
    setProject(updated);
    setShowNewRoom(false);
    setNewRoomName('');
    setNewRoomError('');
    router.push(`/project/${id}/room/${room.id}`, 'forward', 'push');
  };

  const handleOpenNewRoom = () => {
    setNewRoomName('');
    setNewRoomError('');
    setShowNewRoom(true);
    setTimeout(() => inputRef.current?.focus(), 300);
  };

  const handleDeleteRoom = (roomId: string) => {
    const updated = { ...project, rooms: project.rooms.filter(r => r.id !== roomId), updatedAt: new Date().toISOString() };
    upsertProject(updated);
    setProject(updated);
  };

  const totalSqm = project.rooms.reduce((s, r) => s + r.areaSqm, 0);
  const totalPerimeterM = project.rooms.reduce((s, r) => s + r.perimeterM, 0);
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
              <IonIcon slot="icon-only" icon={documentTextOutline} style={{ color: '#4A90D9' }} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent className="project-detail-content">
        {/* ── Client card ── */}
        <div className="card-list" style={{ paddingBottom: 0 }}>
          <div className="card project-detail-client-card">
            <div className="project-detail-client-header">
              <div className="avatar avatar--lg" style={{ background: avatarColor }}>
                {initials}
              </div>
              <div className="project-detail-client-info">
                <div className="project-detail-client-name">{project.clientName || 'Проект'}</div>
                {project.phone && (
                  <div className="project-detail-client-meta">
                    <IonIcon icon={callOutline} />
                    {project.phone}
                  </div>
                )}
                {project.address && (
                  <div className="project-detail-client-meta">
                    <IonIcon icon={locationOutline} />
                    {project.address}
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* ── Rooms header ── */}
        <div className="project-detail-section-header">
          <div className="project-detail-section-title">Помещения</div>
        </div>

        {/* ── Room cards ── */}
        {project.rooms.length === 0 ? (
          <div className="project-detail-no-rooms">
            Нет помещений — добавьте первое
          </div>
        ) : (
          <div className="card-list" style={{ paddingTop: 0, paddingBottom: 8 }}>
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
                    className="project-detail-room-item"
                  >
                    <div className="room-card card">
                      <div className={`room-card__icon ${drawn ? 'room-card__icon--drawn' : ''}`}>
                        {drawn ? <RoomThumbnail points={room.points} /> : <IonIcon icon={squareOutline} />}
                      </div>

                      <div className="room-card__body">
                        <div className="room-card__name">{room.name}</div>
                        {drawn ? (
                          <div className="room-card__chips">
                            <span className="chip">{room.areaSqm.toFixed(1)} м²</span>
                            <span className="chip">{room.perimeterM.toFixed(1)} пог. м</span>
                            {room.fabric && <span className="chip">{room.fabric.title}</span>}
                          </div>
                        ) : (
                          <span className="room-card__undrawned">Чертёж не начерчен</span>
                        )}
                      </div>

                      {roomPrice > 0 ? (
                        <div className="room-card__price">
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
        <div className="project-detail-add-room">
          <ActionButton solid onClick={handleOpenNewRoom}>
            Добавить помещение
          </ActionButton>
        </div>

        <IonModal
          isOpen={showNewRoom}
          onDidDismiss={() => { setShowNewRoom(false); setNewRoomName(''); setNewRoomError(''); }}
          breakpoints={[0, 1]}
          initialBreakpoint={1}
          className="new-room-modal"
        >
          <div className="new-room-modal__content">
            <div className="new-room-modal__handle" />
            <div className="new-room-modal__header">
              <div className="new-room-modal__title">Новое помещение</div>
            </div>
            <div className="new-room-modal__body">
              <div className="new-room-modal__suggestions">
                {['Зал', 'Гостиная', 'Кухня', 'Спальня', 'Детская', 'Прихожая', 'Ванная', 'Кабинет', 'Балкон'].map(s => (
                  <button
                    key={s}
                    className={`new-room-modal__suggestion${newRoomName === s ? ' new-room-modal__suggestion--active' : ''}`}
                    onClick={() => { setNewRoomName(s); inputRef.current?.focus(); }}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <input
                ref={inputRef}
                className="new-room-modal__input"
                type="text"
                placeholder="Название"
                value={newRoomName}
                onChange={e => { setNewRoomName(e.target.value); setNewRoomError(''); }}
                onKeyDown={e => { if (e.key === 'Enter') handleAddRoom(); }}
              />
              {newRoomError && <div className="new-room-modal__error">{newRoomError}</div>}
            </div>
            <div className="new-room-modal__footer">
              <button
                className="new-room-modal__btn new-room-modal__btn--cancel"
                onClick={() => { setShowNewRoom(false); setNewRoomName(''); }}
              >
                Отмена
              </button>
              <ActionButton expand={false} solid onClick={handleAddRoom} className="new-room-modal__action-btn">
                Добавить
              </ActionButton>
            </div>
          </div>
        </IonModal>
      </IonContent>

      {totalSqm > 0 && (
        <div className="project-detail-totals">
          <div className="project-detail-totals__heading">Итого</div>
          <div className="project-detail-totals__stat">
            <span className="project-detail-totals__value">{totalSqm.toFixed(1)}</span>
            <span className="project-detail-totals__label">м²</span>
          </div>
          {totalPerimeterM > 0 && (
            <div className="project-detail-totals__stat">
              <span className="project-detail-totals__value">{totalPerimeterM.toFixed(1)}</span>
              <span className="project-detail-totals__label">пог. м</span>
            </div>
          )}
          {totalPrice > 0 && (
            <div className="project-detail-totals__stat project-detail-totals__stat--price">
              <span className="project-detail-totals__value">{Math.round(totalPrice).toLocaleString('ru')} ₽</span>
              <span className="project-detail-totals__label">ориентировочно</span>
            </div>
          )}
        </div>
      )}
    </IonPage>
  );
};

function roomWord(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return 'помещение';
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return 'помещения';
  return 'помещений';
}

export default ProjectDetail;
