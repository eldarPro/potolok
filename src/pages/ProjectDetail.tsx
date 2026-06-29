import React, { useEffect, useRef, useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonButton, IonIcon,
  IonFab, IonFabButton,
  IonModal, IonItem, IonItemSliding, IonItemOptions, IonItemOption,
  IonActionSheet, IonAlert, IonList, IonLabel, IonInput, IonTextarea,
  useIonRouter, useIonViewWillEnter,
} from '@ionic/react';
import {
  chevronBackOutline, addOutline, trashOutline,
  chevronForwardOutline, documentTextOutline, settingsOutline, ellipsisVerticalOutline, readerOutline,
  callOutline, locationOutline, squareOutline,
} from 'ionicons/icons';
import { useParams } from 'react-router-dom';
import { getProject, upsertProject, createRoom, deleteProject } from '../lib/storage';
import { Project, Room } from '../types';
import ActionButton from '../components/ActionButton';
import { useT } from '../lib/i18n';
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
  const { t } = useT();
  const { id } = useParams<{ id: string }>();
  const router = useIonRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [showNewRoom, setShowNewRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomError, setNewRoomError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editError, setEditError] = useState('');

  const load = () => setProject(getProject(id));
  useEffect(() => { load(); }, [id]);
  useIonViewWillEnter(() => { load(); });

  if (!project) return null;

  const handleAddRoom = () => {
    const roomName = newRoomName.trim() || `${t('pd.room')} ${project.rooms.length + 1}`;
    if (project.rooms.some(r => r.name.toLowerCase() === roomName.toLowerCase())) {
      setNewRoomError(t('pd.roomExists'));
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

  const handleOpenEdit = () => {
    setEditName(project.clientName);
    setEditPhone(project.phone ?? '');
    setEditAddress(project.address ?? '');
    setEditNotes(project.notes ?? '');
    setEditError('');
    setShowEditModal(true);
  };

  const handleSaveEdit = () => {
    if (!editName.trim()) { setEditError(t('np.errorClient')); return; }
    const updated = { ...project, clientName: editName.trim(), phone: editPhone, address: editAddress, notes: editNotes, updatedAt: new Date().toISOString() };
    upsertProject(updated);
    setProject(updated);
    setShowEditModal(false);
  };

  const handleDeleteProject = () => {
    deleteProject(project.id);
    router.push('/', 'back', 'pop');
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
          <IonButtons slot="end">
            <IonButton fill="clear" color="primary" onClick={() => router.push(`/project/${id}/summary`, 'forward', 'push')}>
              <IonIcon icon={documentTextOutline} style={{ marginRight: 4 }} />
              {t('pd.estimate')}
            </IonButton>
            <IonButton fill="clear" onClick={() => setShowMenu(true)}>
              <IonIcon slot="icon-only" icon={ellipsisVerticalOutline} />
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
                <div className="project-detail-client-name">{project.clientName || t('pd.project')}</div>
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
                {project.notes && (
                  <div className="project-detail-client-meta">
                    <IonIcon icon={readerOutline} />
                    {project.notes}
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* ── Rooms header ── */}
        <div className="project-detail-section-header">
          <div className="project-detail-section-title">{t('pd.rooms')}</div>
        </div>

        {/* ── Room cards ── */}
        {project.rooms.length === 0 ? (
          <div className="project-detail-no-rooms">
            {t('pd.noRooms')}
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
                          <span className="room-card__undrawned">{t('pd.notDrawn')}</span>
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

        <IonFab
          vertical="bottom"
          horizontal="end"
          slot="fixed"
          style={totalSqm > 0 ? { marginBottom: 'calc(60px + env(safe-area-inset-bottom, 0px))' } : undefined}
        >
          <IonFabButton onClick={handleOpenNewRoom}>
            <IonIcon icon={addOutline} />
          </IonFabButton>
        </IonFab>

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
              <div className="new-room-modal__title">{t('pd.newRoom')}</div>
            </div>
            <div className="new-room-modal__body">
              <div className="new-room-modal__suggestions">
                {[t('rs.0'), t('rs.1'), t('rs.2'), t('rs.3'), t('rs.4'), t('rs.5'), t('rs.6'), t('rs.7'), t('rs.8')].map(s => (
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
                placeholder={t('pd.roomName')}
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
                {t('common.cancel')}
              </button>
              <ActionButton expand={false} solid onClick={handleAddRoom} className="new-room-modal__action-btn">
                {t('common.add')}
              </ActionButton>
            </div>
          </div>
        </IonModal>
      </IonContent>

      {totalSqm > 0 && (
        <div className="project-detail-totals">
          <div className="project-detail-totals__heading">{t('sum.total')}</div>
          <div className="project-detail-totals__stat">
            <span className="project-detail-totals__value">{totalSqm.toFixed(1)}</span>
            <span className="project-detail-totals__label">м²</span>
          </div>
          {totalPerimeterM > 0 && (
            <div className="project-detail-totals__stat">
              <span className="project-detail-totals__value">{totalPerimeterM.toFixed(1)}</span>
              <span className="project-detail-totals__label">{t('pd.linM')}</span>
            </div>
          )}
          {totalPrice > 0 && (
            <div className="project-detail-totals__stat project-detail-totals__stat--price">
              <span className="project-detail-totals__value">{Math.round(totalPrice).toLocaleString('ru')} ₽</span>
              <span className="project-detail-totals__label">{t('pd.approx')}</span>
            </div>
          )}
        </div>
      )}
      <IonActionSheet
        isOpen={showMenu}
        onDidDismiss={() => setShowMenu(false)}
        buttons={[
          { text: t('common.edit'), handler: () => handleOpenEdit() },
          { text: t('common.delete'), role: 'destructive', handler: () => setShowDeleteConfirm(true) },
          { text: t('common.cancel'), role: 'cancel' },
        ]}
      />

      <IonAlert
        isOpen={showDeleteConfirm}
        onDidDismiss={() => setShowDeleteConfirm(false)}
        header={t('pd.deleteTitle')}
        message={t('pd.deleteMsg')}
        buttons={[
          { text: t('common.cancel'), role: 'cancel' },
          { text: t('common.delete'), role: 'destructive', handler: handleDeleteProject },
        ]}
      />

      <IonModal
        isOpen={showEditModal}
        onDidDismiss={() => setShowEditModal(false)}
        breakpoints={[0, 1]}
        initialBreakpoint={1}
        className="new-room-modal"
      >
        <div className="new-room-modal__content">
          <div className="new-room-modal__handle" />
          <div className="new-room-modal__header">
            <div className="new-room-modal__title">{t('pd.editProject')}</div>
          </div>
          <div className="new-room-modal__body" style={{ paddingBottom: 8 }}>
            <IonList inset style={{ margin: '0 0 12px' }}>
              <IonItem>
                <IonLabel position="stacked">{t('np.client')}</IonLabel>
                <IonInput value={editName} onIonInput={e => { setEditName(e.detail.value ?? ''); setEditError(''); }} placeholder={t('np.clientPH')} clearInput />
              </IonItem>
              <IonItem>
                <IonLabel position="stacked">{t('np.phone')}</IonLabel>
                <IonInput value={editPhone} onIonInput={e => setEditPhone(e.detail.value ?? '')} type="tel" placeholder={t('np.phonePH')} />
              </IonItem>
              <IonItem>
                <IonLabel position="stacked">{t('np.address')}</IonLabel>
                <IonInput value={editAddress} onIonInput={e => setEditAddress(e.detail.value ?? '')} placeholder={t('np.addressPH')} />
              </IonItem>
              <IonItem lines="none">
                <IonLabel position="stacked">{t('np.notes')}</IonLabel>
                <IonTextarea value={editNotes} onIonInput={e => setEditNotes(e.detail.value ?? '')} placeholder={t('np.notesPH')} rows={3} />
              </IonItem>
            </IonList>
            {editError && <div className="new-room-modal__error">{editError}</div>}
          </div>
          <div className="new-room-modal__footer">
            <button className="new-room-modal__btn new-room-modal__btn--cancel" onClick={() => setShowEditModal(false)}>
              {t('common.cancel')}
            </button>
            <ActionButton expand={false} solid onClick={handleSaveEdit} className="new-room-modal__action-btn">
              {t('common.save')}
            </ActionButton>
          </div>
        </div>
      </IonModal>
    </IonPage>
  );
};

export default ProjectDetail;
