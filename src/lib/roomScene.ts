// Renders a room's drawing as a 3D sketch (three.js): walls extruded from the
// outline, the stretch ceiling in the fabric's colour, every light fixture and
// curtain niche at its drawn position. The sketch is then handed to the image
// model as the base image, so the AI only has to make it photorealistic and
// the layout comes straight from the drawing.
//
// Loaded lazily (dynamic import) — three.js is heavy and only this screen needs it.

import * as THREE from 'three';
import { Room, LightingType } from '../types';
import { Point, tessellateRoom, pointInPolygon, pxToMeters } from './geometry';

/** Not stored per room yet — a typical apartment ceiling */
export const DEFAULT_CEILING_HEIGHT_M = 2.7;

const WIDTH = 1280;
const HEIGHT = 960;
const EYE_HEIGHT_M = 1.5;
const MAX_POINT_LIGHTS = 12;

const isGlossy = (title: string) => /глянц|лак|gloss|lack|brillant|brill|parlak|połysk/i.test(title);

const toM = (p: { x: number; y: number }): Point => ({ x: pxToMeters(p.x), y: pxToMeters(p.y) });

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

function distToOutline(p: Point, outline: Point[]): number {
  let d = Infinity;
  for (let i = 0; i < outline.length - 1; i++) d = Math.min(d, distToSegment(p, outline[i], outline[i + 1]));
  return d;
}

/** The interior point farthest from every wall — a "centre" that stays inside L/U-shaped rooms too. */
function roomCentre(outline: Point[]): Point {
  const xs = outline.map(p => p.x), ys = outline.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const steps = 40;
  let best: Point = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  let bestD = -1;
  for (let i = 1; i < steps; i++) {
    for (let j = 1; j < steps; j++) {
      const p = { x: minX + (maxX - minX) * i / steps, y: minY + (maxY - minY) * j / steps };
      if (!pointInPolygon(p, outline)) continue;
      const d = distToOutline(p, outline);
      if (d > bestD) { bestD = d; best = p; }
    }
  }
  return best;
}

function segmentInside(a: Point, b: Point, outline: Point[]): boolean {
  for (let t = 0.05; t < 1; t += 0.05) {
    if (!pointInPolygon({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, outline)) return false;
  }
  return true;
}

/** Stand in the corner with the longest clear view of the centre, a step out from the walls. */
function cameraSpot(corners: Point[], outline: Point[], centre: Point): Point {
  let best: Point | null = null;
  let bestD = -1;
  for (const c of corners) {
    const d = Math.hypot(centre.x - c.x, centre.y - c.y);
    if (d < 0.5) continue;
    const ux = (centre.x - c.x) / d, uy = (centre.y - c.y) / d;
    const p = { x: c.x + ux * 0.45, y: c.y + uy * 0.45 };
    if (!pointInPolygon(p, outline) || !segmentInside(p, centre, outline)) continue;
    if (d > bestD) { bestD = d; best = p; }
  }
  return best ?? centre;
}

/** Soft radial glow sprite — makes fixtures read as "lit" to the image model. */
function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,248,225,1)');
  gr.addColorStop(0.18, 'rgba(255,240,200,0.75)');
  gr.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Glow across a band's width (v axis), uniform along it — for LED strips/lines */
function bandGlowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 64);
  gr.addColorStop(0, 'rgba(255,240,200,0)');
  gr.addColorStop(0.5, 'rgba(255,245,215,1)');
  gr.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Plan (x, y) in meters → world; plan y runs along world z. */
const v3 = (p: Point, h: number) => new THREE.Vector3(p.x, h, p.y);

/** A flat band lying in the ceiling plane along a polyline (LED lines, niche gaps). */
function ceilingBand(path: Point[], width: number, h: number, material: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-3) continue;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len + width, width), material);
    m.rotation.x = Math.PI / 2;
    m.rotation.z = Math.atan2(b.y - a.y, b.x - a.x);
    m.position.set((a.x + b.x) / 2, h, (a.y + b.y) / 2);
    group.add(m);
  }
  return group;
}

export interface RoomSceneOptions {
  ceilingHeightM?: number;
}

