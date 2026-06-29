import React, { useEffect, useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonList, IonItem, IonLabel, IonText, IonIcon, IonActionSheet,
  useIonViewWillEnter,
} from '@ionic/react';
import {
  personOutline, barChartOutline, bookOutline, languageOutline,
} from 'ionicons/icons';
import { useHistory } from 'react-router-dom';
import { MasterProfile } from '../types';
import { loadMasterProfile } from '../lib/storage';
import { useT, LANGS } from '../lib/i18n';
import './Cabinet.css';

const Cabinet: React.FC = () => {
  const history = useHistory();
  const { t, lang, setLang } = useT();
  const [profile, setProfile] = useState<MasterProfile>(loadMasterProfile());
  const [showLangPicker, setShowLangPicker] = useState(false);

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
          <IonTitle>{t('cab.title')}</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent fullscreen className="cabinet-content">
        <div className="cabinet-profile">
          <div className="cabinet-profile-header">
            <div className={`cabinet-avatar${isEmpty ? ' cabinet-avatar--empty' : ''}`}>
              {initial || <IonIcon icon={personOutline} style={{ fontSize: 26 }} />}
            </div>
            <div className="cabinet-profile-info">
              <h2>{profile.name.trim() || t('cab.master')}</h2>
              {profile.company && <p>{profile.company}</p>}
              {!profile.company && profile.phone && <p>{profile.phone}</p>}
            </div>
          </div>

          {isEmpty && (
            <IonText color="medium">
              <p style={{ fontSize: 14, margin: '4px 0 0' }}>
                {t('cab.fillData')}
              </p>
            </IonText>
          )}

          <IonList className="cabinet-menu">
            <IonItem button detail onClick={() => history.push('/tabs/cabinet/profile')} lines="full">
              <IonIcon icon={personOutline} slot="start" className="cabinet-menu-icon" />
              <IonLabel>{t('cab.profile')}</IonLabel>
            </IonItem>
            <IonItem button detail onClick={() => history.push('/tabs/cabinet/stats')} lines="full">
              <IonIcon icon={barChartOutline} slot="start" className="cabinet-menu-icon" />
              <IonLabel>{t('cab.stats')}</IonLabel>
            </IonItem>
            <IonItem button detail onClick={() => history.push('/tabs/cabinet/handbook')} lines="full">
              <IonIcon icon={bookOutline} slot="start" className="cabinet-menu-icon" />
              <IonLabel>{t('cab.handbook')}</IonLabel>
            </IonItem>
            <IonItem button detail onClick={() => setShowLangPicker(true)} lines="none">
              <IonIcon icon={languageOutline} slot="start" className="cabinet-menu-icon" />
              <IonLabel>{t('lang.changeItem')}</IonLabel>
            </IonItem>
          </IonList>
        </div>

        <IonActionSheet
          isOpen={showLangPicker}
          header={t('cab.language')}
          buttons={[
            ...LANGS.map(l => ({
              text: `${l.flag}  ${l.name}`,
              cssClass: lang === l.code ? 'lang-action-selected' : undefined,
              handler: () => setLang(l.code),
            })),
            { text: t('common.cancel'), role: 'cancel' },
          ]}
          onDidDismiss={() => setShowLangPicker(false)}
        />
      </IonContent>
    </IonPage>
  );
};

export default Cabinet;
