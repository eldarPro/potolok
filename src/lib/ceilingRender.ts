// The «Визуал» view: the ceiling as it will look in life, rendered with three.js
// and laid onto the drawing as a picture.
//
// The camera stands in the room at eye height and looks straight up. The
// ceiling plane is square to the view, so it lands on the plan without any
// distortion — the picture lies exactly over the outline — while gloss and
// satin reflect the room the way they would for someone standing there.
// Fixtures hanging below the ceiling are moved along the line of sight so they,
// too, land on their place in the plan.
//
// Loaded lazily (dynamic import) — three.js is heavy and only this view needs it.

import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CatalogItem, Room, RoomLightingPoint } from '../types';
import { Point, tessellateRoom, sampleArc, pxToMeters, pxToCm } from './geometry';
import { nicheShape, crossBand } from './nicheGeometry';
import { trackSpotAim, bareTracks } from './lightGlow';
import { fabricFinish, profileKind, hexRgb } from './fabric';
import { roomCentre, DEFAULT_CEILING_HEIGHT_M } from './roomScene';

const EYE_M = 1.5;
/** A side of the picture never goes past this (phone GPUs, memory) */
export const MAX_SIDE_PX = 2048;
/** The room with its lights off: dim enough for the glow of the lights to show */
export const DUSK = 0.45;
/** The layer the picture's camera sees: all but the walls */
const SEEN = 2;
const MAX_SPOTLIGHTS = 24;
const MAX_POINTLIGHTS = 24;
const MAX_AREALIGHTS = 40;

const PX_PER_M = 1 / pxToMeters(1);
const toM = (p: { x: number; y: number }): Point => ({ x: pxToMeters(p.x), y: pxToMeters(p.y) });
const cm2px = (cm: number) => cm / pxToCm(1);

/** A rectangle on the drawing, in drawing (world) px */
export interface WorldRect { x: number; y: number; width: number; height: number }

export interface CeilingImage extends WorldRect {
  canvas: HTMLCanvasElement;
  /** picture px per meter it was rendered at */
  pxPerM: number;
}

export interface CeilingRenderOptions {
  /** picture px per meter wanted (capped so no side passes MAX_SIDE_PX) */
  pxPerM: number;
  /** only this part of the drawing (world px) — for a sharp close-up when zoomed in */
  region?: WorldRect;
  /** shown on walls with no profile chosen yet */
  defaultProfile?: CatalogItem | null;
  /** the room's lights as three.js lights; off — the fabric alone, evenly lit
   * at dusk, for the drawing's own glow of the lights to go over it */
  lights?: boolean;
  /** how bright the room is with its lights off (hemisphere light) */
  ambient?: number;
}

let sharedRenderer: THREE.WebGLRenderer | null = null;
function getRenderer(): THREE.WebGLRenderer {
  if (!sharedRenderer) {
    sharedRenderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    sharedRenderer.setPixelRatio(1);
    sharedRenderer.toneMapping = THREE.AgXToneMapping;
    sharedRenderer.toneMappingExposure = 1.25;
    sharedRenderer.shadowMap.enabled = true;
    sharedRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    RectAreaLightUniformsLib.init();
  }
  return sharedRenderer;
}

