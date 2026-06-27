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
import './NewProject.css';

const NewProject: React.FC = () => {
  const router = useIonRouter();
  const [clientName, setClientName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const handleCreate = () => {
    if (!clientName.trim()) {
      setError('Укажите имя клиента');
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
          <IonTitle>Новый проект</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="new-project-content">
        <IonList inset className="new-project-form">
          <IonItem>
            <IonLabel position="stacked">Клиент *</IonLabel>
            <IonInput
              value={clientName}
              onIonInput={e => { setClientName(e.detail.value ?? ''); setError(''); }}
              placeholder="Иванов Иван"
              clearInput
            />
          </IonItem>
          <IonItem>
            <IonLabel position="stacked">Телефон</IonLabel>
            <IonInput
              value={phone}
              onIonInput={e => setPhone(e.detail.value ?? '')}
              type="tel"
              placeholder="+7 (999) 000-00-00"
            />
          </IonItem>
          <IonItem>
            <IonLabel position="stacked">Адрес объекта</IonLabel>
            <IonInput
              value={address}
              onIonInput={e => setAddress(e.detail.value ?? '')}
              placeholder="ул. Ленина 1, кв. 5"
            />
          </IonItem>
          <IonItem lines="none">
            <IonLabel position="stacked">Заметки</IonLabel>
            <IonTextarea
              value={notes}
              onIonInput={e => setNotes(e.detail.value ?? '')}
              placeholder="Дополнительная информация..."
              rows={3}
            />
          </IonItem>
        </IonList>

        {error && (
          <div className="new-project-error">{error}</div>
        )}

        <div className="new-project-footer">
          <ActionButton solid onClick={handleCreate}>
            Создать проект
          </ActionButton>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default NewProject;
