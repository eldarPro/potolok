import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Stage, Layer, Line, Circle, Text, Group, RegularPolygon } from 'react-konva';
import Konva from 'konva';
import { Point, snapAngle, dist, polygonArea, polygonPerimeter, pxToMeters, fmtM } from '../lib/geometry';
import { Room } from '../types';

const CLOSE_THRESHOLD = 24;
const GRID_SIZE = 40;
const MIN_POINTS = 3;

interface Props {
  room: Room;
  onChange: (updated: Partial<Room>) => void;
  width: number;
  height: number;
}

type Tool = 'draw' | 'move';

const CeilingCanvas: React.FC<Props> = ({ room, onChange, width, height }) => {
  const [points, setPoints] = useState<Point[]>(room.points);
  const [closed, setClosed] = useState(room.points.length >= MIN_POINTS);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [tool, setTool] = useState<Tool>(room.points.length >= MIN_POINTS ? 'move' : 'draw');
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [draggingPoint, setDraggingPoint] = useState<number | null>(null);
  const isDragging = useRef(false);
  const lastTouch = useRef<Point | null>(null);
  const pinchDist = useRef<number | null>(null);

  const isClosed = closed || (points.length >= MIN_POINTS);

  useEffect(() => {
    setPoints(room.points);
    setClosed(room.points.length >= MIN_POINTS && room.areaSqm > 0);
    setTool(room.points.length >= MIN_POINTS ? 'move' : 'draw');
  }, [room.id]);

  const toCanvas = useCallback((clientX: number, clientY: number, stageEl: HTMLDivElement): Point => {
    const rect = stageEl.getBoundingClientRect();
    return {
      x: (clientX - rect.left - stagePos.x) / scale,
      y: (clientY - rect.top - stagePos.y) / scale,
    };
  }, [stagePos, scale]);

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

  const finishPolygon = (pts: Point[]) => {
    const metrics = computeMetrics(pts);
    setPoints(pts);
    setClosed(true);
    setTool('move');
    onChange({ points: pts, ...metrics });
  };

  const handleTap = (pt: Point) => {
    if (tool !== 'draw' || closed) return;
    const snapped = snapToGrid(pt);

    if (points.length >= MIN_POINTS) {
      const first = points[0];
      if (dist(snapped, first) < CLOSE_THRESHOLD * 2) {
        finishPolygon(points);
        return;
      }
    }

    if (points.length > 0) {
      const last = points[points.length - 1];
      const snappedAngle = snapAngle(last, snapped);
      setPoints(prev => [...prev, snappedAngle]);
    } else {
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
      x: (pos.x - stagePos.x) / scale,
      y: (pos.y - stagePos.y) / scale,
    };
  };

  const handleStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.target !== stageRef.current && tool === 'draw') return;
    if (tool === 'draw') {
      const pos = getPointerPos(e);
      if (pos) handleTap(pos);
    }
  };

  const handleStageMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (tool !== 'draw' || points.length === 0 || closed) return;
    const pos = getPointerPos(e);
    if (!pos) return;
    const last = points[points.length - 1];
    setCursor(snapAngle(last, snapToGrid(pos)));
  };

  // Touch handlers for draw tool
  const handleTouchStart = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const touches = e.evt.touches;
    if (touches.length === 2) {
      pinchDist.current = Math.hypot(
        touches[0].clientX - touches[1].clientX,
        touches[0].clientY - touches[1].clientY
      );
      return;
    }
    if (tool === 'draw') {
      e.evt.preventDefault();
      const t = touches[0];
      const stage = stageRef.current;
      if (!stage) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;
      const pt = { x: (pos.x - stagePos.x) / scale, y: (pos.y - stagePos.y) / scale };
      handleTap(pt);
    } else {
      lastTouch.current = { x: touches[0].clientX, y: touches[0].clientY };
    }
  };

  const handleTouchMove = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const touches = e.evt.touches;
    if (touches.length === 2 && pinchDist.current !== null) {
      e.evt.preventDefault();
      const newDist = Math.hypot(
        touches[0].clientX - touches[1].clientX,
        touches[0].clientY - touches[1].clientY
      );
      const ratio = newDist / pinchDist.current;
      setScale(s => Math.min(4, Math.max(0.3, s * ratio)));
      pinchDist.current = newDist;
      return;
    }
    if (tool === 'draw' && points.length > 0 && !closed) {
      const t = touches[0];
      const stage = stageRef.current;
      if (!stage) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;
      const pt = { x: (pos.x - stagePos.x) / scale, y: (pos.y - stagePos.y) / scale };
      const last = points[points.length - 1];
      setCursor(snapAngle(last, snapToGrid(pt)));
    } else if (tool === 'move' && lastTouch.current && touches.length === 1) {
      const dx = touches[0].clientX - lastTouch.current.x;
      const dy = touches[0].clientY - lastTouch.current.y;
      setStagePos(p => ({ x: p.x + dx, y: p.y + dy }));
      lastTouch.current = { x: touches[0].clientX, y: touches[0].clientY };
    }
  };

  const handleTouchEnd = () => {
    pinchDist.current = null;
    lastTouch.current = null;
  };

  const handleReset = () => {
    setPoints([]);
    setClosed(false);
    setCursor(null);
    setTool('draw');
    onChange({ points: [], areaSqm: 0, perimeterM: 0 });
  };

  const handleUndoPoint = () => {
    if (closed) {
      setClosed(false);
      setTool('draw');
      return;
    }
    setPoints(prev => prev.slice(0, -1));
  };

  // Build flat array for Konva Line
  const flatPoints = (pts: Point[]) => pts.flatMap(p => [p.x, p.y]);

  const previewLine = cursor && points.length > 0 ? [
    points[points.length - 1],
    cursor,
  ] : null;

  // Dimension label for each segment
  const segmentLabels = points.map((p, i) => {
    if (i === 0 && !closed) return null;
    const prev = closed && i === 0 ? points[points.length - 1] : points[i - 1];
    if (!prev) return null;
    const mx = (p.x + prev.x) / 2;
    const my = (p.y + prev.y) / 2;
    const d = dist(p, prev);
    const m = pxToMeters(d, room.scale);
    return { mx, my, label: fmtM(m), key: i };
  }).filter(Boolean);

  const nearStart = !closed && points.length >= MIN_POINTS && cursor
    ? dist(cursor, points[0]) < CLOSE_THRESHOLD * 2
    : false;

  const metrics = closed ? computeMetrics(points) : null;

  return (
    <div style={{ position: 'relative', background: '#1a1a2e', borderRadius: 12, overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 12px', background: 'rgba(0,0,0,0.4)', alignItems: 'center' }}>
        <button
          onClick={() => setTool(t => t === 'draw' ? 'move' : 'draw')}
          style={{
            padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            background: tool === 'draw' ? '#3880ff' : 'rgba(255,255,255,0.15)',
            color: '#fff',
          }}
        >
          {tool === 'draw' ? '✏️ Рисую' : '✋ Перемещение'}
        </button>
        <div style={{ flex: 1 }} />
        {points.length > 0 && (
          <button onClick={handleUndoPoint} style={{ padding: '6px 10px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 13, background: 'rgba(255,255,255,0.15)', color: '#fff' }}>
            ↩ Отмена
          </button>
        )}
        {points.length > 0 && (
          <button onClick={handleReset} style={{ padding: '6px 10px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 13, background: 'rgba(220,50,50,0.6)', color: '#fff' }}>
            🗑
          </button>
        )}
      </div>

      <Stage
        ref={stageRef}
        width={width}
        height={height}
        x={stagePos.x}
        y={stagePos.y}
        scaleX={scale}
        scaleY={scale}
        onMouseMove={handleStageMouseMove}
        onMouseDown={handleStageMouseDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ cursor: tool === 'draw' ? 'crosshair' : 'grab' }}
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
              points={flatPoints(points)}
              closed
              fill="rgba(56,128,255,0.18)"
              stroke="#3880ff"
              strokeWidth={2}
            />
          )}

          {/* In-progress polygon */}
          {!closed && points.length > 1 && (
            <Line
              points={flatPoints(points)}
              stroke="#3880ff"
              strokeWidth={2}
              lineCap="round"
              lineJoin="round"
            />
          )}

          {/* Preview line while moving finger */}
          {previewLine && !closed && (
            <Line
              points={flatPoints(previewLine)}
              stroke={nearStart ? '#2dd36f' : '#3880ff'}
              strokeWidth={2}
              dash={[6, 4]}
            />
          )}

          {/* Dimension labels on segments */}
          {segmentLabels.map(seg => seg && (
            <Group key={seg.key} x={seg.mx} y={seg.my}>
              <Text
                text={seg.label}
                fontSize={11}
                fill="#fff"
                offsetX={20}
                offsetY={8}
                padding={3}
              />
            </Group>
          ))}

          {/* Vertices */}
          {points.map((p, i) => (
            <Circle
              key={i}
              x={p.x}
              y={p.y}
              radius={i === 0 && nearStart ? 14 : 7}
              fill={i === 0 ? (nearStart ? '#2dd36f' : '#fff') : '#3880ff'}
              stroke={i === 0 ? '#3880ff' : '#fff'}
              strokeWidth={2}
              draggable={closed}
              onDragMove={e => {
                const newPts = [...points];
                newPts[i] = { x: e.target.x(), y: e.target.y() };
                setPoints(newPts);
                const m = computeMetrics(newPts);
                onChange({ points: newPts, ...m });
              }}
            />
          ))}

          {/* Area label in center */}
          {closed && metrics && (
            <Text
              x={points.reduce((s, p) => s + p.x, 0) / points.length - 40}
              y={points.reduce((s, p) => s + p.y, 0) / points.length - 10}
              text={`${metrics.areaSqm.toFixed(2)} м²`}
              fontSize={16}
              fontStyle="bold"
              fill="#fff"
            />
          )}
        </Layer>
      </Stage>

      {/* Hint */}
      <div style={{ padding: '6px 12px', background: 'rgba(0,0,0,0.4)', fontSize: 12, color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>
        {closed
          ? `Площадь: ${metrics?.areaSqm.toFixed(2)} м²  ·  Периметр: ${metrics?.perimeterM.toFixed(2)} м`
          : points.length === 0
            ? 'Тапайте по экрану чтобы добавить точки контура'
            : points.length < MIN_POINTS
              ? `Добавьте ещё ${MIN_POINTS - points.length} точки`
              : 'Тапните на первую точку чтобы замкнуть контур'
        }
      </div>
    </div>
  );
};

export default CeilingCanvas;
