import React, { useState, useEffect } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonButtons, IonBackButton, useIonViewWillEnter,
} from '@ionic/react';
import { chevronBackOutline } from 'ionicons/icons';
import { useParams } from 'react-router-dom';
import { getProject, upsertProject } from '../lib/storage';
import { Project, Room, RoomVisualization } from '../types';
import VisualizeWorkspace from '../components/VisualizeWorkspace';
import { useT } from '../lib/i18n';

const RoomVisualize: React.FC = () => {
  const { t } = useT();
  const { projectId, roomId } = useParams<{ projectId: string; roomId: string }>();

  const [project, setProject] = useState<Project | null>(null);
  const [room, setRoom] = useState<Room | null>(null);

  const load = () => {
    const p = getProject(projectId);
    if (!p) return;
    setProject(p);
    setRoom(p.rooms.find(r => r.id === roomId) ?? null);
  };

  useEffect(() => { load(); }, [projectId, roomId]);
  useIonViewWillEnter(() => load());

  if (!project || !room) return null;

  const persist = (visualization: RoomVisualization | null) => {
    const updatedRoom: Room = { ...room, visualization };
    const updatedProject: Project = {
      ...project,
      rooms: project.rooms.map(r => r.id === roomId ? updatedRoom : r),
      updatedAt: new Date().toISOString(),
    };
    setRoom(updatedRoom);
    setProject(updatedProject);
    upsertProject(updatedProject);
  };

  return (
    <IonPage className="dark-page">
      <IonHeader className="dark-header">
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton text="" icon={chevronBackOutline} defaultHref={`/project/${projectId}/room/${roomId}`} />
          </IonButtons>
          <div className="dark-header__title">
            <div className="dark-header__name">{t('viz.title')}</div>
            <div className="dark-header__sub">{[room.name, project.clientName].filter(Boolean).join(' · ')}</div>
          </div>
        </IonToolbar>
      </IonHeader>

      <VisualizeWorkspace visualization={room.visualization} onChange={persist} room={room} fileName={room.name} />
    </IonPage>
  );
};

export default RoomVisualize;