/** Turns `obj` so its local x runs along `along` and its front (−z) faces `facing` */
function orient(obj: THREE.Object3D, along: THREE.Vector3, facing: THREE.Vector3) {
  const x = along.clone().normalize();
  const z = facing.clone().normalize().negate();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  x.crossVectors(y, z);
  obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/** Price-list colours are often a tint to tell items apart in a list — near-white is white */
function fabricColour(hex: string | undefined): THREE.Color {
  const [r, g, b] = hexRgb(hex);
  return Math.min(r, g, b) >= 215 ? new THREE.Color('#ffffff') : new THREE.Color(hex!);
}

/** Renders the room's ceiling; null when the room has no outline */
export function renderCeiling(room: Room, opts: CeilingRenderOptions): CeilingImage | null {
  if (room.points.length < 3) return null;
  const H = DEFAULT_CEILING_HEIGHT_M;
  const d = H - EYE_M;

  let outline = tessellateRoom(room.points, true, 16).map(toM);
  const first = outline[0], last = outline[outline.length - 1];
  if (outline.length > 3 && Math.hypot(first.x - last.x, first.y - last.y) < 1e-6) outline = outline.slice(0, -1);
  const outlinePx = tessellateRoom(room.points, true, 16);
  const E = roomCentre([...outline, outline[0]]);
  /** where a thing hanging `drop` m below the ceiling goes, so it is seen over plan point p */
  const hang = (p: Point, drop: number): Point => ({ x: E.x + (p.x - E.x) * (d - drop) / d, y: E.y + (p.y - E.y) * (d - drop) / d });
  const v3 = (p: Point, h: number) => new THREE.Vector3(p.x, h, p.y);

  // outline turning: inward normal of a run a → b
  let area2 = 0;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length];
    area2 += a.x * b.y - b.x * a.y;
  }
  const inward = (a: Point, b: Point): Point => {
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const n = { x: -(b.y - a.y) / L, y: (b.x - a.x) / L };
    return area2 > 0 ? n : { x: -n.x, y: -n.y };
  };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#000000');
  const shape = new THREE.Shape(outline.map(p => new THREE.Vector2(p.x, p.y)));
  const flat = (geo: THREE.BufferGeometry, mat: THREE.Material, y: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = Math.PI / 2; // shape XY → world XZ, facing down
    m.position.y = y;
    return m;
  };

  /** A box lying along a → b at height y (its centre), `w` wide, `h` thick, `off` m into the room */
  const along = (a: Point, b: Point, w: number, h: number, y: number, mat: THREE.Material, off = 0) => {
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 1e-4) return null;
    const n = inward(a, b);
    // local x along the run, y across it, z vertical
    const m = new THREE.Mesh(new THREE.BoxGeometry(L, w, h), mat);
    m.position.set((a.x + b.x) / 2 + n.x * off, y, (a.y + b.y) / 2 + n.y * off);
    orient(m, new THREE.Vector3(b.x - a.x, 0, b.y - a.y), new THREE.Vector3(0, -1, 0));
    scene.add(m);
    return m;
  };
  /** A box along a free path (not tied to a wall) */
  const bar = (a: Point, b: Point, w: number, h: number, y: number, mat: THREE.Material) => {
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 1e-4) return;
    const m = new THREE.Mesh(new THREE.BoxGeometry(L, h, w), mat);
    m.position.set((a.x + b.x) / 2, y, (a.y + b.y) / 2);
    m.rotation.y = -Math.atan2(b.y - a.y, b.x - a.x);
    scene.add(m);
  };

  // ── Room shell: parquet floor, painted walls with skirting, so gloss has something to mirror ──
  scene.add(flat(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ color: '#8c7560', roughness: 0.55, side: THREE.DoubleSide }), 0));
  const wallMat = new THREE.MeshStandardMaterial({ color: '#e6e0d6', roughness: 0.92, side: THREE.DoubleSide });
  const skirtMat = new THREE.MeshStandardMaterial({ color: '#f2efe9', roughness: 0.6 });
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length];
    const g = new THREE.BufferGeometry().setFromPoints([v3(a, 0), v3(b, 0), v3(b, H), v3(a, 0), v3(b, H), v3(a, H)]);
    g.computeVertexNormals();
    const wall = new THREE.Mesh(g, wallMat);
    wall.userData.wall = true;
    scene.add(wall);
    along(a, b, 0.015, 0.07, 0.035, skirtMat, 0.008);
  }

  // ── The fabric ──
  const finish = fabricFinish(room.fabric);
  const ceilMat = new THREE.MeshPhysicalMaterial({
    color: fabricColour(room.fabric?.color), side: THREE.DoubleSide,
    roughness: { matte: 0.95, satin: 0.38, gloss: 0.22 }[finish],
    specularIntensity: finish === 'matte' ? 0.2 : 1,
    ior: finish === 'satin' ? 1.7 : 1.5,
    envMapIntensity: finish === 'satin' ? 1.2 : 0.4,
  });
  const ceiling = flat(new THREE.ShapeGeometry(shape), ceilMat, H + 0.0006);
  scene.add(ceiling);
  let reflector: Reflector | null = null;

  // ── Profiles where the fabric meets the wall ──
  const segs = room.profileSegments ?? [];
  const n = room.points.length;
  const insertMat = new Map<string, THREE.Material>();
  const gapMat = new THREE.MeshBasicMaterial({ color: '#000000' });
  const ledMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.35, 1.0) });
  let areaLights = 0;
  const addArea = (color: string, intensity: number, w: number, h: number, pos: THREE.Vector3, dir: THREE.Vector3, facing: THREE.Vector3) => {
    if (areaLights >= MAX_AREALIGHTS || w < 1e-3) return;
    const l = new THREE.RectAreaLight(color, intensity, w, h);
    l.position.copy(pos);
    orient(l, dir, facing);
    scene.add(l);
    areaLights++;
  };
  for (let i = 0; i < n; i++) {
    const prof = segs.find(s => s.edgeIndex === i)?.profile ?? opts.defaultProfile ?? null;
    const kind = prof ? profileKind(prof) : 'standard';
    const colour = prof?.color ?? '#ffffff';
    const a0 = room.points[i], b0 = room.points[(i + 1) % n];
    const run = [a0, ...sampleArc(a0, b0, a0.bulge, 16)].map(toM);
    // arcs: geometry follows every piece, lights take a few longer pieces
    const lightRun = [a0, ...sampleArc(a0, b0, a0.bulge, 4)].map(toM);
    for (let k = 0; k < run.length - 1; k++) {
      const a = run[k], b = run[k + 1];
      if (kind === 'standard') {
        if (!insertMat.has(colour)) insertMat.set(colour, new THREE.MeshStandardMaterial({ color: colour, roughness: 0.45 }));
        along(a, b, 0.012, 0.005, H - 0.0025, insertMat.get(colour)!, 0.006);
      } else if (kind === 'shadow') {
        along(a, b, 0.010, 0.0005, H - 0.0003, gapMat, 0.005);
      } else if (kind === 'floating') {
        along(a, b, 0.010, 0.0005, H - 0.0003, ledMat, 0.005);
      }
    }
    if (kind === 'floating') {
      for (let k = 0; k < lightRun.length - 1; k++) {
        const a = lightRun[k], b = lightRun[k + 1], nn = inward(a, b), L = Math.hypot(b.x - a.x, b.y - a.y);
        const mid = { x: (a.x + b.x) / 2 + nn.x * 0.01, y: (a.y + b.y) / 2 + nn.y * 0.01 };
        const dir = new THREE.Vector3(b.x - a.x, 0, b.y - a.y);
        // down onto the wall, and a softer wash back along the fabric's edge
        addArea('#ffd6a0', 6, L, 0.02, v3(mid, H - 0.005), dir, new THREE.Vector3(-nn.x, -1, -nn.y));
        addArea('#ffd6a0', 1.6, L, 0.02, v3(mid, H - 0.03), dir, new THREE.Vector3(nn.x * 0.3, 1, nn.y * 0.3));
      }
    }
  }

  // ── Niches: the fabric stops short of the wall, a dark recess with the track in it ──
  const recessMat = new THREE.MeshStandardMaterial({ color: '#161514', roughness: 1, side: THREE.DoubleSide });
  const trackMat = new THREE.MeshStandardMaterial({ color: '#d9d9d9', roughness: 0.4, metalness: 0.3 });
  const recess = (poly: Point[]) => {
    if (poly.length < 3) return;
    const s = new THREE.Shape(poly.map(p => { const m = toM(p); return new THREE.Vector2(m.x, m.y); }));
    scene.add(flat(new THREE.ShapeGeometry(s), recessMat, H - 0.0015));
  };
  const rail = (path: Point[], curtain: boolean) => {
    if (!curtain) return;
    const ps = path.map(toM);
    for (let k = 0; k < ps.length - 1; k++) bar(ps[k], ps[k + 1], 0.02, 0.004, H - 0.003, trackMat);
  };
  for (const el of room.selectedNiches ?? []) {
    const curtain = el.kind !== 'count' && el.niche.type === 'curtain';
    if (el.kind === 'wall') {
      const sh = nicheShape(room, el);
      if (sh) { recess([...sh.wall, ...[...sh.inner].reverse()]); rail(sh.rail, curtain); }
    } else if (el.kind === 'cross') {
      const cb = crossBand(room, el);
      if (cb) { recess(cb.band); rail(cb.line, curtain); }
    } else if (el.kind === 'path' && el.points.length >= 2) {
      const ps = el.points.map(toM);
      for (let k = 0; k < ps.length - 1; k++) bar(ps[k], ps[k + 1], 0.15, 0.001, H - 0.0015, recessMat);
    }
  }

  // ── Lights ──
  // Recessed lights barely light the ceiling itself: it is lit by what bounces
  // off the floor and walls. Without global illumination that bounce is a warm
  // light from below, plus a soft pool over each light.
  const lights = opts.lights ? room.lighting ?? [] : [];
  scene.add(new THREE.HemisphereLight('#ffffff', '#d9cdbf', opts.lights && lights.length ? 0.6 : opts.ambient ?? DUSK));
  let spotLights = 0, pointLights = 0;
  const addSpotLight = (color: string, intensity: number, angle: number, from: THREE.Vector3, to: THREE.Vector3) => {
    if (spotLights >= MAX_SPOTLIGHTS) return;
    const s = new THREE.SpotLight(color, intensity, 0, angle, 0.6, 2);
    s.position.copy(from); s.target.position.copy(to);
    scene.add(s, s.target);
    spotLights++;
  };
  const addBounce = (p: Point, color: string, intensity: number) => {
    if (pointLights >= MAX_POINTLIGHTS) return;
    const b = new THREE.PointLight(color, intensity, 2.2, 2);
    b.position.copy(v3(p, H - 1.3));
    scene.add(b);
    pointLights++;
  };
  const glow = (c: string, k = 3) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k) });
  const bezelMat = new THREE.MeshStandardMaterial({ color: '#d9d9d9', roughness: 0.3, metalness: 0.7, side: THREE.DoubleSide });
  const lensMat = glow('#fff2d6');
  const brass = new THREE.MeshStandardMaterial({ color: '#b08d57', roughness: 0.35, metalness: 0.85 });
  const bulbMat = glow('#ffe6b8');
  const railMat = new THREE.MeshStandardMaterial({ color: '#151515', roughness: 0.45 });
  const ringGeo = new THREE.RingGeometry(0.035, 0.05, 32);
  const lensGeo = new THREE.CircleGeometry(0.035, 32);

  const trackRunsPx = lights.flatMap(e => e.kind === 'path' && e.catalogItem.type === 'track' ? [e.points] : []);
  const bare = bareTracks(lights, cm2px);

  const addSpot = (p: Point) => {
    addSpotLight('#ffd9a8', 18, Math.PI / 3.2, v3(p, H - 0.02), v3(p, 0));
    addBounce(p, '#ffcf96', 0.9);
    const ring = new THREE.Mesh(ringGeo, bezelMat); ring.rotation.x = Math.PI / 2; ring.position.copy(v3(p, H - 0.002)); scene.add(ring);
    const lens = new THREE.Mesh(lensGeo, lensMat); lens.rotation.x = Math.PI / 2; lens.position.copy(v3(p, H - 0.003)); scene.add(lens);
  };
  const addChandelier = (p: Point) => {
    const drop = 0.35;
    const hubAt = hang(p, drop);
    const hub = v3(hubAt, H - drop);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.015, 24), brass); cup.position.copy(v3(p, H - 0.008)); scene.add(cup);
    // the rod runs from the cup to the hub — along the line of sight, as seen from below
    const top = v3(p, H - 0.015), rodLen = top.distanceTo(hub);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, rodLen, 8), brass);
    rod.position.copy(top.clone().lerp(hub, 0.5)); rod.lookAt(hub); rod.rotateX(Math.PI / 2); scene.add(rod);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), brass); ball.position.copy(hub); scene.add(ball);
    for (let k = 0; k < 6; k++) {
      const an = k * Math.PI / 3;
      const tipAt = hang({ x: p.x + Math.cos(an) * 0.32, y: p.y + Math.sin(an) * 0.32 }, drop - 0.04);
      const tip = v3(tipAt, H - drop + 0.04);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, hub.distanceTo(tip), 6), brass);
      arm.position.copy(hub.clone().lerp(tip, 0.5)); arm.lookAt(tip); arm.rotateX(Math.PI / 2); arm.castShadow = true; scene.add(arm);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), bulbMat); bulb.position.copy(tip); scene.add(bulb);
    }
    ball.castShadow = true;
    const L = new THREE.PointLight('#ffd49a', 2.2, 0, 2);
    L.position.copy(hub.clone().add(new THREE.Vector3(0, 0.02, 0)));
    L.castShadow = true; L.shadow.mapSize.set(512, 512); L.shadow.radius = 6; L.shadow.bias = -0.002;
    scene.add(L);
  };
  const addTrackSpot = (el: RoomLightingPoint) => {
    const p = toM(el);
    const aim = trackSpotAim(el, trackRunsPx, cm2px, outlinePx).angle;
    const r = ((aim ?? 0) - 90) * Math.PI / 180;
    const dir = aim === null ? { x: 0, y: 0 } : { x: Math.cos(r), y: Math.sin(r) };
    const at = hang(p, 0.1), from = v3(at, H - 0.1);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 20), railMat);
    body.position.copy(from);
    body.lookAt(from.x + dir.x * 0.2, H - 0.6, from.z + dir.y * 0.2); body.rotateX(Math.PI / 2);
    scene.add(body);
    addSpotLight('#fff1dc', 14, Math.PI / 9, from, new THREE.Vector3(at.x + dir.x * 1.2, 0.6, at.y + dir.y * 1.2));
  };

  for (const el of lights) {
    const type = el.catalogItem.type;
    if (el.kind === 'point') {
      if (type === 'chandelier') addChandelier(toM(el));
      else if (type === 'track_spot') addTrackSpot(el);
      else addSpot(toM(el));
      continue;
    }
    const path = el.points.map(toM);
    for (let k = 0; k < path.length - 1; k++) {
      const a = path[k], b = path[k + 1], L = Math.hypot(b.x - a.x, b.y - a.y);
      if (L < 1e-3) continue;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dir = new THREE.Vector3(b.x - a.x, 0, b.y - a.y);
      if (type === 'strip') {
        // a hidden LED strip washes the ceiling around it
        addArea('#ffd08a', 3.5, L, 0.03, v3(mid, H - 0.03), dir, new THREE.Vector3(0, 1, 0));
        bar(a, b, 0.008, 0.002, H - 0.004, glow('#ffd9a0'));
      } else if (type === 'line') {
        bar(a, b, 0.05, 0.002, H - 0.002, new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.75, 3.0) }));
        addArea('#eef5ff', 9, L, 0.05, v3(mid, H - 0.01), dir, new THREE.Vector3(0, -1, 0));
        addBounce(mid, '#e8f0ff', 0.7);
      } else {
        // a track; one with no spots on it lights up itself
        bar(a, b, 0.035, 0.035, H - 0.018, railMat);
        if (bare.has(el.id)) {
          bar(a, b, 0.015, 0.002, H - 0.037, glow('#fff1dc', 2.4));
          addArea('#fff1dc', 4, L, 0.02, v3(mid, H - 0.04), dir, new THREE.Vector3(0, -1, 0));
          addBounce(mid, '#ffe6c8', 0.5);
        }
      }
    }
  }

  // ── Frame: the region asked for, cut to the room ──
  const xs = outline.map(p => p.x), ys = outline.map(p => p.y);
  let [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  if (opts.region) {
    const r = opts.region;
    x0 = Math.max(x0, pxToMeters(r.x)); y0 = Math.max(y0, pxToMeters(r.y));
    x1 = Math.min(x1, pxToMeters(r.x + r.width)); y1 = Math.min(y1, pxToMeters(r.y + r.height));
    if (x1 - x0 < 0.01 || y1 - y0 < 0.01) { disposeScene(scene); return null; }
  }
  const pxPerM = Math.max(8, Math.min(opts.pxPerM, MAX_SIDE_PX / (x1 - x0), MAX_SIDE_PX / (y1 - y0)));
  const W = Math.max(1, Math.round((x1 - x0) * pxPerM)), Hh = Math.max(1, Math.round((y1 - y0) * pxPerM));

  const renderer = getRenderer();
  renderer.setSize(W, Hh, false);

  if (finish === 'gloss') {
    // the mirror part — an exact reflection, added to the fabric's own colour
    const spec = 0.3;
    reflector = new Reflector(new THREE.ShapeGeometry(shape), { textureWidth: W, textureHeight: Hh, color: new THREE.Color(spec, spec, spec), clipBias: 0.002 });
    reflector.rotation.x = Math.PI / 2; reflector.position.y = H;
    const rm = reflector.material as THREE.ShaderMaterial;
    rm.transparent = true; rm.blending = THREE.AdditiveBlending; rm.depthWrite = false;
    scene.add(reflector);
  }

  // The walls are there to be mirrored, not seen: in a room that isn't convex
  // a wall stands between the eye and part of the ceiling and would hide it
  // behind a hard slanted edge. The camera sees everything but the walls; the
  // mirror and the satin's surroundings (cameras on layer 0) see them too.
  scene.traverse(o => { if (!o.userData.wall) o.layers.enable(SEEN); });
  const cam = new THREE.PerspectiveCamera();
  cam.layers.set(SEEN);
  cam.position.set(E.x, EYE_M, E.y);
  cam.up.set(0, 0, -1);
  cam.lookAt(E.x, H, E.y);
  cam.updateMatrixWorld();
  // Off-axis frustum cut to the frame. Looking up, the camera's right is world −x
  // (seen from below the plan is mirrored) — the picture is flipped back below.
  const near = 0.05, far = 30;
  cam.projectionMatrix.makePerspective(
    (E.x - x1) * near / d, (E.x - x0) * near / d, (E.y - y0) * near / d, (E.y - y1) * near / d, near, far,
  );
  cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();

  let pmrem: THREE.PMREMGenerator | null = null, cubeRT: THREE.WebGLCubeRenderTarget | null = null;
  if (finish === 'satin') {
    // satin: the room's reflection, blurred by the surface's roughness
    ceiling.visible = false;
    cubeRT = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
    const cc = new THREE.CubeCamera(0.05, 30, cubeRT);
    cc.position.set(E.x, EYE_M, E.y);
    cc.update(renderer, scene);
    pmrem = new THREE.PMREMGenerator(renderer);
    ceilMat.envMap = pmrem.fromCubemap(cubeRT.texture).texture;
    ceiling.visible = true;
  }

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(1);
  composer.setSize(W, Hh);
  composer.addPass(new RenderPass(scene, cam));
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, Hh), 0.35, 0.5, 0.92);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  try {
    composer.render();
    const out = document.createElement('canvas');
    out.width = W; out.height = Hh;
    const g = out.getContext('2d')!;
    g.translate(W, 0); g.scale(-1, 1);
    g.drawImage(renderer.domElement, 0, 0, W, Hh);
    return { canvas: out, x: x0 * PX_PER_M, y: y0 * PX_PER_M, width: (x1 - x0) * PX_PER_M, height: (y1 - y0) * PX_PER_M, pxPerM };
  } finally {
    bloom.dispose();
    composer.dispose();
    reflector?.dispose();
    ceilMat.envMap?.dispose();
    pmrem?.dispose();
    cubeRT?.dispose();
    disposeScene(scene);
  }
}

function disposeScene(scene: THREE.Scene) {
  const seen = new Set<unknown>();
  scene.traverse(o => {
    const m = o as THREE.Mesh;
    if (m.geometry && !seen.has(m.geometry)) { seen.add(m.geometry); m.geometry.dispose(); }
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) if (!seen.has(mat)) { seen.add(mat); mat.dispose(); }
    (o as unknown as { shadow?: { map?: { dispose(): void } | null } }).shadow?.map?.dispose();
  });
}
