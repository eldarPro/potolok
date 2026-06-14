import React from 'react';
import { IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonIcon, useIonViewWillEnter, useIonRouter } from '@ionic/react';
import { layersOutline, reorderThreeOutline, bulbOutline, buildOutline, briefcaseOutline } from 'ionicons/icons';
import { loadFabrics, loadProfiles, loadLightings, loadServices, loadAccessories } from '../lib/storage';
import './PriceList.css';

const CATEGORIES = [
  { key: 'fabrics',     label: 'Полотна',        icon: layersOutline,       bg: '#E3F2FD', iconColor: '#1E88E5', href: '/price-list/fabrics' },
  { key: 'profiles',    label: 'Профили',         icon: reorderThreeOutline, bg: '#F3E5F5', iconColor: '#8E24AA', href: '/price-list/profiles' },
  { key: 'lightings',   label: 'Освещение',       icon: bulbOutline,         bg: '#FFF8E1', iconColor: '#F9A825', href: '/price-list/lightings' },
  { key: 'accessories', label: 'Комплектующие',   icon: buildOutline,        bg: '#E8F5E9', iconColor: '#2E7D32', href: '/price-list/accessories' },
  { key: 'services',    label: 'Доп. услуги',     icon: briefcaseOutline,    bg: '#FCE4EC', iconColor: '#C62828', href: '/price-list/services' },
] as const;

const PriceList: React.FC = () => {
  const router = useIonRouter();
  const [counts, setCounts] = React.useState<Record<string, number>>({});

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
          <IonTitle>Ценники</IonTitle>
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
                <p className="price-cat-name">{cat.label}</p>
                <p className="price-cat-count">{counts[cat.key] ?? 0} позиц.</p>
              </div>
            </button>
          ))}
        </div>
      </IonContent>
    </IonPage>
  );
};

export default PriceList;
