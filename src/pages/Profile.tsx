import React, { useEffect, useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonList, IonItem, IonLabel, IonInput, IonButton, IonIcon,
  IonButtons, IonBackButton, IonToast,
} from '@ionic/react';
import {
  personOutline, callOutline, businessOutline,
  locationOutline, mailOutline,
} from 'ionicons/icons';
import { useHistory } from 'react-router-dom';
import { MasterProfile } from '../types';
import { loadMasterProfile, saveMasterProfile } from '../lib/storage';
import { useT } from '../lib/i18n';
import './Cabinet.css';

const Profile: React.FC = () => {
  const { t } = useT();
  const history = useHistory();
  const [form, setForm] = useState<MasterProfile>(loadMasterProfile());
  const [toastMsg, setToastMsg] = useState('');

  useEffect(() => {
    setForm(loadMasterProfile());
  }, []);

  const set = <K extends keyof MasterProfile>(field: K, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const handleSave = () => {
    const saved: MasterProfile = {
      name: form.name.trim(),
      company: form.company.trim(),
      phone: form.phone.trim(),
      city: form.city.trim(),
      email: form.email.trim(),
    };
    saveMasterProfile(saved);
    setToastMsg(t('prof.saved'));
    setTimeout(() => history.goBack(), 1200);
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/tabs/cabinet" text="" />
          </IonButtons>
          <IonTitle>{t('prof.title')}</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent fullscreen className="cabinet-content">
        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 16px 8px' }}>
          <div className={`cabinet-avatar${!form.name.trim() ? ' cabinet-avatar--empty' : ''}`} style={{ width: 72, height: 72, fontSize: 30 }}>
            {form.name.trim()[0]?.toUpperCase() || <IonIcon icon={personOutline} style={{ fontSize: 34 }} />}
          </div>
        </div>

        <IonList inset>
          <IonItem>
            <IonIcon icon={personOutline} slot="start" color="medium" />
            <IonLabel position="stacked">{t('prof.fullName')}</IonLabel>
            <IonInput
              value={form.name}
              onIonInput={e => set('name', e.detail.value ?? '')}
              placeholder={t('prof.namePH')}
              clearInput
            />
          </IonItem>
          <IonItem>
            <IonIcon icon={businessOutline} slot="start" color="medium" />
            <IonLabel position="stacked">{t('prof.company')}</IonLabel>
            <IonInput
              value={form.company}
              onIonInput={e => set('company', e.detail.value ?? '')}
              placeholder={t('prof.companyPH')}
              clearInput
            />
          </IonItem>
          <IonItem>
            <IonIcon icon={callOutline} slot="start" color="medium" />
            <IonLabel position="stacked">{t('prof.phone')}</IonLabel>
            <IonInput
              value={form.phone}
              onIonInput={e => set('phone', e.detail.value ?? '')}
              type="tel"
              placeholder={t('np.phonePH')}
            />
          </IonItem>
          <IonItem>
            <IonIcon icon={locationOutline} slot="start" color="medium" />
            <IonLabel position="stacked">{t('prof.city')}</IonLabel>
            <IonInput
              value={form.city}
              onIonInput={e => set('city', e.detail.value ?? '')}
              placeholder={t('prof.cityPH')}
              clearInput
            />
          </IonItem>
          <IonItem lines="none">
            <IonIcon icon={mailOutline} slot="start" color="medium" />
            <IonLabel position="stacked">{t('prof.email')}</IonLabel>
            <IonInput
              value={form.email}
              onIonInput={e => set('email', e.detail.value ?? '')}
              type="email"
              placeholder={t('prof.emailPH')}
            />
          </IonItem>
        </IonList>

        <div className="cabinet-actions" style={{ padding: '0 16px 16px' }}>
          <IonButton expand="block" onClick={handleSave}>{t('common.save')}</IonButton>
          <IonButton expand="block" fill="outline" onClick={() => history.goBack()}>{t('common.cancel')}</IonButton>
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

export default Profile;
