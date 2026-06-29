import React from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonBackButton, IonButtons, IonItem, IonLabel, IonIcon,
  IonAccordion, IonAccordionGroup,
} from '@ionic/react';
import {
  folderOutline, pricetagOutline, calculatorOutline,
  personOutline, barChartOutline, addCircleOutline,
} from 'ionicons/icons';
import { useT } from '../lib/i18n';

const SECTIONS = [
  { icon: folderOutline,       titleKey: 'hb.s0.title', textKey: 'hb.s0.text' },
  { icon: addCircleOutline,    titleKey: 'hb.s1.title', textKey: 'hb.s1.text' },
  { icon: calculatorOutline,   titleKey: 'hb.s2.title', textKey: 'hb.s2.text' },
  { icon: pricetagOutline,     titleKey: 'hb.s3.title', textKey: 'hb.s3.text' },
  { icon: barChartOutline,     titleKey: 'hb.s4.title', textKey: 'hb.s4.text' },
  { icon: personOutline,       titleKey: 'hb.s5.title', textKey: 'hb.s5.text' },
];

const Handbook: React.FC = () => {
  const { t } = useT();
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/tabs/cabinet" />
          </IonButtons>
          <IonTitle>{t('hb.title')}</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent fullscreen>
        <IonAccordionGroup multiple>
          {SECTIONS.map((s, i) => (
            <IonAccordion key={i} value={String(i)}>
              <IonItem slot="header" lines="full">
                <IonIcon icon={s.icon} slot="start" style={{ color: 'var(--ion-color-primary)' }} />
                <IonLabel>{t(s.titleKey)}</IonLabel>
              </IonItem>
              <div slot="content" style={{ padding: '12px 16px 16px', fontSize: 15, lineHeight: 1.6, color: 'var(--ion-text-color)' }}>
                {t(s.textKey)}
              </div>
            </IonAccordion>
          ))}
        </IonAccordionGroup>
      </IonContent>
    </IonPage>
  );
};

export default Handbook;
