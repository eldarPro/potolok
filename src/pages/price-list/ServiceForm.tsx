import React, { useEffect, useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonList, IonItem, IonLabel, IonInput, IonTextarea,
  IonText, useIonRouter,
} from '@ionic/react';
import { useParams } from 'react-router-dom';
import { chevronBackOutline } from 'ionicons/icons';
import { AdditionalService } from '../../types';
import ActionButton from '../../components/ActionButton';
import { loadServices, upsertService } from '../../lib/storage';
import { useT } from '../../lib/i18n';

type FormState = Omit<AdditionalService, 'id'>;

const empty = (): FormState => ({ title: '', price: 0, priceInstall: 0, description: '' });

const ServiceForm: React.FC = () => {
  const { t } = useT();
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
    if (!form.title.trim()) { setError(t('cf.errorTitle')); return; }
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
          <IonTitle>{isNew ? t('cf.newTitle') : t('cf.editTitle')}</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent>
        <IonList inset>
          <IonItem>
            <IonLabel position="stacked">{t('cf.name')}</IonLabel>
            <IonInput value={form.title} onIonInput={e => set('title', e.detail.value ?? '')} clearInput />
          </IonItem>
          <IonItem>
            <IonLabel position="stacked">{t('sf.clientPrice')}</IonLabel>
            <IonInput type="number" value={form.price} onIonInput={e => set('price', Number(e.detail.value) || 0)} />
          </IonItem>
          <IonItem>
            <IonLabel position="stacked">{t('sf.installPrice')}</IonLabel>
            <IonInput type="number" value={form.priceInstall} onIonInput={e => set('priceInstall', Number(e.detail.value) || 0)} />
          </IonItem>
          <IonItem>
            <IonLabel position="stacked">{t('sf.description')}</IonLabel>
            <IonTextarea
              value={form.description}
              onIonInput={e => set('description', e.detail.value ?? '')}
              rows={3}
              placeholder={t('sf.optional')}
            />
          </IonItem>
        </IonList>

        {error && (
          <div style={{ padding: '0 32px' }}>
            <IonText color="danger"><small>{error}</small></IonText>
          </div>
        )}

        <div style={{ padding: 16 }}>
          <ActionButton solid onClick={handleSave}>
            {isNew ? t('common.add') : t('common.save')}
          </ActionButton>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default ServiceForm;
