import React, { useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonIcon, IonFab, IonFabButton,
  IonAlert, useIonViewWillEnter, useIonRouter,
} from '@ionic/react';
import { addOutline, chevronBackOutline, settingsOutline, trashOutline, layersOutline, reorderThreeOutline } from 'ionicons/icons';
import ActionButton from '../../components/ActionButton';
import { CatalogItem } from '../../types';
import { loadFabrics, deleteFabric, loadProfiles, deleteProfile } from '../../lib/storage';
import { useT } from '../../lib/i18n';
import './ItemCard.css';

interface Props {
  category: 'fabrics' | 'profiles';
}

const CATALOG_META = {
  fabrics:  { icon: layersOutline,       bg: '#E3F2FD', iconColor: '#1E88E5', titleKey: 'sec.fabric',  subtitleKey: 'cf.subtitleFabric' },
  profiles: { icon: reorderThreeOutline, bg: '#F3E5F5', iconColor: '#8E24AA', titleKey: 'sec.profile', subtitleKey: 'cf.subtitleProfile' },
} as const;

const CatalogList: React.FC<Props> = ({ category }) => {
  const { t } = useT();
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
  const meta = CATALOG_META[category];

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton text="" icon={chevronBackOutline} defaultHref="/tabs/prices" />
          </IonButtons>
          <IonTitle>{t(meta.titleKey)}</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="price-items-content">
        {items.length === 0 ? (
          <div className="price-items-empty">
            <div className="empty-state">
              <div className="empty-state__icon-wrap" style={{ background: meta.bg }}>
                <IonIcon icon={meta.icon} style={{ color: meta.iconColor }} />
              </div>
              <p className="empty-state__title">{t('pl.noItems')}</p>
              <p className="empty-state__subtitle">{t(meta.subtitleKey)}</p>
              <ActionButton solid onClick={() => router.push(`${basePath}/new`)}>{t('common.add')}</ActionButton>
            </div>
          </div>
        ) : (
          <div className="price-items-list">
            {items.map(item => (
              <div className="price-item-card" key={item.id}>
                <div className="price-item-card__header">
                  <div className="price-item-card__dot" style={{ background: item.color }} />
                  <span className="price-item-card__title">{item.title}</span>
                  {item.isDefault && <span className="price-item-card__badge">{t('cf.default')}</span>}
                  <div className="price-item-card__actions">
                    <button className="price-item-card__action-btn" onClick={() => router.push(`${basePath}/${item.id}/edit`)}>
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
                    <span className="price-item-card__price-label">{t('mf.clientPerSqm')}</span>
                  </div>
                  <div className="price-item-card__price-cell">
                    <span className="price-item-card__price-val">{item.priceCorner} ₽</span>
                    <span className="price-item-card__price-label">{t('mf.clientPerCorner')}</span>
                  </div>
                  <div className="price-item-card__price-cell">
                    <span className="price-item-card__price-val">{item.priceInstall} ₽</span>
                    <span className="price-item-card__price-label">{t('mf.installPerSqm')}</span>
                  </div>
                  <div className="price-item-card__price-cell">
                    <span className="price-item-card__price-val">{item.priceInstallCorner} ₽</span>
                    <span className="price-item-card__price-label">{t('mf.installPerCorner')}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <IonFab vertical="bottom" horizontal="end" slot="fixed">
          <IonFabButton onClick={() => router.push(`${basePath}/new`)}>
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

export default CatalogList;
