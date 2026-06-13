import React, { useEffect, useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonList, IonItem, IonLabel, IonInput, IonButton, IonText, IonIcon, IonToast,
} from '@ionic/react';
import {
  settingsOutline, personOutline, callOutline, businessOutline,
  locationOutline, mailOutline, barChartOutline, downloadOutline, cloudUploadOutline,
} from 'ionicons/icons';
import { MasterProfile } from '../types';
import { loadMasterProfile, saveMasterProfile } from '../lib/storage';
import './Cabinet.css';

const Cabinet: React.FC = () => {
  const [profile, setProfile] = useState<MasterProfile>(loadMasterProfile());
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<MasterProfile>(profile);
  const [toastMsg, setToastMsg] = useState('');

  useEffect(() => {
    const p = loadMasterProfile();
    setProfile(p);
    setForm(p);
  }, []);

  const isEmpty = !profile.name.trim();

  const startEdit = () => {
    setForm(profile);
    setEditing(true);
  };

  const cancelEdit = () => setEditing(false);

  const handleSave = () => {
    const saved: MasterProfile = {
      name: form.name.trim(),
      company: form.company.trim(),
      phone: form.phone.trim(),
      city: form.city.trim(),
      email: form.email.trim(),
    };
    saveMasterProfile(saved);
    setProfile(saved);
    setEditing(false);
    setToastMsg('Данные сохранены');
  };

  const set = <K extends keyof MasterProfile>(field: K, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const initial = profile.name.trim()[0]?.toUpperCase() ?? '';

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
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
            <button type="button" className="cabinet-edit-btn" onClick={startEdit}>
              <IonIcon icon={settingsOutline} />
            </button>
          </div>

          {editing && (
            <IonList className="cabinet-edit-form">
              <IonItem>
                <IonIcon icon={personOutline} slot="start" color="medium" />
                <IonLabel position="stacked">ФИО</IonLabel>
                <IonInput
                  value={form.name}
                  onIonInput={e => set('name', e.detail.value ?? '')}
                  placeholder="Иванов Иван Иванович"
                  clearInput
                />
              </IonItem>
              <IonItem>
                <IonIcon icon={businessOutline} slot="start" color="medium" />
                <IonLabel position="stacked">Компания</IonLabel>
                <IonInput
                  value={form.company}
                  onIonInput={e => set('company', e.detail.value ?? '')}
                  placeholder="ООО «Потолки» или ИП"
                  clearInput
                />
              </IonItem>
              <IonItem>
                <IonIcon icon={callOutline} slot="start" color="medium" />
                <IonLabel position="stacked">Телефон</IonLabel>
                <IonInput
                  value={form.phone}
                  onIonInput={e => set('phone', e.detail.value ?? '')}
                  type="tel"
                  placeholder="+7 (999) 000-00-00"
                />
              </IonItem>
              <IonItem>
                <IonIcon icon={locationOutline} slot="start" color="medium" />
                <IonLabel position="stacked">Город</IonLabel>
                <IonInput
                  value={form.city}
                  onIonInput={e => set('city', e.detail.value ?? '')}
                  placeholder="Москва"
                  clearInput
                />
              </IonItem>
              <IonItem lines="none">
                <IonIcon icon={mailOutline} slot="start" color="medium" />
                <IonLabel position="stacked">Email</IonLabel>
                <IonInput
                  value={form.email}
                  onIonInput={e => set('email', e.detail.value ?? '')}
                  type="email"
                  placeholder="master@example.com"
                />
              </IonItem>
              <div className="cabinet-actions" style={{ padding: '12px 16px 16px' }}>
                <IonButton expand="block" onClick={handleSave}>Сохранить</IonButton>
                <IonButton expand="block" fill="outline" onClick={cancelEdit}>Отмена</IonButton>
              </div>
            </IonList>
          )}

          {isEmpty && !editing && (
            <IonText color="medium">
              <p style={{ fontSize: 14, margin: '4px 0 0' }}>
                Заполните данные — они будут отображаться в сметах
              </p>
            </IonText>
          )}

          <IonList className="cabinet-menu">
            <IonItem button detail onClick={() => setToastMsg('В разработке')} lines="full">
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
