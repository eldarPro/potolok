import React, { useEffect, useState, useRef } from 'react';
import {
  IonPage, IonHeader, IonToolbar,
  IonButtons, IonBackButton, IonButton, IonIcon,
  useIonToast, useIonViewWillEnter, useIonViewWillLeave, useIonRouter,
} from '@ionic/react';
import {
  chevronBackOutline, closeOutline, ellipsisVerticalOutline,
  createOutline, sparklesOutline, refreshOutline, trashOutline,
} from 'ionicons/icons';
import { useParams } from 'react-router-dom';
import { getProject, upsertProject, loadProfiles, loadLightings, loadNiches, loadFabrics, loadAccessories, loadServices } from '../lib/storage';
import { uuid } from '../lib/uuid';
import { Project, Room, CatalogItem, RoomProfileSegment, LightingCatalogItem, RoomLightingPoint, RoomLightingPath, NicheItem, WallPoint, Accessory, AdditionalService } from '../types';
import CeilingCanvas, { CanvasSelection, selectionKey } from '../components/CeilingCanvas';
import ElementCard from '../components/ElementCard';
import RoomSheet from '../components/RoomSheet';
import SectionPanel, { PanelSection } from '../components/SectionPanel';
import BluetoothMeasureModal from '../components/BluetoothMeasureModal';
import ManualMeasureModal from '../components/ManualMeasureModal';
import { edgeLengthM, dist, pxToMeters, Point } from '../lib/geometry';
import { isStraightWall } from '../lib/nicheGeometry';
import { newWallNiche, newCrossNiche } from '../lib/nicheEdit';
import { roomDiagonals, diagonalKey } from '../lib/diagonals';
import { useT } from '../lib/i18n';
import { useConfirm, usePrompt } from '../components/Dialogs';
import './RoomEditor.css';