/** Render the room sketch; resolves to a JPEG data URL. Throws if the room has no closed outline. */
export async function renderRoomScene(room: Room, opts: RoomSceneOptions = {}): Promise<string> {
  if (room.points.length < 3) throw new Error('room has no outline');
  const H = opts.ceilingHeightM ?? DEFAULT_CEILING_HEIGHT_M;

  const outline = tessellateRoom(room.points, true, 16).map(toM);
  const corners = room.points.map(toM);
  const centre = roomCentre(outline);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#d9d4cc');

  // ── Shell: floor, walls, ceiling ──
  const shape = new THREE.Shape(outline.map(p => new THREE.Vector2(p.x, p.y)));

  const floor = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshStandardMaterial({ color: '#a88b6c', roughness: 0.8, side: THREE.DoubleSide }),
  );
  floor.rotation.x = Math.PI / 2; // shape XY → world XZ (y → +z)
  scene.add(floor);

  const fabricColor = room.fabric?.color || '#f5f5f5';
  const glossy = isGlossy(room.fabric?.title ?? '');
  const ceiling = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshStandardMaterial({
      color: fabricColor,
      roughness: glossy ? 0.12 : 0.95,
      metalness: glossy ? 0.25 : 0,
      side: THREE.DoubleSide,
    }),
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = H;
  scene.add(ceiling);

  const wallMat = new THREE.MeshStandardMaterial({ color: '#ebe6df', roughness: 0.9, side: THREE.DoubleSide });
  const edgeMat = new THREE.LineBasicMaterial({ color: '#b9b2a8' });
  for (let i = 0; i < outline.length - 1; i++) {
    const a = outline[i], b = outline[i + 1];
    const geo = new THREE.BufferGeometry().setFromPoints([v3(a, 0), v3(b, 0), v3(b, H), v3(a, 0), v3(b, H), v3(a, H)]);
    geo.computeVertexNormals();
    scene.add(new THREE.Mesh(geo, wallMat));
  }
  // Wall/ceiling junction and real corners as thin lines — keeps the shape crisp for the model
  scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(outline.map(p => v3(p, H - 0.003))), edgeMat));
  for (const c of corners) {
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([v3(c, 0), v3(c, H)]), edgeMat));
  }

  // ── Base light: dim, so fixtures stand out ──
  scene.add(new THREE.HemisphereLight('#ffffff', '#8a7a68', 0.65));
  scene.add(new THREE.AmbientLight('#ffffff', 0.2));

  // ── Curtain niches: a dark gap in the ceiling along the drawn line ──
  const nicheMat = new THREE.MeshBasicMaterial({ color: '#3a3836', side: THREE.DoubleSide });
  for (const n of room.selectedNiches) {
    if (n.kind !== 'path' || n.points.length < 2) continue;
    scene.add(ceilingBand(n.points.map(toM), 0.15, H - 0.004, nicheMat));
  }

  // ── Lighting ──
  const glow = glowTexture();
  const glowMat = new THREE.SpriteMaterial({ map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const haloMat = new THREE.MeshBasicMaterial({
    map: glow, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const emissive = new THREE.MeshBasicMaterial({ color: '#fffbe8', side: THREE.DoubleSide });
  const railMat = new THREE.MeshStandardMaterial({ color: '#1e1e1e', roughness: 0.5 });
  const stripGlowMat = new THREE.MeshBasicMaterial({
    map: bandGlowTexture(), transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  let pointLights = 0;

  const addPointLight = (p: Point, h: number, intensity: number) => {
    if (pointLights >= MAX_POINT_LIGHTS) return;
    const l = new THREE.PointLight('#ffe9c4', intensity, 4.5, 1.6);
    l.position.copy(v3(p, h));
    scene.add(l);
    pointLights++;
  };
  /** Glow around a hanging fixture (camera-facing) */
  const addGlow = (p: Point, h: number, size: number) => {
    const s = new THREE.Sprite(glowMat);
    s.position.copy(v3(p, h));
    s.scale.set(size, size, 1);
    scene.add(s);
  };
  /** Light pool lying flat on the ceiling — a sprite there would be cut in half by the ceiling plane */
  const haloGeo = new THREE.PlaneGeometry(1, 1);
  const addHalo = (p: Point, size: number) => {
    const m = new THREE.Mesh(haloGeo, haloMat);
    m.rotation.x = Math.PI / 2;
    m.position.copy(v3(p, H - 0.008));
    m.scale.set(size, size, 1);
    scene.add(m);
  };

  const addPoint = (p: Point, type: LightingType) => {
    if (type === 'chandelier') {
      const drop = 0.45;
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, drop), railMat);
      cord.position.copy(v3(p, H - drop / 2));
      scene.add(cord);
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.18, 24, 16), emissive);
      body.position.copy(v3(p, H - drop - 0.12));
      scene.add(body);
      addGlow(p, H - drop - 0.12, 1.2);
      addPointLight(p, H - drop - 0.3, 3);
    } else if (type === 'track_spot') {
      const spot = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 16), railMat);
      spot.position.copy(v3(p, H - 0.1));
      scene.add(spot);
      addGlow(p, H - 0.18, 0.25);
      addPointLight(p, H - 0.3, 1.2);
    } else {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.045, 24), emissive);
      disc.rotation.x = Math.PI / 2;
      disc.position.copy(v3(p, H - 0.005));
      scene.add(disc);
      addHalo(p, 0.32);
      addPointLight(p, H - 0.25, 1.2);
    }
  };

  for (const el of room.lighting) {
    const type = el.catalogItem.type;
    if (el.kind === 'point') {
      addPoint(toM(el), type);
      continue;
    }
    const path = el.points.map(toM);
    if (path.length < 2) continue;
    if (type === 'track' || type === 'track_spot') {
      scene.add(ceilingBand(path, 0.04, H - 0.01, railMat));
      if (type === 'track_spot') {
        // a few heads spread along the track
        for (let i = 0; i < path.length - 1; i++) {
          const a = path[i], b = path[i + 1];
          const k = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 0.8));
          for (let j = 0; j < k; j++) {
            const t = (j + 0.5) / k;
            addPoint({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, 'track_spot');
          }
        }
      }
    } else {
      // strip / line: a glowing band inside a soft glow band
      scene.add(ceilingBand(path, type === 'strip' ? 0.03 : 0.05, H - 0.006, emissive));
      scene.add(ceilingBand(path, 0.22, H - 0.009, stripGlowMat));
      for (let i = 0; i < path.length - 1; i++) {
        const a = path[i], b = path[i + 1];
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        addPointLight(mid, H - 0.2, 0.8);
      }
    }
  }

  // ── Camera: from a corner at eye height, looking up at the room's centre ──
  const eye = cameraSpot(corners, outline, centre);
  const camera = new THREE.PerspectiveCamera(75, WIDTH / HEIGHT, 0.05, 100);
  camera.position.copy(v3(eye, EYE_HEIGHT_M));
  const lookDist = Math.hypot(centre.x - eye.x, centre.y - eye.y);
  // aim past the centre so the far walls are framed, tilted up towards the ceiling
  camera.lookAt(v3(
    { x: eye.x + (centre.x - eye.x) * 1.4, y: eye.y + (centre.y - eye.y) * 1.4 },
    EYE_HEIGHT_M + Math.min(1.0, lookDist * 0.4),
  ));

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  try {
    renderer.setSize(WIDTH, HEIGHT, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/jpeg', 0.9);
  } finally {
    renderer.dispose();
    renderer.forceContextLoss();
    glow.dispose();
  }
}

