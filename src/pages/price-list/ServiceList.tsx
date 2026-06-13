import React, { useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonIcon, IonFab, IonFabButton,
  IonAccordionGroup, IonAccordion, IonItem, IonLabel, IonText, IonButton,
  IonAlert, useIonViewWillEnter, useIonRouter,
} from '@ionic/react';
import { addOutline, chevronBackOutline } from 'ionicons/icons';
import { AdditionalService } from '../../types';
import { loadServices, deleteService } from '../../lib/storage';

const ServiceList: React.FC = () => {
  const router = useIonRouter();
  const [items, setItems] = useState<AdditionalService[]>([]);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = () => setItems(loadServices());
  useIonViewWillEnter(load);

  const confirmDelete = () => {
    if (!deleteId) return;
    deleteService(deleteId);
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
          <IonTitle>Доп. услуги</IonTitle>
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
                </IonItem>
                <div slot="content">
                  <IonItem lines="full">
                    <IonLabel color="medium">Цена клиенту</IonLabel>
                    <IonText slot="end">{item.price} ₽</IonText>
                  </IonItem>
                  <IonItem lines={item.description ? 'full' : 'none'}>
                    <IonLabel color="medium">Зарплата за установку</IonLabel>
                    <IonText slot="end">{item.priceInstall} ₽</IonText>
                  </IonItem>
                  {item.description ? (
                    <IonItem lines="none">
                      <IonLabel color="medium">
                        Описание
                        <p style={{ whiteSpace: 'pre-wrap' }}>{item.description}</p>
                      </IonLabel>
                    </IonItem>
                  ) : null}
                  <div style={{ display: 'flex', gap: 8, padding: '8px 16px 12px' }}>
                    <IonButton
                      fill="outline"
                      expand="block"
                      style={{ flex: 1 }}
                      onClick={() => router.push(`/price-list/services/${item.id}/edit`)}
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
          <IonFabButton onClick={() => router.push('/price-list/services/new')}>
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

export default ServiceList;