const RoomEditor: React.FC = () => {
  const { t } = useT();
  const { projectId, roomId } = useParams<{ projectId: string; roomId: string }>();
  const router = useIonRouter();
  const [presentToast] = useIonToast();
  const [project, setProject] = useState<Project | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [profiles, setProfiles] = useState<CatalogItem[]>([]);
  const [lightings, setLightings] = useState<LightingCatalogItem[]>([]);
  const [fabrics, setFabrics] = useState<CatalogItem[]>([]);
  const [niches, setNiches] = useState<NicheItem[]>([]);
  const [accessories, setAccessories] = useState<Accessory[]>([]);
  const [services, setServices] = useState<AdditionalService[]>([]);
  // The room section open under the drawing; the drawing is its preview:
  // `focus` is what's highlighted there, `preview` the typed, unapplied shape
  const [section, setSection] = useState<PanelSection | null>(null);
  const [focus, setFocus] = useState<CanvasSelection | null>(null);
  const [preview, setPreview] = useState<Point[] | null>(null);
  const [panelExpanded, setPanelExpanded] = useState(false);
  // a not-yet-applied change beyond the outline (a wall split: new corner + profiles)
  const [previewRoom, setPreviewRoom] = useState<Partial<Room> | null>(null);
  // the wall being split — a sub-page of the profiles section
  const [splitWall, setSplitWall] = useState<number | null>(null);
  useEffect(() => {
    setFocus(null); setPreview(null); setPreviewRoom(null);
    if (section !== 'profile') setSplitWall(null);
  }, [section]);

  // The element picked on the drawing — its card replaces the room panel
  const [selection, setSelection] = useState<CanvasSelection | null>(null);
  const [cardHeight, setCardHeight] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);

  const [undoStack, setUndoStack] = useState<Room[]>([]);
  const [redoStack, setRedoStack] = useState<Room[]>([]);
  const isDraggingRef = useRef(false);

  const [placingLighting, setPlacingLighting] = useState<LightingCatalogItem | null>(null);
  const [lightingPathPts, setLightingPathPts] = useState<{ x: number; y: number }[]>([]);
  const [pathRedoStack, setPathRedoStack] = useState<{ x: number; y: number }[]>([]);
  // IDs of lights placed in the current session (for cancel to remove them)
  const [lightingSessionIds, setLightingSessionIds] = useState<Set<string>>(new Set());

  const [placingNiche, setPlacingNiche] = useState<NicheItem | null>(null);
  // Placing a niche across the room (two taps) rather than along a wall, and its first end
  const [nicheCross, setNicheCross] = useState(false);
  const [crossStart, setCrossStart] = useState<WallPoint | null>(null);
  useEffect(() => { if (!placingNiche) setCrossStart(null); }, [placingNiche]);

  const [menuOpen, setMenuOpen] = useState(false);
  const prompt = usePrompt();
  const confirm = useConfirm();
  const [bluetoothOpen, setBluetoothOpen] = useState(false);
  const [manualMeasureOpen, setManualMeasureOpen] = useState(false);

  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [canvasKey, setCanvasKey] = useState(0);

  const load = () => {
    const p = getProject(projectId);
    if (!p) return;
    setProject(p);
    setRoom(p.rooms.find(r => r.id === roomId) ?? null);
    setProfiles(loadProfiles());
    setLightings(loadLightings());
    setFabrics(loadFabrics());
    setNiches(loadNiches());
    setAccessories(loadAccessories());
    setServices(loadServices());
  };

  useEffect(() => {
    load();
    setUndoStack([]);
    setRedoStack([]);
  }, [projectId, roomId]);
  // The outline can change on another page (diagonals). Coming back, record the
  // shape we had as an undo step so «Отменить» can return to it.
  const roomRef = useRef<Room | null>(null);
  roomRef.current = room;
  // the section that sent us to the price list — reopened on the way back
  const reopenSection = useRef<PanelSection | null>(null);
  useIonViewWillEnter(() => {
    const before = roomRef.current;
    const after = getProject(projectId)?.rooms.find(r => r.id === roomId);
    if (before && after && before.id === after.id &&
        JSON.stringify(before.points) !== JSON.stringify(after.points)) {
      setUndoStack(prev => [...prev.slice(-30), before]);
      setRedoStack([]);
    }
    load();
    if (reopenSection.current) { setSection(reopenSection.current); reopenSection.current = null; }
  });

  // Set up ResizeObserver after room is loaded (ref is null until JSX renders)
  useEffect(() => {
    if (!room) return;
    const el = canvasContainerRef.current;
    if (!el) return;
    const measure = () => {
      if (el.clientWidth > 0 && el.clientHeight > 0)
        setCanvasSize({ width: el.clientWidth, height: el.clientHeight });
    };
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    measure();
    return () => obs.disconnect();
  }, [room?.id]);

  useEffect(() => { setLightingPathPts([]); setPathRedoStack([]); }, [placingLighting?.id]);
  useIonViewWillLeave(() => {
    setPlacingLighting(null);
    setLightingPathPts([]);
    setPathRedoStack([]);
    setLightingSessionIds(new Set());
    setPlacingNiche(null);
    setSection(null);
  });

  if (!project || !room) return null;

  // A selection outlives what it points at after undo, delete or a redraw — drop it then
  const liveSelection = ((): CanvasSelection | null => {
    const s = selection;
    if (!s || room.areaSqm === 0 || placingLighting || placingNiche || section) return null;
    const n = room.points.length;
    if (s.kind === 'corner' || s.kind === 'wall') return s.index < n ? s : null;
    if (s.kind === 'diagonal') {
      const key = diagonalKey(s.i, s.j);
      return roomDiagonals(room.points).some(d => d.key === key) ? s : null;
    }
    if (s.kind === 'light') return (room.lighting ?? []).some(e => e.id === s.id) ? s : null;
    if (s.kind === 'niche') return (room.selectedNiches ?? []).some(e => e.id === s.id && e.kind !== 'count') ? s : null;
    return s;
  })();
  // Part of the canvas the card hides: everything above the room panel it covers
  const panelHeight = (bodyRef.current?.clientHeight ?? 0) - canvasSize.height;
  const obscuredBottom = liveSelection ? Math.max(0, cardHeight - panelHeight) : 0;

  const handleVertexDragStart = () => {
    if (!isDraggingRef.current) {
      setUndoStack(prev => [...prev.slice(-30), room]);
      setRedoStack([]);
      isDraggingRef.current = true;
    }
  };

  const handleVertexDragEnd = () => { isDraggingRef.current = false; };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack(s => [...s, room]);
    setUndoStack(s => s.slice(0, -1));
    setRoom(prev);
    const proj = {
      ...project,
      rooms: project!.rooms.map(r => r.id === roomId ? prev : r),
      updatedAt: new Date().toISOString(),
    };
    setProject(proj);
    upsertProject(proj);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack(s => [...s, room]);
    setRedoStack(s => s.slice(0, -1));
    setRoom(next);
    const proj = {
      ...project,
      rooms: project!.rooms.map(r => r.id === roomId ? next : r),
      updatedAt: new Date().toISOString(),
    };
    setProject(proj);
    upsertProject(proj);
  };

  const updateRoom = (partial: Partial<Room>) => {
    if (!isDraggingRef.current) {
      // When committing a new polygon (points arrive from local canvas state),
      // push an "open polygon" snapshot so undo goes back to editable outline,
      // not to empty canvas.
      let undoTarget = room;
      if (
        partial.points !== undefined &&
        (partial.areaSqm ?? 0) > 0 &&
        room.areaSqm === 0
      ) {
        undoTarget = { ...room, points: partial.points, areaSqm: 0, perimeterM: 0, profileSegments: [] };
        // the next step after closing the outline: check its diagonals
        if (partial.points.length >= 4) { setSelection(null); setSection('diagonals'); }
      }
      setUndoStack(prev => [...prev.slice(-30), undoTarget]);
      setRedoStack([]);
    }
    let updated: Room = { ...room, ...partial };

    if (partial.points !== undefined) {
      const pts = partial.points;
      if (pts.length < 3) {
        updated.profileSegments = [];
      } else {
        const existing = updated.profileSegments ?? [];
        if (existing.length === 0) {
          const def = profiles.find(p => p.isDefault) ?? profiles[0] ?? null;
          if (def) {
            updated.profileSegments = pts.map((_, i) => ({
              edgeIndex: i, profileId: def.id, profile: { ...def },
              lengthM: edgeLengthM(pts, i),
            }));
          }
        } else {
          updated.profileSegments = existing
            .filter(s => s.edgeIndex < pts.length)
            .map(s => ({ ...s, lengthM: edgeLengthM(pts, s.edgeIndex) }));
        }
      }
      // Wall niches hang on wall numbers — drop any whose wall is gone
      updated.selectedNiches = (updated.selectedNiches ?? [])
        .filter(n => n.kind === 'wall' ? n.edges.every(e => e < pts.length)
          : n.kind === 'cross' ? n.a.edge < pts.length && n.b.edge < pts.length : true);
    }

    setRoom(updated);
    const proj = {
      ...project,
      rooms: project.rooms.map(r => r.id === roomId ? updated : r),
      updatedAt: new Date().toISOString(),
    };
    setProject(proj);
    upsertProject(proj);
  };

  const clearDrawing = async () => {
    const ok = await confirm({
      title: t('re.clearTitle'), message: t('re.clearMsg'), confirmText: t('re.clearConfirm'), tone: 'warning', dark: true,
    });
    if (!ok) return;
    // Drawn niche lines are anchored to the old room shape and become invalid
    // once it's wiped — drop them, same as lighting. Manually-counted ('pcs')
    // niches carry no geometry, so they survive the redraw like accessories do.
    updateRoom({
      points: [], areaSqm: 0, perimeterM: 0, profileSegments: [], lighting: [], hiddenDiagonals: [],
      selectedNiches: (room.selectedNiches ?? []).filter(n => n.kind === 'count'),
    });
    setLightingPathPts([]);
    setPathRedoStack([]);
    setPlacingLighting(null);
    setPlacingNiche(null);
    setCanvasKey(k => k + 1);
  };

  const askRename = async () => {
    const v = await prompt({
      title: t('re.renameTitle'), confirmText: t('common.save'), dark: true,
      fields: [{ name: 'name', placeholder: t('re.namePH'), value: room.name, required: true }],
    });
    const name = v?.name.trim();
    if (name) updateRoom({ name });
  };

  const askDeleteRoom = async () => {
    const ok = await confirm({
      title: t('re.deleteRoomTitle'), message: t('re.deleteRoomMsg', { name: room.name }), confirmText: t('common.delete'), dark: true,
    });
    if (ok) deleteRoom();
  };

  const deleteRoom = () => {
    const proj = {
      ...project,
      rooms: project.rooms.filter(r => r.id !== roomId),
      updatedAt: new Date().toISOString(),
    };
    upsertProject(proj);
    router.push(`/project/${projectId}`, 'back');
  };

  const handleLightingTap = (pt: { x: number; y: number }) => {
    if (!placingLighting) return;
    if (placingLighting.placement === 'point') {
      const newEl: RoomLightingPoint = {
        id: uuid(), kind: 'point',
        catalogItemId: placingLighting.id, catalogItem: { ...placingLighting },
        x: pt.x, y: pt.y,
      };
      updateRoom({ lighting: [...(room.lighting ?? []), newEl] });
      setLightingSessionIds(prev => new Set([...prev, newEl.id]));
      setPathRedoStack([]);
    } else {
      setPathRedoStack([]);
      setLightingPathPts(prev => [...prev, pt]);
    }
  };

  const handleUndoLightingPoint = () => {
    if (lightingPathPts.length > 0) {
      const last = lightingPathPts[lightingPathPts.length - 1];
      setPathRedoStack(prev => [...prev, last]);
      setLightingPathPts(prev => prev.slice(0, -1));
    } else {
      // Only undo if the previous snapshot still has a committed polygon,
      // so we don't accidentally switch back to draw mode while in lighting mode.
      const prev = undoStack.length > 0 ? undoStack[undoStack.length - 1] : null;
      if (prev && prev.areaSqm > 0) handleUndo();
    }
  };

  const handleRedoLightingPoint = () => {
    if (pathRedoStack.length > 0) {
      const pt = pathRedoStack[pathRedoStack.length - 1];
      setPathRedoStack(prev => prev.slice(0, -1));
      setLightingPathPts(prev => [...prev, pt]);
    } else {
      const next = redoStack.length > 0 ? redoStack[redoStack.length - 1] : null;
      if (next && next.areaSqm > 0) handleRedo();
    }
  };

  const handleFinishPlacingLighting = () => {
    commitLightingPath();
    setPlacingLighting(null);
    setLightingPathPts([]);
    setPathRedoStack([]);
    setLightingSessionIds(new Set());
  };

  const handleCancelPlacingLighting = () => {
    const ids = lightingSessionIds;
    if (ids.size > 0) updateRoom({ lighting: (room.lighting ?? []).filter(e => !ids.has(e.id)) });
    setPlacingLighting(null);
    setLightingPathPts([]);
    setPathRedoStack([]);
    setLightingSessionIds(new Set());
  };

  // A line drawn so far goes into the room on «Готово»
  const commitLightingPath = () => {
    if (!placingLighting || placingLighting.placement !== 'path' || lightingPathPts.length < 2) return;
    let totalPx = 0;
    for (let i = 0; i < lightingPathPts.length - 1; i++)
      totalPx += dist(lightingPathPts[i], lightingPathPts[i + 1]);
    const newEl: RoomLightingPath = {
      id: uuid(), kind: 'path',
      catalogItemId: placingLighting.id, catalogItem: { ...placingLighting },
      points: lightingPathPts, lengthM: pxToMeters(totalPx),
    };
    updateRoom({ lighting: [...(room.lighting ?? []), newEl] });
    setLightingSessionIds(prev => new Set([...prev, newEl.id]));
    setLightingPathPts([]);
    setPathRedoStack([]);
  };

  // How much of the type being placed went in during this placing
  const placedNow = (room.lighting ?? []).filter(e => lightingSessionIds.has(e.id) && e.catalogItemId === placingLighting?.id).length;

  const hasLightingTools = lightings.length > 0 && room.areaSqm > 0;
  const isPlacingPath = placingLighting?.placement === 'path';

  // Across the room: the first tap sets one end, the second — on another
  // wall — puts the niche in
  const handleNicheCrossTap = (wp: WallPoint) => {
    if (!placingNiche) return;
    if (!crossStart) { setCrossStart(wp); return; }
    const newEl = newCrossNiche(placingNiche, crossStart, wp);
    updateRoom({ selectedNiches: [...(room.selectedNiches ?? []), newEl] });
    setPlacingNiche(null);
    setCrossStart(null);
    setSelection({ kind: 'niche', id: newEl.id });
  };

  // A niche goes on with a tap on a wall: along all of it — then the card or
  // its handles move its ends.
  const handleNicheWallTap = (edge: number) => {
    if (!placingNiche) return;
    if (!isStraightWall(room.points, edge)) {
      presentToast({ message: t('nc.curvedWall'), duration: 2000, position: 'top' });
      return;
    }
    const newEl = newWallNiche(placingNiche, edge);
    updateRoom({ selectedNiches: [...(room.selectedNiches ?? []), newEl] });
    setPlacingNiche(null);
    setSelection({ kind: 'niche', id: newEl.id });
  };

  // A niche counted in pieces needs no wall — add one and stop placing
  const addNichePiece = (item: NicheItem) => {
    const list = room.selectedNiches ?? [];
    const existing = list.find(n => n.kind === 'count' && n.nicheId === item.id);
    updateRoom({
      selectedNiches: existing
        ? list.map(n => n === existing && n.kind === 'count' ? { ...n, quantity: n.quantity + 1 } : n)
        : [...list, { id: uuid(), kind: 'count', nicheId: item.id, niche: { ...item }, quantity: 1 }],
    });
    presentToast({ message: t('nc.pieceAdded', { title: item.title }), duration: 1500, position: 'top' });
    handleCancelPlacingNiche();
  };

  const handleCancelPlacingNiche = () => { setPlacingNiche(null); setCrossStart(null); };

  // With a section open, a tap on the wall or diagonal it edits picks its row;
  // anything else closes the section and opens that element's card
  const handleCanvasSelect = (s: CanvasSelection | null) => {
    if (section) {
      if (!s || (section === 'profile' && s.kind === 'wall') || (section === 'diagonals' && s.kind === 'diagonal')) {
        setFocus(s);
        return;
      }
      setSection(null);
    }
    setSelection(s);
  };

  return (
    <IonPage className="dark-page" style={{ display: 'flex', flexDirection: 'column' }}>
      <IonHeader className="dark-header">
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton text="" icon={chevronBackOutline} defaultHref={`/project/${projectId}`} />
          </IonButtons>
          <div className="dark-header__title">
            <div className="dark-header__name">{room.name}</div>
            {project.clientName && <div className="dark-header__sub">{project.clientName}</div>}
          </div>
          <IonButtons slot="end">
            <IonButton className="editor-header__ai" onClick={() => router.push(`/project/${projectId}/room/${roomId}/visualize`, 'forward', 'push')}>
              <IonIcon slot="start" icon={sparklesOutline} />AI
            </IonButton>
            <IonButton fill="clear" onClick={() => setMenuOpen(true)}>
              <IonIcon slot="icon-only" icon={ellipsisVerticalOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <div ref={bodyRef} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, position: 'relative' }}>

          {/* ── Canvas ── */}
          <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
            <div
              ref={canvasContainerRef}
              style={{ position: 'absolute', inset: 0 }}
            >
            {canvasSize.width > 0 && canvasSize.height > 0 && (
              <CeilingCanvas
                key={canvasKey}
                room={preview || previewRoom ? { ...room, ...previewRoom, ...(preview ? { points: preview } : {}) } : room}
                onChange={updateRoom}
                width={canvasSize.width}
                height={canvasSize.height}
                showDiagonals={section === 'diagonals'}
                placingLighting={placingLighting}
                inProgressLightingPath={lightingPathPts}
                onLightingTap={handleLightingTap}
                onUndoLightingPoint={handleUndoLightingPoint}
                onRedoLightingPoint={handleRedoLightingPoint}
                canUndoLighting={lightingPathPts.length > 0 || (undoStack.length > 0 && (undoStack[undoStack.length - 1]?.areaSqm ?? 0) > 0)}
                canRedoLighting={pathRedoStack.length > 0 || (redoStack.length > 0 && (redoStack[redoStack.length - 1]?.areaSqm ?? 0) > 0)}
                placingNiche={placingNiche}
                onNicheWallTap={handleNicheWallTap}
                nicheCross={nicheCross}
                crossStart={crossStart}
                onNicheCrossTap={handleNicheCrossTap}
                onUndo={handleUndo}
                onRedo={handleRedo}
                canUndo={undoStack.length > 0}
                canRedo={redoStack.length > 0}
                onVertexDragStart={handleVertexDragStart}
                onVertexDragEnd={handleVertexDragEnd}
                onOutOfBounds={() => presentToast({
                  message: t('re.outOfBounds'),
                  duration: 1500, position: 'bottom', color: 'danger',
                })}
                onOpenBluetooth={() => setBluetoothOpen(true)}
                onOpenManualMeasure={() => setManualMeasureOpen(true)}
                hideTools={!!section && !placingLighting && !placingNiche}
                onToggleDiagonals={() => { setSelection(null); setSection(section === 'diagonals' ? null : 'diagonals'); }}
                selection={section ? focus : liveSelection}
                onSelect={handleCanvasSelect}
                obscuredBottom={obscuredBottom}
              />
            )}


            </div>
          </div>{/* end canvas */}

          {/* ── Bottom: the open section, the summary bar, or the finish bar while placing ── */}
          {section && !placingLighting && !placingNiche && (
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, ...(panelExpanded ? { flex: '0 0 68%' } : { flex: '0 1 auto', maxHeight: '50%' }) }}>
              <SectionPanel
                section={section}
                room={room}
                pricing={project.pricing}
                fabrics={fabrics}
                profiles={profiles}
                lightings={lightings}
                niches={niches}
                accessories={accessories}
                services={services}
                onChange={updateRoom}
                onPlaceLighting={l => { setFocus(null); setPlacingLighting(l); }}
                onPlaceNiche={n => { setSection(null); setNicheCross(false); setPlacingNiche(n); }}
                focus={focus}
                onFocus={setFocus}
                onPickElement={s => { setSection(null); setSelection(s); }}
                onPreview={setPreview}
                splitWall={splitWall}
                onSplitWall={setSplitWall}
                onPreviewRoom={setPreviewRoom}
                onToast={message => presentToast({ message, duration: 1800, position: 'top' })}
                expanded={panelExpanded}
                onExpand={setPanelExpanded}
                onClose={() => setSection(null)}
                onAddToPriceList={category => { reopenSection.current = section; router.push(`/price-list/${category}/new`); }}
              />
            </div>
          )}
          {!placingLighting && !placingNiche ? (
            // nothing to fill in until the outline is drawn — the canvas guides that;
            // diagonals are the outline itself, not a tab here, so the bar steps aside for them
            room.areaSqm > 0 && section !== 'diagonals' && <RoomSheet
              active={section}
              room={room}
              pricing={project.pricing}
              onOpenSection={s => { setSelection(null); setSection(section === s ? null : s); }}
              onOpenEstimate={() => router.push(`/project/${projectId}/summary?room=${roomId}`)}
            />
          ) : (
          <div style={{
            background: 'rgba(8, 12, 22, 0.94)',
            backdropFilter: 'blur(20px)',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            padding: '12px 16px',
            paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))',
          }}>

            {/* Lighting placing bar: how many so far */}
            {placingLighting && (
              <div style={{
                marginBottom: 12, padding: '10px 14px',
                background: 'rgba(249,168,37,0.12)',
                borderRadius: 14,
                border: '1px solid rgba(249,168,37,0.3)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
                    {isPlacingPath
                      ? `${t('re.lineHint')} · ${lightingPathPts.length} ${t('re.points')}`
                      : `${t('re.spotHint')} · ${placedNow} ${t('mc.pcs')}`}
                  </span>
                  <button
                    onClick={handleCancelPlacingLighting}
                    style={{
                      background: 'none', border: 'none', padding: 4,
                      cursor: 'pointer', color: 'rgba(255,255,255,0.35)', flexShrink: 0,
                    }}
                  >
                    <IonIcon icon={closeOutline} style={{ fontSize: 20, display: 'block' }} />
                  </button>
                  <button
                    onClick={handleFinishPlacingLighting}
                    style={{
                      padding: '6px 14px', borderRadius: 10,
                      background: '#F9A825', border: 'none',
                      color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
                    }}
                  >
                    {t('re.done')}
                  </button>
                </div>
              </div>
            )}

            {/* Niche placing bar: which niche (its chip), along a wall or across
                the room, then the tap(s) on the walls */}
            {placingNiche && (
              <div style={{
                marginBottom: 12, padding: '10px 14px',
                background: 'rgba(0,131,143,0.12)',
                borderRadius: 14,
                border: '1px solid rgba(0,131,143,0.35)',
              }}>
              {niches.length > 1 && (
                <div className="niche-types">
                  {niches.filter(n => n.unit === 'perimeter').map(n => (
                    <button key={n.id} className={`niche-types__chip${n.id === placingNiche.id ? ' niche-types__chip--on' : ''}`} onClick={() => setPlacingNiche(n)}>
                      {n.title}
                      <small>{n.price.toLocaleString('ru')} ₽/{t('unit.m')}</small>
                    </button>
                  ))}
                  {niches.filter(n => n.unit === 'pcs').map(n => (
                    <button key={n.id} className="niche-types__chip niche-types__chip--piece" onClick={() => addNichePiece(n)}>
                      + {n.title}
                      <small>{n.price.toLocaleString('ru')} ₽/{t('unit.pcs')}</small>
                    </button>
                  ))}
                </div>
              )}
              <div className="niche-modes">
                <button className={`niche-modes__btn${!nicheCross ? ' niche-modes__btn--on' : ''}`} onClick={() => { setNicheCross(false); setCrossStart(null); }}>
                  {t('nc.modeAlong')}
                </button>
                <button className={`niche-modes__btn${nicheCross ? ' niche-modes__btn--on' : ''}`} onClick={() => setNicheCross(true)}>
                  {t('nc.modeAcross')}
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
                  {!nicheCross ? t('re.nicheTapWall') : !crossStart ? t('nc.crossFirst') : t('nc.crossSecond')}
                </span>
                <button
                  onClick={handleCancelPlacingNiche}
                  style={{
                    background: 'none', border: 'none', padding: 4,
                    cursor: 'pointer', color: 'rgba(255,255,255,0.35)', flexShrink: 0,
                  }}
                >
                  <IonIcon icon={closeOutline} style={{ fontSize: 20, display: 'block' }} />
                </button>
              </div>
              </div>
            )}

          </div>
          )}

          {liveSelection && (
            <ElementCard
              key={selectionKey(liveSelection)}
              room={room}
              selection={liveSelection}
              pricing={project.pricing}
              fabrics={fabrics}
              profiles={profiles}
              lightings={lightings}
              niches={niches}
              onChange={updateRoom}
              onSelect={setSelection}
              onSplitWall={i => { setSelection(null); setSection('profile'); setSplitWall(i); }}
              onOpenSection={s => { setSelection(null); setSection(s); }}
              onPlaceLighting={setPlacingLighting}
              onToast={message => presentToast({ message, duration: 1800, position: 'top' })}
              onHeight={setCardHeight}
            />
          )}
        </div>


      {/* ── Room menu ── */}
      {menuOpen && (
        <RoomMenu
          onClose={() => setMenuOpen(false)}
          actions={[
            { icon: createOutline, label: t('re.editName'), onClick: askRename },
            { icon: refreshOutline, label: t('re.clearDraft'), onClick: clearDrawing },
            { icon: trashOutline, label: t('re.deleteRoom'), danger: true, onClick: askDeleteRoom },
          ]}
        />
      )}



      {bluetoothOpen && room && canvasSize.width > 0 && (
        <BluetoothMeasureModal
          room={room}
          canvasW={canvasSize.width}
          canvasH={canvasSize.height}
          onApply={(partial) => { updateRoom(partial); setCanvasKey(k => k + 1); }}
          onClose={() => setBluetoothOpen(false)}
        />
      )}

      {manualMeasureOpen && room && canvasSize.width > 0 && (
        <ManualMeasureModal
          room={room}
          canvasW={canvasSize.width}
          canvasH={canvasSize.height}
          onApply={(partial) => { updateRoom(partial); setCanvasKey(k => k + 1); }}
          onClose={() => setManualMeasureOpen(false)}
        />
      )}
    </IonPage>
  );
};

interface RoomMenuAction {
  icon: string;
  label: string;
  danger?: boolean;
  onClick: () => void;
}

/** Popover under the ⋮ button */
const RoomMenu: React.FC<{
  actions: RoomMenuAction[];
  onClose: () => void;
}> = ({ actions, onClose }) => {
  const run = (a: RoomMenuAction) => { onClose(); a.onClick(); };
  return (
    <div className="room-menu">
      <div className="room-menu__backdrop" onClick={onClose} />
      <div className="room-menu__panel">
        {actions.map(a => (
          <React.Fragment key={a.label}>
            {a.danger && <div className="room-menu__sep" />}
            <button className={`room-menu__item${a.danger ? ' room-menu__item--danger' : ''}`} onClick={() => run(a)}>
              <span className="room-menu__icon"><IonIcon icon={a.icon} /></span>
              <span>{a.label}</span>
            </button>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

export default RoomEditor;
