import React from 'react';
import { IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonIcon, useIonViewWillEnter, useIonRouter } from '@ionic/react';
import { layersOutline, reorderThreeOutline, bulbOutline, buildOutline, briefcaseOutline } from 'ionicons/icons';
import { loadFabrics, loadProfiles, loadLightings, loadServices, loadAccessories } from '../lib/storage';
import { useT } from '../lib/i18n';
import './PriceList.css';

const PriceList: React.FC = () => {
  const { t } = useT();
  const router = useIonRouter();
  const [counts, setCounts] = React.useState<Record<string, number>>({});

  const CATEGORIES = [
    { key: 'fabrics',     labelKey: 'sec.fabric',      icon: layersOutline,       bg: '#E3F2FD', iconColor: '#1E88E5', href: '/price-list/fabrics' },
    { key: 'profiles',    labelKey: 'sec.profile',     icon: reorderThreeOutline, bg: '#F3E5F5', iconColor: '#8E24AA', href: '/price-list/profiles' },
    { key: 'lightings',   labelKey: 'sec.lighting',    icon: bulbOutline,         bg: '#FFF8E1', iconColor: '#F9A825', href: '/price-list/lightings' },
    { key: 'accessories', labelKey: 'sec.accessories', icon: buildOutline,        bg: '#E8F5E9', iconColor: '#2E7D32', href: '/price-list/accessories' },
    { key: 'services',    labelKey: 'sec.services',    icon: briefcaseOutline,    bg: '#FCE4EC', iconColor: '#C62828', href: '/price-list/services' },
  ];

  useIonViewWillEnter(() => {
    setCounts({
      fabrics:     loadFabrics().length,
      profiles:    loadProfiles().length,
      lightings:   loadLightings().length,
      services:    loadServices().length,
      accessories: loadAccessories().length,
    });
  });

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>{t('tab.prices')}</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="price-list-content">
        <div className="price-list-grid">
          {CATEGORIES.map(cat => (
            <button key={cat.key} className="price-cat-card" onClick={() => router.push(cat.href)}>
              <div className="price-cat-icon-wrap" style={{ background: cat.bg }}>
                <IonIcon icon={cat.icon} style={{ color: cat.iconColor }} />
              </div>
              <div className="price-cat-info">
                <p className="price-cat-name">{t(cat.labelKey)}</p>
                <p className="price-cat-count">{counts[cat.key] ?? 0} {t('pl.positions')}</p>
              </div>
            </button>
          ))}
        </div>
      </IonContent>
    </IonPage>
  );
};

export default PriceList;