/** Prompt for turning the sketch into a photo — lists what's in the drawing so the model keeps it. */
export function drawingPrompt(room: Room): string {
  const counts = new Map<string, number>();
  for (const el of room.lighting) {
    const title = el.catalogItem.title;
    counts.set(title, (counts.get(title) ?? 0) + (el.kind === 'point' ? 1 : 0));
  }
  const lights = [...counts.entries()]
    .map(([title, n]) => (n > 0 ? `${title} — ${n} шт.` : title))
    .join(', ');
  const fabric = room.fabric?.title;
  const niches = room.selectedNiches.some(n => n.kind === 'path');

  return [
    'Это 3D-эскиз комнаты с натяжным потолком. Преврати его в фотореалистичную фотографию интерьера современной квартиры.',
    'Строго сохрани ракурс камеры, форму комнаты и потолка, а также точное количество и расположение каждого светильника — ничего не добавляй на потолок и не убирай.',
    fabric ? `Потолок — натяжное полотно «${fabric}».` : '',
    lights ? `Освещение на потолке: ${lights}. Светильники включены.` : '',
    niches ? 'Тёмная полоса у стены — скрытая ниша для штор, добавь в неё шторы.' : '',
    'Стены, пол, окна и мебель сделай реалистичными и уместными для комнаты «' + room.name + '».',
  ].filter(Boolean).join(' ');
}
