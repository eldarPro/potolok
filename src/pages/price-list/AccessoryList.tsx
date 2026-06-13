import React, { useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonIcon, IonFab, IonFabButton,
  IonAccordionGroup, IonAccordion, IonItem, IonLabel, IonText, IonButton,
  IonAlert, useIonViewWillEnter, useIonRouter,
} from '@ionic/react';
import { addOutline, chevronBackOutline } from 'ionicons/icons';
import { Accessory } from '../../types';
import { loadAccessories, deleteAccessory } from '../../lib/storage';

const AccessoryList: React.FC = () => {
  const router = useIonRouter();
  const [items, setItems] = useState<Accessory[]>([]);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = () => setItems(loadAccessories());
  useIonViewWillEnter(load);

  const confirmDelete = () => {
    if (!deleteId) return;
    deleteAccessory(deleteId);
    setDeleteId(null);
    load();
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonButtons slot="start">
            <IonBackButton text="" icon={chevronBackOutline} defaultHref="/tabs/prices" />
          </IonButtons>
          <IonTitle>Комплектующие</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent>
        {items.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
            <IonText color="medium">Нет данных</IonText>
          </div>
        ) : (
          <IonAccordionGroup>
            {items.map(item => (
              <IonAccordion key={item.id} value={item.id}>
                <IonItem slot="header" color="light">
                  <IonLabel>{item.title}</IonLabel>
                  <IonText slot="end" color="medium"><small>{item.unit}</small></IonText>
                </IonItem>
                <div slot="content">
                  <IonItem lines="full">
                    <IonLabel color="medium">Цена клиенту</IonLabel>
                    <IonText slot="end">{item.price} ₽ / {item.unit}</IonText>
                  </IonItem>
                  <IonItem lines="none">
                    <IonLabel color="medium">Зарплата за установку</IonLabel>
                    <IonText slot="end">{item.priceInstall} ₽ / {item.unit}</IonText>
                  </IonItem>
                  <div style={{ display: 'flex', gap: 8, padding: '8px 16px 12px' }}>
                    <IonButton
                      fill="outline"
                      expand="block"
                      style={{ flex: 1 }}
                      onClick={() => router.push(`/price-list/accessories/${item.id}/edit`)}
                    >
                      Изменить
                    </IonButton>
                    <IonButton
                      fill="outline"
                      color="danger"
                      expand="block"
                      style={{ flex: 1 }}
                      onClick={() => setDeleteId(item.id)}
                    >
                      Удалить
                    </IonButton>
                  </div>
                </div>
              </IonAccordion>
            ))}
          </IonAccordionGroup>
        )}

        <IonFab vertical="bottom" horizontal="end" slot="fixed">
          <IonFabButton onClick={() => router.push('/price-list/accessories/new')}>
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

export default AccessoryList;
