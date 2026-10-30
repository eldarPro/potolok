import React, { useEffect, useState, useRef } from 'react';
import {
  IonPage, IonHeader, IonToolbar,
  IonButtons, IonBackButton, IonButton, IonIcon, IonActionSheet, IonAlert,
  useIonToast, useIonViewWillEnter, useIonViewWillLeave, useIonRouter,
} from '@ionic/react';
import {
  chevronBackOutline, closeOutline, ellipsisVerticalOutline,
  createOutline, colorPaletteOutline, refreshOutline, trashOutline,
} from 'ionicons/icons';
import { useParams, useHistory } from 'react-router-dom';
import { getProject, upsertProject, loadProfiles, loadLightings, loadNiches, loadFabrics } from '../lib/storage';
import { uuid } from '../lib/uuid';
import { Project, Room, CatalogItem, RoomProfileSegment, LightingCatalogItem, RoomLightingPoint, RoomLightingPath, NicheItem, WallPoint } from '../types';
import CeilingCanvas, { CanvasSelection, selectionKey } from '../components/CeilingCanvas';
import ElementCard from '../components/ElementCard';
import WallSplitScreen from '../components/WallSplitScreen';
import RoomSheet from '../components/RoomSheet';
import BluetoothMeasureModal from '../components/BluetoothMeasureModal';
import ManualMeasureModal from '../components/ManualMeasureModal';
import { edgeLengthM, dist, pxToMeters } from '../lib/geometry';
import { isStraightWall } from '../lib/nicheGeometry';
import { newWallNiche, newCrossNiche } from '../lib/nicheEdit';
import { roomDiagonals, diagonalKey } from '../lib/diagonals';
import { splitEdge } from '../lib/roomEdit';
import { useT } from '../lib/i18n';
import './RoomEditor.css';

