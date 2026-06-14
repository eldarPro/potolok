import React, { useEffect, useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonList, IonItem, IonLabel, IonInput,
  IonToggle, IonButton, IonText, useIonRouter,
} from '@ionic/react';
import { useParams } from 'react-router-dom';
import { chevronBackOutline } from 'ionicons/icons';
import { CatalogItem } from '../../types';
import { loadFabrics, upsertFabric, loadProfiles, upsertProfile } from '../../lib/storage';

interface Props {
  category: 'fabrics' | 'profiles';
}

type FormState = Omit<CatalogItem, 'id'>;

const empty = (): FormState => ({
  title: '', price: 0, priceCorner: 0, priceInstall: 0, priceInstallCorner: 0,
  isDefault: false, color: '#ffffff',
});

const CatalogForm: React.FC<Props> = ({ category }) => {
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
    if (!form.title.trim()) { setError('Укажите название'); return; }
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
          <IonTitle>{isNew ? 'Новый' : 'Редактирование'}</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent>
        <IonList inset>
          <IonItem>
            <IonLabel position="stacked">Название *</IonLabel>
            <IonInput
              value={form.title}
              onIonInput={e => set('title', e.detail.value ?? '')}
              clearInput
            />
          </IonItem>
          <IonItem>
            <IonLabel position="stacked">Цена клиенту (₽)</IonLabel>
            <IonInput
              type="number"
              value={form.price}
              onIonInput={e => set('price', Number(e.detail.value) || 0)}
            />
          </IonItem>
          <IonItem>
            <IonLabel position="stacked">Цена клиенту за угол (₽)</IonLabel>
            <IonInput
              type="number"
              value={form.priceCorner}
              onIonInput={e => set('priceCorner', Number(e.detail.value) || 0)}
            />
          </IonItem>
          <IonItem>
            <IonLabel position="stacked">Зарплата за установку (₽)</IonLabel>
            <IonInput
              type="number"
              value={form.priceInstall}
              onIonInput={e => set('priceInstall', Number(e.detail.value) || 0)}
            />
          </IonItem>
          <IonItem>
            <IonLabel position="stacked">Зарплата за угол (₽)</IonLabel>
            <IonInput
              type="number"
              value={form.priceInstallCorner}
              onIonInput={e => set('priceInstallCorner', Number(e.detail.value) || 0)}
            />
          </IonItem>
          <IonItem>
            <IonLabel>По умолчанию</IonLabel>
            <IonToggle
              slot="end"
              checked={form.isDefault}
              onIonChange={e => set('isDefault', e.detail.checked)}
            />
          </IonItem>
          <IonItem>
            <IonLabel>Цвет</IonLabel>
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
          <IonButton expand="block" onClick={handleSave}>
            {isNew ? 'Добавить' : 'Сохранить'}
          </IonButton>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default CatalogForm;
