import React, { useEffect, useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonButton, IonIcon, IonList,
  IonItem, IonLabel, IonAlert, IonText, IonNote,
  IonItemSliding, IonItemOptions, IonItemOption,
  useIonRouter,
} from '@ionic/react';
import {
  chevronBackOutline, addOutline, trashOutline,
  documentTextOutline, chevronForwardOutline,
} from 'ionicons/icons';
import { useParams } from 'react-router-dom';
import { getProject, upsertProject, createRoom } from '../lib/storage';
import { Project, Room } from '../types';

const ProjectDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const router = useIonRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [showNewRoom, setShowNewRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');

  const load = () => setProject(getProject(id));

  useEffect(() => {
    load();
  }, [id]);

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
  const totalPrice = project.rooms.reduce((s, room) => {
    const c = room.points.length;
    const f = room.fabric ? room.fabric.price * room.areaSqm + room.fabric.priceCorner * c : 0;
    const p = (room.profileSegments ?? []).reduce(
      (sum, seg) => sum + seg.profile.price * seg.lengthM + seg.profile.priceCorner,
      0,
    );
    return s + f + p;
  }, 0);

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
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
        {/* Project info */}
        <div style={{ padding: '16px 16px 4px', borderBottom: '1px solid var(--ion-border-color)' }}>
          {project.address && <IonText color="medium"><p style={{ margin: 0, fontSize: 14 }}>{project.address}</p></IonText>}
          {project.phone && <IonText color="medium"><p style={{ margin: 0, fontSize: 14 }}>{project.phone}</p></IonText>}
        </div>

        {/* Rooms */}
        <IonList>
          {project.rooms.map(room => (
            <IonItemSliding key={room.id}>
              <IonItem button detail={false} routerLink={`/project/${id}/room/${room.id}`}>
                <IonLabel>
                  <h3>{room.name}</h3>
                  {room.areaSqm > 0 && (
                    <p>{room.areaSqm.toFixed(2)} м² · п.{room.perimeterM.toFixed(2)} м
                      {room.fabric && <span> · {room.fabric.title}</span>}
                    </p>
                  )}
                </IonLabel>
                <IonNote slot="end">
                  {(() => {
                    if (room.areaSqm === 0) return 'Не начерчено';
                    const c = room.points.length;
                    const f = room.fabric ? room.fabric.price * room.areaSqm + room.fabric.priceCorner * c : 0;
                    const p = (room.profileSegments ?? []).reduce(
                      (sum, seg) => sum + seg.profile.price * seg.lengthM + seg.profile.priceCorner,
                      0,
                    );
                    const total = f + p;
                    return total > 0 ? `${Math.round(total).toLocaleString('ru')} ₽` : `${room.areaSqm.toFixed(1)} м²`;
                  })()}
                </IonNote>
                <IonIcon icon={chevronForwardOutline} slot="end" color="medium" style={{ marginLeft: 4 }} />
              </IonItem>
              <IonItemOptions side="end">
                <IonItemOption color="danger" onClick={() => handleDeleteRoom(room.id)}>
                  <IonIcon slot="icon-only" icon={trashOutline} />
                </IonItemOption>
              </IonItemOptions>
            </IonItemSliding>
          ))}
        </IonList>

        <div style={{ padding: 16 }}>
          <IonButton expand="block" fill="outline" onClick={() => setShowNewRoom(true)}>
            <IonIcon slot="start" icon={addOutline} />
            Добавить помещение
          </IonButton>
        </div>

        {/* Total */}
        {totalSqm > 0 && (
          <div style={{ margin: '0 16px 24px', padding: 16, background: 'var(--ion-color-light)', borderRadius: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <IonText color="medium"><small>Общая площадь</small></IonText>
              <IonText><b>{totalSqm.toFixed(2)} м²</b></IonText>
            </div>
            {totalPrice > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <IonText color="medium"><small>Итого (ориентир.)</small></IonText>
                <IonText color="primary"><b>{totalPrice.toLocaleString('ru')} ₽</b></IonText>
              </div>
            )}
          </div>
        )}

        <IonAlert
          isOpen={showNewRoom}
          header="Новое помещение"
          inputs={[{ name: 'name', type: 'text', placeholder: 'Зал, кухня, спальня...' }]}
          buttons={[
            { text: 'Отмена', role: 'cancel', handler: () => setShowNewRoom(false) },
            {
              text: 'Добавить',
              handler: (data) => handleAddRoom(data.name ?? ''),
            },
          ]}
          onDidDismiss={() => setShowNewRoom(false)}
        />
      </IonContent>
    </IonPage>
  );
};

export default ProjectDetail;
