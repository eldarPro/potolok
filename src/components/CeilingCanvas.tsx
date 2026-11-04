import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { IonIcon } from '@ionic/react';
import { arrowUndoOutline, arrowRedoOutline, resizeOutline, scanOutline, createOutline, shapesOutline, bluetoothOutline, chevronForwardOutline, sunnyOutline } from 'ionicons/icons';
import { Stage, Layer, Line, Circle, Text, Group, Rect, Wedge, Arc, Image as KImage } from 'react-konva';
import Konva from 'konva';
import {
  Point, dist, polygonArea, polygonPerimeter, pxToMeters, pxToCm, fmtCm, vertexLabels,
  pointInPolygon, GRID_SIZE,
  edgeLen, arcHandlePoint, bulgeFromThreePoints, edgeWouldCrossRoom, sampleArc, tessellateRoom, liveCornerAngle, cornerWedge,
  nicheFreeEnds, distToSegment,
} from '../lib/geometry';
import { roomDiagonals } from '../lib/diagonals';
import { layoutLabels, calloutJoin, LABEL } from '../lib/canvasLabels';

// A wall can bow at most into a full semicircle. Capping here (rather than
// higher) keeps the arc's projection onto its own chord monotonic, so the
// edgeWouldCrossRoom check below can't be fooled by a reflex arc looping
// around a shared corner without technically crossing a wall segment.
const MAX_WALL_BULGE = 1;
import { Room, LightingCatalogItem, RoomLightingPoint, RoomLightingPath, NicheItem, RoomNicheWall, RoomNicheCross, WallPoint } from '../types';
import {
  nicheShape, nicheSpan, chainCmAt, pointAlongChain, inwardNormal, isStraightWall, chainLengthCm,
  crossLine, crossBand, wallPointXY, wallLengthCm, snapWallCm, squareCmOn,
} from '../lib/nicheGeometry';
import { snapNicheEnd } from '../lib/nicheEdit';
import { hasCornice } from '../lib/pricing';
import { useT } from '../lib/i18n';
import { pointLightGuides, pathLabelAnchor } from '../lib/lightGuides';
import { pickFrame, lightScales, snapLight, frameCentre, ScaleFrame, SnapKind } from '../lib/lightScales';
import { GLOW, BARE_TRACK, trackSpotAim, bareTracks, CHANDELIER_ARMS } from '../lib/lightGlow';
import { lightColor } from '../lib/lighting';
import { hexRgb } from '../lib/fabric';
import { PointLightMark, PathLightMark, markUnit, GlowTint, PointGlow, PathGlow, GlowPointMark, GlowPathMark, ChandelierGlow, TrackBeam } from './LightMarks';
import { useCeilingVisual } from './useCeilingVisual';
import './CeilingCanvas.css';

/** What a tap on the finished drawing picked — the element card acts on it */
export type CanvasSelection =
  | { kind: 'corner'; index: number }
  | { kind: 'wall'; index: number }
  | { kind: 'diagonal'; i: number; j: number }
  | { kind: 'light'; id: string }
  /** all the lights of one price-list item — picked in the lighting section */
  | { kind: 'lightGroup'; id: string }
  | { kind: 'niche'; id: string }
  | { kind: 'fabric' };

export const selectionKey = (s: CanvasSelection | null) => !s ? '' : s.kind === 'corner' || s.kind === 'wall' ? `${s.kind}:${s.index}`
  : s.kind === 'diagonal' ? `diagonal:${s.i}-${s.j}` : s.kind === 'fabric' ? 'fabric' : `${s.kind}:${s.id}`;

// A finger that travels further than this between down and up was panning, not tapping
const TAP_SLOP_PX = 8;
const SEL = '#F9A825';

const CLOSE_THRESHOLD = 24;
// How far (screen px) from a wall a tap still puts a niche on it
const NICHE_WALL_REACH = 44;
// How close (screen px) a dragged niche end must come to a magnet to stick
const NICHE_SNAP_PX = 14;
const NICHE = '#00ACC1';
// How close (screen px) a new light must come to another's row to line up with it
const SNAP_PX = 14;
// Set-out scales: their numbers and the light they were just lined up for
const SCALE = '#ffcf5a';
const SCALE_SNAP = '#5ee0c2';
const NICHE_DARK = '#00838F';

// Diagonal hatch for a niche band — made once, on first use
let hatch: HTMLCanvasElement | null | undefined;
const nicheHatch = () => {
  if (hatch !== undefined) return hatch;
  hatch = null;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 8;
    const g = c.getContext('2d');
    if (g) {
      g.fillStyle = 'rgba(0,172,193,0.16)';
      g.fillRect(0, 0, 8, 8);
      g.strokeStyle = 'rgba(0,172,193,0.85)';
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(0, 8); g.lineTo(8, 0);
      g.moveTo(-2, 2); g.lineTo(2, -2);
      g.moveTo(6, 10); g.lineTo(10, 6);
      g.stroke();
      hatch = c;
    }
  } catch { /* no canvas (tests) — plain fill instead */ }
  return hatch;
};
const flat = (ps: Point[]) => ps.flatMap(p => [p.x, p.y]);
// Deep enough to pull apart corners a few cm apart — marks and text keep
// their screen size at any zoom, so zooming in really does make room.
const MAX_ZOOM = 20;
// Zoom-out floor; a room too big to fit at it lowers the floor to half its
// fit scale, so a pinch can always get back to (and past) the whole outline.
const MIN_ZOOM = 0.2;
const MIN_POINTS = 3;
// A two-finger gesture is either a rotate or a zoom/pan, never both: it does
// nothing until one movement clears its threshold, then stays locked to that
// mode until the fingers lift — so a twist doesn't zoom when the fingers
// drift apart a little, and a pinch doesn't wobble the drawing.
const ROTATE_START_DEG = 8;
const ZOOM_START_RATIO = 1.1;  // finger spread change (either way)
const PAN_START_PX = 20;       // midpoint travel
// While rotating, the drawing sticks to a multiple of 90° within this angle,
// making it easy to get back to the original orientation.
const ROTATE_SNAP_DEG = 4;

const rotatePt = (p: Point, deg: number): Point => {
  const r = deg * Math.PI / 180;
  const c = Math.cos(r), s = Math.sin(r);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
};

const normDeg = (deg: number) => ((deg % 360) + 540) % 360 - 180;

type Rotation = { angle: number; x: number; y: number };
const NO_ROTATION: Rotation = { angle: 0, x: 0, y: 0 };

interface Props {
  room: Room;
  onChange: (updated: Partial<Room>) => void;
  width: number;
  height: number;
  /** The diagonals section is open: diagonals on the drawing, and nothing but
   *  the outline, wall lengths and corner letters around them */
  showDiagonals?: boolean;
  placingLighting?: LightingCatalogItem | null;
  inProgressLightingPath?: { x: number; y: number }[];
  onLightingTap?: (pt: { x: number; y: number }) => void;
  onUndoLightingPoint?: () => void;
  onRedoLightingPoint?: () => void;
  canUndoLighting?: boolean;
  canRedoLighting?: boolean;
  placingNiche?: NicheItem | null;
  onNicheWallTap?: (edge: number) => void;
  /** placing a niche across the room: two taps, one on each wall */
  nicheCross?: boolean;
  /** the first end of a niche across the room, once tapped */
  crossStart?: WallPoint | null;
  onNicheCrossTap?: (wp: WallPoint) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onVertexDragStart?: () => void;
  onVertexDragEnd?: () => void;
  onOutOfBounds?: () => void;
  onOpenBluetooth?: () => void;
  onOpenManualMeasure?: () => void;
  /** Opens/closes the diagonals panel — a button in the toolbar over the drawing */
  onToggleDiagonals?: () => void;
  /** a section panel is open — the drawing gets all the room, no toolbar over it */
  hideTools?: boolean;
  selection?: CanvasSelection | null;
  onSelect?: (s: CanvasSelection | null) => void;
  /** Height of the canvas bottom covered by the element card — the selection is kept above it */
  obscuredBottom?: number;
}

type Tool = 'draw' | 'move';

/** Colours of a set-out number: on the scale, of the light in hand, lined up */
const TONE = { plain: SCALE, active: SEL, snap: SCALE_SNAP } as const;

/** A number on the drawing — set-out scales, a light's distances, a run's length */
const ValuePill: React.FC<{
  at: Point; angle: number; px: number; text: string; w: number;
  tone: keyof typeof TONE; color?: string;
}> = ({ at, angle, px, text, w, tone, color }) => {
  const h = 18, lit = tone !== 'plain';
  return (
    <Group x={at.x} y={at.y} rotation={angle} scaleX={px} scaleY={px} listening={false}>
      <Rect x={-w / 2} y={-h / 2} width={w} height={h} cornerRadius={5} fill={lit ? TONE[tone] : 'rgba(14,15,26,0.9)'} />
      <Text x={-w / 2} y={-h / 2} width={w} height={h} align="center" verticalAlign="middle" text={text} fontSize={11.5} fontStyle="bold" fill={lit ? '#16182a' : color ?? SCALE} />
    </Group>
  );
};

/** Height of the toolbar over the drawing, plus a gap */
const TOOLBAR_H = 88;

const ToolBtn: React.FC<{
  icon: string; label: string; onClick?: () => void; disabled?: boolean;
  /** orange tool (diagonals); active — its panel is open */
  accent?: boolean; active?: boolean;
}> = ({ icon, label, onClick, disabled, accent, active }) => (
  <button
    className={`cv-tool${accent ? ' cv-tool--accent' : ''}${active ? ' cv-tool--active' : ''}`}
    onClick={onClick} disabled={disabled}
  >
    <span className="cv-tool__btn">
      <IonIcon icon={icon} />
    </span>
    <span className="cv-tool__label">{label}</span>
  </button>
);

