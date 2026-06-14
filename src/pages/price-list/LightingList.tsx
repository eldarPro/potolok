import React, { useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonIcon, IonFab, IonFabButton,
  IonAlert, useIonViewWillEnter, useIonRouter,
} from '@ionic/react';
import { addOutline, chevronBackOutline, settingsOutline, trashOutline } from 'ionicons/icons';
import { LightingCatalogItem } from '../../types';
import { loadLightings, deleteLighting } from '../../lib/storage';
import { LIGHTING_META, UNIT_LABEL } from '../../lib/lighting';
import './ItemCard.css';

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
      <div className="price-item-card" key={item.id}>
        <div className="price-item-card__header">
          {item.placement === 'point' ? (
            <span className="price-item-card__symbol" style={{ color: item.color !== '#ffffff' ? item.color : '#555' }}>
              {item.symbol}
            </span>
          ) : (
            <div className="price-item-card__line" style={{ background: item.color, border: '1px solid rgba(0,0,0,0.12)' }} />
          )}
          <span className="price-item-card__title">{item.title}</span>
          <span className="price-item-card__chip">{meta.label}</span>
          <div className="price-item-card__actions">
            <button className="price-item-card__action-btn" onClick={() => router.push(`/price-list/lightings/${item.id}/edit`)}>
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
            <span className="price-item-card__price-label">клиент / {unitLabel}</span>
          </div>
          <div className="price-item-card__price-cell">
            <span className="price-item-card__price-val">{item.priceInstall} ₽</span>
            <span className="price-item-card__price-label">монтаж / {unitLabel}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton text="" icon={chevronBackOutline} defaultHref="/tabs/prices" />
          </IonButtons>
          <IonTitle>Освещение</IonTitle>
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
            {point.length > 0 && (
              <>
                <p className="price-items-section-label">Точечные</p>
                {point.map(renderItem)}
              </>
            )}
            {path.length > 0 && (
              <>
                <p className="price-items-section-label">Линейные</p>
                {path.map(renderItem)}
              </>
            )}
          </div>
        )}

        <IonFab vertical="bottom" horizontal="end" slot="fixed">
          <IonFabButton onClick={() => router.push('/price-list/lightings/new')}>
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

export default LightingList;
