import React, { useEffect, useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonList, IonItem, IonLabel, IonInput, IonTextarea,
  IonText, IonSelect, IonSelectOption, useIonRouter,
} from '@ionic/react';
import { useParams } from 'react-router-dom';
import { chevronBackOutline } from 'ionicons/icons';
import { NicheItem, NicheType, NicheUnit } from '../../types';
import ActionButton from '../../components/ActionButton';
import { loadNiches, upsertNiche } from '../../lib/storage';
import { uuid } from '../../lib/uuid';
import { useT } from '../../lib/i18n';
import './NicheForm.css';

type FormState = Omit<NicheItem, 'id'>;

const empty = (): FormState => ({
  title: '', unit: 'perimeter', price: 0, priceInstall: 0, description: '',
  type: 'curtain', priceCap: 0, priceInstallCap: 0, priceCorner: 0, priceInstallCorner: 0,
  priceCornice: 0, priceInstallCornice: 0,
});

const UNITS: NicheUnit[] = ['perimeter', 'pcs'];
const TYPES: NicheType[] = ['curtain', 'cornice'];

type PriceKey = 'priceCap' | 'priceInstallCap' | 'priceCorner' | 'priceInstallCorner' | 'priceCornice' | 'priceInstallCornice';

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

  // A niche's add-ons — end caps, corners, the cornice — each with a client
  // price and the installer's pay, as on every price-list item
  const priceGroup = (title: string, hint: string, client: PriceKey, install: PriceKey, unit: string) => (
    <>
      <div className="nf-group">
        <div className="nf-group__title">{title}</div>
        <div className="nf-group__hint">{hint}</div>
      </div>
      <IonList inset>
        <IonItem>
          <IonLabel position="stacked">{t('af.clientPrice', { unit })}</IonLabel>
          <IonInput type="number" value={form[client] ?? 0} onIonInput={e => set(client, Number(e.detail.value) || 0)} />
        </IonItem>
        <IonItem>
          <IonLabel position="stacked">{t('af.installPrice', { unit })}</IonLabel>
          <IonInput type="number" value={form[install] ?? 0} onIonInput={e => set(install, Number(e.detail.value) || 0)} />
        </IonItem>
      </IonList>
    </>
  );

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
          {form.unit === 'perimeter' && (
            <IonItem>
              <IonLabel position="stacked">{t('nf.type')}</IonLabel>
              <IonSelect value={form.type} onIonChange={e => set('type', e.detail.value)} interface="action-sheet">
                {TYPES.map(ty => (
                  <IonSelectOption key={ty} value={ty}>
                    {ty === 'curtain' ? t('nf.typeCurtain') : t('nf.typeCornice')}
                  </IonSelectOption>
                ))}
              </IonSelect>
            </IonItem>
          )}
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

        {form.unit === 'perimeter' && <>
          {priceGroup(t('nf.capGroup'), t('nf.capHint'), 'priceCap', 'priceInstallCap', t('unit.pcs'))}
          {priceGroup(t('nf.cornerGroup'), t('nf.cornerHint'), 'priceCorner', 'priceInstallCorner', t('unit.pcs'))}
          {form.type === 'cornice' && priceGroup(t('nf.corniceGroup'), t('nf.corniceHint'), 'priceCornice', 'priceInstallCornice', t('unit.m'))}
        </>}

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
