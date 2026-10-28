import React, { useRef, useState, useEffect, useCallback } from 'react';
import { IonIcon } from '@ionic/react';
import { arrowUndoOutline, arrowRedoOutline, createOutline, appsOutline, bluetoothOutline, keypadOutline, chevronForwardOutline } from 'ionicons/icons';
import { Stage, Layer, Line, Circle, Text, Group, Rect } from 'react-konva';
import Konva from 'konva';
import {
  Point, snapAngle, dist, polygonArea, polygonPerimeter, pxToMeters, pxToCm, fmtCm, pointLabel, vertexLabels,
  pointInPolygon, relevantDiagonalPartner, GRID_SIZE,
  edgeLen, arcHandlePoint, bulgeFromThreePoints, edgeWouldCrossRoom, sampleArc, tessellateRoom,
  nearestPointOnOutline,
} from '../lib/geometry';
import { roomDiagonals } from '../lib/diagonals';

// A wall can bow at most into a full semicircle. Capping here (rather than
// higher) keeps the arc's projection onto its own chord monotonic, so the
// edgeWouldCrossRoom check below can't be fooled by a reflex arc looping
// around a shared corner without technically crossing a wall segment.
const MAX_WALL_BULGE = 1;
import { Room, LightingCatalogItem, RoomLightingPoint, RoomLightingPath, NicheItem, RoomNichePath } from '../types';

/** What a tap on the finished drawing picked — the element card acts on it */
export type CanvasSelection =
  | { kind: 'corner'; index: number }
  | { kind: 'wall'; index: number }
  | { kind: 'diagonal'; i: number; j: number }
  | { kind: 'light'; id: string }
  | { kind: 'niche'; id: string }
  | { kind: 'fabric' };

export const selectionKey = (s: CanvasSelection | null) => !s ? '' : s.kind === 'corner' || s.kind === 'wall' ? `${s.kind}:${s.index}`
  : s.kind === 'diagonal' ? `diagonal:${s.i}-${s.j}` : s.kind === 'fabric' ? 'fabric' : `${s.kind}:${s.id}`;

// A finger that travels further than this between down and up was panning, not tapping
const TAP_SLOP_PX = 8;
const SEL = '#F9A825';

const CLOSE_THRESHOLD = 24;
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
  placingLighting?: LightingCatalogItem | null;
  inProgressLightingPath?: { x: number; y: number }[];
  onLightingTap?: (pt: { x: number; y: number }) => void;
  onUndoLightingPoint?: () => void;
  onRedoLightingPoint?: () => void;
  canUndoLighting?: boolean;
  canRedoLighting?: boolean;
  placingNiche?: NicheItem | null;
  inProgressNichePath?: { x: number; y: number }[];
  onNicheTap?: (pt: { x: number; y: number }, finish: boolean) => void;
  onUndoNichePoint?: () => void;
  onRedoNichePoint?: () => void;
  canUndoNiche?: boolean;
  canRedoNiche?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onVertexDragStart?: () => void;
  onVertexDragEnd?: () => void;
  onOutOfBounds?: () => void;
  onOpenTemplates?: () => void;
  onOpenBluetooth?: () => void;
  onOpenManualMeasure?: () => void;
  selection?: CanvasSelection | null;
  onSelect?: (s: CanvasSelection | null) => void;
  /** Height of the canvas bottom covered by the element card — the selection is kept above it */
  obscuredBottom?: number;
}

type Tool = 'draw' | 'move';

const lightColor = (color: string) => (color === '#ffffff' ? '#ffeb3b' : color);

