import React from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonList, IonItem, IonLabel, IonNote, useIonViewWillEnter,
} from '@ionic/react';
import { useIonRouter } from '@ionic/react';
import { loadFabrics, loadProfiles, loadLightings, loadServices, loadAccessories } from '../lib/storage';

const PriceList: React.FC = () => {
  const router = useIonRouter();
  const [counts, setCounts] = React.useState({ fabrics: 0, profiles: 0, lightings: 0, services: 0, accessories: 0 });

  const refresh = () => setCounts({
    fabrics: loadFabrics().length,
    profiles: loadProfiles().length,
    lightings: loadLightings().length,
    services: loadServices().length,
    accessories: loadAccessories().length,
  });

  useIonViewWillEnter(refresh);

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonTitle>Ценники</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <IonList inset>
          <IonItem button detail onClick={() => router.push('/price-list/fabrics')}>
            <IonLabel>Полотна</IonLabel>
            <IonNote slot="end">{counts.fabrics} шт.</IonNote>
          </IonItem>
          <IonItem button detail onClick={() => router.push('/price-list/profiles')}>
            <IonLabel>Профили</IonLabel>
            <IonNote slot="end">{counts.profiles} шт.</IonNote>
          </IonItem>
          <IonItem button detail onClick={() => router.push('/price-list/lightings')}>
            <IonLabel>Освещение</IonLabel>
            <IonNote slot="end">{counts.lightings} шт.</IonNote>
          </IonItem>
          <IonItem button detail onClick={() => router.push('/price-list/accessories')}>
            <IonLabel>Комплектующие</IonLabel>
            <IonNote slot="end">{counts.accessories} шт.</IonNote>
          </IonItem>
          <IonItem button detail onClick={() => router.push('/price-list/services')}>
            <IonLabel>Доп. услуги</IonLabel>
            <IonNote slot="end">{counts.services} шт.</IonNote>
          </IonItem>
        </IonList>
      </IonContent>
    </IonPage>
  );
};

export default PriceList;
