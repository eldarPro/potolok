import React, { useRef, useState, useEffect } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonIcon,
  IonTextarea, IonSpinner, IonAlert, useIonToast, useIonViewWillEnter,
} from '@ionic/react';
import {
  chevronBackOutline, cameraOutline, imagesOutline, sparklesOutline,
  arrowUndoOutline, refreshOutline, downloadOutline, trashOutline, cubeOutline,
  checkmarkOutline, closeOutline,
} from 'ionicons/icons';
import { useParams } from 'react-router-dom';
import { getProject, upsertProject, loadFabrics, loadLightings } from '../lib/storage';
import { uuid } from '../lib/uuid';
import { Project, Room, RoomVisualization, VisualizationVersion, CatalogItem, LightingCatalogItem } from '../types';
import { fileToDataUrl, downscaleDataUrl } from '../lib/image';
import { generateCeilingImages, ImageEditError } from '../lib/imageEdit';
import type { LayoutBox } from '../lib/roomScene';
import ActionButton from '../components/ActionButton';
import { useT } from '../lib/i18n';
import './RoomVisualize.css';

/** The model sometimes adds or drops a fixture — a few variants per run let the user pick a faithful one. */
const VARIANTS = 3;

/** Generated variants waiting for the user to pick one; only the picked one is stored. */
interface PendingVariants {
  base: VisualizationVersion[];
  prompt: string;
  images: string[];
  selected: number;
}

// Dark fabrics used to darken the whole room, walls included — so the walls are pinned explicitly.
const fabricPreset = (title: string) =>
  `Замени полотно натяжного потолка на «${title}». Меняется только поверхность потолка: стены, пол, мебель и окна остаются ровно того же цвета и вида, что сейчас, — стены не темнеют. Все светильники на потолке сохрани на своих местах. Сохрани перспективу и естественное освещение комнаты. Результат должен быть фотореалистичным.`;

const lightingPreset = (title: string, type: LightingCatalogItem['type']) => {
  const placement =
    type === 'chandelier' ? 'по центру потолка' :
    type === 'strip' || type === 'line' ? 'по периметру потолка' :
    'равномерно по потолку';
  return `Добавь на потолок «${title}» ${placement}. Остальную часть фотографии не меняй, впиши элемент реалистично с учётом перспективы, масштаба и освещения комнаты.`;
};

const RoomVisualize: React.FC = () => {
  const { t } = useT();
  const { projectId, roomId } = useParams<{ projectId: string; roomId: string }>();
  const [presentToast] = useIonToast();

  const [project, setProject] = useState<Project | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [fabrics, setFabrics] = useState<CatalogItem[]>([]);
  const [lightings, setLightings] = useState<LightingCatalogItem[]>([]);

  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pending, setPending] = useState<PendingVariants | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    const p = getProject(projectId);
    if (!p) return;
    setProject(p);
    setRoom(p.rooms.find(r => r.id === roomId) ?? null);
    setFabrics(loadFabrics());
    setLightings(loadLightings());
  };

  useEffect(() => { load(); }, [projectId, roomId]);
  useIonViewWillEnter(() => load());

  if (!project || !room) return null;

  const hasDrawing = room.areaSqm > 0;

  const versions = room.visualization?.versions ?? [];
  const current = versions[versions.length - 1] ?? null;

  const persist = (visualization: RoomVisualization | null) => {
    const updatedRoom: Room = { ...room, visualization };
    const updatedProject: Project = {
      ...project,
      rooms: project.rooms.map(r => r.id === roomId ? updatedRoom : r),
      updatedAt: new Date().toISOString(),
    };
    setRoom(updatedRoom);
    setProject(updatedProject);
    try {
      upsertProject(updatedProject);
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

  /** Generates variants of an edit of the last version in `base`; on failure the prompt stays in the box to retry. */
  const generateFrom = async (base: VisualizationVersion[], text: string, layout?: LayoutBox[]) => {
    try {
      const raw = await generateCeilingImages(base[base.length - 1].image, text, VARIANTS, layout);
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
      await generateFrom(versions, text);
    } finally {
      setBusy(false);
    }
  };

  // The 3D sketch becomes the "original" (versions[0]); the AI pass on top of it is versions[1].
  const handleFromDrawing = async () => {
    if (busy || !hasDrawing) return;
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
      await generateFrom([sketch], text, layout);
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
    a.download = `${room.name}-${Date.now()}.jpg`;
    a.click();
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton text="" icon={chevronBackOutline} defaultHref={`/project/${projectId}/room/${roomId}`} />
          </IonButtons>
          <IonTitle>{t('viz.title')}</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="visualize-content">
        {!current ? (
          <div className="viz-empty">
            <div className="viz-empty__icon"><IonIcon icon={sparklesOutline} /></div>
            <div className="viz-empty__title">{t('viz.emptyTitle')}</div>
            <div className="viz-empty__subtitle">{t('viz.emptySubtitle')}</div>
            <div className="viz-empty__actions">
              <ActionButton icon={cubeOutline} solid disabled={!hasDrawing || busy} onClick={handleFromDrawing}>
                {busy ? t('viz.generating') : t('viz.fromDrawing')}
              </ActionButton>
              {!hasDrawing && <div className="viz-empty__hint">{t('viz.needDrawing')}</div>}
              <ActionButton icon={cameraOutline} onClick={() => cameraInputRef.current?.click()}>
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
              {!pending && (
                <button className="viz-photo__delete" onClick={() => setDeleteConfirmOpen(true)}>
                  <IonIcon icon={trashOutline} />
                </button>
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
            {versions.length > 1 && (
              <div className="viz-history">
                {versions.map((v, i) => (
                  <img
                    key={v.id}
                    src={v.image}
                    alt=""
                    className={`viz-history__thumb${i === versions.length - 1 ? ' viz-history__thumb--active' : ''}`}
                  />
                ))}
              </div>
            )}

            <div className="viz-toolbar">
              <button className="viz-toolbar__btn" disabled={versions.length <= 1} onClick={handleUndo}>
                <IonIcon icon={arrowUndoOutline} />{t('viz.undo')}
              </button>
              <button className="viz-toolbar__btn" disabled={versions.length <= 1} onClick={handleReset}>
                <IonIcon icon={refreshOutline} />{t('viz.reset')}
              </button>
              <button className="viz-toolbar__btn" onClick={handleDownload}>
                <IonIcon icon={downloadOutline} />{t('viz.download')}
              </button>
            </div>

            {fabrics.length > 0 && (
              <div className="viz-presets">
                <div className="viz-presets__label">{t('sec.fabric')}</div>
                <div className="viz-presets__row">
                  {fabrics.map(f => (
                    <button key={f.id} className="viz-chip" onClick={() => setPrompt(fabricPreset(f.title))}>
                      {f.title}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {lightings.length > 0 && (
              <div className="viz-presets">
                <div className="viz-presets__label">{t('sec.lighting')}</div>
                <div className="viz-presets__row">
                  {lightings.map(l => (
                    <button key={l.id} className="viz-chip" onClick={() => setPrompt(lightingPreset(l.title, l.type))}>
                      {l.symbol} {l.title}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="viz-prompt">
              <IonTextarea
                value={prompt}
                onIonInput={e => setPrompt(e.detail.value ?? '')}
                placeholder={t('viz.promptPH')}
                autoGrow
                rows={2}
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
    </IonPage>
  );
};

export default RoomVisualize;