const CeilingCanvas: React.FC<Props> = ({
  room, onChange, width, height,
  placingLighting = null,
  inProgressLightingPath = [],
  onLightingTap,
  onUndoLightingPoint,
  onRedoLightingPoint,
  canUndoLighting = false,
  canRedoLighting = false,
  placingNiche = null,
  inProgressNichePath = [],
  onNicheTap,
  onUndoNichePoint,
  onRedoNichePoint,
  canUndoNiche = false,
  canRedoNiche = false,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  onVertexDragStart,
  onVertexDragEnd,
  onOutOfBounds,
  onOpenTemplates,
  onOpenBluetooth,
  onOpenManualMeasure,
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
  // Rotation of the drawing only — the grid lives outside the rotated group
  // and stays put. In stage (pre-viewport) coordinates a world point p is
  // drawn at R(angle)·p + (x, y), so it composes with pan/zoom untouched.
  const [rotation, setRotation] = useState<Rotation>(NO_ROTATION);
  const rotationRef = useRef(rotation);
  rotationRef.current = rotation;
  const prevRoomId = useRef(room.id);
  const [draggingPoint, setDraggingPoint] = useState<number | null>(null);
  const [drawRedoStack, setDrawRedoStack] = useState<Point[][]>([]);
  const selKey = selectionKey(selection);
  const selectedPoint = selection?.kind === 'corner' ? selection.index : null;
  const selectedWall = selection?.kind === 'wall' ? selection.index : null;
  const selectedLighting = selection?.kind === 'light' ? selection.id : null;
  const selectedNicheEl = selection?.kind === 'niche' ? selection.id : null;
  const selectedDiag = selection?.kind === 'diagonal' ? selection : null;
  const fabricSelected = selection?.kind === 'fabric';
  // Where the current pointer gesture started and whether it has turned into
  // a pan/pinch — a tap that travelled isn't a selection.
  const gestureStart = useRef<Point | null>(null);
  const gestureMoved = useRef(false);
  const [nicheHoverOnWall, setNicheHoverOnWall] = useState(false);
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
  const showDiagonals = room.showDiagonals !== false;

  const fitView = useCallback((pts: Point[]) => {
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
    const padding = 60;
    const scale = Math.min(4, (width - padding * 2) / bw, (height - padding * 2) / bh);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    setViewport({ scale, x: width / 2 - cx * scale, y: height / 2 - cy * scale });
  }, [width, height]);

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
  const pick = (e: Konva.KonvaEventObject<Event>, s: CanvasSelection) => {
    e.cancelBubble = true;
    if (gestureMoved.current || placingLighting || placingNiche || !closed) return;
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

  // Text rotation (in the drawing's frame) that reads upright on screen.
  const uprightDeg = (deg: number) => {
    const onScreen = normDeg(deg + rotation.angle);
    return onScreen > 90 || onScreen < -90 ? deg + 180 : deg;
  };

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

  // Snaps a raw tap/cursor point onto the nearest wall when it's close enough
  // to one (within the same threshold used to close the room polygon) — used
  // both to start/finish a niche line on a wall and to preview it on hover.
  const snapToWall = (raw: Point): { point: Point; onWall: boolean } => {
    const outline = tessellateRoom(points, true);
    const { point, distance } = nearestPointOnOutline(raw, outline);
    return { point, onWall: distance * viewport.scale <= CLOSE_THRESHOLD };
  };

  const handleNicheTap = (raw: Point) => {
    const { point: wallPt, onWall } = snapToWall(raw);
    if (inProgressNichePath.length === 0) {
      if (!onWall) { onOutOfBounds?.(); return; }
      onNicheTap?.(wallPt, false);
      return;
    }
    if (onWall) {
      onNicheTap?.(wallPt, true);
      return;
    }
    // Unlike room-wall points, a niche line's anchor (the wall-projected
    // start/previous point) is generally off-grid — rounding the next point
    // to the grid first would measure the snapped angle from an off-grid
    // point to an on-grid one, throwing the direction off by however far the
    // rounding moved it. That error is negligible over a long run but swamps
    // a short one, drawing a visibly crooked line. So snap the angle only,
    // straight off the raw tap, and keep its exact distance from `last`.
    const last = inProgressNichePath[inProgressNichePath.length - 1];
    onNicheTap?.(snapAngle(last, raw), false);
  };

  const handleTap = (pt: Point) => {
    // Niche line placement — start/continue/finish on the room's walls
    if (placingNiche && isClosed) {
      handleNicheTap(pt);
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
    if (placingNiche || placingLighting) {
      const pos = getPointerPos(e);
      if (pos) handleTap(pos);
      return;
    }
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

    if (placingNiche) {
      if (inProgressNichePath.length > 0) {
        const { point, onWall } = snapToWall(pos);
        const last = inProgressNichePath[inProgressNichePath.length - 1];
        setNicheHoverOnWall(onWall);
        setCursor(onWall ? point : snapAngle(last, pos));
      } else {
        const { point, onWall } = snapToWall(pos);
        setNicheHoverOnWall(onWall);
        setCursor(onWall ? point : null);
      }
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
  };

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.container().getBoundingClientRect();
    const mx = e.evt.clientX - rect.left;
    const my = e.evt.clientY - rect.top;
    const ratio = e.evt.deltaY < 0 ? 1.1 : 1 / 1.1;
    setViewport(v => ({
      scale: Math.min(8, Math.max(0.2, v.scale * ratio)),
      x: mx - (mx - v.x) * ratio,
      y: my - (my - v.y) * ratio,
    }));
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
        setViewport(v => ({
          scale: Math.min(8, Math.max(0.2, v.scale * ratio)),
          x: mx - (mx - v.x) * ratio + pdx,
          y: my - (my - v.y) * ratio + pdy,
        }));
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

    if (placingNiche && touches.length === 1 && pos) {
      const raw = screenToWorld(pos.x, pos.y);
      if (inProgressNichePath.length > 0) {
        const { point, onWall } = snapToWall(raw);
        const last = inProgressNichePath[inProgressNichePath.length - 1];
        setNicheHoverOnWall(onWall);
        setCursor(onWall ? point : snapAngle(last, raw));
      } else {
        const { point, onWall } = snapToWall(raw);
        setNicheHoverOnWall(onWall);
        setCursor(onWall ? point : null);
      }
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

  const handleTouchEnd = () => {
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

  const labelCentroid = points.length > 0 ? {
    x: points.reduce((s, q) => s + q.x, 0) / points.length,
    y: points.reduce((s, q) => s + q.y, 0) / points.length,
  } : { x: 0, y: 0 };

  const segmentLabels = points.map((p, i) => {
    if (i === 0 && !closed) return null;
    const prev = closed && i === 0 ? points[points.length - 1] : points[i - 1];
    if (!prev) return null;
    const mid = arcHandlePoint(prev, p, prev.bulge);
    const d = edgeLen(prev, p, prev.bulge);
    const cm = pxToCm(d);
    const dx = p.x - prev.x, dy = p.y - prev.y;
    const segLen = Math.hypot(dx, dy) || 1;
    const angle = uprightDeg(Math.atan2(dy, dx) * 180 / Math.PI); // keep text upright, never upside-down
    // Push the label out along the wall's normal, away from the room's
    // centroid, so it floats outside the drawing instead of on the line.
    let nx = -dy / segLen, ny = dx / segLen;
    if ((mid.x - labelCentroid.x) * nx + (mid.y - labelCentroid.y) * ny < 0) { nx = -nx; ny = -ny; }
    const margin = 7;
    const wall = closed && i === 0 ? points.length - 1 : i - 1;
    return { mx: mid.x + nx * margin, my: mid.y + ny * margin, label: fmtCm(cm), key: i, angle, wall };
  }).filter(Boolean);

  // Invisible wide hit-lines along each wall of the closed room — grab and drag
  // anywhere on a wall to bow it into an arc (no visible curvature handle).
  const wallHitLines = isClosed && !placingLighting && !placingNiche ? points.map((a, i) => {
    const b = points[(i + 1) % points.length];
    return { i, a, b, points: [a.x, a.y, ...sampleArc(a, b, a.bulge, 24).flatMap(p => [p.x, p.y])] };
  }) : [];

  // Once the room is closed, show every diagonal the triangulation needs to
  // fix the shape. While still drawing (or nudging a vertex before closing),
  // a full triangulation isn't meaningful — there's no wrap-around edge yet,
  // and the point being dragged can make the shape self-intersect — so show
  // just the one diagonal relevant to whichever point is actively moving,
  // the same corner-pairing the closed quad case already uses.
  const labels = vertexLabels(points);
  type DiagonalHint = { a: Point; b: Point; labelI: string; labelJ: string; key: string; i?: number; j?: number };
  const closedDiagonals: DiagonalHint[] = showDiagonals && closed && points.length >= 4
    ? roomDiagonals(points).map(d => ({
        a: points[d.i], b: points[d.j], labelI: labels[d.i], labelJ: labels[d.j], key: `diag-${d.key}`, i: d.i, j: d.j,
      }))
    : [];

  const cursorDiagPartner = showDiagonals && !closed && !placingLighting && !placingNiche && cursor
    ? relevantDiagonalPartner(points.length, points.length + 1)
    : null;
  const cursorDiagonal: DiagonalHint[] = cursorDiagPartner != null && cursor
    ? [{
        a: points[cursorDiagPartner], b: cursor,
        labelI: labels[cursorDiagPartner], labelJ: pointLabel(points.length), key: 'diag-cursor',
      }]
    : [];

  const dragDiagPartner = showDiagonals && !closed && draggingPoint != null
    ? relevantDiagonalPartner(draggingPoint, points.length)
    : null;
  const dragDiagonal: DiagonalHint[] = dragDiagPartner != null && draggingPoint != null
    ? [{
        a: points[dragDiagPartner], b: points[draggingPoint],
        labelI: labels[dragDiagPartner], labelJ: labels[draggingPoint], key: 'diag-drag',
      }]
    : [];

  const diagonals: DiagonalHint[] = [...closedDiagonals, ...cursorDiagonal, ...dragDiagonal];

  // Diagonals usually cross near their midpoints (always, in a quad), so
  // labels parked at the middle pile up on each other. Slide each label along
  // its own diagonal, away from crossings and labels already placed, but no
  // further than it takes to clear them — stays centred when nothing's near.
  const diagonalLabels = (() => {
    const crossings: Point[] = [];
    for (let i = 0; i < diagonals.length; i++) {
      for (let j = i + 1; j < diagonals.length; j++) {
        const { a: p, b: p2 } = diagonals[i], { a: q, b: q2 } = diagonals[j];
        const rx = p2.x - p.x, ry = p2.y - p.y, sx = q2.x - q.x, sy = q2.y - q.y;
        const den = rx * sy - ry * sx;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((q.x - p.x) * sy - (q.y - p.y) * sx) / den;
        const u = ((q.x - p.x) * ry - (q.y - p.y) * rx) / den;
        if (t > 0.01 && t < 0.99 && u > 0.01 && u < 0.99) crossings.push({ x: p.x + rx * t, y: p.y + ry * t });
      }
    }
    const placed: { p: Point; halfW: number }[] = [];
    return diagonals.map(d => {
      const text = `${d.labelI}–${d.labelJ} ${fmtCm(pxToCm(dist(d.a, d.b)))}`;
      const w = text.length * 5.4 + 8;
      let best = { t: 0.5, score: -Infinity };
      for (let t = 0.25; t <= 0.751; t += 0.025) {
        const p = { x: d.a.x + (d.b.x - d.a.x) * t, y: d.a.y + (d.b.y - d.a.y) * t };
        const clear = Math.min(
          ...crossings.map(c => dist(p, c) / (w / 2 + 6)),
          ...placed.map(o => dist(p, o.p) / (w / 2 + o.halfW + 4)),
        );
        const score = Math.min(clear, 1) - Math.abs(t - 0.5) * 0.01;
        if (score > best.score) best = { t, score };
      }
      const p = { x: d.a.x + (d.b.x - d.a.x) * best.t, y: d.a.y + (d.b.y - d.a.y) * best.t };
      placed.push({ p, halfW: w / 2 });
      return { ...d, text, w, p };
    });
  })();

  const nearStart = !placingLighting && !closed && points.length >= MIN_POINTS && cursor
    ? dist(cursor, points[0]) * viewport.scale < CLOSE_THRESHOLD
    : false;

  const metrics = closed ? computeMetrics(points) : null;

  // Lighting path preview line
  const lastPathPt = inProgressLightingPath[inProgressLightingPath.length - 1];
  const lightPathPreview = placingLighting?.placement === 'path' && lastPathPt && cursor
    ? [lastPathPt, cursor]
    : null;

  // Niche line preview — dashed segment from the last placed point to the
  // (possibly wall-snapped) cursor; the start marker shows where a tap on an
  // empty in-progress path would begin the line.
  const lastNichePt = inProgressNichePath[inProgressNichePath.length - 1];
  const nichePathPreview = placingNiche && lastNichePt && cursor ? [lastNichePt, cursor] : null;
  const nicheStartMarker = placingNiche && inProgressNichePath.length === 0 && cursor && nicheHoverOnWall
    ? cursor
    : null;

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
      return el?.kind === 'path' ? centre(el.points) : null;
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
          {(() => {
            const x0 = Math.floor(-viewport.x / viewport.scale / GRID_SIZE) * GRID_SIZE - GRID_SIZE;
            const y0 = Math.floor(-viewport.y / viewport.scale / GRID_SIZE) * GRID_SIZE - GRID_SIZE;
            const x1 = (width - viewport.x) / viewport.scale + GRID_SIZE;
            const y1 = (height - viewport.y) / viewport.scale + GRID_SIZE;
            const lines = [];
            for (let x = x0; x <= x1; x += GRID_SIZE) {
              lines.push(<Line key={`gv${x}`} points={[x, y0, x, y1]} stroke="rgba(255,255,255,0.06)" strokeWidth={1} listening={false} />);
            }
            for (let y = y0; y <= y1; y += GRID_SIZE) {
              lines.push(<Line key={`gh${y}`} points={[x0, y, x1, y]} stroke="rgba(255,255,255,0.06)" strokeWidth={1} listening={false} />);
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
                fill={fabricSelected ? 'rgba(249,168,37,0.16)' : 'rgba(56,128,255,0.18)'}
                stroke="#3880ff"
                strokeWidth={2}
                onClick={e => pick(e, { kind: 'fabric' })}
                onTap={e => pick(e, { kind: 'fabric' })}
              />
              {fabricSelected && (
                <Line points={outlinePoints(points)} closed stroke={SEL} strokeWidth={3} dash={[10, 6]} listening={false} />
              )}
            </>
          )}

          {/* In-progress polygon */}
          {!closed && points.length > 1 && (
            <Line points={flatPoints(points)} stroke="#3880ff" strokeWidth={2} lineCap="round" lineJoin="round" />
          )}

          {/* Polygon preview line */}
          {previewLine && !closed && (
            <>
              <Line
                points={flatPoints(previewLine)}
                stroke={nearStart ? '#2dd36f' : '#3880ff'}
                strokeWidth={2}
                dash={[6, 4]}
              />
              {dist(previewLine[0], previewLine[1]) > 1 && (
                <Text
                  x={(previewLine[0].x + previewLine[1].x) / 2}
                  y={(previewLine[0].y + previewLine[1].y) / 2}
                  offsetY={16}
                  rotation={-rotation.angle}
                  text={fmtCm(pxToCm(dist(previewLine[0], previewLine[1])))}
                  fontSize={12}
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

          {/* Diagonals with lengths */}
          {diagonalLabels.map(({ a, b, key, text, w, p, i, j }) => {
            const angle = uprightDeg(Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI); // keep text upright, never upside-down
            const h = 13;
            const isSel = selectedDiag != null && selectedDiag.i === i && selectedDiag.j === j;
            const tappable = closed && i != null && j != null;
            return (
              <Group key={key}>
                <Line
                  points={[a.x, a.y, b.x, b.y]}
                  stroke="#F9A825"
                  strokeWidth={isSel ? 4 : 1.5}
                  dash={[8, 6]}
                  opacity={isSel ? 1 : 0.85}
                  shadowColor={isSel ? SEL : undefined}
                  shadowBlur={isSel ? 10 : 0}
                  listening={false}
                />
                {/* Pill sits right on the line so the dashes never run through the text */}
                <Group
                  x={p.x} y={p.y} rotation={angle}
                  listening={tappable}
                  onClick={e => tappable && pick(e, { kind: 'diagonal', i: i!, j: j! })}
                  onTap={e => tappable && pick(e, { kind: 'diagonal', i: i!, j: j! })}
                >
                  <Rect
                    x={-w / 2} y={-h / 2} width={w} height={h} cornerRadius={h / 2}
                    fill="rgba(18,22,38,0.88)" stroke="rgba(249,168,37,0.5)" strokeWidth={0.75}
                  />
                  <Text
                    text={text} x={-w / 2} y={-h / 2} width={w} height={h}
                    align="center" verticalAlign="middle"
                    fontSize={9} fontStyle="bold" fill="#F9A825"
                  />
                  {/* wider invisible target than the pill itself */}
                  <Rect x={-w / 2 - 6} y={-h / 2 - 8} width={w + 12} height={h + 16} fill="transparent" />
                </Group>
              </Group>
            );
          })}

          {/* Segment dimension labels */}
          {segmentLabels.map(seg => seg && (
            <Group
              key={seg.key} x={seg.mx} y={seg.my} rotation={seg.angle}
              onClick={e => pick(e, { kind: 'wall', index: seg.wall })}
              onTap={e => pick(e, { kind: 'wall', index: seg.wall })}
            >
              <Text text={seg.label} fontSize={9} fill={seg.wall === selectedWall ? SEL : '#fff'} fontStyle={seg.wall === selectedWall ? 'bold' : 'normal'} offsetX={seg.label.length * 2.7} offsetY={7} padding={3} />
            </Group>
          ))}

          {/* Selected wall glow */}
          {selectedWall != null && points.length > selectedWall && (() => {
            const a = points[selectedWall], b = points[(selectedWall + 1) % points.length];
            return (
              <Line
                points={[a.x, a.y, ...sampleArc(a, b, a.bulge, 24).flatMap(q => [q.x, q.y])]}
                stroke={SEL} strokeWidth={5} lineCap="round" lineJoin="round"
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
          {wallHitLines.map(w => (
            <Line
              key={`wall-hit-${w.i}`}
              points={w.points}
              stroke="transparent"
              strokeWidth={1}
              hitStrokeWidth={28}
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

          {/* Vertices */}
          {points.map((p, i) => {
            const isSelected = selectedPoint === i;
            const baseRadius = i === 0 && nearStart ? 14 : 7;
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
                    radius={baseRadius + 7}
                    fill="rgba(249,168,37,0.25)"
                    stroke={SEL}
                    strokeWidth={2}
                    listening={false}
                  />
                )}
                <Circle
                  x={p.x} y={p.y}
                  radius={baseRadius}
                  fill={i === 0 ? (nearStart ? '#2dd36f' : '#fff') : '#3880ff'}
                  stroke={isSelected ? SEL : (i === 0 ? '#3880ff' : '#fff')}
                  strokeWidth={isSelected ? 2 : 1}
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
                <Text
                  x={p.x} y={p.y}
                  width={baseRadius * 2} height={baseRadius * 2}
                  offsetX={baseRadius} offsetY={baseRadius}
                  rotation={-rotation.angle}
                  align="center" verticalAlign="middle"
                  text={labels[i]}
                  fontSize={baseRadius + 3} fontStyle="bold"
                  fill={i === 0 && !nearStart ? '#3880ff' : '#fff'}
                  listening={false}
                />
              </Group>
            );
          })}

          {/* ── Placed point lighting elements ── */}
          {(room.lighting ?? []).filter(e => e.kind === 'point').map(e => {
            const el = e as RoomLightingPoint;
            const isSel = selectedLighting === el.id;
            return (
              <Group key={el.id}>
                {isSel && (
                  <Circle
                    x={el.x} y={el.y} radius={18}
                    fill="rgba(249,168,37,0.22)" stroke={SEL} strokeWidth={2}
                    listening={false}
                  />
                )}
                <Circle
                  x={el.x} y={el.y} radius={16}
                  fill="transparent"
                  listening={!placingLighting && !placingNiche}
                  onClick={e => pick(e, { kind: 'light', id: el.id })}
                  onTap={e => pick(e, { kind: 'light', id: el.id })}
                />
                <Text
                  x={el.x} y={el.y}
                  offsetX={10} offsetY={10}
                  rotation={-rotation.angle}
                  text={el.catalogItem.symbol}
                  fontSize={20}
                  fill={lightColor(el.catalogItem.color)}
                  shadowColor="rgba(0,0,0,0.6)" shadowBlur={4}
                  listening={false}
                />
              </Group>
            );
          })}

          {/* ── Placed path lighting elements ── */}
          {(room.lighting ?? []).filter(e => e.kind === 'path').map(e => {
            const el = e as RoomLightingPath;
            const isSel = selectedLighting === el.id;
            return (
              <Line
                key={el.id}
                points={el.points.flatMap(p => [p.x, p.y])}
                stroke={lightColor(el.catalogItem.color)}
                strokeWidth={isSel ? 9 : 5}
                lineCap="round"
                lineJoin="round"
                shadowColor={isSel ? SEL : undefined}
                shadowBlur={isSel ? 12 : 0}
                listening={!placingLighting && !placingNiche}
                hitStrokeWidth={20}
                onClick={e => pick(e, { kind: 'light', id: el.id })}
                onTap={e => pick(e, { kind: 'light', id: el.id })}
              />
            );
          })}

          {/* ── In-progress lighting path ── */}
          {placingLighting?.placement === 'path' && inProgressLightingPath.length > 0 && (
            <>
              <Line
                points={inProgressLightingPath.flatMap(p => [p.x, p.y])}
                stroke={lightColor(placingLighting.color)}
                strokeWidth={5}
                dash={[10, 5]}
                lineCap="round"
                listening={false}
              />
              {inProgressLightingPath.map((p, i) => (
                <Circle key={i} x={p.x} y={p.y} radius={5} fill={lightColor(placingLighting.color)} listening={false} />
              ))}
            </>
          )}

          {/* ── Lighting path preview line (cursor) ── */}
          {lightPathPreview && (
            <Line
              points={lightPathPreview.flatMap(p => [p.x, p.y])}
              stroke={lightColor(placingLighting!.color)}
              strokeWidth={3}
              dash={[6, 4]}
              opacity={0.5}
              listening={false}
            />
          )}

          {/* ── Placed niche lines ── */}
          {(room.selectedNiches ?? []).filter((e): e is RoomNichePath => e.kind === 'path').map(el => {
            const isSel = selectedNicheEl === el.id;
            return (
              <Line
                key={el.id}
                points={el.points.flatMap(p => [p.x, p.y])}
                stroke="#00838F"
                strokeWidth={isSel ? 8 : 4}
                lineCap="round"
                lineJoin="round"
                dash={[14, 6]}
                shadowColor={isSel ? SEL : undefined}
                shadowBlur={isSel ? 12 : 0}
                listening={!placingNiche && !placingLighting}
                hitStrokeWidth={20}
                onClick={e => pick(e, { kind: 'niche', id: el.id })}
                onTap={e => pick(e, { kind: 'niche', id: el.id })}
              />
            );
          })}

          {/* ── In-progress niche line ── */}
          {placingNiche && inProgressNichePath.length > 0 && (
            <>
              <Line
                points={inProgressNichePath.flatMap(p => [p.x, p.y])}
                stroke="#00838F"
                strokeWidth={4}
                dash={[14, 6]}
                lineCap="round"
                listening={false}
              />
              {inProgressNichePath.map((p, i) => (
                <Circle key={i} x={p.x} y={p.y} radius={5} fill="#00838F" listening={false} />
              ))}
            </>
          )}

          {/* ── Niche line preview (cursor) — green once it's over a wall and would finish the line ── */}
          {nichePathPreview && (
            <Line
              points={nichePathPreview.flatMap(p => [p.x, p.y])}
              stroke={nicheHoverOnWall ? '#2dd36f' : '#00838F'}
              strokeWidth={3}
              dash={[6, 4]}
              opacity={0.7}
              listening={false}
            />
          )}

          {/* ── Niche start marker — highlights the wall point a tap would start from ── */}
          {nicheStartMarker && (
            <Circle x={nicheStartMarker.x} y={nicheStartMarker.y} radius={9} fill="#2dd36f" listening={false} />
          )}
          </Group>
        </Layer>
      </Stage>

      {/* Floating undo/redo buttons */}
      <div style={{
        position: 'absolute', top: 10, left: 10,
        display: 'flex', gap: 8,
        pointerEvents: 'auto',
      }}>
        {placingNiche ? (
          <>
            <button onClick={onUndoNichePoint} disabled={!canUndoNiche} style={{ width: 44, height: 44, borderRadius: 14, border: 'none', cursor: canUndoNiche ? 'pointer' : 'default', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', color: canUndoNiche ? '#fff' : 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <IonIcon icon={arrowUndoOutline} style={{ fontSize: 22 }} />
            </button>
            <button onClick={onRedoNichePoint} disabled={!canRedoNiche} style={{ width: 44, height: 44, borderRadius: 14, border: 'none', cursor: canRedoNiche ? 'pointer' : 'default', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', color: canRedoNiche ? '#fff' : 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <IonIcon icon={arrowRedoOutline} style={{ fontSize: 22 }} />
            </button>
          </>
        ) : placingLighting ? (
          <>
            <button onClick={onUndoLightingPoint} disabled={!canUndoLighting} style={{ width: 44, height: 44, borderRadius: 14, border: 'none', cursor: canUndoLighting ? 'pointer' : 'default', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', color: canUndoLighting ? '#fff' : 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <IonIcon icon={arrowUndoOutline} style={{ fontSize: 22 }} />
            </button>
            <button onClick={onRedoLightingPoint} disabled={!canRedoLighting} style={{ width: 44, height: 44, borderRadius: 14, border: 'none', cursor: canRedoLighting ? 'pointer' : 'default', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', color: canRedoLighting ? '#fff' : 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <IonIcon icon={arrowRedoOutline} style={{ fontSize: 22 }} />
            </button>
          </>
        ) : (
          <>
            <button onClick={handleUndoBtn} disabled={!canUndoBtn} style={{ width: 44, height: 44, borderRadius: 14, border: 'none', cursor: canUndoBtn ? 'pointer' : 'default', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', color: canUndoBtn ? '#fff' : 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <IonIcon icon={arrowUndoOutline} style={{ fontSize: 22 }} />
            </button>
            <button onClick={handleRedoBtn} disabled={!canRedoBtn} style={{ width: 44, height: 44, borderRadius: 14, border: 'none', cursor: canRedoBtn ? 'pointer' : 'default', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', color: canRedoBtn ? '#fff' : 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <IonIcon icon={arrowRedoOutline} style={{ fontSize: 22 }} />
            </button>
          </>
        )}
      </div>

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
              {onOpenTemplates && (
                <StartOption
                  icon={appsOutline}
                  color="#8E24AA"
                  title="Готовый шаблон"
                  subtitle="Прямоугольник, буквой Г, П и другие"
                  onClick={onOpenTemplates}
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
              {onOpenManualMeasure && (
                <StartOption
                  icon={keypadOutline}
                  color="#00ACC1"
                  title="Ввести размеры"
                  subtitle="Углы и длины стен вручную"
                  onClick={onOpenManualMeasure}
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
      width: '100%', padding: '10px 12px',
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
      <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{title}</div>
      <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11.5, marginTop: 1 }}>{subtitle}</div>
    </div>
    <IonIcon icon={chevronForwardOutline} style={{ fontSize: 16, color: 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
  </button>
);

export default CeilingCanvas;
