import React, { useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonIcon, IonFab, IonFabButton,
  IonAlert, useIonViewWillEnter, useIonRouter,
} from '@ionic/react';
import { addOutline, chevronBackOutline, settingsOutline, trashOutline, bulbOutline } from 'ionicons/icons';
import ActionButton from '../../components/ActionButton';
import { LightingCatalogItem } from '../../types';
import { loadLightings, deleteLighting } from '../../lib/storage';
import { LIGHTING_META, UNIT_LABEL } from '../../lib/lighting';
import { useT } from '../../lib/i18n';
import './ItemCard.css';

const LightingList: React.FC = () => {
  const { t } = useT();
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
    const unitLabel = t(UNIT_LABEL[item.unit]);
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
          <span className="price-item-card__chip">{t(meta.label)}</span>
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
            <span className="price-item-card__price-label">{t('ml.clientPer')} {unitLabel}</span>
          </div>
          <div className="price-item-card__price-cell">
            <span className="price-item-card__price-val">{item.priceInstall} ₽</span>
            <span className="price-item-card__price-label">{t('ml.installPer')} {unitLabel}</span>
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
          <IonTitle>{t('sec.lighting')}</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="price-items-content">
        {items.length === 0 ? (
          <div className="price-items-empty">
            <div className="empty-state">
              <div className="empty-state__icon-wrap" style={{ background: '#FFF8E1' }}>
                <IonIcon icon={bulbOutline} style={{ color: '#F9A825' }} />
              </div>
              <p className="empty-state__title">{t('pl.noItems')}</p>
              <p className="empty-state__subtitle">{t('lf.subtitle')}</p>
              <ActionButton solid onClick={() => router.push('/price-list/lightings/new')}>{t('common.add')}</ActionButton>
            </div>
          </div>
        ) : (
          <div className="price-items-list">
            {point.length > 0 && (
              <>
                <p className="price-items-section-label">{t('lf.point')}</p>
                {point.map(renderItem)}
              </>
            )}
            {path.length > 0 && (
              <>
                <p className="price-items-section-label">{t('lf.path')}</p>
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
          header={t('pl.deleteTitle')}
          message={t('pl.deleteMsg')}
          buttons={[
            { text: t('common.cancel'), role: 'cancel', handler: () => setDeleteId(null) },
            { text: t('common.delete'), role: 'destructive', handler: confirmDelete },
          ]}
          onDidDismiss={() => setDeleteId(null)}
        />
      </IonContent>
    </IonPage>
  );
};

export default LightingList;
