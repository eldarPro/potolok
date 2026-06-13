import React, { useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonIcon, IonFab, IonFabButton,
  IonAccordionGroup, IonAccordion, IonItem, IonLabel, IonText, IonButton,
  IonAlert, IonListHeader, useIonViewWillEnter, useIonRouter,
} from '@ionic/react';
import { addOutline, chevronBackOutline } from 'ionicons/icons';
import { LightingCatalogItem } from '../../types';
import { loadLightings, deleteLighting } from '../../lib/storage';
import { LIGHTING_META, UNIT_LABEL } from '../../lib/lighting';

const LightingList: React.FC = () => {
  const router = useIonRouter();
  const [items, setItems] = useState<LightingCatalogItem[]>([]);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = () => setItems(loadLightings());
  useIonViewWillEnter(load);

  const confirmDelete = () => {
    if (!deleteId) return;
    deleteLighting(deleteId);
    setDeleteId(null);
    load();
  };

  const point = items.filter(i => i.placement === 'point');
  const path  = items.filter(i => i.placement === 'path');

  const renderItem = (item: LightingCatalogItem) => {
    const meta = LIGHTING_META[item.type];
    const unitLabel = UNIT_LABEL[item.unit];
    return (
      <IonAccordion key={item.id} value={item.id}>
        <IonItem slot="header" color="light">
          {item.placement === 'point' ? (
            <span slot="start" style={{ fontSize: 20, width: 28, textAlign: 'center', color: item.color !== '#ffffff' ? item.color : '#555' }}>
              {item.symbol}
            </span>
          ) : (
            <div slot="start" style={{ width: 28, height: 4, borderRadius: 2, background: item.color, border: '1px solid rgba(0,0,0,0.15)' }} />
          )}
          <IonLabel>{item.title}</IonLabel>
          <IonText slot="end" color="medium" style={{ fontSize: 12 }}>{meta.label}</IonText>
        </IonItem>
        <div slot="content">
          <IonItem lines="full">
            <IonLabel color="medium">Цена клиенту</IonLabel>
            <IonText slot="end">{item.price} ₽ / {unitLabel}</IonText>
          </IonItem>
          <IonItem lines="none">
            <IonLabel color="medium">Зарплата за установку</IonLabel>
            <IonText slot="end">{item.priceInstall} ₽ / {unitLabel}</IonText>
          </IonItem>
          <div style={{ display: 'flex', gap: 8, padding: '8px 16px 12px' }}>
            <IonButton fill="outline" expand="block" style={{ flex: 1 }} onClick={() => router.push(`/price-list/lightings/${item.id}/edit`)}>
              Изменить
            </IonButton>
            <IonButton fill="outline" color="danger" expand="block" style={{ flex: 1 }} onClick={() => setDeleteId(item.id)}>
              Удалить
            </IonButton>
          </div>
        </div>
      </IonAccordion>
    );
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonButtons slot="start">
            <IonBackButton text="" icon={chevronBackOutline} defaultHref="/tabs/prices" />
          </IonButtons>
          <IonTitle>Освещение</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent>
        {items.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
            <IonText color="medium">Нет данных</IonText>
          </div>
        ) : (
          <IonAccordionGroup>
            {point.length > 0 && (
              <>
                <IonListHeader>
                  <IonLabel color="medium" style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Точечные
                  </IonLabel>
                </IonListHeader>
                {point.map(renderItem)}
              </>
            )}
            {path.length > 0 && (
              <>
                <IonListHeader>
                  <IonLabel color="medium" style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Линейные
                  </IonLabel>
                </IonListHeader>
                {path.map(renderItem)}
              </>
            )}
          </IonAccordionGroup>
        )}

        <IonFab vertical="bottom" horizontal="end" slot="fixed">
          <IonFabButton onClick={() => router.push('/price-list/lightings/new')}>
            <IonIcon icon={addOutline} />
          </IonFabButton>
        </IonFab>

        <IonAlert
          isOpen={!!deleteId}
          header="Удалить?"
          message="Это действие нельзя отменить."
          buttons={[
            { text: 'Отмена', role: 'cancel', handler: () => setDeleteId(null) },
            { text: 'Удалить', role: 'destructive', handler: confirmDelete },
          ]}
          onDidDismiss={() => setDeleteId(null)}
        />
      </IonContent>
    </IonPage>
  );
};

export default LightingList;
