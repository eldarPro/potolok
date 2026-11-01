import React, { useRef, useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonIcon,
  useIonRouter, useIonToast, useIonViewWillEnter,
} from '@ionic/react';
import { cameraOutline, imagesOutline, sparklesOutline } from 'ionicons/icons';
import { loadFittings, upsertFitting, loadProjects } from '../lib/storage';
import { fileToDataUrl, downscaleDataUrl } from '../lib/image';
import { uuid } from '../lib/uuid';
import { Fitting } from '../types';
import { useT } from '../lib/i18n';
import './Fittings.css';

/** One card in "Recent": a fitting, or a project room that already has a visualization */
interface RecentItem {
  key: string;
  image: string;
  title: string;
  sub: string;
  linked: boolean;
  href: string;
  updatedAt: string;
}

const lastImage = (versions: { image: string }[]) => versions[versions.length - 1].image;

const Fittings: React.FC = () => {
  const { t } = useT();
  const router = useIonRouter();
  const [presentToast] = useIonToast();
  const [recent, setRecent] = useState<RecentItem[]>([]);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  useIonViewWillEnter(() => {
    const fittings: RecentItem[] = loadFittings().map(f => ({
      key: f.id,
      image: lastImage(f.visualization.versions),
      title: t('fit.itemTitle', { date: new Date(f.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) }),
      sub: t('fit.itemSub', { n: f.visualization.versions.length }),
      linked: false,
      href: `/fitting/${f.id}`,
      updatedAt: f.updatedAt,
    }));
    const rooms: RecentItem[] = loadProjects().flatMap(p => p.rooms
      .filter(r => r.visualization?.versions.length)
      .map(r => ({
        key: r.id,
        image: lastImage(r.visualization!.versions),
        title: r.name,
        sub: `→ ${p.clientName || t('proj.noName')}`,
        linked: true,
        href: `/project/${p.id}/room/${r.id}/visualize`,
        updatedAt: p.updatedAt,
      })));
    setRecent([...fittings, ...rooms].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  });

  const startFitting = async (file: File) => {
    try {
      const image = await downscaleDataUrl(await fileToDataUrl(file));
      const now = new Date().toISOString();
      const fitting: Fitting = {
        id: uuid(), createdAt: now, updatedAt: now,
        visualization: { versions: [{ id: uuid(), image, prompt: '', createdAt: now }] },
      };
      upsertFitting(fitting);
      router.push(`/fitting/${fitting.id}`);
    } catch {
      presentToast({ message: t('viz.photoError'), duration: 2500, color: 'danger', position: 'bottom' });
    }
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) startFitting(f);
    e.target.value = '';
  };

  return (
    <IonPage>
      <IonHeader className="blue-header">
        <IonToolbar>
          <IonTitle>{t('fit.title')}</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="blue-page">
        <div className="blue-hero" />

        <div className="fittings-actions blue-hero-overlap">
          <button className="fittings-action fittings-action--main" onClick={() => cameraInputRef.current?.click()}>
            <IonIcon icon={cameraOutline} />{t('fit.takePhoto')}
          </button>
          <button className="fittings-action card" onClick={() => photoInputRef.current?.click()}>
            <IonIcon icon={imagesOutline} />{t('fit.fromGallery')}
          </button>
        </div>

        {recent.length === 0 ? (
          <div className="fittings-empty">
            <IonIcon icon={sparklesOutline} />
            <p>{t('fit.emptyHint')}</p>
          </div>
        ) : (<>
          <div className="fittings-section">{t('fit.recent')}</div>
          <div className="fittings-grid">
            {recent.map(item => (
              <button key={item.key} className="fittings-card card" onClick={() => router.push(item.href)}>
                <img src={item.image} alt="" />
                <div className="fittings-card__body">
                  <div className="fittings-card__title">{item.title}</div>
                  <div className={`fittings-card__sub${item.linked ? ' fittings-card__sub--linked' : ''}`}>{item.sub}</div>
                </div>
              </button>
            ))}
          </div>
        </>)}

        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onFile} />
        <input ref={photoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFile} />
      </IonContent>
    </IonPage>
  );
};

export default Fittings;
