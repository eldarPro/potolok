import React, { useEffect, useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonList, IonItem, IonLabel, IonText, IonIcon, IonToast,
  useIonViewWillEnter,
} from '@ionic/react';
import {
  personOutline, barChartOutline, downloadOutline, cloudUploadOutline,
} from 'ionicons/icons';
import { useHistory } from 'react-router-dom';
import { MasterProfile } from '../types';
import { loadMasterProfile } from '../lib/storage';
import './Cabinet.css';

const Cabinet: React.FC = () => {
  const history = useHistory();
  const [profile, setProfile] = useState<MasterProfile>(loadMasterProfile());
  const [toastMsg, setToastMsg] = useState('');

  useEffect(() => {
    setProfile(loadMasterProfile());
  }, []);

  useIonViewWillEnter(() => {
    setProfile(loadMasterProfile());
  });

  const isEmpty = !profile.name.trim();
  const initial = profile.name.trim()[0]?.toUpperCase() ?? '';

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Кабинет</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent fullscreen className="cabinet-content">
        <div className="cabinet-profile">
          <div className="cabinet-profile-header">
            <div className={`cabinet-avatar${isEmpty ? ' cabinet-avatar--empty' : ''}`}>
              {initial || <IonIcon icon={personOutline} style={{ fontSize: 26 }} />}
            </div>
            <div className="cabinet-profile-info">
              <h2>{profile.name.trim() || 'Мастер'}</h2>
              {profile.company && <p>{profile.company}</p>}
              {!profile.company && profile.phone && <p>{profile.phone}</p>}
            </div>
          </div>

          {isEmpty && (
            <IonText color="medium">
              <p style={{ fontSize: 14, margin: '4px 0 0' }}>
                Заполните данные — они будут отображаться в сметах
              </p>
            </IonText>
          )}

          <IonList className="cabinet-menu">
            <IonItem button detail onClick={() => history.push('/tabs/cabinet/profile')} lines="full">
              <IonIcon icon={personOutline} slot="start" className="cabinet-menu-icon" />
              <IonLabel>Личный профиль</IonLabel>
            </IonItem>
            <IonItem button detail onClick={() => history.push('/tabs/cabinet/stats')} lines="full">
              <IonIcon icon={barChartOutline} slot="start" className="cabinet-menu-icon" />
              <IonLabel>Статистика</IonLabel>
            </IonItem>
            <IonItem button detail onClick={() => setToastMsg('В разработке')} lines="full">
              <IonIcon icon={downloadOutline} slot="start" className="cabinet-menu-icon" />
              <IonLabel>Экспорт данных</IonLabel>
            </IonItem>
            <IonItem button detail onClick={() => setToastMsg('В разработке')} lines="none">
              <IonIcon icon={cloudUploadOutline} slot="start" className="cabinet-menu-icon" />
              <IonLabel>Импорт данных</IonLabel>
            </IonItem>
          </IonList>
        </div>

        <IonToast
          isOpen={!!toastMsg}
          onDidDismiss={() => setToastMsg('')}
          message={toastMsg}
          duration={1800}
          position="bottom"
        />
      </IonContent>
    </IonPage>
  );
};

export default Cabinet;
