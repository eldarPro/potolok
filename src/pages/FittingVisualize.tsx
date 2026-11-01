import React, { useState, useEffect } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonButton,
  IonModal, IonContent, IonList, IonItem, IonLabel, IonIcon,
  useIonRouter, useIonToast, useIonViewWillEnter,
} from '@ionic/react';
import { chevronBackOutline, addOutline, addCircleOutline, folderOpenOutline } from 'ionicons/icons';
import { useLocation, useParams } from 'react-router-dom';
import { getFitting, upsertFitting, deleteFitting, loadProjects, upsertProject, createProject, createRoom } from '../lib/storage';
import { Fitting, Project, Room, RoomVisualization } from '../types';
import VisualizeWorkspace from '../components/VisualizeWorkspace';
import { useT } from '../lib/i18n';
import { useMenu, usePrompt } from '../components/Dialogs';
import './FittingVisualize.css';

const FittingVisualize: React.FC = () => {
  const { t } = useT();
  const { id } = useParams<{ id: string }>();
  // the description typed on the Try-on tab, generated from right away
  const { state } = useLocation<{ prompt?: string } | undefined>();
  const router = useIonRouter();
  const [presentToast] = useIonToast();

  const [fitting, setFitting] = useState<Fitting | null>(null);
  const menu = useMenu();
  const prompt = usePrompt();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [pickedProject, setPickedProject] = useState<Project | null>(null);

  const load = () => setFitting(getFitting(id));

  useEffect(() => { load(); }, [id]);
  useIonViewWillEnter(() => load());

  if (!fitting) return null;

  const persist = (visualization: RoomVisualization | null) => {
    if (!visualization) {
      deleteFitting(fitting.id);
      router.goBack();
      return;
    }
    const updated: Fitting = { ...fitting, visualization, updatedAt: new Date().toISOString() };
    setFitting(updated);
    upsertFitting(updated);
  };

  /** The fitting moves into the room (it is not copied — photos are large), then the room opens. */
  const moveTo = (project: Project, room: Room, isNewRoom: boolean) => {
    const filled: Room = { ...room, visualization: fitting.visualization };
    const updated: Project = {
      ...project,
      rooms: isNewRoom ? [...project.rooms, filled] : project.rooms.map(r => r.id === room.id ? filled : r),
      updatedAt: new Date().toISOString(),
    };
    try {
      upsertProject(updated);
    } catch {
      presentToast({ message: t('viz.storageError'), duration: 2500, color: 'danger', position: 'bottom' });
      return;
    }
    deleteFitting(fitting.id);
    setPickerOpen(false);
    presentToast({ message: t('fit.saved'), duration: 2000, position: 'bottom' });
    router.push(`/project/${updated.id}`, 'forward', 'replace');
  };

  const saveToNewProject = (clientName: string, roomName: string) => {
    const project = createProject({ clientName: clientName.trim(), address: '', phone: '', notes: '' });
    moveTo(project, createRoom(roomName.trim() || t('fit.defaultRoom')), true);
  };

  const askNewProject = async () => {
    const v = await prompt({
      title: t('fit.saveNew'), confirmText: t('common.save'), dark: true,
      fields: [
        // a project needs a client name, as on the new-project form
        { name: 'client', placeholder: t('fit.clientPH'), required: true },
        { name: 'room', placeholder: t('fit.roomPH'), value: t('fit.defaultRoom') },
      ],
    });
    if (v) saveToNewProject(v.client, v.room ?? '');
  };

  const openSave = () => menu({
    title: t('fit.saveTitle'),
    subtitle: t('fit.saveHint'),
    dark: true,
    items: [
      { icon: addCircleOutline, label: t('fit.saveNew'), onClick: askNewProject },
      { icon: folderOpenOutline, label: t('fit.saveExisting'), onClick: openPicker },
    ],
  });

  const openPicker = () => {
    setProjects(loadProjects());
    setPickedProject(null);
    setPickerOpen(true);
  };

  return (
    <IonPage className="dark-page">
      <IonHeader className="dark-header">
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton text="" icon={chevronBackOutline} defaultHref="/tabs/fittings" />
          </IonButtons>
          <div className="dark-header__title">
            <div className="dark-header__name">{t('fit.title')}</div>
          </div>
          <IonButtons slot="end">
            <IonButton className="fitting-save-btn" onClick={openSave}>{t('common.save')}</IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <VisualizeWorkspace visualization={fitting.visualization} onChange={persist} fileName={t('fit.title')} autoPrompt={state?.prompt} />


      <IonModal isOpen={pickerOpen} onDidDismiss={() => setPickerOpen(false)} initialBreakpoint={0.75} breakpoints={[0, 0.75, 1]}>
        <IonHeader>
          <IonToolbar>
            {pickedProject && (
              <IonButtons slot="start">
                <IonButton onClick={() => setPickedProject(null)}><IonIcon slot="icon-only" icon={chevronBackOutline} /></IonButton>
              </IonButtons>
            )}
            <IonTitle>{pickedProject ? t('fit.pickRoom') : t('fit.pickProject')}</IonTitle>
          </IonToolbar>
        </IonHeader>
        <IonContent>
          {!pickedProject ? (
            projects.length === 0 ? (
              <div className="fitting-picker__empty">{t('fit.noProjects')}</div>
            ) : (
              <IonList>
                {projects.map(p => (
                  <IonItem key={p.id} button detail onClick={() => setPickedProject(p)}>
                    <IonLabel>
                      <h2>{p.clientName || t('proj.noName')}</h2>
                      {p.address && <p>{p.address}</p>}
                    </IonLabel>
                  </IonItem>
                ))}
              </IonList>
            )
          ) : (
            <IonList>
              {pickedProject.rooms.map(r => (
                <IonItem key={r.id} button detail onClick={() => moveTo(pickedProject, r, false)}>
                  <IonLabel>
                    <h2>{r.name}</h2>
                    {r.visualization && <p className="fitting-picker__warn">{t('fit.replaces')}</p>}
                  </IonLabel>
                </IonItem>
              ))}
              <IonItem button onClick={() => moveTo(pickedProject, createRoom(t('fit.defaultRoom')), true)}>
                <IonIcon slot="start" icon={addOutline} color="primary" />
                <IonLabel color="primary">{t('pd.newRoom')}</IonLabel>
              </IonItem>
            </IonList>
          )}
        </IonContent>
      </IonModal>
    </IonPage>
  );
};

export default FittingVisualize;
