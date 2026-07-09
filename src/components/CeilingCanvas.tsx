import React, { useRef, useState, useEffect, useCallback } from 'react';
import { IonIcon } from '@ionic/react';
import { arrowUndoOutline, arrowRedoOutline, trashOutline, resizeOutline, createOutline, appsOutline, bluetoothOutline, keypadOutline, chevronForwardOutline } from 'ionicons/icons';
import { Stage, Layer, Line, Circle, Text, Group } from 'react-konva';
import Konva from 'konva';
import {
  Point, snapAngle, dist, polygonArea, polygonPerimeter, pxToMeters, pxToCm, fmtCm, pointLabel,
  pointInPolygon, edgeLengthM, polygonDiagonals, GRID_SIZE,
  edgeLen, arcHandlePoint, bulgeFromThreePoints, edgeWouldCrossRoom, sampleArc, tessellateRoom,
  nearestPointOnOutline,
} from '../lib/geometry';

// A wall can bow at most into a full semicircle. Capping here (rather than
// higher) keeps the arc's projection onto its own chord monotonic, so the
// edgeWouldCrossRoom check below can't be fooled by a reflex arc looping
// around a shared corner without technically crossing a wall segment.
const MAX_WALL_BULGE = 1;
import { Room, LightingCatalogItem, RoomLightingPoint, RoomLightingPath, NicheItem, RoomNichePath } from '../types';

const CLOSE_THRESHOLD = 24;
const MIN_POINTS = 3;

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
}

type Tool = 'draw' | 'move';

const lightColor = (color: string) => (color === '#ffffff' ? '#ffeb3b' : color);

