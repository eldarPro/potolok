import React, { useRef, useState } from 'react';
import {
  IonContent, IonIcon, IonTextarea, IonSpinner, IonAlert, useIonToast,
} from '@ionic/react';
import {
  cameraOutline, imagesOutline, sparklesOutline,
  arrowUndoOutline, refreshOutline, downloadOutline, trashOutline, cubeOutline,
  checkmarkOutline, closeOutline,
} from 'ionicons/icons';
import { uuid } from '../lib/uuid';
import { Room, RoomVisualization, VisualizationVersion } from '../types';
import { fileToDataUrl, downscaleDataUrl } from '../lib/image';
import { generateCeilingImages, ImageEditError } from '../lib/imageEdit';
import type { LayoutBox } from '../lib/roomScene';
import ActionButton from './ActionButton';
import { useT } from '../lib/i18n';
import './VisualizeWorkspace.css';

/** The model sometimes adds or drops a fixture — a few variants per run let the user pick a faithful one. */
const VARIANTS = 3;

/** Generated variants waiting for the user to pick one; only the picked one is stored. */
interface PendingVariants {
  base: VisualizationVersion[];
  prompt: string;
  images: string[];
  selected: number;
}

// Free text names only the change; the model otherwise tends to repaint the walls or drop fixtures.
const editRequest = (text: string) =>
  `${text}\n\nМеняй только то, что описано выше. Стены, пол, мебель, окна и светильники, о которых не сказано, оставь ровно такими, как на фото. Сохрани перспективу и освещение комнаты. Результат должен быть фотореалистичным.`;

interface Props {
  visualization: RoomVisualization | null;
  /** Stores the new state; may throw when storage is full */
  onChange: (visualization: RoomVisualization | null) => void;
  /** The room drawing behind this visualization; without it only photos can be used */
  room?: Room;
  /** Download name, without extension */
  fileName: string;
}