const RoomEditor: React.FC = () => {
  const { t } = useT();
  const { projectId, roomId } = useParams<{ projectId: string; roomId: string }>();
  const router = useIonRouter();
  const history = useHistory();
  const [presentToast] = useIonToast();
  const [project, setProject] = useState<Project | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [profiles, setProfiles] = useState<CatalogItem[]>([]);
  const [lightings, setLightings] = useState<LightingCatalogItem[]>([]);
  const [fabrics, setFabrics] = useState<CatalogItem[]>([]);
  const [niches, setNiches] = useState<NicheItem[]>([]);

  // The element picked on the drawing — its card replaces the room panel
  const [selection, setSelection] = useState<CanvasSelection | null>(null);
  const [cardHeight, setCardHeight] = useState(0);
  const [splitEdgeIdx, setSplitEdgeIdx] = useState<number | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const [undoStack, setUndoStack] = useState<Room[]>([]);
  const [redoStack, setRedoStack] = useState<Room[]>([]);
  const isDraggingRef = useRef(false);

  const [placingLighting, setPlacingLighting] = useState<LightingCatalogItem | null>(null);
  const [lightingPathPts, setLightingPathPts] = useState<{ x: number; y: number }[]>([]);
  const [pathRedoStack, setPathRedoStack] = useState<{ x: number; y: number }[]>([]);
  // IDs of lights placed in the current session (for cancel to remove them)
  const [lightingSessionIds, setLightingSessionIds] = useState<Set<string>>(new Set());
  const [lightingPickerOpen, setLightingPickerOpen] = useState(false);

  const [placingNiche, setPlacingNiche] = useState<NicheItem | null>(null);
  // Placing a niche across the room (two taps) rather than along a wall, and its first end
  const [nicheCross, setNicheCross] = useState(false);
  const [crossStart, setCrossStart] = useState<WallPoint | null>(null);
  useEffect(() => { if (!placingNiche) setCrossStart(null); }, [placingNiche]);

  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
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
  useIonViewWillEnter(() => {
    const before = roomRef.current;
    const after = getProject(projectId)?.rooms.find(r => r.id === roomId);
    if (before && after && before.id === after.id &&
        JSON.stringify(before.points) !== JSON.stringify(after.points)) {
      setUndoStack(prev => [...prev.slice(-30), before]);
      setRedoStack([]);
    }
    load();
    const params = new URLSearchParams(window.location.search);
    if (params.get('pickLighting') === '1') {
      setLightingPickerOpen(true);
      history.replace(window.location.pathname);
    }
    const placeNicheId = params.get('placeNiche');
    if (placeNicheId) {
      const found = loadNiches().find(n => n.id === placeNicheId);
      if (found) setPlacingNiche(found);
      history.replace(window.location.pathname);
    }
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
  });

  if (!project || !room) return null;

  // A selection outlives what it points at after undo, delete or a redraw — drop it then
  const liveSelection = ((): CanvasSelection | null => {
    const s = selection;
    if (!s || room.areaSqm === 0 || placingLighting || placingNiche) return null;
    const n = room.points.length;
    if (s.kind === 'corner' || s.kind === 'wall') return s.index < n ? s : null;
    if (s.kind === 'diagonal') {
      const key = diagonalKey(s.i, s.j);
      return room.showDiagonals !== false && !room.hiddenDiagonals?.includes(key)
        && roomDiagonals(room.points).some(d => d.key === key) ? s : null;
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

  const clearDrawing = () => {
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

  const finishLightingPath = () => {
    if (!placingLighting || lightingPathPts.length < 2) return;
    let totalPx = 0;
    for (let i = 0; i < lightingPathPts.length - 1; i++)
      totalPx += dist(lightingPathPts[i], lightingPathPts[i + 1]);
    const newEl: RoomLightingPath = {
      id: uuid(), kind: 'path',
      catalogItemId: placingLighting.id, catalogItem: { ...placingLighting },
      points: lightingPathPts, lengthM: pxToMeters(totalPx),
    };
    updateRoom({ lighting: [...(room.lighting ?? []), newEl] });
    setPlacingLighting(null);
    setLightingPathPts([]);
    setPathRedoStack([]);
    setLightingSessionIds(new Set());
  };

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

  return (
    <IonPage style={{ display: 'flex', flexDirection: 'column' }}>
      <IonHeader className="editor-header">
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton text="" icon={chevronBackOutline} defaultHref={`/project/${projectId}`} />
          </IonButtons>
          <div className="editor-header__title">
            <div className="editor-header__name">{room.name}</div>
            {project.clientName && <div className="editor-header__sub">{project.clientName}</div>}
          </div>
          <IonButtons slot="end">
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
                room={room}
                onChange={updateRoom}
                width={canvasSize.width}
                height={canvasSize.height}
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
                selection={liveSelection}
                onSelect={setSelection}
                obscuredBottom={obscuredBottom}
              />
            )}


            </div>
          </div>{/* end canvas */}

          {/* ── Bottom: summary sheet, or the finish bar while placing ── */}
          {!placingLighting && !placingNiche ? (
            <RoomSheet
              room={room}
              pricing={project.pricing}
              onOpenSection={section => router.push(`/project/${projectId}/room/${roomId}/materials/${section}`)}
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

            {/* Point lighting finish bar */}
            {placingLighting?.placement === 'point' && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                marginBottom: 12, padding: '10px 14px',
                background: 'rgba(249,168,37,0.12)',
                borderRadius: 14,
                border: '1px solid rgba(249,168,37,0.3)',
              }}>
                <span style={{ flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
                  {placingLighting.title} · {lightingSessionIds.size} {t('mc.pcs')}
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
            )}

            {/* Path lighting finish bar */}
            {isPlacingPath && lightingPathPts.length >= 2 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                marginBottom: 12, padding: '10px 14px',
                background: 'rgba(249,168,37,0.12)',
                borderRadius: 14,
                border: '1px solid rgba(249,168,37,0.3)',
              }}>
                <span style={{ flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
                  {placingLighting?.title} · {lightingPathPts.length} {t('re.points')}
                </span>
                <button
                  onClick={() => { setPlacingLighting(null); setLightingPathPts([]); }}
                  style={{
                    background: 'none', border: 'none', padding: 4,
                    cursor: 'pointer', color: 'rgba(255,255,255,0.35)', flexShrink: 0,
                  }}
                >
                  <IonIcon icon={closeOutline} style={{ fontSize: 20, display: 'block' }} />
                </button>
                <button
                  onClick={finishLightingPath}
                  style={{
                    padding: '6px 14px', borderRadius: 10,
                    background: '#F9A825', border: 'none',
                    color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  {t('re.done')}
                </button>
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
              onSplitWall={setSplitEdgeIdx}
              onOpenSection={section => router.push(`/project/${projectId}/room/${roomId}/materials/${section}`)}
              onPlaceLighting={setPlacingLighting}
              onToast={message => presentToast({ message, duration: 1800, position: 'top' })}
              onHeight={setCardHeight}
            />
          )}
        </div>

      {splitEdgeIdx !== null && splitEdgeIdx < room.points.length && (
        <WallSplitScreen
          points={room.points}
          edgeIndex={splitEdgeIdx}
          profiles={profiles}
          current={room.profileSegments?.find(s => s.edgeIndex === splitEdgeIdx)?.profile ?? null}
          wallColors={room.points.map((_, i) => room.profileSegments?.find(s => s.edgeIndex === i)?.profile.color ?? null)}
          onCancel={() => setSplitEdgeIdx(null)}
          onSplit={(distCm, first, second) => {
            const r = splitEdge(room, splitEdgeIdx, distCm, first, second);
            if (r) updateRoom(r);
            setSelection({ kind: 'wall', index: splitEdgeIdx });
            setSplitEdgeIdx(null);
          }}
        />
      )}

      {/* ── Room menu ── */}
      {menuOpen && (
        <RoomMenu
          onClose={() => setMenuOpen(false)}
          actions={[
            { icon: colorPaletteOutline, label: t('viz.menuItem'), onClick: () => router.push(`/project/${projectId}/room/${roomId}/visualize`, 'forward', 'push') },
            { icon: createOutline, label: t('re.editName'), onClick: () => setRenameOpen(true) },
            { icon: refreshOutline, label: t('re.clearDraft'), onClick: clearDrawing },
            { icon: trashOutline, label: t('re.deleteRoom'), danger: true, onClick: () => setDeleteConfirmOpen(true) },
          ]}
        />
      )}

      {/* ── Rename alert ── */}
      <IonAlert
        isOpen={renameOpen}
        header={t('re.renameTitle')}
        inputs={[{ name: 'name', type: 'text', value: room.name, placeholder: t('re.namePH') }]}
        buttons={[
          { text: t('common.cancel'), role: 'cancel' },
          {
            text: t('common.save'),
            handler: (data: { name: string }) => {
              const name = data.name?.trim();
              if (name) updateRoom({ name });
            },
          },
        ]}
        onDidDismiss={() => setRenameOpen(false)}
      />

      {/* ── Delete confirmation ── */}
      <IonAlert
        isOpen={deleteConfirmOpen}
        header={t('re.deleteRoomTitle')}
        message={t('re.deleteRoomMsg', { name: room.name })}
        buttons={[
          { text: t('common.cancel'), role: 'cancel' },
          { text: t('common.delete'), role: 'destructive', handler: deleteRoom },
        ]}
        onDidDismiss={() => setDeleteConfirmOpen(false)}
      />

      <IonActionSheet
        isOpen={lightingPickerOpen}
        header={t('re.pickLighting')}
        buttons={[
          ...lightings.map(l => ({
            text: `${l.symbol}  ${l.title} — ${l.price.toLocaleString('ru')} ₽/${l.placement === 'path' ? 'м' : t('mc.pcs')}`,
            handler: () => { setPlacingLighting(l); setLightingPickerOpen(false); },
          })),
          { text: t('common.cancel'), role: 'cancel' as const },
        ]}
        onDidDismiss={() => setLightingPickerOpen(false)}
      />

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
