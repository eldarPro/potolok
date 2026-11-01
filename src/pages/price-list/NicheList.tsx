import React, { useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonIcon, IonFab, IonFabButton,
  useIonViewWillEnter, useIonRouter,
} from '@ionic/react';
import { addOutline, chevronBackOutline, albumsOutline } from 'ionicons/icons';
import ActionButton from '../../components/ActionButton';
import { NicheItem } from '../../types';
import { loadNiches, deleteNiche } from '../../lib/storage';
import { useT } from '../../lib/i18n';
import { useConfirm } from '../../components/Dialogs';
import PriceItemCard, { PriceLine } from './PriceItemCard';
import './ItemCard.css';

const NicheList: React.FC = () => {
  const { t } = useT();
  const router = useIonRouter();
  const [items, setItems] = useState<NicheItem[]>([]);
  const confirm = useConfirm();

  const load = () => setItems(loadNiches());
  useIonViewWillEnter(load);

  const askDelete = async (id: string, title: string) => {
    const ok = await confirm({
      title: t('pl.deleteTitle'),
      message: <><b>«{title}»</b><br />{t('pl.deleteMsg')}</>,
      confirmText: t('common.delete'),
    });
    if (!ok) return;
    deleteNiche(id);
    load();
  };

  // End cap, corner and cornice prices — only those the niche has
  const extras = (item: NicheItem, side: 'client' | 'worker'): PriceLine[] => {
    if (item.unit !== 'perimeter') return [];
    const w = side === 'worker';
    const lines: PriceLine[] = [
      { value: (w ? item.priceInstallCap : item.priceCap) ?? 0, unit: t('nc.capUnit') },
      { value: (w ? item.priceInstallCorner : item.priceCorner) ?? 0, unit: t('unit.corner') },
      ...(item.type === 'cornice' ? [{ value: (w ? item.priceInstallCornice : item.priceCornice) ?? 0, unit: t('nc.corniceUnit') }] : []),
    ];
    return lines.filter(l => l.value > 0);
  };

  return (
    <IonPage>
      <IonHeader className="blue-header">
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton text="" icon={chevronBackOutline} defaultHref="/tabs/prices" />
          </IonButtons>
          <IonTitle>{t('sec.niches')}</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="price-items-content">
        {items.length > 0 && <div className="blue-hero" />}
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
          <div className="price-items-list blue-hero-overlap">
            {items.map(item => {
              const unitLabel = t(item.unit === 'pcs' ? 'unit.pcs' : 'unit.m');
              return (
              <PriceItemCard
                key={item.id}
                title={item.title}
                tags={<>
                  <span className="price-item-card__chip">{t(item.unit === 'pcs' ? 'nf.unitPcs' : 'nf.unitPerimeter')}</span>
                  {item.unit === 'perimeter' && item.type && (
                    <span className="price-item-card__chip">{t(item.type === 'curtain' ? 'nc.typeCurtain' : 'nc.typeCornice')}</span>
                  )}
                </>}
                client={[{ value: item.price, unit: unitLabel }, ...extras(item, 'client')]}
                worker={[{ value: item.priceInstall, unit: unitLabel }, ...extras(item, 'worker')]}
                description={item.description}
                onEdit={() => router.push(`/price-list/niches/${item.id}/edit`)}
                onDelete={() => askDelete(item.id, item.title)}
              />
              );
            })}
          </div>
        )}

        <IonFab vertical="bottom" horizontal="end" slot="fixed">
          <IonFabButton onClick={() => router.push('/price-list/niches/new')}>
            <IonIcon icon={addOutline} />
          </IonFabButton>
        </IonFab>
      </IonContent>
    </IonPage>
  );
};

export default NicheList;
