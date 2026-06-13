import React, { useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonIcon, IonFab, IonFabButton,
  IonAccordionGroup, IonAccordion, IonItem, IonLabel, IonText, IonButton,
  IonAlert, useIonViewWillEnter, useIonRouter,
} from '@ionic/react';
import { addOutline, chevronBackOutline } from 'ionicons/icons';
import { CatalogItem } from '../../types';
import {
  loadFabrics, deleteFabric,
  loadProfiles, deleteProfile,
} from '../../lib/storage';

interface Props {
  category: 'fabrics' | 'profiles';
  title: string;
}

const CatalogList: React.FC<Props> = ({ category, title }) => {
  const router = useIonRouter();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = () => setItems(category === 'fabrics' ? loadFabrics() : loadProfiles());
  useIonViewWillEnter(load);

  const confirmDelete = () => {
    if (!deleteId) return;
    if (category === 'fabrics') deleteFabric(deleteId);
    else deleteProfile(deleteId);
    setDeleteId(null);
    load();
  };

  const basePath = `/price-list/${category}`;

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonButtons slot="start">
            <IonBackButton text="" icon={chevronBackOutline} defaultHref="/tabs/prices" />
          </IonButtons>
          <IonTitle>{title}</IonTitle>
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
                  <div
                    slot="start"
                    style={{ width: 16, height: 16, borderRadius: 3, background: item.color, border: '1px solid rgba(0,0,0,0.15)', flexShrink: 0 }}
                  />
                  <IonLabel>{item.title}</IonLabel>
                  {item.isDefault && <IonText slot="end" color="primary" style={{ fontSize: 12 }}>по умолч.</IonText>}
                </IonItem>
                <div slot="content">
                  <IonItem lines="full">
                    <IonLabel color="medium">Цена клиенту</IonLabel>
                    <IonText slot="end">{item.price} ₽</IonText>
                  </IonItem>
                  <IonItem lines="full">
                    <IonLabel color="medium">Цена клиенту за угол</IonLabel>
                    <IonText slot="end">{item.priceCorner} ₽</IonText>
                  </IonItem>
                  <IonItem lines="full">
                    <IonLabel color="medium">Зарплата за установку</IonLabel>
                    <IonText slot="end">{item.priceInstall} ₽</IonText>
                  </IonItem>
                  <IonItem lines="none">
                    <IonLabel color="medium">Зарплата за угол</IonLabel>
                    <IonText slot="end">{item.priceInstallCorner} ₽</IonText>
                  </IonItem>
                  <div style={{ display: 'flex', gap: 8, padding: '8px 16px 12px' }}>
                    <IonButton
                      fill="outline"
                      expand="block"
                      style={{ flex: 1 }}
                      onClick={() => router.push(`${basePath}/${item.id}/edit`)}
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
          <IonFabButton onClick={() => router.push(`${basePath}/new`)}>
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

export default CatalogList;
