import React, { useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonList, IonItem, IonLabel,
  IonInput, IonTextarea, IonButton, IonText,
} from '@ionic/react';
import { chevronBackOutline } from 'ionicons/icons';
import { useIonRouter } from '@ionic/react';
import { createProject, upsertProject } from '../lib/storage';

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
        <IonToolbar color="primary">
          <IonButtons slot="start">
            <IonBackButton text="" icon={chevronBackOutline} defaultHref="/" />
          </IonButtons>
          <IonTitle>Новый проект</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent>
        <IonList inset>
          <IonItem>
            <IonLabel position="stacked">Клиент *</IonLabel>
            <IonInput
              value={clientName}
              onIonInput={e => setClientName(e.detail.value ?? '')}
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
          <IonItem>
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
          <div style={{ padding: '0 16px' }}>
            <IonText color="danger"><small>{error}</small></IonText>
          </div>
        )}

        <div style={{ padding: 16 }}>
          <IonButton expand="block" onClick={handleCreate}>
            Создать проект
          </IonButton>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default NewProject;