/** Photo, AI edits and their history — the page content of a room visualization or a fitting. */
const VisualizeWorkspace: React.FC<Props> = ({ visualization, onChange, room, fileName }) => {
  const { t } = useT();
  const [presentToast] = useIonToast();

  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pending, setPending] = useState<PendingVariants | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const hasDrawing = !!room && room.areaSqm > 0;

  const versions = visualization?.versions ?? [];
  const current = versions[versions.length - 1] ?? null;

  const persist = (v: RoomVisualization | null) => {
    try {
      onChange(v);
    } catch {
      presentToast({ message: t('viz.storageError'), duration: 2500, color: 'danger', position: 'bottom' });
    }
  };

  const addPhoto = async (file: File) => {
    try {
      const raw = await fileToDataUrl(file);
      const resized = await downscaleDataUrl(raw);
      const version: VisualizationVersion = { id: uuid(), image: resized, prompt: '', createdAt: new Date().toISOString() };
      persist({ versions: [version] });
    } catch {
      presentToast({ message: t('viz.photoError'), duration: 2500, color: 'danger', position: 'bottom' });
    }
  };

  /**
   * Generates variants of an edit of the last version in `base`; on failure the prompt stays in the box to retry.
   * `text` is what the user sees and can retry; `request` is what the model gets.
   */
  const generateFrom = async (base: VisualizationVersion[], text: string, request = text, layout?: LayoutBox[]) => {
    try {
      const raw = await generateCeilingImages(base[base.length - 1].image, request, VARIANTS, layout);
      const images = await Promise.all(raw.map(img => downscaleDataUrl(img)));
      setPending({ base, prompt: text, images, selected: 0 });
      setPrompt('');
    } catch (e) {
      setPrompt(text);
      const code = e instanceof ImageEditError ? e.code : 'network';
      const key = code === 'blocked' ? 'viz.errorBlocked' : 'viz.error';
      presentToast({ message: t(key), duration: 3000, color: 'danger', position: 'bottom' });
    }
  };

  const handleGenerate = async () => {
    if (!current || busy) return;
    const text = prompt.trim();
    if (!text) return;
    setBusy(true);
    try {
      await generateFrom(versions, text, editRequest(text));
    } finally {
      setBusy(false);
    }
  };

  // The 3D sketch becomes the "original" (versions[0]); the AI pass on top of it is versions[1].
  const handleFromDrawing = async () => {
    if (busy || !room || !hasDrawing) return;
    setBusy(true);
    try {
      let sketch: VisualizationVersion;
      let text: string;
      let layout: LayoutBox[];
      try {
        const { renderRoomScene, drawingPrompt } = await import('../lib/roomScene');
        const scene = await renderRoomScene(room);
        // boxes are in 0–1000 frame units, so downscaling doesn't move them
        const image = await downscaleDataUrl(scene.image);
        layout = scene.layout;
        sketch = { id: uuid(), image, prompt: '', createdAt: new Date().toISOString() };
        text = drawingPrompt(room);
      } catch {
        presentToast({ message: t('viz.sketchError'), duration: 2500, color: 'danger', position: 'bottom' });
        return;
      }
      persist({ versions: [sketch] });
      await generateFrom([sketch], text, text, layout);
    } finally {
      setBusy(false);
    }
  };

  const handleApplyVariant = () => {
    if (!pending) return;
    const version: VisualizationVersion = {
      id: uuid(), image: pending.images[pending.selected], prompt: pending.prompt, createdAt: new Date().toISOString(),
    };
    persist({ versions: [...pending.base, version] });
    setPending(null);
  };

  const handleDiscardVariants = () => {
    if (!pending) return;
    setPrompt(pending.prompt);
    setPending(null);
  };

  const handleUndo = () => { if (versions.length > 1) persist({ versions: versions.slice(0, -1) }); };
  const handleReset = () => { if (versions.length > 1) persist({ versions: [versions[0]] }); };
  const handleDeletePhoto = () => { persist(null); setDeleteConfirmOpen(false); };

  const handleDownload = () => {
    if (!current) return;
    const a = document.createElement('a');
    a.href = current.image;
    a.download = `${fileName}-${Date.now()}.jpg`;
    a.click();
  };

  return (
    <>
    <IonContent className="visualize-content">
      {!current ? (
        <div className="viz-empty">
          <div className="viz-empty__icon"><IonIcon icon={sparklesOutline} /></div>
          <div className="viz-empty__title">{t('viz.emptyTitle')}</div>
          <div className="viz-empty__subtitle">{t(room ? 'viz.emptySubtitle' : 'fit.emptyHint')}</div>
          <div className="viz-empty__actions">
            {room && (<>
            <ActionButton icon={cubeOutline} solid disabled={!hasDrawing || busy} onClick={handleFromDrawing}>
              {busy ? t('viz.generating') : t('viz.fromDrawing')}
            </ActionButton>
            {!hasDrawing && <div className="viz-empty__hint">{t('viz.needDrawing')}</div>}
            </>)}
            <ActionButton icon={cameraOutline} solid={!room} onClick={() => cameraInputRef.current?.click()}>
              {t('viz.takePhoto')}
            </ActionButton>
            <ActionButton icon={imagesOutline} onClick={() => photoInputRef.current?.click()}>
              {t('viz.uploadPhoto')}
            </ActionButton>
          </div>
        </div>
      ) : (
        <div className="viz-workspace">
          <div className="viz-photo">
            <img src={pending ? pending.images[pending.selected] : current.image} alt="" />
            {busy && (
              <div className="viz-photo__overlay">
                <IonSpinner name="crescent" />
                <span>{t('viz.generating')}</span>
              </div>
            )}
            {!pending && !busy && (
              // undo/reset only appear once there is an edit to step back from
              <div className="viz-photo__tools">
                {versions.length > 1 && (<>
                  <button className="viz-photo__tool" aria-label={t('viz.undo')} title={t('viz.undo')} onClick={handleUndo}>
                    <IonIcon icon={arrowUndoOutline} />
                  </button>
                  <button className="viz-photo__tool" aria-label={t('viz.reset')} title={t('viz.reset')} onClick={handleReset}>
                    <IonIcon icon={refreshOutline} />
                  </button>
                </>)}
                <button className="viz-photo__tool" aria-label={t('viz.download')} title={t('viz.download')} onClick={handleDownload}>
                  <IonIcon icon={downloadOutline} />
                </button>
                <button className="viz-photo__tool" aria-label={t('viz.deletePhoto')} title={t('viz.deletePhoto')} onClick={() => setDeleteConfirmOpen(true)}>
                  <IonIcon icon={trashOutline} />
                </button>
              </div>
            )}
          </div>

          {pending ? (
            <div className="viz-variants">
              <div className="viz-presets__label">{t('viz.pickVariant')}</div>
              <div className="viz-history">
                {pending.images.map((img, i) => (
                  <img
                    key={i}
                    src={img}
                    alt=""
                    className={`viz-history__thumb viz-variants__thumb${i === pending.selected ? ' viz-history__thumb--active' : ''}`}
                    onClick={() => setPending({ ...pending, selected: i })}
                  />
                ))}
              </div>
              <div className="viz-toolbar">
                <button className="viz-toolbar__btn" onClick={handleDiscardVariants}>
                  <IonIcon icon={closeOutline} />{t('common.cancel')}
                </button>
                <ActionButton icon={checkmarkOutline} solid expand={false} className="viz-variants__apply" onClick={handleApplyVariant}>
                  {t('viz.applyVariant')}
                </ActionButton>
              </div>
            </div>
          ) : (<>
          <div className="viz-prompt">
            <IonTextarea
              value={prompt}
              onIonInput={e => setPrompt(e.detail.value ?? '')}
              placeholder={t('viz.promptPH')}
              autoGrow
              rows={3}
              disabled={busy}
              className="viz-prompt__input"
            />
            <ActionButton icon={sparklesOutline} solid disabled={busy || !prompt.trim()} onClick={handleGenerate}>
              {busy ? t('viz.generating') : t('viz.generate')}
            </ActionButton>
          </div>
          </>)}
        </div>
      )}

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) addPhoto(f); e.target.value = ''; }}
      />
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) addPhoto(f); e.target.value = ''; }}
      />
    </IonContent>

    <IonAlert
      isOpen={deleteConfirmOpen}
      onDidDismiss={() => setDeleteConfirmOpen(false)}
      header={t('viz.deletePhoto')}
      message={t('viz.deletePhotoConfirm')}
      buttons={[
        { text: t('common.cancel'), role: 'cancel' },
        { text: t('common.delete'), role: 'destructive', handler: handleDeletePhoto },
      ]}
    />
    </>
  );
};

export default VisualizeWorkspace;