const labelOffset = (pts: Point[], p: Point, dist = 18): { ox: number; oy: number } => {
  if (pts.length === 0) return { ox: 10, oy: -18 };
  const cx = pts.reduce((s, q) => s + q.x, 0) / pts.length;
  const cy = pts.reduce((s, q) => s + q.y, 0) / pts.length;
  const dx = p.x - cx;
  const dy = p.y - cy;
  const len = Math.hypot(dx, dy) || 1;
  return { ox: (dx / len) * dist - 6, oy: (dy / len) * dist - 6 };
};

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
}) => {
  const [points, setPoints] = useState<Point[]>(room.points);
  const [closed, setClosed] = useState(room.points.length >= MIN_POINTS);
  const [manualStarted, setManualStarted] = useState(false);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [tool, setTool] = useState<Tool>(room.points.length >= MIN_POINTS ? 'move' : 'draw');
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
  const [draggingPoint, setDraggingPoint] = useState<number | null>(null);
  const [drawRedoStack, setDrawRedoStack] = useState<Point[][]>([]);
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  const [selectedLighting, setSelectedLighting] = useState<string | null>(null);
  const [selectedNicheEl, setSelectedNicheEl] = useState<string | null>(null);
  const [nicheHoverOnWall, setNicheHoverOnWall] = useState(false);
  const [showDiagonals, setShowDiagonals] = useState(false);
  const isDragging = useRef(false);
  const isDraggingPoint = useRef(false);
  const lastTouch = useRef<Point | null>(null);
  const lastMouse = useRef<Point | null>(null);
  const pinchRef = useRef<{ dist: number; mx: number; my: number } | null>(null);
  const isTouching = useRef(false);
  const wallDragOrigin = useRef<Point | null>(null);

  const isClosed = closed || points.length >= MIN_POINTS;

  const fitView = useCallback((pts: Point[]) => {
    if (pts.length === 0) return;
    const xs = pts.map(p => p.x);
    const ys = pts.map(p => p.y);
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

  useEffect(() => {
    if (isDraggingPoint.current) return;
    const pts = room.points;
    setDrawRedoStack([]);
    setPoints(pts);
    setClosed(pts.length >= MIN_POINTS && room.areaSqm > 0);
    setTool(pts.length >= MIN_POINTS && room.areaSqm > 0 ? 'move' : 'draw');
    if (pts.length === 0) setManualStarted(false);
    if (pts.length >= MIN_POINTS) {
      fitView(pts);
    } else {
      setViewport({ x: 0, y: 0, scale: 1 });
    }
  }, [room.id, room.points.length, room.perimeterM, fitView]);

  // Clear cursor when switching lighting item
  useEffect(() => { setCursor(null); setSelectedPoint(null); setSelectedLighting(null); }, [placingLighting?.id]);
  useEffect(() => { setCursor(null); setSelectedPoint(null); setSelectedNicheEl(null); }, [placingNiche?.id]);
  useEffect(() => { if (!closed) setSelectedPoint(null); }, [closed]);

  const toCanvas = useCallback((clientX: number, clientY: number, stageEl: HTMLDivElement): Point => {
    const rect = stageEl.getBoundingClientRect();
    return {
      x: (clientX - rect.left - viewport.x) / viewport.scale,
      y: (clientY - rect.top - viewport.y) / viewport.scale,
    };
  }, [viewport]);

  const snapToGrid = (p: Point): Point => ({
    x: Math.round(p.x / GRID_SIZE) * GRID_SIZE,
    y: Math.round(p.y / GRID_SIZE) * GRID_SIZE,
  });

  const computeMetrics = (pts: Point[]) => {
    const areaPx = polygonArea(pts);
    const perimPx = polygonPerimeter(pts);
    const areaSqm = parseFloat((pxToMeters(Math.sqrt(areaPx), room.scale) ** 2).toFixed(2));
    const perimeterM = parseFloat(pxToMeters(perimPx, room.scale).toFixed(2));
    return { areaSqm, perimeterM };
  };

  const deletePoint = (i: number) => {
    if (points.length <= 3) return;
    const n = points.length;
    const newPts = [...points.slice(0, i), ...points.slice(i + 1)];
    const prevEdgeIdx = (i - 1 + n) % n;
    // Deleting a vertex merges its two adjacent edges into one straight edge —
    // a single arc can't represent the combined shape, so drop any curvature.
    const mergedIdx = i === 0 ? n - 2 : i - 1;
    if (newPts[mergedIdx]?.bulge) newPts[mergedIdx] = { ...newPts[mergedIdx], bulge: 0 };
    const existingSegs = room.profileSegments ?? [];
    const updatedSegs = existingSegs
      .filter(s => s.edgeIndex !== i)
      .map(s => {
        let newIdx = s.edgeIndex;
        if (s.edgeIndex === prevEdgeIdx) {
          newIdx = i === 0 ? n - 2 : i - 1;
        } else if (s.edgeIndex > i) {
          newIdx = s.edgeIndex - 1;
        }
        return { ...s, edgeIndex: newIdx, lengthM: edgeLengthM(newPts, newIdx, room.scale) };
      })
      .sort((a, b) => a.edgeIndex - b.edgeIndex);
    const areaPx = polygonArea(newPts);
    const perimPx = polygonPerimeter(newPts);
    const areaSqm = parseFloat((pxToMeters(Math.sqrt(areaPx), room.scale) ** 2).toFixed(2));
    const perimeterM = parseFloat(pxToMeters(perimPx, room.scale).toFixed(2));
    setPoints(newPts);
    setSelectedPoint(null);
    setDrawRedoStack([]);
    onChange({ points: newPts, profileSegments: updatedSegs, areaSqm, perimeterM });
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
    const snapped = snapToGrid(pt);

    if (points.length >= MIN_POINTS) {
      const first = points[0];
      if (dist(pt, first) * viewport.scale < CLOSE_THRESHOLD) {
        finishPolygon(points);
        return;
      }
    }

    if (points.length > 0) {
      const last = points[points.length - 1];
      const snappedAngle = snapToGrid(snapAngle(last, snapped));
      setDrawRedoStack([]);
      setPoints(prev => [...prev, snappedAngle]);
    } else {
      setDrawRedoStack([]);
      setPoints([snapped]);
    }
  };

  const stageRef = useRef<Konva.Stage>(null);

  const getPointerPos = (e: Konva.KonvaEventObject<TouchEvent | MouseEvent>): Point | null => {
    const stage = stageRef.current;
    if (!stage) return null;
    const pos = stage.getPointerPosition();
    if (!pos) return null;
    return {
      x: (pos.x - viewport.x) / viewport.scale,
      y: (pos.y - viewport.y) / viewport.scale,
    };
  };

  const screenToWorld = (sx: number, sy: number): Point => ({
    x: (sx - viewport.x) / viewport.scale,
    y: (sy - viewport.y) / viewport.scale,
  });

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
    if (e.target !== stageRef.current && tool === 'draw') return;
    if (tool === 'draw') {
      const pos = getPointerPos(e);
      if (pos) handleTap(pos);
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

    if (tool !== 'draw' || points.length === 0 || closed) return;
    const last = points[points.length - 1];
    setCursor(snapToGrid(snapAngle(last, snapToGrid(pos))));
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
      const stage = stageRef.current;
      const rect = stage?.container().getBoundingClientRect();
      pinchRef.current = {
        dist: Math.hypot(
          touches[0].clientX - touches[1].clientX,
          touches[0].clientY - touches[1].clientY,
        ),
        mx: rect ? (touches[0].clientX + touches[1].clientX) / 2 - rect.left : 0,
        my: rect ? (touches[0].clientY + touches[1].clientY) / 2 - rect.top  : 0,
      };
      lastTouch.current = null;
      return;
    }

    if (tool === 'draw' || placingLighting || placingNiche) {
      e.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;
      const pt = { x: (pos.x - viewport.x) / viewport.scale, y: (pos.y - viewport.y) / viewport.scale };
      handleTap(pt);
      // Keep cursor at tap position so the dashed preview appears as soon as
      // the user starts moving toward the next point (on touch, mousemove doesn't fire)
      if (!closed) setCursor(pt);
    } else if (!isDraggingPoint.current) {
      lastTouch.current = { x: touches[0].clientX, y: touches[0].clientY };
    }
  };

  const handleTouchMove = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const touches = e.evt.touches;

    // ── Pinch: zoom anchored to midpoint + pan ──
    if (touches.length === 2 && pinchRef.current) {
      e.evt.preventDefault();
      const newDist = Math.hypot(
        touches[0].clientX - touches[1].clientX,
        touches[0].clientY - touches[1].clientY,
      );
      const ratio = newDist / pinchRef.current.dist;

      const stage = stageRef.current;
      const rect = stage?.container().getBoundingClientRect();
      const mx = rect ? (touches[0].clientX + touches[1].clientX) / 2 - rect.left : pinchRef.current.mx;
      const my = rect ? (touches[0].clientY + touches[1].clientY) / 2 - rect.top  : pinchRef.current.my;
      const pdx = mx - pinchRef.current.mx;
      const pdy = my - pinchRef.current.my;

      setViewport(v => ({
        scale: Math.min(8, Math.max(0.2, v.scale * ratio)),
        x: mx - (mx - v.x) * ratio + pdx,
        y: my - (my - v.y) * ratio + pdy,
      }));

      pinchRef.current = { dist: newDist, mx, my };
      return;
    }

    const stage = stageRef.current;
    if (!stage) return;
    const pos = stage.getPointerPosition();

    if (placingLighting?.placement === 'path' && inProgressLightingPath.length > 0 && touches.length === 1 && pos) {
      setCursor({ x: (pos.x - viewport.x) / viewport.scale, y: (pos.y - viewport.y) / viewport.scale });
      return;
    }

    if (placingNiche && touches.length === 1 && pos) {
      const raw = { x: (pos.x - viewport.x) / viewport.scale, y: (pos.y - viewport.y) / viewport.scale };
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

    if (tool === 'draw' && points.length > 0 && !closed && touches.length === 1) {
      const rect = stage.container().getBoundingClientRect();
      const tx = (touches[0].clientX - rect.left - viewport.x) / viewport.scale;
      const ty = (touches[0].clientY - rect.top  - viewport.y) / viewport.scale;
      const last = points[points.length - 1];
      setCursor(snapToGrid(snapAngle(last, snapToGrid({ x: tx, y: ty }))));
    } else if (tool === 'move' && lastTouch.current && touches.length === 1 && !isDraggingPoint.current) {
      const ddx = touches[0].clientX - lastTouch.current.x;
      const ddy = touches[0].clientY - lastTouch.current.y;
      setViewport(v => ({ ...v, x: v.x + ddx, y: v.y + ddy }));
      lastTouch.current = { x: touches[0].clientX, y: touches[0].clientY };
    }
  };

  const handleTouchEnd = () => {
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
    if (!closed && points.length > 0) {
      localUndoPoint();
    } else {
      onUndo?.();
    }
  };

  const handleRedoBtn = () => {
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

  const segmentLabels = points.map((p, i) => {
    if (i === 0 && !closed) return null;
    const prev = closed && i === 0 ? points[points.length - 1] : points[i - 1];
    if (!prev) return null;
    const mid = arcHandlePoint(prev, p, prev.bulge);
    const d = edgeLen(prev, p, prev.bulge);
    const cm = pxToCm(d, room.scale);
    return { mx: mid.x, my: mid.y, label: fmtCm(cm), key: i };
  }).filter(Boolean);

  // Invisible wide hit-lines along each wall of the closed room — grab and drag
  // anywhere on a wall to bow it into an arc (no visible curvature handle).
  const wallHitLines = isClosed && !placingLighting && !placingNiche ? points.map((a, i) => {
    const b = points[(i + 1) % points.length];
    return { i, a, b, points: [a.x, a.y, ...sampleArc(a, b, a.bulge, 24).flatMap(p => [p.x, p.y])] };
  }) : [];

  const diagonals = showDiagonals && closed && points.length >= 4
    ? polygonDiagonals(points)
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

  // Niche line preview — dashed segment from the last placed point to the
  // (possibly wall-snapped) cursor; the start marker shows where a tap on an
  // empty in-progress path would begin the line.
  const lastNichePt = inProgressNichePath[inProgressNichePath.length - 1];
  const nichePathPreview = placingNiche && lastNichePt && cursor ? [lastNichePt, cursor] : null;
  const nicheStartMarker = placingNiche && inProgressNichePath.length === 0 && cursor && nicheHoverOnWall
    ? cursor
    : null;

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (tool !== 'draw' || points.length === 0 || closed || placingLighting) return;
    if (e.pointerType === 'touch' && pinchRef.current) return; // ignore during pinch
    const stageEl = stageRef.current?.container();
    if (!stageEl) return;
    const rect = stageEl.getBoundingClientRect();
    const tx = (e.clientX - rect.left - viewport.x) / viewport.scale;
    const ty = (e.clientY - rect.top  - viewport.y) / viewport.scale;
    const last = points[points.length - 1];
    setCursor(snapToGrid(snapAngle(last, snapToGrid({ x: tx, y: ty }))));
  };

  return (
    <div
      style={{ position: 'relative', background: '#1a1a2e', overflow: 'hidden' }}
      onPointerMove={handlePointerMove}
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
        onClick={() => { setSelectedPoint(null); setSelectedLighting(null); setSelectedNicheEl(null); }}
        onTap={() => { setSelectedPoint(null); setSelectedLighting(null); setSelectedNicheEl(null); }}
        style={{ cursor: placingNiche ? 'crosshair' : placingLighting ? 'crosshair' : tool === 'draw' ? 'crosshair' : 'grab' }}
      >
        <Layer>
          {/* Grid */}
          {Array.from({ length: Math.ceil(width / GRID_SIZE) + 2 }).map((_, i) => (
            <Line key={`gv${i}`} points={[i * GRID_SIZE, -height, i * GRID_SIZE, height * 2]} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
          ))}
          {Array.from({ length: Math.ceil(height / GRID_SIZE) + 2 }).map((_, i) => (
            <Line key={`gh${i}`} points={[-width, i * GRID_SIZE, width * 2, i * GRID_SIZE]} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
          ))}

          {/* Filled polygon */}
          {closed && points.length > 2 && (
            <Line
              points={outlinePoints(points)}
              closed
              fill="rgba(56,128,255,0.18)"
              stroke="#3880ff"
              strokeWidth={2}
            />
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
              <Text
                x={(previewLine[0].x + previewLine[1].x) / 2}
                y={(previewLine[0].y + previewLine[1].y) / 2 - 16}
                text={fmtCm(pxToCm(dist(previewLine[0], previewLine[1]), room.scale))}
                fontSize={12}
                fontStyle="bold"
                fill={nearStart ? '#2dd36f' : '#fff'}
                shadowColor="rgba(0,0,0,0.9)"
                shadowBlur={4}
                shadowOffsetX={1}
                shadowOffsetY={1}
                listening={false}
              />
            </>
          )}

          {/* Diagonals with lengths */}
          {diagonals.map(([i, j], k) => {
            const a = points[i], b = points[j];
            // Stagger labels along the line so they don't collide at a quad's centre
            // or crowd together on diagonals fanning out of one vertex
            const t = 0.28 + (k % 3) * 0.14;
            const lx = a.x + (b.x - a.x) * t;
            const ly = a.y + (b.y - a.y) * t;
            return (
              <Group key={`diag-${k}`} listening={false}>
                <Line
                  points={[a.x, a.y, b.x, b.y]}
                  stroke="#F9A825"
                  strokeWidth={1.5}
                  dash={[8, 6]}
                  opacity={0.85}
                />
                <Text
                  x={lx} y={ly - 15}
                  text={`${pointLabel(i)}–${pointLabel(j)} ${fmtCm(pxToCm(dist(a, b), room.scale))}`}
                  fontSize={11} fontStyle="bold" fill="#F9A825"
                  shadowColor="rgba(0,0,0,0.9)" shadowBlur={4} shadowOffsetX={1} shadowOffsetY={1}
                />
              </Group>
            );
          })}

          {/* Segment dimension labels */}
          {segmentLabels.map(seg => seg && (
            <Group key={seg.key} x={seg.mx} y={seg.my}>
              <Text text={seg.label} fontSize={11} fill="#fff" offsetX={20} offsetY={8} padding={3} />
            </Group>
          ))}

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
              onTouchStart={() => { isDraggingPoint.current = true; lastTouch.current = null; }}
              onDragStart={e => {
                onVertexDragStart?.();
                setSelectedPoint(null);
                lastMouse.current = null; lastTouch.current = null; isDraggingPoint.current = true;
                wallDragOrigin.current = getPointerPos(e);
              }}
              onDragMove={e => {
                if (!wallDragOrigin.current) return;
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
            return (
              <Group key={i}>
                {isSelected && (
                  <Circle
                    x={p.x} y={p.y}
                    radius={baseRadius + 7}
                    fill="rgba(229,57,53,0.25)"
                    stroke="#E53935"
                    strokeWidth={2}
                    listening={false}
                  />
                )}
                <Circle
                  x={p.x} y={p.y}
                  radius={baseRadius}
                  fill={i === 0 ? (nearStart ? '#2dd36f' : '#fff') : '#3880ff'}
                  stroke={isSelected ? '#E53935' : (i === 0 ? '#3880ff' : '#fff')}
                  strokeWidth={isSelected ? 3 : 2}
                  listening={closed && !placingLighting && !placingNiche}
                  draggable={closed && !placingLighting && !placingNiche}
                  onTouchStart={() => { isDraggingPoint.current = true; lastTouch.current = null; }}
                  onDragStart={() => { onVertexDragStart?.(); setSelectedPoint(null); lastMouse.current = null; lastTouch.current = null; isDraggingPoint.current = true; }}
                  onDragMove={e => {
                    const newPts = [...points];
                    newPts[i] = { ...points[i], x: e.target.x(), y: e.target.y() };
                    setPoints(newPts);
                    const m = computeMetrics(newPts);
                    onChange({ points: newPts, ...m });
                  }}
                  onDragEnd={() => { isDraggingPoint.current = false; onVertexDragEnd?.(); }}
                  onClick={e => {
                    if (closed && !placingLighting) {
                      e.cancelBubble = true;
                      setSelectedLighting(null);
                      setSelectedPoint(prev => prev === i ? null : i);
                    }
                  }}
                  onTap={e => {
                    if (closed && !placingLighting) {
                      e.cancelBubble = true;
                      setSelectedLighting(null);
                      setSelectedPoint(prev => prev === i ? null : i);
                    }
                  }}
                />
                <Text
                  x={p.x + labelOffset(points, p).ox}
                  y={p.y + labelOffset(points, p).oy}
                  text={pointLabel(i)}
                  fontSize={13} fontStyle="bold" fill="#fff"
                  shadowColor="rgba(0,0,0,0.8)" shadowBlur={3} shadowOffsetX={1} shadowOffsetY={1}
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
                    fill="rgba(229,57,53,0.2)" stroke="#E53935" strokeWidth={2}
                    listening={false}
                  />
                )}
                <Circle
                  x={el.x} y={el.y} radius={16}
                  fill="transparent"
                  listening={!placingLighting && !placingNiche}
                  onClick={e => { e.cancelBubble = true; setSelectedPoint(null); setSelectedLighting(isSel ? null : el.id); }}
                  onTap={e => { e.cancelBubble = true; setSelectedPoint(null); setSelectedLighting(isSel ? null : el.id); }}
                />
                <Text
                  x={el.x - 10} y={el.y - 10}
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
                shadowColor={isSel ? '#E53935' : undefined}
                shadowBlur={isSel ? 12 : 0}
                listening={!placingLighting && !placingNiche}
                hitStrokeWidth={20}
                onClick={e => { e.cancelBubble = true; setSelectedPoint(null); setSelectedLighting(isSel ? null : el.id); }}
                onTap={e => { e.cancelBubble = true; setSelectedPoint(null); setSelectedLighting(isSel ? null : el.id); }}
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
                shadowColor={isSel ? '#E53935' : undefined}
                shadowBlur={isSel ? 12 : 0}
                listening={!placingNiche && !placingLighting}
                hitStrokeWidth={20}
                onClick={e => { e.cancelBubble = true; setSelectedPoint(null); setSelectedNicheEl(isSel ? null : el.id); }}
                onTap={e => { e.cancelBubble = true; setSelectedPoint(null); setSelectedNicheEl(isSel ? null : el.id); }}
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

      {/* Diagonals toggle */}
      {closed && points.length >= 4 && !placingLighting && (
        <button
          onClick={() => setShowDiagonals(s => !s)}
          title="Диагонали"
          style={{
            position: 'absolute', top: 10, right: 10,
            width: 44, height: 44, borderRadius: 14, border: 'none',
            cursor: 'pointer',
            background: showDiagonals ? 'rgba(249,168,37,0.92)' : 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(8px)',
            color: showDiagonals ? '#000' : '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <IonIcon icon={resizeOutline} style={{ fontSize: 22 }} />
        </button>
      )}

      {/* Delete point button */}
      {selectedPoint !== null && points.length > 3 && (() => {
        const p = points[selectedPoint];
        const sx = p.x * viewport.scale + viewport.x;
        const sy = p.y * viewport.scale + viewport.y;
        return (
          <button
            onClick={() => deletePoint(selectedPoint)}
            style={{
              position: 'absolute',
              left: sx - 18,
              top: sy - 58,
              width: 36, height: 36,
              borderRadius: '50%',
              background: '#E53935',
              border: 'none',
              cursor: 'pointer',
              color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 10px rgba(229,57,53,0.55)',
              zIndex: 100,
              pointerEvents: 'auto',
            }}
          >
            <IonIcon icon={trashOutline} style={{ fontSize: 18 }} />
          </button>
        );
      })()}

      {/* Delete lighting button */}
      {selectedLighting && !placingLighting && (() => {
        const el = (room.lighting ?? []).find(e => e.id === selectedLighting);
        if (!el) return null;
        let wx: number, wy: number;
        if (el.kind === 'point') {
          wx = (el as RoomLightingPoint).x;
          wy = (el as RoomLightingPoint).y;
        } else {
          const pts = (el as RoomLightingPath).points;
          wx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
          wy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
        }
        const sx = wx * viewport.scale + viewport.x;
        const sy = wy * viewport.scale + viewport.y;
        return (
          <button
            onClick={() => {
              onChange({ lighting: (room.lighting ?? []).filter(e => e.id !== selectedLighting) });
              setSelectedLighting(null);
            }}
            style={{
              position: 'absolute',
              left: sx - 18,
              top: sy - 58,
              width: 36, height: 36,
              borderRadius: '50%',
              background: '#E53935',
              border: 'none',
              cursor: 'pointer',
              color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 10px rgba(229,57,53,0.55)',
              zIndex: 100,
              pointerEvents: 'auto',
            }}
          >
            <IonIcon icon={trashOutline} style={{ fontSize: 18 }} />
          </button>
        );
      })()}

      {/* Delete niche button */}
      {selectedNicheEl && !placingNiche && (() => {
        const el = (room.selectedNiches ?? []).find(e => e.id === selectedNicheEl && e.kind === 'path') as RoomNichePath | undefined;
        if (!el) return null;
        const wx = el.points.reduce((s, p) => s + p.x, 0) / el.points.length;
        const wy = el.points.reduce((s, p) => s + p.y, 0) / el.points.length;
        const sx = wx * viewport.scale + viewport.x;
        const sy = wy * viewport.scale + viewport.y;
        return (
          <button
            onClick={() => {
              onChange({ selectedNiches: (room.selectedNiches ?? []).filter(e => e.id !== selectedNicheEl) });
              setSelectedNicheEl(null);
            }}
            style={{
              position: 'absolute',
              left: sx - 18,
              top: sy - 58,
              width: 36, height: 36,
              borderRadius: '50%',
              background: '#E53935',
              border: 'none',
              cursor: 'pointer',
              color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 10px rgba(229,57,53,0.55)',
              zIndex: 100,
              pointerEvents: 'auto',
            }}
          >
            <IonIcon icon={trashOutline} style={{ fontSize: 18 }} />
          </button>
        );
      })()}

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
