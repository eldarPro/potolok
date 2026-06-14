import React, { useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonIcon, IonFab, IonFabButton,
  IonAlert, useIonViewWillEnter, useIonRouter,
} from '@ionic/react';
import { addOutline, chevronBackOutline, settingsOutline, trashOutline } from 'ionicons/icons';
import { Accessory } from '../../types';
import { loadAccessories, deleteAccessory } from '../../lib/storage';
import './ItemCard.css';

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
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton text="" icon={chevronBackOutline} defaultHref="/tabs/prices" />
          </IonButtons>
          <IonTitle>Комплектующие</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="price-items-content">
        {items.length === 0 ? (
          <div className="price-items-empty">
            <span>Нет позиций</span>
            <span style={{ fontSize: 13 }}>Нажмите + чтобы добавить</span>
          </div>
        ) : (
          <div className="price-items-list">
            {items.map(item => (
              <div className="price-item-card" key={item.id}>
                <div className="price-item-card__header">
                  <span className="price-item-card__title">{item.title}</span>
                  <span className="price-item-card__chip">{item.unit}</span>
                  <div className="price-item-card__actions">
                    <button className="price-item-card__action-btn" onClick={() => router.push(`/price-list/accessories/${item.id}/edit`)}>
                      <IonIcon icon={settingsOutline} />
                    </button>
                    <button className="price-item-card__action-btn price-item-card__action-btn--danger" onClick={() => setDeleteId(item.id)}>
                      <IonIcon icon={trashOutline} />
                    </button>
                  </div>
                </div>
                <div className="price-item-card__divider" />
                <div className="price-item-card__prices">
                  <div className="price-item-card__price-cell">
                    <span className="price-item-card__price-val">{item.price} ₽</span>
                    <span className="price-item-card__price-label">клиенту / {item.unit}</span>
                  </div>
                  <div className="price-item-card__price-cell">
                    <span className="price-item-card__price-val">{item.priceInstall} ₽</span>
                    <span className="price-item-card__price-label">монтаж / {item.unit}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <IonFab vertical="bottom" horizontal="end" slot="fixed">
          <IonFabButton onClick={() => router.push('/price-list/accessories/new')}>
            <IonIcon icon={addOutline} />
          </IonFabButton>
        </IonFab>

        <IonAlert
          isOpen={!!deleteId}
          header="Удалить позицию?"
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
