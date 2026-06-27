import React, { useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonIcon, IonFab, IonFabButton,
  IonAlert, useIonViewWillEnter, useIonRouter,
} from '@ionic/react';
import { addOutline, chevronBackOutline, settingsOutline, trashOutline, briefcaseOutline } from 'ionicons/icons';
import ActionButton from '../../components/ActionButton';
import { AdditionalService } from '../../types';
import { loadServices, deleteService } from '../../lib/storage';
import './ItemCard.css';

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
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton text="" icon={chevronBackOutline} defaultHref="/tabs/prices" />
          </IonButtons>
          <IonTitle>Доп. услуги</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="price-items-content">
        {items.length === 0 ? (
          <div className="price-items-empty">
            <div className="empty-state">
              <div className="empty-state__icon-wrap" style={{ background: '#FCE4EC' }}>
                <IonIcon icon={briefcaseOutline} style={{ color: '#C62828' }} />
              </div>
              <p className="empty-state__title">Нет позиций</p>
              <p className="empty-state__subtitle">Добавьте дополнительные услуги, чтобы включать их в расчёты</p>
              <ActionButton solid onClick={() => router.push('/price-list/services/new')}>Добавить</ActionButton>
            </div>
          </div>
        ) : (
          <div className="price-items-list">
            {items.map(item => (
              <div className="price-item-card" key={item.id}>
                <div className="price-item-card__header">
                  <span className="price-item-card__title">{item.title}</span>
                  <div className="price-item-card__actions">
                    <button className="price-item-card__action-btn" onClick={() => router.push(`/price-list/services/${item.id}/edit`)}>
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
                    <span className="price-item-card__price-label">клиенту</span>
                  </div>
                  <div className="price-item-card__price-cell">
                    <span className="price-item-card__price-val">{item.priceInstall} ₽</span>
                    <span className="price-item-card__price-label">монтаж</span>
                  </div>
                </div>
                {item.description ? (
                  <p className="price-item-card__desc">{item.description}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}

        <IonFab vertical="bottom" horizontal="end" slot="fixed">
          <IonFabButton onClick={() => router.push('/price-list/services/new')}>
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

export default ServiceList;
