import React, { useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonIcon, IonFab, IonFabButton,
  useIonViewWillEnter, useIonRouter,
} from '@ionic/react';
import { addOutline, chevronBackOutline, briefcaseOutline } from 'ionicons/icons';
import ActionButton from '../../components/ActionButton';
import { AdditionalService } from '../../types';
import { loadServices, deleteService } from '../../lib/storage';
import { useT } from '../../lib/i18n';
import { useConfirm } from '../../components/Dialogs';
import PriceItemCard from './PriceItemCard';
import './ItemCard.css';

const ServiceList: React.FC = () => {
  const { t } = useT();
  const router = useIonRouter();
  const [items, setItems] = useState<AdditionalService[]>([]);
  const confirm = useConfirm();

  const load = () => setItems(loadServices());
  useIonViewWillEnter(load);

  const askDelete = async (id: string, title: string) => {
    const ok = await confirm({
      title: t('pl.deleteTitle'),
      message: <><b>«{title}»</b><br />{t('pl.deleteMsg')}</>,
      confirmText: t('common.delete'),
    });
    if (!ok) return;
    deleteService(id);
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
                onDelete={() => askDelete(item.id, item.title)}
              />
            ))}
          </div>
        )}

        <IonFab vertical="bottom" horizontal="end" slot="fixed">
          <IonFabButton onClick={() => router.push('/price-list/services/new')}>
            <IonIcon icon={addOutline} />
          </IonFabButton>
        </IonFab>
      </IonContent>
    </IonPage>
  );
};

export default ServiceList;
