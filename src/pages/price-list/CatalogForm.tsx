import React, { useEffect, useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonList, IonItem, IonLabel, IonInput,
  IonToggle, IonText, useIonRouter,
} from '@ionic/react';
import { useParams } from 'react-router-dom';
import { chevronBackOutline } from 'ionicons/icons';
import { CatalogItem } from '../../types';
import ActionButton from '../../components/ActionButton';
import { loadFabrics, upsertFabric, loadProfiles, upsertProfile } from '../../lib/storage';
import { useT } from '../../lib/i18n';

interface Props {
  category: 'fabrics' | 'profiles';
}

type FormState = Omit<CatalogItem, 'id'>;

const empty = (): FormState => ({
  title: '', price: 0, priceCorner: 0, priceInstall: 0, priceInstallCorner: 0,
  isDefault: false, color: '#ffffff',
});

const CatalogForm: React.FC<Props> = ({ category }) => {
  const { t } = useT();
  const { id } = useParams<{ id?: string }>();
  const router = useIonRouter();
  const isNew = !id;
  const [form, setForm] = useState<FormState>(empty());
  const [error, setError] = useState('');

  useEffect(() => {
    if (id) {
      const all = category === 'fabrics' ? loadFabrics() : loadProfiles();
      const found = all.find(i => i.id === id);
      if (found) {
        const { id: _id, ...rest } = found;
        setForm(rest);
      }
    }
  }, [id, category]);

  const set = <K extends keyof FormState>(field: K, value: FormState[K]) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const handleSave = () => {
    if (!form.title.trim()) { setError(t('cf.errorTitle')); return; }
    const item: CatalogItem = { id: id ?? crypto.randomUUID(), ...form, title: form.title.trim() };
    if (category === 'fabrics') upsertFabric(item);
    else upsertProfile(item);
    router.goBack();
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton text="" icon={chevronBackOutline} defaultHref={`/price-list/${category}`} />
          </IonButtons>
          <IonTitle>{isNew ? t('cf.newTitle') : t('cf.editTitle')}</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent>
        <IonList inset>
          <IonItem>
            <IonLabel position="stacked">{t('cf.name')}</IonLabel>
            <IonInput
              value={form.title}
              onIonInput={e => set('title', e.detail.value ?? '')}
              clearInput
            />
          </IonItem>
          <IonItem>
            <IonLabel position="stacked">{t('mf.clientPrice')}</IonLabel>
            <IonInput
              type="number"
              value={form.price}
              onIonInput={e => set('price', Number(e.detail.value) || 0)}
            />
          </IonItem>
          <IonItem>
            <IonLabel position="stacked">{t('mf.clientPriceCorner')}</IonLabel>
            <IonInput
              type="number"
              value={form.priceCorner}
              onIonInput={e => set('priceCorner', Number(e.detail.value) || 0)}
            />
          </IonItem>
          <IonItem>
            <IonLabel position="stacked">{t('mf.installPrice')}</IonLabel>
            <IonInput
              type="number"
              value={form.priceInstall}
              onIonInput={e => set('priceInstall', Number(e.detail.value) || 0)}
            />
          </IonItem>
          <IonItem>
            <IonLabel position="stacked">{t('mf.installPriceCorner')}</IonLabel>
            <IonInput
              type="number"
              value={form.priceInstallCorner}
              onIonInput={e => set('priceInstallCorner', Number(e.detail.value) || 0)}
            />
          </IonItem>
          <IonItem>
            <IonLabel>{t('cf.isDefault')}</IonLabel>
            <IonToggle
              slot="end"
              checked={form.isDefault}
              onIonChange={e => set('isDefault', e.detail.checked)}
            />
          </IonItem>
          <IonItem>
            <IonLabel>{t('cf.color')}</IonLabel>
            <div slot="end" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--ion-color-medium)' }}>{form.color}</span>
              <input
                type="color"
                value={form.color}
                onChange={e => set('color', e.target.value)}
                style={{ width: 36, height: 28, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
              />
            </div>
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

export default CatalogForm;
