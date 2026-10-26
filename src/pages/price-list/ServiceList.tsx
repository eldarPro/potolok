import React, { useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonIcon, IonFab, IonFabButton,
  IonAlert, useIonViewWillEnter, useIonRouter,
} from '@ionic/react';
import { addOutline, chevronBackOutline, briefcaseOutline } from 'ionicons/icons';
import ActionButton from '../../components/ActionButton';
import { AdditionalService } from '../../types';
import { loadServices, deleteService } from '../../lib/storage';
import { useT } from '../../lib/i18n';
import PriceItemCard from './PriceItemCard';
import './ItemCard.css';

const ServiceList: React.FC = () => {
  const { t } = useT();
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
      <IonHeader className="blue-header">
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton text="" icon={chevronBackOutline} defaultHref="/tabs/prices" />
          </IonButtons>
          <IonTitle>{t('sec.services')}</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="price-items-content">
        {items.length > 0 && <div className="blue-hero" />}
        {items.length === 0 ? (
          <div className="price-items-empty">
            <div className="empty-state">
              <div className="empty-state__icon-wrap" style={{ background: '#FCE4EC' }}>
                <IonIcon icon={briefcaseOutline} style={{ color: '#C62828' }} />
              </div>
              <p className="empty-state__title">{t('pl.noItems')}</p>
              <p className="empty-state__subtitle">{t('sf.subtitle')}</p>
              <ActionButton solid onClick={() => router.push('/price-list/services/new')}>{t('common.add')}</ActionButton>
            </div>
          </div>
        ) : (
          <div className="price-items-list blue-hero-overlap">
            {items.map(item => (
              <PriceItemCard
                key={item.id}
                title={item.title}
                client={[{ value: item.price }]}
                worker={[{ value: item.priceInstall }]}
                description={item.description}
                onEdit={() => router.push(`/price-list/services/${item.id}/edit`)}
                onDelete={() => setDeleteId(item.id)}
              />
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

export default ServiceList;
