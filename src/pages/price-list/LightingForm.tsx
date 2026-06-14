import React, { useEffect, useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonList, IonItem, IonLabel, IonInput,
  IonSelect, IonSelectOption, IonButton, IonText, useIonRouter,
} from '@ionic/react';
import { useParams } from 'react-router-dom';
import { chevronBackOutline } from 'ionicons/icons';
import { LightingCatalogItem, LightingType } from '../../types';
import { loadLightings, upsertLighting } from '../../lib/storage';
import { LIGHTING_TYPES, LIGHTING_META, POINT_SYMBOLS, UNIT_LABEL } from '../../lib/lighting';

type FormState = Omit<LightingCatalogItem, 'id'>;

const empty = (): FormState => ({
  title: '', type: 'spot', placement: 'point', unit: 'pcs',
  symbol: '⊙', price: 0, priceInstall: 0, color: '#ffffff',
});

const LightingForm: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const router = useIonRouter();
  const isNew = !id;
  const [form, setForm] = useState<FormState>(empty());
  const [error, setError] = useState('');

  useEffect(() => {
    if (id) {
      const found = loadLightings().find(i => i.id === id);
      if (found) {
        const { id: _id, ...rest } = found;
        setForm(rest);
      }
    }
  }, [id]);

  const set = <K extends keyof FormState>(field: K, value: FormState[K]) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const handleTypeChange = (type: LightingType) => {
    const meta = LIGHTING_META[type];
    setForm(prev => ({
      ...prev,
      type,
      placement: meta.placement,
      unit: meta.unit,
      symbol: meta.placement === 'point' ? prev.symbol || '⊙' : '—',
    }));
  };

  const handleSave = () => {
    if (!form.title.trim()) { setError('Укажите название'); return; }
    upsertLighting({ id: id ?? crypto.randomUUID(), ...form, title: form.title.trim() });
    router.goBack();
  };

  const unitLabel = UNIT_LABEL[form.unit];

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton text="" icon={chevronBackOutline} defaultHref="/price-list/lightings" />
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
            <IonLabel position="stacked">Тип</IonLabel>
            <IonSelect value={form.type} onIonChange={e => handleTypeChange(e.detail.value)}>
              {LIGHTING_TYPES.map(([type, meta]) => (
                <IonSelectOption key={type} value={type}>{meta.label}</IonSelectOption>
              ))}
            </IonSelect>
          </IonItem>

          <IonItem>
            <IonLabel color="medium">Размещение</IonLabel>
            <IonText slot="end" color="medium">
              {form.placement === 'point' ? 'Точка на чертеже' : 'Линия на чертеже'}
            </IonText>
          </IonItem>

          <IonItem>
            <IonLabel color="medium">Единица измерения</IonLabel>
            <IonText slot="end" color="medium">{unitLabel}</IonText>
          </IonItem>

          <IonItem>
            <IonLabel position="stacked">Цена клиенту (₽ / {unitLabel})</IonLabel>
            <IonInput type="number" value={form.price} onIonInput={e => set('price', Number(e.detail.value) || 0)} />
          </IonItem>

          <IonItem>
            <IonLabel position="stacked">Зарплата за установку (₽ / {unitLabel})</IonLabel>
            <IonInput type="number" value={form.priceInstall} onIonInput={e => set('priceInstall', Number(e.detail.value) || 0)} />
          </IonItem>

          <IonItem>
            <IonLabel>Цвет на чертеже</IonLabel>
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

        {/* Symbol picker — только для point */}
        {form.placement === 'point' && (
          <div style={{ padding: '0 16px 8px' }}>
            <IonText color="medium">
              <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600 }}>Символ на чертеже</p>
            </IonText>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {POINT_SYMBOLS.map(sym => (
                <button
                  key={sym}
                  onClick={() => set('symbol', sym)}
                  style={{
                    width: 44, height: 44, fontSize: 22, borderRadius: 10,
                    border: form.symbol === sym ? '2px solid var(--ion-color-primary)' : '2px solid var(--ion-color-light)',
                    background: form.symbol === sym ? 'rgba(56,128,255,0.1)' : 'var(--ion-color-light)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {sym}
                </button>
              ))}
            </div>
          </div>
        )}

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

export default LightingForm;
