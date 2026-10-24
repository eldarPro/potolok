import React, { useEffect, useRef, useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonContent,
  IonButtons, IonBackButton, IonButton, IonIcon,
  IonModal, IonItem,
  IonActionSheet, IonAlert, IonList, IonLabel, IonInput, IonTextarea,
  useIonRouter, useIonViewWillEnter,
} from '@ionic/react';
import {
  chevronBackOutline, addOutline,
  documentTextOutline, ellipsisVerticalOutline, readerOutline,
  callOutline, locationOutline, chatbubbleOutline, navigateOutline, createOutline,
} from 'ionicons/icons';
import { Capacitor } from '@capacitor/core';
import { useParams } from 'react-router-dom';
import { getProject, upsertProject, createRoom, deleteProject } from '../lib/storage';
import { Project } from '../types';
import { calcRoomClientPrice, projectEstimate, projectPricing } from '../lib/pricing';
import ActionButton from '../components/ActionButton';
import RoomThumb from '../components/RoomThumb';
import { useT } from '../lib/i18n';
import './ProjectDetail.css';

const formatRub = (v: number) => `${Math.round(v).toLocaleString('ru')} ₽`;

const mapsUrl = (address: string) => {
  const q = encodeURIComponent(address);
  switch (Capacitor.getPlatform()) {
    case 'android': return `geo:0,0?q=${q}`;
    case 'ios': return `maps://?q=${q}`;
    default: return `https://www.google.com/maps/search/?api=1&query=${q}`;
  }
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
  const [roomMenuId, setRoomMenuId] = useState<string | null>(null);
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
  const pricing = projectPricing(project);
  const totalPrice = projectEstimate(project).clientTotal;
  const drawnCount = project.rooms.filter(r => r.areaSqm > 0).length;
  const tel = (project.phone ?? '').replace(/[^\d+]/g, '');
  const menuRoom = project.rooms.find(r => r.id === roomMenuId);

  return (
    <IonPage>
      <IonHeader className="project-detail-header">
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton text="" icon={chevronBackOutline} defaultHref="/" />
          </IonButtons>
          <IonButtons slot="end">
            <IonButton fill="clear" onClick={() => setShowMenu(true)}>
              <IonIcon slot="icon-only" icon={ellipsisVerticalOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent className="project-detail-content">
        {/* ── Client ── */}
        <div className="project-detail-hero">
          <div className="project-detail-hero__name">{project.clientName || t('pd.project')}</div>
          {(project.phone || project.address) && (
            <div className="project-detail-hero__info">
              {project.phone && <span><IonIcon icon={callOutline} />{project.phone}</span>}
              {project.address && <span><IonIcon icon={locationOutline} />{project.address}</span>}
            </div>
          )}
          {project.notes && (
            <div className="project-detail-hero__notes">
              <IonIcon icon={readerOutline} />
              {project.notes}
            </div>
          )}
          {(tel || project.address) && (
            <div className="project-detail-hero__actions">
              {tel && (
                <a className="project-detail-hero__action" href={`tel:${tel}`}>
                  <IonIcon icon={callOutline} />{t('pd.call')}
                </a>
              )}
              {tel && (
                <a className="project-detail-hero__action" href={`sms:${tel}`}>
                  <IonIcon icon={chatbubbleOutline} />{t('pd.message')}
                </a>
              )}
              {project.address && (
                <a className="project-detail-hero__action" href={mapsUrl(project.address)} target="_blank" rel="noopener noreferrer">
                  <IonIcon icon={navigateOutline} />{t('pd.route')}
                </a>
              )}
            </div>
          )}
        </div>

        {/* ── Totals ── */}
        <div className="project-detail-totals card">
          <div className="project-detail-totals__stat project-detail-totals__stat--price">
            <b className={totalPrice > 0 ? '' : 'project-detail-totals__none'}>{totalPrice > 0 ? formatRub(totalPrice) : '— ₽'}</b>
            <small>{t('pd.approxShort')}</small>
          </div>
          <div className="project-detail-totals__stat">
            <b className={totalSqm > 0 ? '' : 'project-detail-totals__none'}>{totalSqm.toFixed(1)}</b>
            <small>м²</small>
          </div>
          <div className="project-detail-totals__stat">
            <b className={totalPerimeterM > 0 ? '' : 'project-detail-totals__none'}>{totalPerimeterM.toFixed(1)}</b>
            <small>{t('pd.linM')}</small>
          </div>
          <button
            className="project-detail-totals__estimate"
            disabled={project.rooms.length === 0}
            onClick={() => router.push(`/project/${id}/summary`, 'forward', 'push')}
          >
            <IonIcon icon={documentTextOutline} />
            {t('pd.estimate')}
          </button>
        </div>

        {/* ── Rooms ── */}
        <div className="project-detail-section-header">
          <div className="project-detail-section-title">{t('pd.rooms')}</div>
          {project.rooms.length > 0 && (
            <div className="project-detail-section-meta">
              {t('pd.drawnOf', { n: drawnCount, total: project.rooms.length })}
            </div>
          )}
        </div>

        <div className="project-detail-rooms">
          {project.rooms.map(room => {
            const roomPrice = calcRoomClientPrice(room, pricing);
            const drawn = room.areaSqm > 0;
            return (
              <div
                key={room.id}
                className="room-tile card"
                onClick={() => router.push(`/project/${id}/room/${room.id}`, 'forward', 'push')}
              >
                <div className={`room-tile__preview${drawn ? '' : ' room-tile__preview--empty'}`}>
                  {drawn ? (
                    <RoomThumb points={room.points} size={88} pad={4} strokeWidth={2} />
                  ) : (
                    <>
                      <IonIcon icon={createOutline} />
                      {t('pd.draw')}
                    </>
                  )}
                </div>
                <div className="room-tile__body">
                  <div className="room-tile__top">
                    <div className="room-tile__name">{room.name}</div>
                    <button
                      className="room-tile__menu"
                      aria-label={t('pd.roomMenu')}
                      onClick={e => { e.stopPropagation(); setRoomMenuId(room.id); }}
                    >
                      <IonIcon icon={ellipsisVerticalOutline} />
                    </button>
                  </div>
                  <div className="room-tile__meta">
                    {drawn
                      ? [`${room.areaSqm.toFixed(1)} м²`, room.fabric?.title].filter(Boolean).join(' · ')
                      : t('pd.noDrawing')}
                  </div>
                  <div className={`room-tile__price${roomPrice > 0 ? '' : ' room-tile__price--none'}`}>
                    {roomPrice > 0 ? formatRub(roomPrice) : '—'}
                  </div>
                </div>
              </div>
            );
          })}

          <button className="room-tile room-tile--add" onClick={handleOpenNewRoom}>
            <IonIcon icon={addOutline} />
            {t('pd.newRoom')}
          </button>
        </div>

        {project.rooms.length === 0 && (
          <div className="project-detail-empty-hint">{t('pd.emptyHint')}</div>
        )}

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

      <IonActionSheet
        isOpen={!!menuRoom}
        onDidDismiss={() => setRoomMenuId(null)}
        header={menuRoom?.name}
        buttons={[
          { text: t('viz.menuItem'), handler: () => { if (menuRoom) router.push(`/project/${id}/room/${menuRoom.id}/visualize`, 'forward', 'push'); } },
          { text: t('common.delete'), role: 'destructive', handler: () => { if (menuRoom) handleDeleteRoom(menuRoom.id); } },
          { text: t('common.cancel'), role: 'cancel' },
        ]}
      />

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
