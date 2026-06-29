import React, { useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonList, IonItem, IonLabel,
  IonInput, IonTextarea, IonIcon,
} from '@ionic/react';
import { chevronBackOutline, addOutline } from 'ionicons/icons';
import { useIonRouter } from '@ionic/react';
import { createProject, upsertProject } from '../lib/storage';
import ActionButton from '../components/ActionButton';
import { useT } from '../lib/i18n';
import './NewProject.css';

const NewProject: React.FC = () => {
  const { t } = useT();
  const router = useIonRouter();
  const [clientName, setClientName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const handleCreate = () => {
    if (!clientName.trim()) {
      setError(t('np.errorClient'));
      return;
    }
    const project = createProject({ clientName: clientName.trim(), address, phone, notes });
    upsertProject(project);
    router.push(`/project/${project.id}`);
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton text="" icon={chevronBackOutline} defaultHref="/" />
          </IonButtons>
          <IonTitle>{t('np.title')}</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="new-project-content">
        <IonList inset className="new-project-form">
          <IonItem>
            <IonLabel position="stacked">{t('np.client')}</IonLabel>
            <IonInput
              value={clientName}
              onIonInput={e => { setClientName(e.detail.value ?? ''); setError(''); }}
              placeholder={t('np.clientPH')}
              clearInput
            />
          </IonItem>
          <IonItem>
            <IonLabel position="stacked">{t('np.phone')}</IonLabel>
            <IonInput
              value={phone}
              onIonInput={e => setPhone(e.detail.value ?? '')}
              type="tel"
              placeholder={t('np.phonePH')}
            />
          </IonItem>
          <IonItem>
            <IonLabel position="stacked">{t('np.address')}</IonLabel>
            <IonInput
              value={address}
              onIonInput={e => setAddress(e.detail.value ?? '')}
              placeholder={t('np.addressPH')}
            />
          </IonItem>
          <IonItem lines="none">
            <IonLabel position="stacked">{t('np.notes')}</IonLabel>
            <IonTextarea
              value={notes}
              onIonInput={e => setNotes(e.detail.value ?? '')}
              placeholder={t('np.notesPH')}
              rows={3}
            />
          </IonItem>
        </IonList>

        {error && (
          <div className="new-project-error">{error}</div>
        )}

        <div className="new-project-footer">
          <ActionButton solid onClick={handleCreate}>
            {t('proj.create')}
          </ActionButton>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default NewProject;
