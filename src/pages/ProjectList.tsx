import React, { useEffect, useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonFab, IonFabButton, IonIcon, IonList, IonItem,
  IonLabel, IonText, IonItemSliding, IonItemOptions,
  IonItemOption, IonNote, IonButtons, IonButton,
} from '@ionic/react';
import { add, trashOutline, chevronForwardOutline } from 'ionicons/icons';
import { useIonRouter } from '@ionic/react';
import { loadProjects, deleteProject } from '../lib/storage';
import { Project } from '../types';

const ProjectList: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const router = useIonRouter();

  const refresh = () => setProjects(loadProjects());

  useEffect(() => {
    refresh();
  }, []);

  const handleDelete = (id: string) => {
    deleteProject(id);
    refresh();
  };

  const totalSqm = (p: Project) =>
    p.rooms.reduce((s, r) => s + r.areaSqm, 0);

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Натяжные потолки</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent>
        {projects.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 12 }}>
            <IonText color="medium" style={{ fontSize: 48 }}>📐</IonText>
            <IonText color="medium"><p style={{ margin: 0 }}>Нет проектов</p></IonText>
            <IonText color="medium"><small>Нажмите + чтобы создать</small></IonText>
          </div>
        ) : (
          <IonList>
            {projects.map(p => (
              <IonItemSliding key={p.id}>
                <IonItem button detail={false} routerLink={`/project/${p.id}`}>
                  <IonLabel>
                    <h2>{p.clientName || 'Без имени'}</h2>
                    <p>{p.address || 'Адрес не указан'}</p>
                  </IonLabel>
                  <IonNote slot="end" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                    <span>{p.rooms.length} {roomWord(p.rooms.length)}</span>
                    {totalSqm(p) > 0 && <small>{totalSqm(p).toFixed(1)} м²</small>}
                  </IonNote>
                  <IonIcon icon={chevronForwardOutline} slot="end" color="medium" style={{ marginLeft: 4 }} />
                </IonItem>
                <IonItemOptions side="end">
                  <IonItemOption color="danger" onClick={() => handleDelete(p.id)}>
                    <IonIcon slot="icon-only" icon={trashOutline} />
                  </IonItemOption>
                </IonItemOptions>
              </IonItemSliding>
            ))}
          </IonList>
        )}

        <IonFab vertical="bottom" horizontal="end" slot="fixed">
          <IonFabButton routerLink="/new-project">
            <IonIcon icon={add} />
          </IonFabButton>
        </IonFab>
      </IonContent>
    </IonPage>
  );
};

function roomWord(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return 'помещение';
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return 'помещения';
  return 'помещений';
}

export default ProjectList;
