import React, { useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonIcon, IonFab, IonFabButton,
  IonAlert, useIonViewWillEnter, useIonRouter,
} from '@ionic/react';
import { addOutline, chevronBackOutline, settingsOutline, trashOutline, albumsOutline } from 'ionicons/icons';
import ActionButton from '../../components/ActionButton';
import { NicheItem } from '../../types';
import { loadNiches, deleteNiche } from '../../lib/storage';
import { useT } from '../../lib/i18n';
import './ItemCard.css';

const NicheList: React.FC = () => {
  const { t } = useT();
  const router = useIonRouter();
  const [items, setItems] = useState<NicheItem[]>([]);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = () => setItems(loadNiches());
  useIonViewWillEnter(load);

  const confirmDelete = () => {
    if (!deleteId) return;
    deleteNiche(deleteId);
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
          <IonTitle>{t('sec.niches')}</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="price-items-content">
        {items.length === 0 ? (
          <div className="price-items-empty">
            <div className="empty-state">
              <div className="empty-state__icon-wrap" style={{ background: '#E0F7FA' }}>
                <IonIcon icon={albumsOutline} style={{ color: '#00838F' }} />
              </div>
              <p className="empty-state__title">{t('pl.noItems')}</p>
              <p className="empty-state__subtitle">{t('nf.subtitle')}</p>
              <ActionButton solid onClick={() => router.push('/price-list/niches/new')}>{t('common.add')}</ActionButton>
            </div>
          </div>
        ) : (
          <div className="price-items-list">
            {items.map(item => {
              const unitLabel = t(item.unit === 'pcs' ? 'unit.pcs' : 'unit.m');
              return (
              <div className="price-item-card" key={item.id}>
                <div className="price-item-card__header">
                  <span className="price-item-card__title">{item.title}</span>
                  <span className="price-item-card__chip">{t(item.unit === 'pcs' ? 'nf.unitPcs' : 'nf.unitPerimeter')}</span>
                  <div className="price-item-card__actions">
                    <button className="price-item-card__action-btn" onClick={() => router.push(`/price-list/niches/${item.id}/edit`)}>
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
                    <span className="price-item-card__price-label">{t('ma.clientPer')}{unitLabel}</span>
                  </div>
                  <div className="price-item-card__price-cell">
                    <span className="price-item-card__price-val">{item.priceInstall} ₽</span>
                    <span className="price-item-card__price-label">{t('ma.installPer')}{unitLabel}</span>
                  </div>
                </div>
                {item.description ? (
                  <p className="price-item-card__desc">{item.description}</p>
                ) : null}
              </div>
              );
            })}
          </div>
        )}

        <IonFab vertical="bottom" horizontal="end" slot="fixed">
          <IonFabButton onClick={() => router.push('/price-list/niches/new')}>
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

export default NicheList;
