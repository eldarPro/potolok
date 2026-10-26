import React, { useEffect, useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonList, IonItem, IonLabel, IonInput, IonTextarea,
  IonText, IonSelect, IonSelectOption, useIonRouter,
} from '@ionic/react';
import { useParams } from 'react-router-dom';
import { chevronBackOutline } from 'ionicons/icons';
import { NicheItem, NicheUnit } from '../../types';
import ActionButton from '../../components/ActionButton';
import { loadNiches, upsertNiche } from '../../lib/storage';
import { uuid } from '../../lib/uuid';
import { useT } from '../../lib/i18n';

type FormState = Omit<NicheItem, 'id'>;

const empty = (): FormState => ({ title: '', unit: 'perimeter', price: 0, priceInstall: 0, description: '' });

const UNITS: NicheUnit[] = ['perimeter', 'pcs'];

const NicheForm: React.FC = () => {
  const { t } = useT();
  const { id } = useParams<{ id?: string }>();
  const router = useIonRouter();
  const isNew = !id;
  const [form, setForm] = useState<FormState>(empty());
  const [error, setError] = useState('');

  useEffect(() => {
    if (id) {
      const found = loadNiches().find(i => i.id === id);
      if (found) {
        const { id: _id, ...rest } = found;
        setForm({ ...empty(), ...rest });
      }
    }
  }, [id]);

  const set = <K extends keyof FormState>(field: K, value: FormState[K]) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const handleSave = () => {
    if (!form.title.trim()) { setError(t('cf.errorTitle')); return; }
    upsertNiche({ id: id ?? uuid(), ...form, title: form.title.trim() });
    router.goBack();
  };

  return (
    <IonPage>
      <IonHeader className="blue-header">
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton text="" icon={chevronBackOutline} defaultHref="/price-list/niches" />
          </IonButtons>
          <IonTitle>{isNew ? t('cf.newTitle') : t('cf.editTitle')}</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="blue-page">
        <div className="blue-hero" />
        <IonList inset className="blue-hero-overlap">
          <IonItem>
            <IonLabel position="stacked">{t('cf.name')}</IonLabel>
            <IonInput value={form.title} onIonInput={e => set('title', e.detail.value ?? '')} clearInput />
          </IonItem>
          <IonItem>
            <IonLabel position="stacked">{t('af.unit')}</IonLabel>
            <IonSelect value={form.unit} onIonChange={e => set('unit', e.detail.value)}>
              {UNITS.map(u => (
                <IonSelectOption key={u} value={u}>
                  {u === 'perimeter' ? t('nf.unitPerimeter') : t('nf.unitPcs')}
                </IonSelectOption>
              ))}
            </IonSelect>
          </IonItem>
          <IonItem>
            <IonLabel position="stacked">{t('af.clientPrice', { unit: t(form.unit === 'pcs' ? 'unit.pcs' : 'unit.m') })}</IonLabel>
            <IonInput type="number" value={form.price} onIonInput={e => set('price', Number(e.detail.value) || 0)} />
          </IonItem>
          <IonItem>
            <IonLabel position="stacked">{t('af.installPrice', { unit: t(form.unit === 'pcs' ? 'unit.pcs' : 'unit.m') })}</IonLabel>
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

export default NicheForm;
