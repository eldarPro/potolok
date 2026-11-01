import React, { useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonIcon, IonFab, IonFabButton,
  useIonViewWillEnter, useIonRouter,
} from '@ionic/react';
import { addOutline, chevronBackOutline, buildOutline } from 'ionicons/icons';
import ActionButton from '../../components/ActionButton';
import { Accessory } from '../../types';
import { loadAccessories, deleteAccessory } from '../../lib/storage';
import { useT } from '../../lib/i18n';
import { useConfirm } from '../../components/Dialogs';
import PriceItemCard from './PriceItemCard';
import './ItemCard.css';

const AccessoryList: React.FC = () => {
  const { t } = useT();
  const router = useIonRouter();
  const [items, setItems] = useState<Accessory[]>([]);
  const confirm = useConfirm();

  const load = () => setItems(loadAccessories());
  useIonViewWillEnter(load);

  const askDelete = async (id: string, title: string) => {
    const ok = await confirm({
      title: t('pl.deleteTitle'),
      message: <><b>«{title}»</b><br />{t('pl.deleteMsg')}</>,
      confirmText: t('common.delete'),
    });
    if (!ok) return;
    deleteAccessory(id);
    load();
  };

  return (
    <IonPage>
      <IonHeader className="blue-header">
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton text="" icon={chevronBackOutline} defaultHref="/tabs/prices" />
          </IonButtons>
          <IonTitle>{t('sec.accessories')}</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="price-items-content">
        {items.length > 0 && <div className="blue-hero" />}
        {items.length === 0 ? (
          <div className="price-items-empty">
            <div className="empty-state">
              <div className="empty-state__icon-wrap" style={{ background: '#E8F5E9' }}>
                <IonIcon icon={buildOutline} style={{ color: '#2E7D32' }} />
              </div>
              <p className="empty-state__title">{t('pl.noItems')}</p>
              <p className="empty-state__subtitle">{t('af.subtitle')}</p>
              <ActionButton solid onClick={() => router.push('/price-list/accessories/new')}>{t('common.add')}</ActionButton>
            </div>
          </div>
        ) : (
          <div className="price-items-list blue-hero-overlap">
            {items.map(item => (
              <PriceItemCard
                key={item.id}
                title={item.title}
                client={[{ value: item.price, unit: item.unit }]}
                worker={[{ value: item.priceInstall, unit: item.unit }]}
                description={item.description}
                onEdit={() => router.push(`/price-list/accessories/${item.id}/edit`)}
                onDelete={() => askDelete(item.id, item.title)}
              />
            ))}
          </div>
        )}

        <IonFab vertical="bottom" horizontal="end" slot="fixed">
          <IonFabButton onClick={() => router.push('/price-list/accessories/new')}>
            <IonIcon icon={addOutline} />
          </IonFabButton>
        </IonFab>
      </IonContent>
    </IonPage>
  );
};

export default AccessoryList;
