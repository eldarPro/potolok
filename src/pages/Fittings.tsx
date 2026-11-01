import React, { useRef, useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonFooter, IonIcon, IonTextarea, IonSpinner,
  useIonRouter, useIonToast, useIonViewWillEnter,
} from '@ionic/react';
import { cameraOutline, imagesOutline, sparklesOutline, arrowForwardOutline, closeOutline } from 'ionicons/icons';
import { useHistory } from 'react-router-dom';
import { loadFittings, upsertFitting, loadProjects } from '../lib/storage';
import { fileToDataUrl, downscaleDataUrl } from '../lib/image';
import { uuid } from '../lib/uuid';
import { Fitting, VisualizationVersion } from '../types';
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

/** Example descriptions offered on an empty tab */
const EXAMPLES = ['fit.ex1', 'fit.ex2', 'fit.ex3', 'fit.ex4'];

const Fittings: React.FC = () => {
  const { t } = useT();
  const router = useIonRouter();
  const history = useHistory();
  const [presentToast] = useIonToast();
  const [recent, setRecent] = useState<RecentItem[]>([]);

  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

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

  const attachPhoto = async (file: File) => {
    try {
      setPhoto(await downscaleDataUrl(await fileToDataUrl(file)));
    } catch {
      presentToast({ message: t('viz.photoError'), duration: 2500, color: 'danger', position: 'bottom' });
    }
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) attachPhoto(f);
    e.target.value = '';
  };

  /**
   * Starts a fitting from the attached photo, or — with only a description — from a blank
   * room sketch; the fitting page then generates from the description straight away.
   */
  const send = async () => {
    const description = text.trim();
    if (sending || (!description && !photo)) return;
    setSending(true);
    try {
      const now = new Date().toISOString();
      let original: VisualizationVersion;
      if (photo) {
        original = { id: uuid(), image: photo, prompt: '', createdAt: now };
      } else {
        const { renderBlankRoom } = await import('../lib/roomScene');
        const image = await downscaleDataUrl((await renderBlankRoom()).image);
        original = { id: uuid(), image, prompt: '', createdAt: now, sketch: true };
      }
      const fitting: Fitting = { id: uuid(), createdAt: now, updatedAt: now, visualization: { versions: [original] } };
      upsertFitting(fitting);
      setText('');
      setPhoto(null);
      history.push({ pathname: `/fitting/${fitting.id}`, state: description ? { prompt: description } : undefined });
    } catch {
      presentToast({ message: t(photo ? 'viz.storageError' : 'viz.sketchError'), duration: 2500, color: 'danger', position: 'bottom' });
    } finally {
      setSending(false);
    }
  };

  return (
    <IonPage>
      <IonHeader className="blue-header">
        <IonToolbar>
          <IonTitle>{t('fit.title')}</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="blue-page">
        {recent.length === 0 ? (
          <div className="fittings-empty">
            <IonIcon icon={sparklesOutline} />
            <p>{t('fit.emptyHint')}</p>
            <div className="fittings-examples">
              {EXAMPLES.map(key => (
                <button key={key} className="fittings-example" onClick={() => setText(t(key))}>{t(key)}</button>
              ))}
            </div>
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

      <IonFooter className="fittings-composer">
        {photo && (
          <div className="fittings-composer__photo">
            <img src={photo} alt="" />
            <button aria-label={t('fit.removePhoto')} onClick={() => setPhoto(null)} disabled={sending}>
              <IonIcon icon={closeOutline} />
            </button>
          </div>
        )}
        <div className="fittings-composer__row">
          <button className="fittings-composer__icon" aria-label={t('fit.takePhoto')} disabled={sending} onClick={() => cameraInputRef.current?.click()}>
            <IonIcon icon={cameraOutline} />
          </button>
          <button className="fittings-composer__icon" aria-label={t('fit.fromGallery')} disabled={sending} onClick={() => photoInputRef.current?.click()}>
            <IonIcon icon={imagesOutline} />
          </button>
          <IonTextarea
            value={text}
            onIonInput={e => setText(e.detail.value ?? '')}
            placeholder={t('fit.composerPH')}
            autoGrow
            rows={1}
            disabled={sending}
            className="fittings-composer__input"
          />
          <button className="fittings-composer__send" aria-label={t('viz.generate')} disabled={sending || (!text.trim() && !photo)} onClick={send}>
            {sending ? <IonSpinner name="crescent" /> : <IonIcon icon={arrowForwardOutline} />}
          </button>
        </div>
      </IonFooter>
    </IonPage>
  );
};

export default Fittings;