const CeilingCanvas: React.FC<Props> = ({
  room, onChange, width, height,
  showDiagonals = false,
  placingLighting = null,
  inProgressLightingPath = [],
  onLightingTap,
  onUndoLightingPoint,
  onRedoLightingPoint,
  canUndoLighting = false,
  canRedoLighting = false,
  placingNiche = null,
  onNicheWallTap,
  nicheCross = false,
  crossStart = null,
  onNicheCrossTap,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  onVertexDragStart,
  onVertexDragEnd,
  onOutOfBounds,
  onOpenBluetooth,
  onOpenManualMeasure,
  onToggleDiagonals,
  hideTools = false,
  selection = null,
  onSelect,
  obscuredBottom = 0,
}) => {
  const [points, setPoints] = useState<Point[]>(room.points);
  const [closed, setClosed] = useState(room.points.length >= MIN_POINTS);
  const [manualStarted, setManualStarted] = useState(false);
  const [cursor, setCursor] = useState<Point | null>(null);
  // True while a single touch is held down to place a new point — the point
  // commits on release (handleTouchEnd), not on touchdown, so it can still be
  // nudged while the finger is on the glass.
  const [placingTouch, setPlacingTouch] = useState(false);
  const [tool, setTool] = useState<Tool>(room.points.length >= MIN_POINTS ? 'move' : 'draw');
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
  const minZoomRef = useRef(MIN_ZOOM);
  // Rotation of the drawing only — the grid lives outside the rotated group
  // and stays put. In stage (pre-viewport) coordinates a world point p is
  // drawn at R(angle)·p + (x, y), so it composes with pan/zoom untouched.
  const [rotation, setRotation] = useState<Rotation>(NO_ROTATION);
  const rotationRef = useRef(rotation);
  rotationRef.current = rotation;
  const prevRoomId = useRef(room.id);
  const [draggingPoint, setDraggingPoint] = useState<number | null>(null);
  const [drawRedoStack, setDrawRedoStack] = useState<Point[][]>([]);
  // The «Визуал» view: the ceiling as it will look in life (a three.js
  // picture), with nothing of the drawing over it
  const [visual, setVisual] = useState(false);
  const selKey = selectionKey(selection);
  const selectedPoint = selection?.kind === 'corner' ? selection.index : null;
  const selectedWall = selection?.kind === 'wall' ? selection.index : null;
  const selectedLighting = selection?.kind === 'light' ? selection.id : null;
  // a group of lights picked in the lighting section: lit, with its set-out numbers
  const selectedGroup = selection?.kind === 'lightGroup' ? selection.id : null;
  const selectedNicheEl = selection?.kind === 'niche' ? selection.id : null;
  // Wall a niche being placed would go on (hover), and the niche end being dragged
  const [nicheHoverEdge, setNicheHoverEdge] = useState<number | null>(null);
  const [nicheDrag, setNicheDrag] = useState<{ at: Point; text: string } | null>(null);
  // Where the next tap would put an end of a niche across the room
  const [crossHover, setCrossHover] = useState<{ at: Point; square: boolean } | null>(null);
  const { t } = useT();
  const selectedDiag = selection?.kind === 'diagonal' ? selection : null;
  const fabricSelected = selection?.kind === 'fabric';
  // Where the current pointer gesture started and whether it has turned into
  // a pan/pinch — a tap that travelled isn't a selection.
  const gestureStart = useRef<Point | null>(null);
  const gestureMoved = useRef(false);
  const isDragging = useRef(false);
  const isDraggingPoint = useRef(false);
  const lastTouch = useRef<Point | null>(null);
  const lastMouse = useRef<Point | null>(null);
  const pinchRef = useRef<{
    dist: number; mx: number; my: number;
    // Finger spread and midpoint at touchdown — for deciding the mode.
    dist0: number; mx0: number; my0: number;
    mode: 'pending' | 'rotate' | 'zoom';
    // Twist tracking: finger-line angle last frame, total twist so far, and
    // the part of it eaten by the ROTATE_START_DEG dead zone.
    lastAngle: number; twist: number; twistOffset: number;
    // Rotation at gesture start and the pivot (drawing's centre, stage coords)
    // it turns around — fixed for the whole gesture so the drawing stays put.
    rot0: Rotation; pivot: Point;
  } | null>(null);
  const isTouching = useRef(false);
  const wallDragOrigin = useRef<Point | null>(null);
  // The true (unsnapped) touch position for the point currently being
  // placed — handleTap needs this raw value, not the snapped `cursor` used
  // for the preview, since its "close the loop" check compares raw distance
  // to point 0 before any snapping is applied.
  const touchRawRef = useRef<Point | null>(null);
  // Grace-period timer between a first finger touching down in draw mode and
  // actually committing it as a point: a real two-finger pinch rarely lands
  // both fingers in the exact same touch frame, so without this the first
  // finger alone would start "placing" and, if it happens to lift again
  // (or a stray touchend slips through) before the second finger registers,
  // drop a point mid-pinch. Holding off the commit for a brief window lets
  // the second finger's touchstart (which clears this) cancel it instead.
  const placingTouchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const TOUCH_PLACE_DELAY = 60;

  const isClosed = closed || points.length >= MIN_POINTS;

  // Point lights that get set-out numbers (a track spot goes by its track),
  // and the corner they are counted from
  const scaleEls = useMemo(() => (room.lighting ?? []).filter((e): e is RoomLightingPoint =>
    e.kind === 'point' && e.catalogItem.type !== 'track_spot'), [room.lighting]);
  const scaleLights = useMemo(() => scaleEls.map(e => ({ x: e.x, y: e.y })), [scaleEls]);
  const scaleFrame: ScaleFrame | null = useMemo(
    () => isClosed ? pickFrame(points, scaleLights) : null, [isClosed, points, scaleLights]);
  const scaleCentre = useMemo(() => scaleFrame ? frameCentre(scaleFrame, points) : undefined, [scaleFrame, points]);
  // A point light under the finger: a new one being placed (id null) or a
  // placed one being moved — where it would land, and what it lined up with
  const [lightDrag, setLightDrag] = useState<{ id: string | null; at: Point; u: SnapKind; v: SnapKind } | null>(null);

  // Current viewport for the fit animation, which starts from wherever the user left it
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const fitAnim = useRef<number | null>(null);
  useEffect(() => () => { if (fitAnim.current !== null) cancelAnimationFrame(fitAnim.current); }, []);

  /** The «Центр» button: glide to the fitted view; already there — a short
   *  shrink-and-back pulse, so the tap visibly did something */
  const animateTo = useCallback((to: { x: number; y: number; scale: number }) => {
    if (fitAnim.current !== null) cancelAnimationFrame(fitAnim.current);
    const from = viewportRef.current;
    const settled = Math.abs(from.x - to.x) < 2 && Math.abs(from.y - to.y) < 2
      && Math.abs(from.scale - to.scale) / to.scale < 0.01;
    const dur = settled ? 320 : 280;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      if (settled) {
        // zoom out by 6% around the screen centre and back
        const z = 1 - 0.06 * Math.sin(Math.PI * k);
        setViewport({ scale: to.scale * z, x: width / 2 - (width / 2 - to.x) * z, y: height / 2 - (height / 2 - to.y) * z });
      } else {
        const e = 1 - Math.pow(1 - k, 3);
        setViewport({
          scale: from.scale + (to.scale - from.scale) * e,
          x: from.x + (to.x - from.x) * e,
          y: from.y + (to.y - from.y) * e,
        });
      }
      fitAnim.current = k < 1 ? requestAnimationFrame(step) : null;
      if (k >= 1) setViewport(to);
    };
    fitAnim.current = requestAnimationFrame(step);
  }, [width, height]);

  const fitView = useCallback((pts: Point[], animate = false) => {
    if (pts.length === 0) return;
    const rot = rotationRef.current;
    const shown = pts.map(p => {
      const q = rotatePt(p, rot.angle);
      return { x: q.x + rot.x, y: q.y + rot.y };
    });
    const xs = shown.map(p => p.x);
    const ys = shown.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const bw = maxX - minX || 1;
    const bh = maxY - minY || 1;
    // a canvas squeezed by the section panel keeps a smaller margin
    const padX = Math.min(60, width * 0.15), padY = Math.min(60, height * 0.15);
    // the toolbar over the drawing takes the top — keep the outline below it
    const padTop = hideTools ? padY : Math.max(padY, TOOLBAR_H);
    const scale = Math.min(MAX_ZOOM, (width - padX * 2) / bw, (height - padTop - padY) / bh);
    minZoomRef.current = Math.min(MIN_ZOOM, scale / 2);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const to = { scale, x: width / 2 - cx * scale, y: (padTop + height - padY) / 2 - cy * scale };
    if (animate) animateTo(to);
    else setViewport(to);
  }, [width, height, hideTools, animateTo]);

  // Re-sync whenever the outline itself changes — not just its point count or
  // perimeter: reshaping by a diagonal keeps both and only moves corners.
  const shapeKey = room.points.map(p => `${p.x},${p.y},${p.bulge ?? 0}`).join(';');

  useEffect(() => {
    if (isDraggingPoint.current) return;
    const pts = room.points;
    setDrawRedoStack([]);
    setPoints(pts);
    setClosed(pts.length >= MIN_POINTS && room.areaSqm > 0);
    setTool(pts.length >= MIN_POINTS && room.areaSqm > 0 ? 'move' : 'draw');
    if (pts.length === 0) setManualStarted(false);
    // A different room (or a cleared one) starts unrotated.
    if (prevRoomId.current !== room.id || pts.length < MIN_POINTS) {
      prevRoomId.current = room.id;
      rotationRef.current = NO_ROTATION;
      setRotation(NO_ROTATION);
    }
    if (pts.length >= MIN_POINTS) {
      fitView(pts);
    } else {
      minZoomRef.current = MIN_ZOOM;
      setViewport({ x: 0, y: 0, scale: 1 });
    }
  }, [room.id, shapeKey, room.perimeterM, fitView]);

  useEffect(() => () => {
    if (placingTouchTimer.current !== null) clearTimeout(placingTouchTimer.current);
  }, []);

  // Clear cursor when switching lighting item
  useEffect(() => { setCursor(null); if (placingLighting) onSelect?.(null); }, [placingLighting?.id]);
  useEffect(() => { setCursor(null); if (placingNiche) onSelect?.(null); }, [placingNiche?.id]);
  useEffect(() => { if (!closed) onSelect?.(null); }, [closed]);

  // Select on a real tap only; tapping the selected element again lets go of it.
  // The tap that places a niche ends placing mode — its click must not then
  // also pick whatever lies under it
  const placedAt = useRef(0);
  const pick = (e: Konva.KonvaEventObject<Event>, s: CanvasSelection) => {
    e.cancelBubble = true;
    if (gestureMoved.current || placingLighting || placingNiche || !closed) return;
    if (Date.now() - placedAt.current < 400) return;
    onSelect?.(selectionKey(s) === selKey ? null : s);
  };

  // Container-relative screen px → world (room) coordinates, undoing both the
  // viewport pan/zoom and the drawing's rotation.
  const screenToWorld = (sx: number, sy: number): Point => {
    const stageX = (sx - viewport.x) / viewport.scale;
    const stageY = (sy - viewport.y) / viewport.scale;
    return rotatePt({ x: stageX - rotation.x, y: stageY - rotation.y }, -rotation.angle);
  };

  const worldToScreen = (p: Point): Point => {
    const q = rotatePt(p, rotation.angle);
    return {
      x: (q.x + rotation.x) * viewport.scale + viewport.x,
      y: (q.y + rotation.y) * viewport.scale + viewport.y,
    };
  };

  // One screen pixel in drawing units: marks, strokes and text are sized in
  // screen px times this, so they look the same at any zoom.
  const px = 1 / viewport.scale;
  const toStage = (p: Point): Point => ({ x: (p.x - viewport.x) * px, y: (p.y - viewport.y) * px });

  const computeMetrics = (pts: Point[]) => {
    const areaPx = polygonArea(pts);
    const perimPx = polygonPerimeter(pts);
    const areaSqm = parseFloat((pxToMeters(Math.sqrt(areaPx)) ** 2).toFixed(2));
    const perimeterM = parseFloat(pxToMeters(perimPx).toFixed(2));
    return { areaSqm, perimeterM };
  };

  const finishPolygon = (pts: Point[]) => {
    const metrics = computeMetrics(pts);
    setDrawRedoStack([]);
    setPoints(pts);
    setClosed(true);
    setTool('move');
    onChange({ points: pts, ...metrics });
  };

  // Wall a niche goes on: the nearest straight one, within reach of the tap
  const nicheWallAt = (pt: Point): number | null => {
    if (points.length < 3) return null;
    let best: number | null = null, bestD = NICHE_WALL_REACH / viewport.scale;
    points.forEach((a, i) => {
      if (!isStraightWall(points, i)) return;
      const d = distToSegment(pt, a, points[(i + 1) % points.length]);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  };

  // Where an end of a niche across the room lands for a tap at `pt`: on the
  // nearest straight wall — square across from the first end when close to
  // it, else a corner or the nearest 5 cm
  const crossPointAt = (pt: Point): { wp: WallPoint; at: Point; square: boolean } | null => {
    const edge = nicheWallAt(pt);
    if (edge == null) return null;
    const square = crossStart && crossStart.edge !== edge ? squareCmOn(points, edge, crossStart) : null;
    const snap = snapWallCm(wallLengthCm(points, edge), chainCmAt(points, [edge], pt), pxToCm(NICHE_SNAP_PX / viewport.scale), square);
    const wp = { edge, cm: snap.cm };
    return { wp, at: wallPointXY(points, wp), square: snap.square };
  };

  // Where a point light dropped at `raw` lands: lined up with the other
  // lights or the middle of the room, else on a round 5 cm; null outside the room
  const landLight = (raw: Point, type: string, selfId: string | null) => {
    const outline = tessellateRoom(points, true);
    if (!pointInPolygon(raw, outline)) return null;
    if (type !== 'track_spot' && scaleFrame) {
      const others = scaleEls.filter(e => e.id !== selfId).map(e => ({ x: e.x, y: e.y }));
      const s = snapLight(scaleFrame, raw, others, pxToCm(SNAP_PX / viewport.scale), scaleCentre);
      if (pointInPolygon(s.at, outline)) return s;
    }
    return { at: raw, u: null, v: null };
  };
  // A new point light follows the finger and lands where it is let go
  const placingPointLight = !!placingLighting && placingLighting.placement === 'point' && isClosed;
  const moveGhost = (raw: Point) => {
    const l = landLight(raw, placingLighting!.type, null);
    setLightDrag(l ? { id: null, ...l } : { id: null, at: raw, u: null, v: null });
  };
  const dropGhost = () => {
    const g = lightDrag;
    setLightDrag(null);
    if (!g || g.id !== null) return;
    if (landLight(g.at, placingLighting?.type ?? '', null)) onLightingTap?.(g.at);
    else onOutOfBounds?.();
  };

  const handleTap = (pt: Point) => {
    if (placingNiche && isClosed && nicheCross) {
      const c = crossPointAt(pt);
      if (!c || (crossStart && c.wp.edge === crossStart.edge)) { onOutOfBounds?.(); return; }
      if (crossStart) placedAt.current = Date.now();
      onNicheCrossTap?.(c.wp);
      return;
    }
    if (placingNiche && isClosed) {
      const edge = nicheWallAt(pt);
      if (edge == null) onOutOfBounds?.(); else { placedAt.current = Date.now(); onNicheWallTap?.(edge); }
      return;
    }

    // Lighting placement mode — only accept taps inside the room polygon
    if (placingLighting && isClosed) {
      if (pointInPolygon(pt, tessellateRoom(points, true))) onLightingTap?.(pt);
      else onOutOfBounds?.();
      return;
    }

    if (tool !== 'draw' || closed) return;

    if (points.length >= MIN_POINTS) {
      const first = points[0];
      if (dist(pt, first) * viewport.scale < CLOSE_THRESHOLD) {
        finishPolygon(points);
        return;
      }
    }

    setDrawRedoStack([]);
    setPoints(prev => [...prev, pt]);
  };

  const stageRef = useRef<Konva.Stage>(null);

  const getPointerPos = (e: Konva.KonvaEventObject<TouchEvent | MouseEvent>): Point | null => {
    const stage = stageRef.current;
    if (!stage) return null;
    const pos = stage.getPointerPosition();
    if (!pos) return null;
    return screenToWorld(pos.x, pos.y);
  };

  const handleStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (isTouching.current) return;
    if (placingPointLight) {
      const pos = getPointerPos(e);
      if (pos) moveGhost(pos);
      return;
    }
    if (placingNiche || placingLighting) {
      const pos = getPointerPos(e);
      if (pos) handleTap(pos);
      return;
    }
    // pressing a light moves the light, not the drawing
    if (e.target.name() === 'light') return;
    if (tool === 'move') {
      lastMouse.current = { x: e.evt.clientX, y: e.evt.clientY };
      return;
    }
    // Pressing a placed vertex drags it; anything else — open canvas, a wall's
    // bow-drag hit band, the preview line under the cursor — places a point,
    // same as handleTouchStart.
    if (tool === 'draw' && e.target.name() === 'vertex') return;
    if (tool === 'draw') {
      const pos = getPointerPos(e);
      if (pos) handleTap(pos);
      // This press placed a point (or closed the room) — its click mustn't
      // then select the wall under the cursor.
      gestureMoved.current = true;
    }
  };

  const handleStageMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (tool === 'move' && lastMouse.current) {
      const dx = e.evt.clientX - lastMouse.current.x;
      const dy = e.evt.clientY - lastMouse.current.y;
      setViewport(v => ({ ...v, x: v.x + dx, y: v.y + dy }));
      lastMouse.current = { x: e.evt.clientX, y: e.evt.clientY };
      return;
    }

    const pos = getPointerPos(e);
    if (!pos) return;

    if (placingPointLight) {
      if (lightDrag && !isTouching.current) moveGhost(pos);
      return;
    }

    if (placingNiche) {
      setNicheHoverEdge(nicheWallAt(pos));
      if (nicheCross) { const c = crossPointAt(pos); setCrossHover(c && { at: c.at, square: c.square }); }
      return;
    }

    if (placingLighting?.placement === 'path' && inProgressLightingPath.length > 0) {
      setCursor(pos);
      return;
    }

    if (tool !== 'draw' || points.length === 0 || closed || isDraggingPoint.current) return;
    setCursor(pos);
  };

  const handleStageMouseUp = () => {
    lastMouse.current = null;
    if (placingPointLight && lightDrag && !isTouching.current) dropGhost();
  };

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.container().getBoundingClientRect();
    const mx = e.evt.clientX - rect.left;
    const my = e.evt.clientY - rect.top;
    const ratio = e.evt.deltaY < 0 ? 1.1 : 1 / 1.1;
    setViewport(v => {
      // at a zoom limit, anchor what the clamp actually applied
      const scale = Math.min(MAX_ZOOM, Math.max(minZoomRef.current, v.scale * ratio)), r = scale / v.scale;
      return { scale, x: mx - (mx - v.x) * r, y: my - (my - v.y) * r };
    });
  };

  const handleTouchStart = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const touches = e.evt.touches;
    isTouching.current = true;
    lastMouse.current = null;
    if (touches.length === 2) {
      if (placingTouchTimer.current !== null) {
        clearTimeout(placingTouchTimer.current);
        placingTouchTimer.current = null;
      }
      const stage = stageRef.current;
      // A finger that landed on a vertex or wall has already armed a drag of
      // it — this is a pinch/twist, so drop that drag rather than moving the
      // point or bending the wall along with the gesture.
      stage?.find((n: Konva.Node) => n.isDragging()).forEach(n => n.stopDrag());
      isDraggingPoint.current = false;
      setDraggingPoint(null);
      const rect = stage?.container().getBoundingClientRect();
      const mx = rect ? (touches[0].clientX + touches[1].clientX) / 2 - rect.left : 0;
      const my = rect ? (touches[0].clientY + touches[1].clientY) / 2 - rect.top  : 0;
      // Turn around the drawing's own centre (bbox of what's on screen) so it
      // spins in place; with nothing drawn yet, fall back to the fingers.
      let pivot: Point = { x: (mx - viewport.x) / viewport.scale, y: (my - viewport.y) / viewport.scale };
      if (points.length > 0) {
        const shown = points.map(p => {
          const q = rotatePt(p, rotation.angle);
          return { x: q.x + rotation.x, y: q.y + rotation.y };
        });
        const xs = shown.map(p => p.x), ys = shown.map(p => p.y);
        pivot = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
      }
      const dist0 = Math.hypot(
        touches[0].clientX - touches[1].clientX,
        touches[0].clientY - touches[1].clientY,
      );
      pinchRef.current = {
        dist: dist0, mx, my,
        dist0, mx0: mx, my0: my,
        mode: 'pending',
        lastAngle: Math.atan2(touches[1].clientY - touches[0].clientY, touches[1].clientX - touches[0].clientX) * 180 / Math.PI,
        twist: 0, twistOffset: 0,
        rot0: rotation, pivot,
      };
      lastTouch.current = null;
      touchRawRef.current = null;
      setPlacingTouch(false);
      // The pending point's preview (dashed line to the first finger) must
      // not linger through the pinch — this is a zoom gesture, not a placement.
      setCursor(null);
      if (lightDrag?.id === null) setLightDrag(null);
      return;
    }

    if (placingPointLight) {
      e.evt.preventDefault();
      const pos = stageRef.current?.getPointerPosition();
      if (pos) moveGhost(screenToWorld(pos.x, pos.y));
      return;
    }

    if (placingLighting || placingNiche) {
      e.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;
      const pt = screenToWorld(pos.x, pos.y);
      handleTap(pt);
      if (!closed) setCursor(pt);
      return;
    }

    if (tool === 'draw' && !closed) {
      // A touch landing on an existing (draggable) vertex is handled by that
      // vertex's own onTouchStart, which stops bubbling (e.cancelBubble) —
      // so by the time we get here, it was a touch on the open canvas (or on
      // an unrelated listening shape, e.g. a wall's bow-drag hit band, which
      // should still fall through to the normal placement/close logic below).
      e.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;
      const raw = screenToWorld(pos.x, pos.y);
      // Don't commit yet — the point lands on release (handleTouchEnd) so the
      // finger can still nudge it beforehand. And don't even arm the "placing"
      // state until TOUCH_PLACE_DELAY has passed without a second finger
      // joining — see the comment on placingTouchTimer above.
      touchRawRef.current = raw;
      setCursor(raw);
      if (placingTouchTimer.current !== null) clearTimeout(placingTouchTimer.current);
      placingTouchTimer.current = setTimeout(() => {
        placingTouchTimer.current = null;
        setPlacingTouch(true);
      }, TOUCH_PLACE_DELAY);
      return;
    }

    if (!isDraggingPoint.current) {
      lastTouch.current = { x: touches[0].clientX, y: touches[0].clientY };
    }
  };

  const handleTouchMove = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const touches = e.evt.touches;

    // ── Two fingers: twist rotates the drawing, or pinch zooms (anchored to
    // the midpoint) + pans — whichever clears its threshold first wins ──
    if (touches.length === 2 && pinchRef.current) {
      e.evt.preventDefault();
      const pinch = pinchRef.current;
      const newDist = Math.hypot(
        touches[0].clientX - touches[1].clientX,
        touches[0].clientY - touches[1].clientY,
      );
      const ratio = newDist / pinch.dist;

      const stage = stageRef.current;
      const rect = stage?.container().getBoundingClientRect();
      const mx = rect ? (touches[0].clientX + touches[1].clientX) / 2 - rect.left : pinch.mx;
      const my = rect ? (touches[0].clientY + touches[1].clientY) / 2 - rect.top  : pinch.my;

      // Accumulate the twist frame by frame (so it can go past ±180°).
      const angle = Math.atan2(touches[1].clientY - touches[0].clientY, touches[1].clientX - touches[0].clientX) * 180 / Math.PI;
      const twist = pinch.twist + normDeg(angle - pinch.lastAngle);
      let { mode, twistOffset } = pinch;
      if (mode === 'pending') {
        const spread = newDist / pinch.dist0;
        if (Math.abs(twist) > ROTATE_START_DEG) {
          mode = 'rotate';
          // Measure from the dead zone's edge so the drawing doesn't jump.
          twistOffset = Math.sign(twist) * ROTATE_START_DEG;
        } else if (
          spread > ZOOM_START_RATIO || spread < 1 / ZOOM_START_RATIO ||
          Math.hypot(mx - pinch.mx0, my - pinch.my0) > PAN_START_PX
        ) {
          mode = 'zoom';
        }
      }

      if (mode === 'rotate') {
        const { rot0, pivot } = pinch;
        let target = rot0.angle + twist - twistOffset;
        const square = Math.round(target / 90) * 90;
        if (Math.abs(target - square) < ROTATE_SNAP_DEG) target = square;
        // Re-pivot: R(Δ)·(t0 − c) + c keeps the pivot (drawing centre) fixed.
        const t = rotatePt({ x: rot0.x - pivot.x, y: rot0.y - pivot.y }, target - rot0.angle);
        setRotation({ angle: normDeg(target), x: t.x + pivot.x, y: t.y + pivot.y });
      } else if (mode === 'zoom' && pinch.mode === 'zoom') {
        // Applied per frame from the previous one — skipped on the frame the
        // mode locks in, so the movement spent deciding isn't applied as a jump.
        const pdx = mx - pinch.mx;
        const pdy = my - pinch.my;
        setViewport(v => {
          const scale = Math.min(MAX_ZOOM, Math.max(minZoomRef.current, v.scale * ratio)), r = scale / v.scale;
          return { scale, x: mx - (mx - v.x) * r + pdx, y: my - (my - v.y) * r + pdy };
        });
      }

      pinchRef.current = { ...pinch, dist: newDist, mx, my, mode, lastAngle: angle, twist, twistOffset };
      return;
    }

    const stage = stageRef.current;
    if (!stage) return;
    const pos = stage.getPointerPosition();

    if (placingLighting?.placement === 'path' && inProgressLightingPath.length > 0 && touches.length === 1 && pos) {
      setCursor(screenToWorld(pos.x, pos.y));
      return;
    }

    if (placingPointLight && touches.length === 1 && pos) {
      if (lightDrag?.id === null) moveGhost(screenToWorld(pos.x, pos.y));
      return;
    }

    if (placingNiche && touches.length === 1 && pos) {
      const raw = screenToWorld(pos.x, pos.y);
      setNicheHoverEdge(nicheWallAt(raw));
      if (nicheCross) { const c = crossPointAt(raw); setCrossHover(c && { at: c.at, square: c.square }); }
      return;
    }

    if (tool === 'draw' && !closed && touches.length === 1 && (placingTouch || placingTouchTimer.current !== null)) {
      const rect = stage.container().getBoundingClientRect();
      const raw = screenToWorld(touches[0].clientX - rect.left, touches[0].clientY - rect.top);
      touchRawRef.current = raw;
      setCursor(raw);
    } else if (tool === 'move' && lastTouch.current && touches.length === 1 && !isDraggingPoint.current) {
      const ddx = touches[0].clientX - lastTouch.current.x;
      const ddy = touches[0].clientY - lastTouch.current.y;
      setViewport(v => ({ ...v, x: v.x + ddx, y: v.y + ddy }));
      lastTouch.current = { x: touches[0].clientX, y: touches[0].clientY };
    }
  };

  const handleTouchEnd = (e: Konva.KonvaEventObject<TouchEvent>) => {
    // the last finger off: a new light lands where it was let go
    if (placingPointLight && lightDrag?.id === null && e.evt.touches.length === 0) dropGhost();
    if (placingTouchTimer.current !== null) {
      // Finger lifted before the grace window elapsed and no second finger
      // ever showed up — a genuine quick tap, so commit it right away.
      clearTimeout(placingTouchTimer.current);
      placingTouchTimer.current = null;
      if (touchRawRef.current) handleTap(touchRawRef.current);
      touchRawRef.current = null;
      // The preview line only exists while this finger is down — don't let
      // it linger at the just-placed point once it's lifted.
      setCursor(null);
    } else if (placingTouch) {
      setPlacingTouch(false);
      if (touchRawRef.current) handleTap(touchRawRef.current);
      touchRawRef.current = null;
      setCursor(null);
    }
    pinchRef.current = null;
    lastTouch.current = null;
    isDraggingPoint.current = false;
    // small delay so the ghost mousedown that fires after touchend is still blocked
    setTimeout(() => { isTouching.current = false; }, 300);
  };

  const handleReset = () => {
    setDrawRedoStack([]);
    setPoints([]);
    setClosed(false);
    setCursor(null);
    setTool('draw');
    onChange({ points: [], areaSqm: 0, perimeterM: 0 });
  };

  // Undo/redo while drawing (pre-commit, local state only)
  const localUndoPoint = () => {
    if (points.length === 0) return;
    setDrawRedoStack(prev => [...prev, points]);
    setPoints(prev => prev.slice(0, -1));
  };

  const localRedoPoint = () => {
    if (drawRedoStack.length === 0) return;
    const restored = drawRedoStack[drawRedoStack.length - 1];
    setDrawRedoStack(prev => prev.slice(0, -1));
    setPoints(restored);
  };

  // Unified undo: local draw undo when drawing, global undo when committed
  const handleUndoBtn = () => {
    setCursor(null);
    if (!closed && points.length > 0) {
      localUndoPoint();
    } else {
      onUndo?.();
    }
  };

  const handleRedoBtn = () => {
    setCursor(null);
    if (!closed && drawRedoStack.length > 0) {
      localRedoPoint();
    } else {
      onRedo?.();
    }
  };

  const canUndoBtn = !closed ? points.length > 0 || canUndo : canUndo;
  const canRedoBtn = !closed ? drawRedoStack.length > 0 || canRedo : canRedo;

  const flatPoints = (pts: Point[]) => pts.flatMap(p => [p.x, p.y]);
  const outlinePoints = (pts: Point[]) => tessellateRoom(pts, true).flatMap(p => [p.x, p.y]);

  const previewLine = !placingLighting && !placingNiche && cursor && points.length > 0 ? [
    points[points.length - 1],
    cursor,
  ] : null;

  // Angle mark at a corner: a wedge into the room with the number, green once
  // it's a right angle. Drawn at the last placed corner while the next wall is
  // being drawn, and at the dragged or selected corner of the finished room.
  type AngleMark = ReturnType<typeof angleMark>;
  const angleMark = (prev: Point, v: Point, next: Point, a: { deg: number; start: number; sweep: number }, selected: boolean) => {
    const shortest = Math.min(dist(prev, v), dist(v, next));
    if (shortest < 4 * px) return null;
    const r = Math.min((selected ? 34 : 24) * px, shortest * 0.4);
    const mid = (a.start + a.sweep / 2) * Math.PI / 180;
    // same rounding as the corner card when selected; green only when the
    // number itself reads 90, so a 90.6° corner shown as «91°» stays blue
    const shown = selected ? Math.round(a.deg * 10) / 10 : Math.round(a.deg);
    const right = shown === 90;
    const ux = Math.cos(a.start * Math.PI / 180), uy = Math.sin(a.start * Math.PI / 180);
    const wx = Math.cos((a.start + a.sweep) * Math.PI / 180), wy = Math.sin((a.start + a.sweep) * Math.PI / 180);
    const q = r * 0.75;
    const color = right ? '#2dd36f' : '#3880ff';
    return {
      ...a, v, r, right, color,
      textColor: right ? color : '#fff',
      square: [v.x + ux * q, v.y + uy * q, v.x + (ux + wx) * q, v.y + (uy + wy) * q, v.x + wx * q, v.y + wy * q],
      labelX: v.x + Math.cos(mid) * (r + 12 * px),
      labelY: v.y + Math.sin(mid) * (r + 12 * px),
      text: `${shown}°`,
    };
  };

  const liveCorner = (() => {
    if (!previewLine || closed || points.length < 2) return null;
    const a = liveCornerAngle(points, previewLine[1]);
    return a && angleMark(points[points.length - 2], previewLine[0], previewLine[1], a, false);
  })();

  // First wall: no previous wall yet, so measure against the on-screen
  // horizontal (the grid), toward whichever side the wall leans. Hidden while
  // the wall lies along it — «0°» tells nothing.
  const firstWallCorner = (() => {
    if (!previewLine || closed || points.length !== 1) return null;
    const [v, next] = previewLine;
    const wall = Math.atan2(next.y - v.y, next.x - v.x) * 180 / Math.PI;
    const onScreen = normDeg(wall + rotation.angle);
    const ref = Math.abs(onScreen) <= 90 ? 0 : 180;
    const sweep = normDeg(onScreen - ref);
    if (Math.round(Math.abs(sweep)) === 0) return null;
    const refRoom = (ref - rotation.angle) * Math.PI / 180;
    const len = dist(v, next);
    const prev = { x: v.x + Math.cos(refRoom) * len, y: v.y + Math.sin(refRoom) * len };
    const start = ref - rotation.angle + Math.min(0, sweep);
    return angleMark(prev, v, next, { deg: Math.abs(sweep), start, sweep: Math.abs(sweep) }, false);
  })();

  // At the corner being dragged, or else the selected one, of the finished
  // room. Matches cornerAngle() in the card: walls measured along their chords
  const cornerMark = (() => {
    const i = draggingPoint ?? selectedPoint;
    if (!closed || i == null || points.length < 3 || !points[i]) return null;
    const n = points.length;
    const prev = points[(i - 1 + n) % n], v = points[i], next = points[(i + 1) % n];
    const winding = points.reduce((s, p, k) => { const q = points[(k + 1) % n]; return s + p.x * q.y - q.x * p.y; }, 0);
    const wedge = cornerWedge(prev, v, next, winding);
    // a corner on a straight run (a split point) has no angle worth drawing — unless it's being dragged
    if (draggingPoint == null && Math.abs(wedge.deg - 180) < 0.5) return null;
    return angleMark(prev, v, next, wedge, i === selectedPoint);
  })();

  const angleMarks = [liveCorner, firstWallCorner, cornerMark].filter((m): m is NonNullable<AngleMark> => m != null);

  // Corner letters and wall lengths, laid out on screen
  const labels = vertexLabels(points);
  const screenPts = points.map(worldToScreen);
  const wallTexts = points.map((a, i) => {
    if (!closed && i === points.length - 1) return null;
    const b = points[(i + 1) % points.length];
    return { text: fmtCm(pxToCm(edgeLen(a, b, a.bulge))), midWorld: arcHandlePoint(a, b, a.bulge) };
  });
  const wallsIn = wallTexts.map(w => w && { text: w.text, mid: worldToScreen(w.midWorld) });
  const labelLayout = layoutLabels(screenPts, closed, wallsIn);

  // Invisible wide hit-lines along each wall of the closed room — grab and drag
  // anywhere on a wall to bow it into an arc (no visible curvature handle).
  const wallHitLines = isClosed && !placingLighting && !placingNiche ? points.map((a, i) => {
    const b = points[(i + 1) % points.length];
    return { i, a, b, points: [a.x, a.y, ...sampleArc(a, b, a.bulge, 24).flatMap(p => [p.x, p.y])] };
  }) : [];

  // Diagonals only with their section open, and once the room is closed —
  // every one the triangulation needs to fix the shape
  const diagonals = showDiagonals && closed && points.length >= 4
    ? roomDiagonals(points).map(d => ({ a: points[d.i], b: points[d.j], key: `diag-${d.key}`, i: d.i, j: d.j }))
    : [];

  const nearStart = !placingLighting && !closed && points.length >= MIN_POINTS && cursor
    ? dist(cursor, points[0]) * viewport.scale < CLOSE_THRESHOLD
    : false;

  const metrics = closed ? computeMetrics(points) : null;

  // Lighting path preview line
  const lastPathPt = inProgressLightingPath[inProgressLightingPath.length - 1];
  const lightPathPreview = placingLighting?.placement === 'path' && lastPathPt && cursor
    ? [lastPathPt, cursor]
    : null;

  // End cap of a niche end left free of a wall: a white bar across the line,
  // as long as the line is wide
  const capBar = (end: Point, toward: Point, width: number): number[] => {
    const dx = toward.x - end.x, dy = toward.y - end.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len * width / 2, ny = dx / len * width / 2;
    return [end.x + nx, end.y + ny, end.x - nx, end.y - ny];
  };

  // Ends of the selected wall niche, dragged along its walls. Each settles on
  // a corner of its walls or the nearest 5 cm.
  const nicheHandles = (el: RoomNicheWall, rail: Point[]) => {
    const r = { ...room, points };
    const handle = (which: 'start' | 'end', at: Point) => (
      <Circle
        key={which}
        x={at.x} y={at.y} radius={10 * px}
        fill="#fff" stroke={NICHE} strokeWidth={3 * px} hitStrokeWidth={16 * px}
        draggable
        onTouchStart={e => { e.cancelBubble = true; isDraggingPoint.current = true; lastTouch.current = null; }}
        onDragStart={e => {
          if (pinchRef.current) { e.target.stopDrag(); return; }
          onVertexDragStart?.();
          lastMouse.current = null; lastTouch.current = null; isDraggingPoint.current = true;
        }}
        onDragMove={e => {
          if (pinchRef.current) return;
          const { from, to, total } = nicheSpan(r, el);
          const raw = chainCmAt(points, el.edges, e.target.position());
          const snap = snapNicheEnd(r, el, raw, pxToCm(NICHE_SNAP_PX / viewport.scale), t('nc.snapCorner'));
          const MIN = 10;
          const cm = which === 'start' ? Math.min(snap.cm, to - MIN) : Math.max(snap.cm, from + MIN);
          const next: RoomNicheWall = which === 'start'
            ? { ...el, startCm: cm, endCm: total - to }
            : { ...el, startCm: from, endCm: total - cm };
          const { point, edge } = pointAlongChain(points, el.edges, cm);
          const nr = inwardNormal(points, edge);
          const half = cm2px(el.depthCm) / 2;
          e.target.position({ x: point.x + nr.x * half, y: point.y + nr.y * half });
          const gap = which === 'start' ? cm : total - cm;
          const lift = 30 / viewport.scale;
          setNicheDrag({ at: { x: point.x - nr.x * lift, y: point.y - nr.y * lift }, text: Math.round(gap) === 0 ? t('nc.snapCorner') : `${Math.round(gap)} ${t('re.cm')}` });
          onChange({ selectedNiches: (room.selectedNiches ?? []).map(x => x.id === el.id ? next : x) });
        }}
        onDragEnd={() => { isDraggingPoint.current = false; setNicheDrag(null); onVertexDragEnd?.(); }}
      />
    );
    return <>{handle('start', rail[0])}{handle('end', rail[rail.length - 1])}</>;
  };
  const cm2px = (cm: number) => cm / pxToCm(1);

  // Ends of the selected niche across the room, each dragged along its own
  // wall — settling square across from the other end, a corner or 5 cm
  const crossHandles = (el: RoomNicheCross, line: [Point, Point]) => {
    const handle = (end: 'a' | 'b', at: Point) => (
      <Circle
        key={end}
        x={at.x} y={at.y} radius={10 * px}
        fill="#fff" stroke={NICHE} strokeWidth={3 * px} hitStrokeWidth={16 * px}
        draggable
        onTouchStart={e => { e.cancelBubble = true; isDraggingPoint.current = true; lastTouch.current = null; }}
        onDragStart={e => {
          if (pinchRef.current) { e.target.stopDrag(); return; }
          onVertexDragStart?.();
          lastMouse.current = null; lastTouch.current = null; isDraggingPoint.current = true;
        }}
        onDragMove={e => {
          if (pinchRef.current) return;
          const w = el[end], other = el[end === 'a' ? 'b' : 'a'];
          const len = wallLengthCm(points, w.edge);
          const snap = snapWallCm(len, chainCmAt(points, [w.edge], e.target.position()), pxToCm(NICHE_SNAP_PX / viewport.scale), squareCmOn(points, w.edge, other));
          const wp = { edge: w.edge, cm: snap.cm };
          const p = wallPointXY(points, wp);
          e.target.position(p);
          const nr = inwardNormal(points, w.edge), lift = 30 / viewport.scale;
          setNicheDrag({
            at: { x: p.x - nr.x * lift, y: p.y - nr.y * lift },
            text: snap.square ? t('nc.square') : `${Math.round(Math.min(snap.cm, len - snap.cm))} ${t('re.cm')}`,
          });
          onChange({ selectedNiches: (room.selectedNiches ?? []).map(x => x.id === el.id ? { ...el, [end]: wp } : x) });
        }}
        onDragEnd={() => { isDraggingPoint.current = false; setNicheDrag(null); onVertexDragEnd?.(); }}
      />
    );
    return <>{handle('a', line[0])}{handle('b', line[1])}</>;
  };

  // Size chain along the wall for the selected niche: the gap to
  // each corner and its own length — the numbers the card edits
  const sizeChain = (edges: number[], from: number, to: number): { at: Point; text: string; main: boolean }[] => {
    const total = chainLengthCm(points, edges);
    const out: { at: Point; text: string; main: boolean }[] = [];
    const part = (a: number, b: number, main: boolean) => {
      if (b - a < 0.5) return;
      const { point, edge } = pointAlongChain(points, edges, (a + b) / 2);
      const nr = inwardNormal(points, edge);
      const off = 22 / viewport.scale;
      out.push({ at: { x: point.x - nr.x * off, y: point.y - nr.y * off }, text: `${Math.round(b - a)}`, main });
    };
    part(0, from, false); part(from, to, true); part(to, total, false);
    return out;
  };
  const sizePills = (() => {
    if (!isClosed || nicheDrag) return [];
    const r = { ...room, points };
    const el = (room.selectedNiches ?? []).find(x => x.id === selectedNicheEl);
    if (el?.kind === 'wall' && nicheShape(r, el)) {
      const { from, to } = nicheSpan(r, el);
      return sizeChain(el.edges, from, to);
    }
    // across the room: each end's gaps to its wall's corners, and its length
    const line = el?.kind === 'cross' ? crossLine(r, el) : null;
    if (el?.kind === 'cross' && line) {
      const mid = { x: (line[0].x + line[1].x) / 2, y: (line[0].y + line[1].y) / 2 };
      return [
        ...sizeChain([el.a.edge], el.a.cm, el.a.cm),
        ...sizeChain([el.b.edge], el.b.cm, el.b.cm),
        { at: mid, text: `${Math.round(pxToCm(dist(line[0], line[1])))}`, main: true },
      ];
    }
    return [];
  })();

  // Tracks a track spot can sit on, and the set-out of the selected point light
  const trackRuns = (room.lighting ?? []).flatMap(e => e.kind === 'path' && e.catalogItem.type === 'track' ? [e.points] : []);
  // The glow view shows the room's lights: with none, there is nothing to look at
  const hasLights = (room.lighting ?? []).length > 0;
  // the last light removed turns the glow view off, so the next light added doesn't bring it back on
  if (visual && !hasLights) setVisual(false);
  // Editing anything (placing, a selection, diagonals) shows the drawing again
  const visualOn = visual && hasLights && isClosed && room.areaSqm > 0 && !showDiagonals && !placingLighting && !placingNiche && !selection;
  const roomOutline = isClosed ? tessellateRoom(points, true) : [];
  // the drawing's part on screen, for a sharp close-up when zoomed in
  const visibleRect = (() => {
    if (!visualOn) return null;
    const cs = [screenToWorld(0, 0), screenToWorld(width, 0), screenToWorld(0, height), screenToWorld(width, height)];
    const xs = cs.map(p => p.x), ys = cs.map(p => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  })();
  const ceilingPic = useCeilingVisual(room, points, visualOn, viewport.scale, visibleRect);
  // Under the light until the picture is made: the fabric's colour at about
  // the picture's dusk brightness, so the view lights up at once
  const fabricStandIn = useMemo(() => {
    const [r, g, b] = hexRgb(room.fabric?.color);
    return `rgb(${Math.round(r * 0.43)},${Math.round(g * 0.4)},${Math.round(b * 0.37)})`;
  }, [room.fabric?.color]);
  // The light over the picture is the old glow view's: each light's reach,
  // tracks with no track spots on them lit themselves
  const bare = useMemo(() => bareTracks(room.lighting ?? [], cm2px),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [room.lighting]);
  // the light takes the fabric's colour — near-white is a white fabric's list tint
  const glowTint = useMemo((): [number, number, number] => {
    const c = hexRgb(room.fabric?.color);
    return Math.min(...c) >= 215 ? [255, 255, 255] : c;
  }, [room.fabric?.color]);
  const lightGuides = (() => {
    if (!isClosed || showDiagonals || placingLighting || placingNiche) return [];
    const el = (room.lighting ?? []).find(e => e.id === selectedLighting);
    // a light on the scales shows its numbers there; a track spot goes by the nearest walls
    if (el?.kind !== 'point' || el.catalogItem.type !== 'track_spot' || lightDrag) return [];
    const others = (room.lighting ?? []).flatMap(e => e.kind === 'point' && e.id !== el.id ? [{ x: e.x, y: e.y }] : []);
    return pointLightGuides(points, el, others);
  })();
  // Labels in screen space: set-out numbers of the selected light, and each light run's length
  const lightPills: { at: Point; text: string; color: string; bold?: boolean; bg?: string }[] = (() => {
    if (showDiagonals || !isClosed) return [];
    const out: { at: Point; text: string; color: string; bold?: boolean; bg?: string }[] = lightGuides.map(g => ({
      at: { x: (g.from.x + g.to.x) / 2, y: (g.from.y + g.to.y) / 2 }, text: `${Math.round(g.cm)}`, color: SEL, bold: true,
    }));
    for (const e of room.lighting ?? []) {
      // a run's length only while it is picked — the «Свет» panel has the totals
      if (e.kind !== 'path' || (e.id !== selectedLighting && e.catalogItemId !== selectedGroup)) continue;
      const a = pathLabelAnchor(e.points);
      if (!a) continue;
      // beside the run, on the room's side — the other side is often the wall and its length
      const off = 16 / viewport.scale;
      const left = { x: a.at.x + a.dir.y * off, y: a.at.y - a.dir.x * off };
      const right = { x: a.at.x - a.dir.y * off, y: a.at.y + a.dir.x * off };
      out.push({
        at: pointInPolygon(left, roomOutline) ? left : right,
        text: `${e.lengthM.toFixed(1)} ${t('unit.m')}`,
        color: e.catalogItem.type === 'line' ? '#fff' : lightColor(e.catalogItem.color),
        bold: e.id === selectedLighting,
      });
    }
    return out;
  })();

  // Set-out scales: each distinct distance of the point lights from one wall
  // stands as a number just inside the other wall, a dashed line running to
  // it from the row. The light in hand — being placed, moved or picked —
  // has its own numbers lit: orange, or green when lined up with another
  // light or the middle of the room.
  type ScaleTone = 'plain' | 'active' | 'snap';
  const scaleView = (() => {
    const none = { marks: [] as { line: Point[]; at: Point; angle: number; text: string; w: number; tone: ScaleTone }[], origin: null as Point | null };
    const picked = scaleEls.find(e => e.id === selectedLighting);
    if (!scaleFrame || showDiagonals || visualOn || !isClosed) return none;
    const group = selectedGroup && !placingLighting && !lightDrag ? selectedGroup : null;
    if (!(placingLighting || lightDrag || picked || group)) return none;
    const f = scaleFrame;
    // a picked group shows only its own numbers
    const els = group ? scaleEls.filter(e => e.catalogItemId === group) : scaleEls;
    if (group && !els.length) return none;
    const lights = els.map(e => lightDrag?.id === e.id ? lightDrag.at : { x: e.x, y: e.y });
    let active = -1;
    if (lightDrag?.id === null) { lights.push(lightDrag.at); active = lights.length - 1; }
    else if (lightDrag) active = els.findIndex(e => e.id === lightDrag.id);
    else if (picked) active = els.indexOf(picked);
    else if (placingLighting) {
      // while placing, the last one put down keeps its numbers lit
      const last = (room.lighting ?? []).at(-1);
      active = last ? els.findIndex(e => e.id === last.id) : -1;
    }
    if (!lights.length) return { ...none, origin: worldToScreen(f.o) };
    const INSET = 14, H = 18;
    const out: typeof none.marks = [];
    for (const wall of ['u', 'v'] as const) {
      const along = wall === 'u' ? f.eu : f.ev, into = wall === 'u' ? f.ev : f.eu;
      // screen directions of the wall and of «into the room» off it
      const s0 = worldToScreen(f.o), s1 = worldToScreen({ x: f.o.x + along.x, y: f.o.y + along.y });
      const dir = { x: s1.x - s0.x, y: s1.y - s0.y }, dl = Math.hypot(dir.x, dir.y) || 1;
      const ux = dir.x / dl, uy = dir.y / dl;
      const si = worldToScreen({ x: f.o.x + into.x, y: f.o.y + into.y });
      const side = Math.sign((si.x - s0.x) * -uy + (si.y - s0.y) * ux) || 1;
      const nx = -uy * side, ny = ux * side;
      let angle = Math.atan2(uy, ux) * 180 / Math.PI;
      if (angle > 90) angle -= 180; else if (angle <= -90) angle += 180;
      const marks = lightScales(f, lights).filter(m => m.wall === wall)
        .map(m => { const at = worldToScreen(m.at); return { m, at, t: (at.x - s0.x) * ux + (at.y - s0.y) * uy }; })
        .sort((a, b) => a.t - b.t);
      // a number that would run into the one before steps along the wall —
      // stepping into the room would put it over the lights
      let prevEnd = -Infinity;
      for (const { m, at, t: pos } of marks) {
        const mine = m.lights.includes(active);
        const centre = scaleCentre != null && Math.abs(m.cm - scaleCentre[wall]) < 0.5;
        const text = mine && centre ? `${m.cm} · ${t('scale.centre')}` : `${m.cm}`;
        const w = text.length * 7 + 12;
        const shift = Math.max(0, prevEnd + 3 - (pos - w / 2));
        prevEnd = pos + shift + w / 2;
        const off = INSET + H / 2;
        const pill = { x: at.x + nx * off + ux * shift, y: at.y + ny * off + uy * shift };
        const end = { x: at.x + nx * (off + H / 2), y: at.y + ny * (off + H / 2) };
        const tone: ScaleTone = !mine ? 'plain' : m.lights.length > 1 || centre ? 'snap' : 'active';
        out.push({ line: [worldToScreen(mine ? lights[active] : m.from), end], at: pill, angle, text, w, tone });
      }
    }
    // the light in hand on top
    out.sort((a, b) => (a.tone === 'plain' ? 0 : 1) - (b.tone === 'plain' ? 0 : 1));
    return { marks: out, origin: worldToScreen(f.o) };
  })();
  const scaleMarks = scaleView.marks;

  // Screen point the selection is about — kept clear of the element card
  const selectionAnchor = (): Point | null => {
    if (!selection) return null;
    if (selection.kind === 'corner') return points[selection.index] ?? null;
    if (selection.kind === 'wall') {
      const a = points[selection.index], b = points[(selection.index + 1) % points.length];
      return a && b ? arcHandlePoint(a, b, a.bulge) : null;
    }
    if (selection.kind === 'diagonal') {
      const a = points[selection.i], b = points[selection.j];
      return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null;
    }
    const centre = (ps: Point[]) => ({ x: ps.reduce((s, q) => s + q.x, 0) / ps.length, y: ps.reduce((s, q) => s + q.y, 0) / ps.length });
    if (selection.kind === 'light') {
      const el = (room.lighting ?? []).find(e => e.id === selection.id);
      return !el ? null : el.kind === 'point' ? el : centre(el.points);
    }
    if (selection.kind === 'niche') {
      const el = (room.selectedNiches ?? []).find(e => e.id === selection.id);
      if (el?.kind === 'path') return centre(el.points);
      const line = el?.kind === 'cross' ? crossLine({ ...room, points }, el) : null;
      if (line) return centre(line);
      const shape = el?.kind === 'wall' ? nicheShape({ ...room, points }, el) : null;
      return shape ? centre(shape.inner) : null;
    }
    return points.length ? centre(points) : null;
  };

  // Pan just enough that the picked element isn't hidden under the card
  // (or the floating buttons at the top) — the zoom stays as it is.
  useEffect(() => {
    const anchor = selectionAnchor();
    if (!anchor) return;
    const sp = worldToScreen(anchor);
    const bottom = height - obscuredBottom - 70;
    const top = 80;
    const shift = sp.y > bottom ? bottom - sp.y : sp.y < top ? top - sp.y : 0;
    if (shift !== 0 && bottom > top) setViewport(v => ({ ...v, y: v.y + shift }));
  }, [selKey, obscuredBottom]);

  const trackGestureStart = (e: React.PointerEvent<HTMLDivElement>) => {
    // A second finger makes it a pinch — never a tap
    if (gestureStart.current && e.isPrimary === false) { gestureMoved.current = true; return; }
    gestureStart.current = { x: e.clientX, y: e.clientY };
    gestureMoved.current = false;
  };
  const trackGestureMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gestureStart.current;
    if (g && e.isPrimary && Math.hypot(e.clientX - g.x, e.clientY - g.y) > TAP_SLOP_PX) gestureMoved.current = true;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (tool !== 'draw' || points.length === 0 || closed || placingLighting || isDraggingPoint.current) return;
    if (e.pointerType === 'touch' && pinchRef.current) return; // ignore during pinch
    const stageEl = stageRef.current?.container();
    if (!stageEl) return;
    const rect = stageEl.getBoundingClientRect();
    setCursor(screenToWorld(e.clientX - rect.left, e.clientY - rect.top));
  };

  return (
    <div
      style={{ position: 'relative', background: '#1a1a2e', overflow: 'hidden' }}
      onPointerMove={e => { trackGestureMove(e); handlePointerMove(e); }}
      onPointerDownCapture={trackGestureStart}
      onPointerUpCapture={e => { if (e.isPrimary) gestureStart.current = null; }}
    >
      <Stage
        ref={stageRef}
        width={width}
        height={height}
        x={viewport.x}
        y={viewport.y}
        scaleX={viewport.scale}
        scaleY={viewport.scale}
        onMouseMove={handleStageMouseMove}
        onMouseDown={handleStageMouseDown}
        onMouseUp={handleStageMouseUp}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={() => { if (!gestureMoved.current) onSelect?.(null); }}
        onTap={() => { if (!gestureMoved.current) onSelect?.(null); }}
        style={{ cursor: placingNiche ? 'crosshair' : placingLighting ? 'crosshair' : tool === 'draw' ? 'crosshair' : 'grab' }}
      >
        <Layer>
          {/* Grid — spans the visible area for the current pan/zoom */}
          {!visualOn && (() => {
            const x0 = Math.floor(-viewport.x / viewport.scale / GRID_SIZE) * GRID_SIZE - GRID_SIZE;
            const y0 = Math.floor(-viewport.y / viewport.scale / GRID_SIZE) * GRID_SIZE - GRID_SIZE;
            const x1 = (width - viewport.x) / viewport.scale + GRID_SIZE;
            const y1 = (height - viewport.y) / viewport.scale + GRID_SIZE;
            const lines = [];
            for (let x = x0; x <= x1; x += GRID_SIZE) {
              lines.push(<Line key={`gv${x}`} points={[x, y0, x, y1]} stroke="rgba(255,255,255,0.06)" strokeWidth={px} listening={false} />);
            }
            for (let y = y0; y <= y1; y += GRID_SIZE) {
              lines.push(<Line key={`gh${y}`} points={[x0, y, x1, y]} stroke="rgba(255,255,255,0.06)" strokeWidth={px} listening={false} />);
            }
            return lines;
          })()}

          {/* Everything below is the drawing — rotated as one, the grid above is not */}
          <Group x={rotation.x} y={rotation.y} rotation={rotation.angle}>

          {/* Filled polygon */}
          {closed && points.length > 2 && (
            <>
              <Line
                points={outlinePoints(points)}
                closed
                fill={fabricSelected ? 'rgba(249,168,37,0.16)' : visualOn ? fabricStandIn : 'rgba(56,128,255,0.18)'}
                stroke={visualOn ? undefined : '#3880ff'}
                strokeWidth={2 * px}
                listening={!visualOn}
                onClick={e => pick(e, { kind: 'fabric' })}
                onTap={e => pick(e, { kind: 'fabric' })}
              />
              {fabricSelected && (
                <Line points={outlinePoints(points)} closed stroke={SEL} strokeWidth={3 * px} dash={[10 * px, 6 * px]} listening={false} />
              )}
            </>
          )}

          {/* ── «Визуал»: the rendered ceiling, cut to the outline — the drawing's marks are all off ── */}
          {visualOn && (
            <Group
              listening={false}
              clipFunc={ctx => { ctx.beginPath(); roomOutline.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); }}
            >
              {[ceilingPic.base, ceilingPic.detail].map((pic, i) => pic && (
                <KImage key={i} image={pic.canvas} x={pic.x} y={pic.y} width={pic.width} height={pic.height} />
              ))}
              <GlowTint.Provider value={glowTint}>
              {(room.lighting ?? []).map(e => {
                const g = bare.has(e.id) ? BARE_TRACK : GLOW[e.catalogItem.type] ?? GLOW.spot;
                if (!g.power) return null;
                const r = cm2px(g.radiusCm), type = e.catalogItem.type;
                if (e.kind === 'path') return <PathGlow key={e.id} points={e.points} r={r} type={type} power={g.power} angle={rotation.angle} />;
                if (type === 'track_spot') {
                  const aim = trackSpotAim(e, trackRuns, cm2px, roomOutline);
                  // a beam reaching about twice as far as its light lands
                  return <TrackBeam key={e.id} x={e.x} y={e.y} angle={aim.angle ?? 0} len={2 * cm2px(GLOW.track_spot.throwCm ?? 70)} drawAngle={rotation.angle} power={g.power} />;
                }
                if (type === 'chandelier') return <ChandelierGlow key={e.id} x={e.x} y={e.y} r={r} armR={cm2px(CHANDELIER_ARMS.cm)} power={g.power} />;
                return <PointGlow key={e.id} x={e.x} y={e.y} r={r} type={type} power={g.power} />;
              })}
              </GlowTint.Provider>
            </Group>
          )}
          {/* the lights themselves, as in the old glow view — looked at, not edited */}
          {visualOn && (room.lighting ?? []).map(e => e.kind === 'path'
            ? <GlowPathMark key={e.id} type={e.catalogItem.type} points={e.points} px={px} cm={cm2px(1)} lit={bare.has(e.id)} />
            : <GlowPointMark
                key={e.id} type={e.catalogItem.type} x={e.x} y={e.y} px={px} cm={cm2px(1)} armR={cm2px(CHANDELIER_ARMS.cm)}
                angle={e.catalogItem.type === 'track_spot' ? trackSpotAim(e, trackRuns, cm2px, roomOutline).angle : null}
              />)}

          {/* In-progress polygon */}
          {!closed && points.length > 1 && (
            <Line points={flatPoints(points)} stroke="#3880ff" strokeWidth={2 * px} lineCap="round" lineJoin="round" />
          )}

          {/* Polygon preview line */}
          {previewLine && !closed && (
            <>
              <Line
                points={flatPoints(previewLine)}
                stroke={nearStart ? '#2dd36f' : '#3880ff'}
                strokeWidth={2 * px}
                dash={[6 * px, 4 * px]}
              />
              {dist(previewLine[0], previewLine[1]) > 1 && (
                <Text
                  x={(previewLine[0].x + previewLine[1].x) / 2}
                  y={(previewLine[0].y + previewLine[1].y) / 2}
                  offsetY={16 * px}
                  rotation={-rotation.angle}
                  text={fmtCm(pxToCm(dist(previewLine[0], previewLine[1])))}
                  fontSize={12 * px}
                  fontStyle="bold"
                  fill={nearStart ? '#2dd36f' : '#fff'}
                  shadowColor="rgba(0,0,0,0.9)"
                  shadowBlur={4}
                  shadowOffsetX={1}
                  shadowOffsetY={1}
                  listening={false}
                />
              )}
            </>
          )}

          {/* Diagonals — lengths are in the section's list, not on the drawing.
              With one selected the rest fade back and the selected one is
              drawn last, on top of every crossing */}
          {[...diagonals]
            .sort((x, y) => Number(selectedDiag != null && selectedDiag.i === x.i && selectedDiag.j === x.j)
              - Number(selectedDiag != null && selectedDiag.i === y.i && selectedDiag.j === y.j))
            .map(({ a, b, key, i, j }) => {
            const isSel = selectedDiag != null && selectedDiag.i === i && selectedDiag.j === j;
            const dimmed = selectedDiag != null && !isSel;
            return (
              <Group key={key} opacity={dimmed ? 0.25 : 1}>
                <Line
                  points={[a.x, a.y, b.x, b.y]}
                  stroke="#F9A825"
                  strokeWidth={(isSel ? 3.5 : 1.5) * px}
                  dash={isSel ? undefined : [8 * px, 6 * px]}
                  opacity={isSel ? 1 : 0.85}
                  shadowColor={isSel ? SEL : undefined}
                  shadowBlur={isSel ? 10 : 0}
                  hitStrokeWidth={18 * px}
                  onClick={e => pick(e, { kind: 'diagonal', i, j })}
                  onTap={e => pick(e, { kind: 'diagonal', i, j })}
                />
                {/* the selected one's length, just above the line at its middle */}
                {isSel && (() => {
                  const deg = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
                  const upright = Math.abs(normDeg(deg + rotation.angle)) > 90 ? deg + 180 : deg;
                  const w = 80, h = LABEL.font + 4;
                  return (
                    <Text
                      x={(a.x + b.x) / 2} y={(a.y + b.y) / 2} rotation={upright} scaleX={px} scaleY={px}
                      width={w} height={h} offsetX={w / 2} offsetY={h + 3} align="center" verticalAlign="bottom"
                      text={fmtCm(pxToCm(dist(a, b)))} fontSize={LABEL.font} fontStyle="bold" fill={SEL}
                      shadowColor="rgba(0,0,0,0.9)" shadowBlur={4}
                      listening={false}
                    />
                  );
                })()}
              </Group>
            );
          })}

          {/* Selected wall glow */}
          {selectedWall != null && points.length > selectedWall && (() => {
            const a = points[selectedWall], b = points[(selectedWall + 1) % points.length];
            return (
              <Line
                points={[a.x, a.y, ...sampleArc(a, b, a.bulge, 24).flatMap(q => [q.x, q.y])]}
                stroke={SEL} strokeWidth={5 * px} lineCap="round" lineJoin="round"
                shadowColor={SEL} shadowBlur={10}
                listening={false}
              />
            );
          })()}

          {/* Wall drag-to-curve — invisible wide hit band along each wall, laid
              down before the vertices so a corner still wins the hit-test over
              the wall band right next to it. Grab anywhere on a wall and drag to
              bow it into an arc; the arc is fit through both ends plus wherever
              you dropped the point, so it always passes exactly under your
              finger — no visible handle needed. */}
          {!visualOn && wallHitLines.map(w => (
            <Line
              key={`wall-hit-${w.i}`}
              points={w.points}
              stroke="transparent"
              strokeWidth={1}
              hitStrokeWidth={28 * px}
              draggable
              x={0} y={0}
              onClick={e => pick(e, { kind: 'wall', index: w.i })}
              onTap={e => pick(e, { kind: 'wall', index: w.i })}
              onTouchStart={() => { isDraggingPoint.current = true; lastTouch.current = null; }}
              onDragStart={e => {
                if (pinchRef.current) { e.target.stopDrag(); return; }
                onVertexDragStart?.();
                setCursor(null);
                lastMouse.current = null; lastTouch.current = null; isDraggingPoint.current = true;
                wallDragOrigin.current = getPointerPos(e);
              }}
              onDragMove={e => {
                if (!wallDragOrigin.current || pinchRef.current) return;
                const dragPt = { x: wallDragOrigin.current.x + e.target.x(), y: wallDragOrigin.current.y + e.target.y() };
                const bulge = bulgeFromThreePoints(w.a, w.b, dragPt, MAX_WALL_BULGE);
                // Stop the wall right where it would start overlapping another
                // wall, instead of letting it pass through — just skip this
                // update and hold at the last valid curvature.
                if (edgeWouldCrossRoom(points, w.i, bulge)) return;
                const newPts = points.map((p, idx) => idx === w.i ? { ...p, bulge } : p);
                setPoints(newPts);
                const m = computeMetrics(newPts);
                onChange({ points: newPts, ...m });
              }}
              onDragEnd={e => {
                isDraggingPoint.current = false;
                onVertexDragEnd?.();
                wallDragOrigin.current = null;
                e.target.position({ x: 0, y: 0 }); // reset so the next drag's delta starts fresh
              }}
            />
          ))}

          {/* Corner angle marks — live while drawing, at the dragged or selected corner — above the
              diagonal and wall labels so the number is never covered */}
          {angleMarks.map((m, k) => (
            <Group key={`angle-${k}`} listening={false}>
              <Wedge
                x={m.v.x} y={m.v.y}
                radius={m.r} angle={m.sweep} rotation={m.start}
                fill={m.color} opacity={0.18}
              />
              {m.right ? (
                <Line points={m.square} stroke={m.color} strokeWidth={1.5 * px} />
              ) : (
                <Arc
                  x={m.v.x} y={m.v.y}
                  innerRadius={m.r} outerRadius={m.r}
                  angle={m.sweep} rotation={m.start}
                  stroke={m.color} strokeWidth={1.5 * px}
                />
              )}
              <Text
                x={m.labelX} y={m.labelY}
                width={48 * px} offsetX={24 * px} offsetY={6 * px} align="center"
                rotation={-rotation.angle}
                text={m.text}
                fontSize={12 * px}
                fontStyle="bold"
                fill={m.textColor}
                shadowColor="rgba(0,0,0,0.9)"
                shadowBlur={4}
                shadowOffsetX={1}
                shadowOffsetY={1}
              />
            </Group>
          ))}

          {/* Vertices */}
          {!visualOn && points.map((p, i) => {
            const isSelected = selectedPoint === i;
            // a small dot (the letter sits outside it) — but the big «close
            // the room here» target while the cursor is on the first corner
            const baseRadius = (i === 0 && nearStart ? 14 : LABEL.dot) * px;
            // Point 0 stays a plain pass-through target while the room is
            // still open — it's the "tap here to close the loop" hotspot in
            // handleTap, so it must not steal the touch into a drag. Every
            // other already-placed point can be nudged mid-draw.
            const canDragVertex = !placingLighting && !placingNiche && (closed || i !== 0);
            return (
              <Group key={i}>
                {isSelected && (
                  <Circle
                    x={p.x} y={p.y}
                    radius={baseRadius + 7 * px}
                    fill="rgba(249,168,37,0.25)"
                    stroke={SEL}
                    strokeWidth={2 * px}
                    listening={false}
                  />
                )}
                <Circle
                  x={p.x} y={p.y}
                  radius={baseRadius}
                  fill={i === 0 ? (nearStart ? '#2dd36f' : '#fff') : '#3880ff'}
                  stroke={isSelected ? SEL : (i === 0 ? '#3880ff' : '#fff')}
                  strokeWidth={(isSelected ? 2 : 1.5) * px}
                  hitStrokeWidth={20 * px}
                  name="vertex"
                  listening={canDragVertex}
                  draggable={canDragVertex}
                  onTouchStart={e => { e.cancelBubble = true; isDraggingPoint.current = true; lastTouch.current = null; }}
                  onDragStart={e => { if (pinchRef.current) { e.target.stopDrag(); return; } onVertexDragStart?.(); setCursor(null); lastMouse.current = null; lastTouch.current = null; isDraggingPoint.current = true; setDraggingPoint(i); }}
                  onDragMove={e => {
                    if (pinchRef.current) return;
                    const newPts = [...points];
                    newPts[i] = { ...points[i], x: e.target.x(), y: e.target.y() };
                    setPoints(newPts);
                    // Only a closed room has real area/perimeter to report —
                    // while still mid-draw, keep the update local so this
                    // doesn't trip the "already closed" check elsewhere.
                    if (closed) {
                      const m = computeMetrics(newPts);
                      onChange({ points: newPts, ...m });
                    } else {
                      onChange({ points: newPts });
                    }
                  }}
                  onDragEnd={() => { isDraggingPoint.current = false; setDraggingPoint(null); onVertexDragEnd?.(); }}
                  onClick={e => { if (closed) pick(e, { kind: 'corner', index: i }); }}
                  onTap={e => { if (closed) pick(e, { kind: 'corner', index: i }); }}
                />
              </Group>
            );
          })}

          {/* ── Placed lighting ── (lighting, niches and wall lengths stay off
              the drawing while diagonals are checked). Lines first, so track
              spots sit on top of their track. */}
          {!showDiagonals && !visualOn && (room.lighting ?? []).filter(e => e.kind === 'path').map(e => {
            const el = e as RoomLightingPath;
            const isSel = selectedLighting === el.id || selectedGroup === el.catalogItemId;
            const pts = flat(el.points);
            return (
              <Group key={el.id}>
                {isSel && <Line points={pts} stroke={SEL} strokeWidth={16 * markUnit(el.catalogItem.type, px, cm2px(1))} opacity={0.35} lineCap="round" lineJoin="round" listening={false} />}
                <PathLightMark type={el.catalogItem.type} color={el.catalogItem.color} points={el.points} px={px} cm={cm2px(1)} />
                <Line
                  points={pts} stroke="transparent" strokeWidth={6 * px} hitStrokeWidth={20 * px}
                  listening={!placingLighting && !placingNiche}
                  onClick={e => pick(e, { kind: 'light', id: el.id })}
                  onTap={e => pick(e, { kind: 'light', id: el.id })}
                />
              </Group>
            );
          })}

          {/* Set-out lines from the selected point light to the walls and its nearest neighbour */}
          {lightGuides.map((g, i) => (
            <Line
              key={`lg${i}`} points={flat([g.from, g.to])}
              stroke={SEL} strokeWidth={1.3 * px} dash={[5 * px, 4 * px]} opacity={g.kind === 'light' ? 0.7 : 1}
              listening={false}
            />
          ))}

          {!showDiagonals && !visualOn && (room.lighting ?? []).filter(e => e.kind === 'point').map(e => {
            const placed = e as RoomLightingPoint;
            // a light being moved is drawn where it would land
            const el = lightDrag?.id === placed.id ? { ...placed, ...lightDrag.at } : placed;
            const isSel = selectedLighting === el.id || lightDrag?.id === el.id || selectedGroup === el.catalogItemId;
            const angle = el.catalogItem.type === 'track_spot' ? trackSpotAim(el, trackRuns, cm2px, roomOutline).angle : null;
            const canMove = !placingLighting && !placingNiche;
            return (
              <Group key={el.id}>
                {isSel && (
                  <Circle
                    x={el.x} y={el.y} radius={(el.catalogItem.type === 'chandelier' ? 26 : 15) * markUnit(el.catalogItem.type, px, cm2px(1))}
                    fill="rgba(249,168,37,0.22)" stroke={SEL} strokeWidth={2 * px}
                    listening={false}
                  />
                )}
                <PointLightMark type={el.catalogItem.type} color={el.catalogItem.color} x={el.x} y={el.y} px={px} cm={cm2px(1)} angle={angle} />
                <Circle
                  x={el.x} y={el.y} radius={(el.catalogItem.type === 'chandelier' ? 22 : 16) * px}
                  fill="transparent"
                  name="light"
                  listening={canMove}
                  draggable={canMove}
                  onTouchStart={e => { e.cancelBubble = true; isDraggingPoint.current = true; lastTouch.current = null; }}
                  onDragStart={e => {
                    if (pinchRef.current) { e.target.stopDrag(); return; }
                    onVertexDragStart?.();
                    lastMouse.current = null; lastTouch.current = null; isDraggingPoint.current = true;
                    setLightDrag({ id: placed.id, at: { x: placed.x, y: placed.y }, u: null, v: null });
                  }}
                  onDragMove={e => {
                    if (pinchRef.current) return;
                    const l = landLight(e.target.position(), placed.catalogItem.type, placed.id);
                    // outside the room it stays where it last was inside
                    const next = l ?? (lightDrag ? { at: lightDrag.at, u: lightDrag.u, v: lightDrag.v } : { at: { x: placed.x, y: placed.y }, u: null, v: null });
                    e.target.position(next.at);
                    setLightDrag({ id: placed.id, ...next });
                  }}
                  onDragEnd={() => {
                    isDraggingPoint.current = false;
                    const d = lightDrag;
                    setLightDrag(null);
                    if (d?.id === placed.id) onChange({ lighting: (room.lighting ?? []).map(x => x.id === placed.id ? { ...x, x: d.at.x, y: d.at.y } : x) });
                    onVertexDragEnd?.();
                  }}
                  onClick={e => pick(e, { kind: 'light', id: el.id })}
                  onTap={e => pick(e, { kind: 'light', id: el.id })}
                />
              </Group>
            );
          })}

          {/* A new point light under the finger, landing where it is let go */}
          {lightDrag?.id === null && placingLighting && (
            <Group listening={false}>
              <Circle x={lightDrag.at.x} y={lightDrag.at.y} radius={15 * markUnit(placingLighting.type, px, cm2px(1))} fill="rgba(249,168,37,0.22)" stroke={SEL} strokeWidth={2 * px} />
              <PointLightMark type={placingLighting.type} color={placingLighting.color} x={lightDrag.at.x} y={lightDrag.at.y} px={px} cm={cm2px(1)} angle={null} />
            </Group>
          )}

          {/* ── In-progress lighting path ── */}
          {placingLighting?.placement === 'path' && inProgressLightingPath.length > 0 && (
            <>
              <Line
                points={inProgressLightingPath.flatMap(p => [p.x, p.y])}
                stroke={lightColor(placingLighting.color)}
                strokeWidth={5 * px}
                dash={[10 * px, 5 * px]}
                lineCap="round"
                listening={false}
              />
              {inProgressLightingPath.map((p, i) => (
                <Circle key={i} x={p.x} y={p.y} radius={5 * px} fill={lightColor(placingLighting.color)} listening={false} />
              ))}
            </>
          )}

          {/* ── Lighting path preview line (cursor) ── */}
          {lightPathPreview && (
            <Line
              points={lightPathPreview.flatMap(p => [p.x, p.y])}
              stroke={lightColor(placingLighting!.color)}
              strokeWidth={3 * px}
              dash={[6 * px, 4 * px]}
              opacity={0.5}
              listening={false}
            />
          )}

          {/* ── Walls a niche can go on, while placing one by a tap ── */}
          {placingNiche && isClosed && points.map((a, i) => isStraightWall(points, i) && (
            <Line
              key={`nw${i}`}
              points={flat([a, points[(i + 1) % points.length]])}
              stroke={NICHE} strokeWidth={(i === nicheHoverEdge ? 8 : 6) * px} lineCap="round"
              opacity={i === nicheHoverEdge ? 0.95 : 0.35}
              shadowColor={i === nicheHoverEdge ? NICHE : undefined} shadowBlur={i === nicheHoverEdge ? 10 : 0}
              listening={false}
            />
          ))}

          {/* ── A niche across the room being placed: its first end, and a
              line on to where the next tap would land (green when square) ── */}
          {placingNiche && nicheCross && crossStart && (() => {
            const a = wallPointXY(points, crossStart);
            return <>
              {crossHover && (
                <Line
                  points={flat([a, crossHover.at])} stroke={crossHover.square ? '#2dd36f' : NICHE}
                  strokeWidth={3 * px} dash={[8 * px, 5 * px]} listening={false}
                />
              )}
              <Circle x={a.x} y={a.y} radius={8 * px} fill={NICHE} stroke="#fff" strokeWidth={2 * px} listening={false} />
            </>;
          })()}
          {placingNiche && nicheCross && crossHover && (
            <Circle x={crossHover.at.x} y={crossHover.at.y} radius={7 * px} stroke={crossHover.square ? '#2dd36f' : NICHE} strokeWidth={3 * px} listening={false} />
          )}

          {/* ── Placed niches: a hatched band where the canvas stops short of
              the wall, its edge solid; a curtain track (гардина) shows its
              rail with runners, a niche for a cornice shows the cornice;
              a cap closes each end that stops short of a wall ── */}
          {!showDiagonals && !visualOn && (room.selectedNiches ?? []).map(el => {
            if (el.kind === 'count') return null;
            const isSel = selectedNicheEl === el.id;
            const listen = !placingNiche && !placingLighting;
            const onPick = (e: Konva.KonvaEventObject<Event>) => pick(e, { kind: 'niche', id: el.id });
            const curtain = el.niche.type === 'curtain';
            const cornice = hasCornice(el);
            const rail = (ps: Point[]) => <>
              {curtain && <>
                <Line points={flat(ps)} stroke="#e0f7fa" strokeWidth={3 * px} lineCap="round" lineJoin="round" listening={false} />
                <Line points={flat(ps)} stroke={NICHE_DARK} strokeWidth={4.5 * px} dash={[0, 10 * px]} lineCap="round" listening={false} />
              </>}
              {cornice && <Line points={flat(ps)} stroke="#ffcc80" strokeWidth={2 * px} dash={[5 * px, 4 * px]} listening={false} />}
            </>;
            const edgeLine = (ps: Point[]) => (
              <Line
                points={flat(ps)} stroke={NICHE} strokeWidth={(isSel ? 4 : 2.5) * px} lineCap="round" lineJoin="round"
                shadowColor={isSel ? SEL : undefined} shadowBlur={isSel ? 12 : 0}
                listening={listen} hitStrokeWidth={20 * px} onClick={onPick} onTap={onPick}
              />
            );
            const cap = (a: Point, b: Point, k: string) => (
              <Line key={k} points={flat([a, b])} stroke={NICHE} strokeWidth={5 * px} lineCap="round" listening={false} />
            );

            // Across the room: a hatched band wall to wall, a canvas edge on
            // each side, the rail or cornice down the middle
            if (el.kind === 'cross') {
              const cb = crossBand({ ...room, points }, el);
              if (!cb) return null;
              const pattern = nicheHatch();
              return (
                <React.Fragment key={el.id}>
                  <Line
                    points={flat(cb.band)} closed
                    {...(pattern
                      ? { fillPatternImage: pattern as unknown as HTMLImageElement, fillPatternScale: { x: px, y: px }, fillPatternRepeat: 'repeat' }
                      : { fill: 'rgba(0,172,193,0.3)' })}
                    listening={listen} onClick={onPick} onTap={onPick}
                  />
                  {edgeLine(cb.edges[0])}
                  {edgeLine(cb.edges[1])}
                  {rail(cb.line)}
                  {isSel && listen && crossHandles(el, cb.line)}
                </React.Fragment>
              );
            }

            // Legacy / odd-shaped niche drawn by points: no band, just its line
            if (el.kind === 'path') {
              const [startFree, endFree] = nicheFreeEnds(points, el.points);
              const n = el.points.length;
              const w = 7 * px;
              return (
                <React.Fragment key={el.id}>
                  {edgeLine(el.points)}
                  {rail(el.points)}
                  {startFree && <Line points={capBar(el.points[0], el.points[1], 3 * w)} stroke={NICHE} strokeWidth={4 * px} lineCap="round" listening={false} />}
                  {endFree && <Line points={capBar(el.points[n - 1], el.points[n - 2], 3 * w)} stroke={NICHE} strokeWidth={4 * px} lineCap="round" listening={false} />}
                </React.Fragment>
              );
            }

            const shape = nicheShape({ ...room, points }, el);
            if (!shape) return null;
            const pattern = nicheHatch();
            const last = shape.wall.length - 1;
            return (
              <React.Fragment key={el.id}>
                <Line
                  points={flat([...shape.wall, ...[...shape.inner].reverse()])} closed
                  {...(pattern
                    ? { fillPatternImage: pattern as unknown as HTMLImageElement, fillPatternScale: { x: px, y: px }, fillPatternRepeat: 'repeat' }
                    : { fill: 'rgba(0,172,193,0.3)' })}
                  listening={listen} onClick={onPick} onTap={onPick}
                />
                {edgeLine(shape.inner)}
                {rail(shape.rail)}
                {shape.freeStart && cap(shape.wall[0], shape.inner[0], 's')}
                {shape.freeEnd && cap(shape.wall[last], shape.inner[shape.inner.length - 1], 'e')}
                {isSel && listen && nicheHandles(el, shape.rail)}
              </React.Fragment>
            );
          })}


          </Group>

          {/* Corner letters and wall lengths — laid out on
              screen (labelLayout), so this group isn't rotated with the
              drawing and the text always reads upright. */}
          <Group>
            {!visualOn && labelLayout.walls.map((l, i) => {
              if (!l) return null;
              const text = wallsIn[i]!.text;
              const sel = i === selectedWall;
              const onPick = (e: Konva.KonvaEventObject<Event>) => pick(e, { kind: 'wall', index: i });
              if (l.kind === 'inline') {
                const at = toStage(l), w = 80, h = LABEL.font + 8;
                return (
                  <Text
                    key={`wl${i}`} x={at.x} y={at.y} rotation={l.angle} scaleX={px} scaleY={px}
                    width={w} height={h} offsetX={w / 2} offsetY={h / 2} align="center" verticalAlign="middle"
                    text={text} fontSize={LABEL.font} fontStyle={sel ? 'bold' : 'normal'} fill={sel ? SEL : '#fff'}
                    onClick={onPick} onTap={onPick}
                  />
                );
              }
              const at = toStage(l), from = toStage(l.anchor), to = toStage(calloutJoin(l));
              return (
                <Group key={`wl${i}`}>
                  <Line points={[from.x, from.y, to.x, to.y]} stroke={sel ? SEL : '#9aa3c7'} strokeWidth={px} listening={false} />
                  <Circle x={from.x} y={from.y} radius={2 * px} fill={sel ? SEL : '#9aa3c7'} listening={false} />
                  <Group x={at.x} y={at.y} scaleX={px} scaleY={px} onClick={onPick} onTap={onPick}>
                    <Rect
                      x={-l.w / 2} y={-l.h / 2} width={l.w} height={l.h} cornerRadius={l.h / 2}
                      fill="#262842" stroke={sel ? SEL : '#4a5080'} strokeWidth={1}
                      hitStrokeWidth={12}
                    />
                    <Text
                      x={-l.w / 2} y={-l.h / 2} width={l.w} height={l.h} align="center" verticalAlign="middle"
                      text={text} fontSize={LABEL.font} fontStyle={sel ? 'bold' : 'normal'} fill={sel ? SEL : '#fff'}
                    />
                  </Group>
                </Group>
              );
            })}
            {!visualOn && [...sizePills, ...(nicheDrag ? [{ at: nicheDrag.at, text: nicheDrag.text, main: true }] : [])].map((p, i) => {
              const at = toStage(worldToScreen(p.at)), w = p.text.length * 7.5 + 16, h = 20;
              const color = p.main ? NICHE : '#c9cfe8';
              return (
                <Group key={`np${i}`} x={at.x} y={at.y} scaleX={px} scaleY={px} listening={false}>
                  <Rect x={-w / 2} y={-h / 2} width={w} height={h} cornerRadius={h / 2} fill="#0c3b42" stroke={color} strokeWidth={1} />
                  <Text x={-w / 2} y={-h / 2} width={w} height={h} align="center" verticalAlign="middle" text={p.text} fontSize={11} fontStyle="bold" fill={p.main ? '#bff4fa' : '#fff'} />
                </Group>
              );
            })}
            {!visualOn && lightPills.map((p, i) => (
              <ValuePill key={`lp${i}`} at={toStage(worldToScreen(p.at))} angle={0} px={px} text={p.text} w={p.text.length * 7 + 12} tone={p.bold ? 'active' : 'plain'} color={p.color} />
            ))}
            {scaleView.origin && (() => {
              const o = toStage(scaleView.origin);
              return <Circle x={o.x} y={o.y} radius={11 * px} stroke={SCALE} strokeWidth={1.5 * px} dash={[3 * px, 2 * px]} listening={false} />;
            })()}
            {scaleMarks.map((m, i) => {
              const a = toStage(m.line[0]), b = toStage(m.line[1]);
              return <Line key={`sl${i}`} points={[a.x, a.y, b.x, b.y]} stroke={TONE[m.tone]} opacity={m.tone === 'plain' ? 0.4 : 0.95} strokeWidth={(m.tone === 'plain' ? 1 : 1.5) * px} dash={[3 * px, 4 * px]} listening={false} />;
            })}
            {scaleMarks.map((m, i) => (
              <ValuePill key={`sp${i}`} at={toStage(m.at)} angle={m.angle} px={px} text={m.text} w={m.w} tone={m.tone} />
            ))}
            {!visualOn && labelLayout.letters.map((l, i) => {
              const at = toStage(l);
              return (
                <Text
                  key={`cl${i}`} x={at.x} y={at.y} scaleX={px} scaleY={px}
                  width={24} height={18} offsetX={12} offsetY={9} align="center" verticalAlign="middle"
                  text={labels[i]} fontSize={LABEL.letterFont} fontStyle="bold"
                  fill={i === selectedPoint ? SEL : '#8fb8ff'}
                  shadowColor="rgba(0,0,0,0.9)" shadowBlur={3}
                  listening={false}
                />
              );
            })}
          </Group>
        </Layer>
      </Stage>

      {/* Toolbar over the drawing: undo/redo, then the outline's own tools */}
      {/* Hidden on an empty drawing, unless there is something to undo/redo (e.g. right after clearing) */}
      {!placingNiche && !hideTools && (points.length > 0 || canUndoBtn || canRedoBtn || placingLighting) && (
        <div className="cv-tools">
          {placingLighting ? (
            <>
              <ToolBtn icon={arrowUndoOutline} label={t('cv.undo')} onClick={onUndoLightingPoint} disabled={!canUndoLighting} />
              <ToolBtn icon={arrowRedoOutline} label={t('cv.redo')} onClick={onRedoLightingPoint} disabled={!canRedoLighting} />
            </>
          ) : (
            <>
              <ToolBtn icon={arrowUndoOutline} label={t('cv.undo')} onClick={handleUndoBtn} disabled={!canUndoBtn} />
              <ToolBtn icon={arrowRedoOutline} label={t('cv.redo')} onClick={handleRedoBtn} disabled={!canRedoBtn} />
              {/* outline tools only once the outline is closed (it then has an area) */}
              {room.areaSqm > 0 && (
                <>
                  <div className="cv-tools__sep" />
                  <ToolBtn icon={scanOutline} label={t('cv.fit')} onClick={() => fitView(points, true)} />
                  {onToggleDiagonals && points.length >= 4 && (
                    <ToolBtn
                      icon={resizeOutline} label={t('mat.tabDiag')} onClick={onToggleDiagonals}
                      accent active={showDiagonals}
                    />
                  )}
                  {hasLights && (
                    <ToolBtn
                      icon={sunnyOutline} label={t('cv.glow')} accent active={visualOn}
                      onClick={() => { if (!visualOn) { onSelect?.(null); setVisual(true); } else setVisual(false); }}
                    />
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* «Визуал»: only when the ceiling picture couldn't be drawn */}
      {visualOn && ceilingPic.failed && (
        <div className="cv-legend">
          <div className="cv-legend__chip"><span>{t('cv.visualFail')}</span></div>
        </div>
      )}

      {/* Empty state overlay — choose how to create the outline */}
      {points.length === 0 && !manualStarted && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none', padding: 20,
        }}>
          <div style={{
            width: '100%', maxWidth: 320,
            background: 'rgba(12,14,24,0.92)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
            borderRadius: 20, padding: '22px 16px 16px',
            pointerEvents: 'auto',
          }}>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 30, marginBottom: 8 }}>📐</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 3 }}>
                Выберите способ построения помещения
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <StartOption
                icon={createOutline}
                color="#1E88E5"
                title="Начертить самому"
                subtitle="Ставьте точки на холсте вручную"
                onClick={() => setManualStarted(true)}
              />
              {onOpenManualMeasure && (
                <StartOption
                  icon={shapesOutline}
                  color="#8E24AA"
                  title="Форма и размеры"
                  subtitle="Г, П, трапеция… или стена за стеной"
                  onClick={onOpenManualMeasure}
                />
              )}
              {onOpenBluetooth && (
                <StartOption
                  icon={bluetoothOutline}
                  color="#2E7D32"
                  title="Через дальномер"
                  subtitle="Обмерить стены лазерным дальномером"
                  onClick={onOpenBluetooth}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const StartOption: React.FC<{
  icon: string; color: string; title: string; subtitle: string; onClick: () => void;
}> = ({ icon, color, title, subtitle, onClick }) => (
  <button
    onClick={onClick}
    style={{
      display: 'flex', alignItems: 'center', gap: 12,
      width: '100%', padding: '12px 12px',
      background: 'rgba(255,255,255,0.06)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 14, cursor: 'pointer', textAlign: 'left',
    }}
  >
    <div style={{
      width: 38, height: 38, borderRadius: 11, flexShrink: 0,
      background: `${color}26`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <IonIcon icon={icon} style={{ fontSize: 20, color }} />
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ color: '#fff', fontWeight: 700, fontSize: 14, lineHeight: 1.25 }}>{title}</div>
      <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11.5, lineHeight: 1.35, marginTop: 4 }}>{subtitle}</div>
    </div>
    <IonIcon icon={chevronForwardOutline} style={{ fontSize: 16, color: 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
  </button>
);

export default CeilingCanvas;
