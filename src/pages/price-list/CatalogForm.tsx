import React, { useEffect, useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonList, IonItem, IonLabel, IonInput, IonTextarea,
  IonToggle, IonText, IonSelect, IonSelectOption, useIonRouter,
} from '@ionic/react';
import { useParams } from 'react-router-dom';
import { chevronBackOutline } from 'ionicons/icons';
import { CatalogItem, FabricFinish, ProfileKind } from '../../types';
import { fabricFinish, profileKind } from '../../lib/fabric';
import ActionButton from '../../components/ActionButton';
import { loadFabrics, upsertFabric, loadProfiles, upsertProfile } from '../../lib/storage';
import { uuid } from '../../lib/uuid';
import { useT } from '../../lib/i18n';

interface Props {
  category: 'fabrics' | 'profiles';
}

type FormState = Omit<CatalogItem, 'id'>;

const FINISHES: FabricFinish[] = ['matte', 'satin', 'gloss'];
const PROFILE_KINDS: ProfileKind[] = ['standard', 'shadow', 'floating', 'gapless'];

const empty = (): FormState => ({
  title: '', price: 0, priceCorner: 0, priceInstall: 0, priceInstallCorner: 0,
  isDefault: false, color: '#ffffff', description: '',
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
        // an item from before these fields shows what its title suggests
        setForm({
          ...empty(), ...rest,
          ...(category === 'fabrics' ? { finish: fabricFinish(found) } : { profileKind: profileKind(found) }),
        });
      }
    }
  }, [id, category]);

  const set = <K extends keyof FormState>(field: K, value: FormState[K]) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const handleSave = () => {
    if (!form.title.trim()) { setError(t('cf.errorTitle')); return; }
    const item: CatalogItem = { id: id ?? uuid(), ...form, title: form.title.trim() };
    // a new item's look follows its title unless picked by hand
    if (category === 'fabrics') item.finish = form.finish ?? fabricFinish(item);
    else item.profileKind = form.profileKind ?? profileKind(item);
    if (category === 'fabrics') upsertFabric(item);
    else upsertProfile(item);
    router.goBack();
  };

  return (
    <IonPage>
      <IonHeader className="blue-header">
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton text="" icon={chevronBackOutline} defaultHref={`/price-list/${category}`} />
          </IonButtons>
          <IonTitle>{isNew ? t('cf.newTitle') : t('cf.editTitle')}</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="blue-page">
        <div className="blue-hero" />
        <IonList inset className="blue-hero-overlap">
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
            <IonLabel position="stacked">
              {t(category === 'fabrics' ? 'mf.clientPriceCornerExtra' : 'mf.clientPriceCorner')}
            </IonLabel>
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
            <IonLabel position="stacked">
              {t(category === 'fabrics' ? 'mf.installPriceCornerExtra' : 'mf.installPriceCorner')}
            </IonLabel>
            <IonInput
              type="number"
              value={form.priceInstallCorner}
              onIonInput={e => set('priceInstallCorner', Number(e.detail.value) || 0)}
            />
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
          <IonItem>
            <IonLabel>{t('cf.isDefault')}</IonLabel>
            <IonToggle
              slot="end"
              checked={form.isDefault}
              onIonChange={e => set('isDefault', e.detail.checked)}
            />
          </IonItem>
          {category === 'fabrics' ? (
            <IonItem>
              <IonLabel position="stacked">{t('cf.finish')}</IonLabel>
              <IonSelect
                value={form.finish ?? fabricFinish(form)}
                onIonChange={e => set('finish', e.detail.value as FabricFinish)}
              >
                {FINISHES.map(f => <IonSelectOption key={f} value={f}>{t(`cf.finish.${f}`)}</IonSelectOption>)}
              </IonSelect>
            </IonItem>
          ) : (
            <IonItem>
              <IonLabel position="stacked">{t('cf.profileKind')}</IonLabel>
              <IonSelect
                value={form.profileKind ?? profileKind(form)}
                onIonChange={e => set('profileKind', e.detail.value as ProfileKind)}
              >
                {PROFILE_KINDS.map(k => <IonSelectOption key={k} value={k}>{t(`cf.pk.${k}`)}</IonSelectOption>)}
              </IonSelect>
            </IonItem>
          )}
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
