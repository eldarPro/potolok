import React, { useEffect, useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonList, IonItem, IonLabel, IonInput, IonTextarea,
  IonButton, IonText, useIonRouter,
} from '@ionic/react';
import { useParams } from 'react-router-dom';
import { chevronBackOutline } from 'ionicons/icons';
import { AdditionalService } from '../../types';
import { loadServices, upsertService } from '../../lib/storage';

type FormState = Omit<AdditionalService, 'id'>;

const empty = (): FormState => ({ title: '', price: 0, priceInstall: 0, description: '' });

const ServiceForm: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const router = useIonRouter();
  const isNew = !id;
  const [form, setForm] = useState<FormState>(empty());
  const [error, setError] = useState('');

  useEffect(() => {
    if (id) {
      const found = loadServices().find(i => i.id === id);
      if (found) {
        const { id: _id, ...rest } = found;
        setForm(rest);
      }
    }
  }, [id]);

  const set = <K extends keyof FormState>(field: K, value: FormState[K]) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const handleSave = () => {
    if (!form.title.trim()) { setError('Укажите название'); return; }
    upsertService({ id: id ?? crypto.randomUUID(), ...form, title: form.title.trim() });
    router.goBack();
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton text="" icon={chevronBackOutline} defaultHref="/price-list/services" />
          </IonButtons>
          <IonTitle>{isNew ? 'Новый' : 'Редактирование'}</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent>
        <IonList inset>
          <IonItem>
            <IonLabel position="stacked">Название *</IonLabel>
            <IonInput value={form.title} onIonInput={e => set('title', e.detail.value ?? '')} clearInput />
          </IonItem>
          <IonItem>
            <IonLabel position="stacked">Цена клиенту (₽)</IonLabel>
            <IonInput type="number" value={form.price} onIonInput={e => set('price', Number(e.detail.value) || 0)} />
          </IonItem>
          <IonItem>
            <IonLabel position="stacked">Зарплата за установку (₽)</IonLabel>
            <IonInput type="number" value={form.priceInstall} onIonInput={e => set('priceInstall', Number(e.detail.value) || 0)} />
          </IonItem>
          <IonItem>
            <IonLabel position="stacked">Описание</IonLabel>
            <IonTextarea
              value={form.description}
              onIonInput={e => set('description', e.detail.value ?? '')}
              rows={3}
              placeholder="Необязательно"
            />
          </IonItem>
        </IonList>

        {error && (
          <div style={{ padding: '0 32px' }}>
            <IonText color="danger"><small>{error}</small></IonText>
          </div>
        )}

        <div style={{ padding: 16 }}>
          <IonButton expand="block" onClick={handleSave}>
            {isNew ? 'Добавить' : 'Сохранить'}
          </IonButton>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default ServiceForm;
