import React, { useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonIcon, IonFab, IonFabButton,
  useIonViewWillEnter, useIonRouter,
} from '@ionic/react';
import { addOutline, chevronBackOutline, bulbOutline } from 'ionicons/icons';
import ActionButton from '../../components/ActionButton';
import { LightingCatalogItem } from '../../types';
import { loadLightings, deleteLighting } from '../../lib/storage';
import { LIGHTING_META, UNIT_LABEL } from '../../lib/lighting';
import { useT } from '../../lib/i18n';
import { useConfirm } from '../../components/Dialogs';
import PriceItemCard from './PriceItemCard';
import './ItemCard.css';

// Dark ink on light swatches, white on dark ones
const tileInk = (hex: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#374151';
  const n = parseInt(m[1], 16);
  const lum = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 150 ? '#374151' : '#fff';
};

const LightingList: React.FC = () => {
  const { t } = useT();
  const router = useIonRouter();
  const [items, setItems] = useState<LightingCatalogItem[]>([]);
  const confirm = useConfirm();

  const load = () => setItems(loadLightings());
  useIonViewWillEnter(load);

  const askDelete = async (id: string, title: string) => {
    const ok = await confirm({
      title: t('pl.deleteTitle'),
      message: <><b>«{title}»</b><br />{t('pl.deleteMsg')}</>,
      confirmText: t('common.delete'),
    });
    if (!ok) return;
    deleteLighting(id);
    load();
  };

  const point = items.filter(i => i.placement === 'point');
  const path  = items.filter(i => i.placement === 'path');

  const renderItem = (item: LightingCatalogItem) => {
    const meta = LIGHTING_META[item.type];
    const unitLabel = t(UNIT_LABEL[item.unit]);
    return (
      <PriceItemCard
        key={item.id}
        title={item.title}
        swatch={
          <div className="price-item-card__dot price-item-card__tile" style={{ background: item.color, color: tileInk(item.color) }}>
            {item.placement === 'point'
              ? <span className="price-item-card__symbol">{item.symbol}</span>
              : <span className="price-item-card__line" />}
          </div>
        }
        tags={<span className="price-item-card__chip">{t(meta.label)}</span>}
        client={[{ value: item.price, unit: unitLabel }]}
        worker={[{ value: item.priceInstall, unit: unitLabel }]}
        description={item.description}
        onEdit={() => router.push(`/price-list/lightings/${item.id}/edit`)}
        onDelete={() => askDelete(item.id, item.title)}
      />
    );
  };

  return (
    <IonPage>
      <IonHeader className="blue-header">
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton text="" icon={chevronBackOutline} defaultHref="/tabs/prices" />
          </IonButtons>
          <IonTitle>{t('sec.lighting')}</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="price-items-content">
        {items.length > 0 && <div className="blue-hero" />}
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
          <div className="price-items-list blue-hero-overlap">
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
      </IonContent>
    </IonPage>
  );
};

export default LightingList;
