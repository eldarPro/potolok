import React, { createContext, useContext } from 'react';
import { Group, Circle, Line, Rect, Wedge } from 'react-konva';
import { LightingType } from '../types';
import { lightColor } from '../lib/lighting';
import { CHANDELIER_ARMS } from '../lib/lightGlow';

/*
 * Lighting on the drawing, in the manner of a lighting plan: the shape says
 * what it is (a spot is a crossed circle, a chandelier a double circle with
 * rays, a light line a lit channel with square ends, a strip a glowing dash,
 * a track a rail), the catalog colour only tints it. The same shapes are
 * used as SVG in the legend under the drawing (LightIcon).
 */

/** The ceiling under the marks — a mark punches its own background so lines under it don't show through */
const BG = '#1c2650';
const RAIL = '#262838';
const LINE_EDGE = '#6b6f88';

type Pt = { x: number; y: number };
const flat = (ps: Pt[]) => ps.flatMap(p => [p.x, p.y]);

/*
 * How big a plan mark is drawn. A mark is designed in screen px (`N` — the
 * size of its body: a spot's ring, a chandelier's rays, a line's stroke), but
 * a fixed screen size lies about the lamp: on a 50 m hall a 9 cm spot would
 * look a couple of metres across, and zoomed in close it would shrink below
 * the lamp itself. So the body is kept between
 *  - the lamp's real size `R` (cm, an average one of its kind) — zoomed in, a
 *    mark never gets smaller than the thing it stands for;
 *  - `K`× the real size — zoomed out on a big drawing the mark shrinks with
 *    it, down to `floor` screen px, below which it would stop being legible.
 * In between (any ordinary room on a phone) it keeps its designed size.
 */
const MARK_K = 4;
const MARK_BODY: Record<string, { N: number; R: number; floor: number }> = {
  spot: { N: 13, R: 9, floor: 5 },
  chandelier: { N: 40, R: CHANDELIER_ARMS.cm * 2, floor: 14 },
  track_spot: { N: 12, R: 14, floor: 6 },
  line: { N: 5.5, R: 5, floor: 2.2 },
  track: { N: 7.5, R: 4, floor: 3 },
  strip: { N: 2.2, R: 1, floor: 1.2 },
};

/**
 * The unit a plan mark is drawn in, drawing px: `px` (drawing px per screen
 * px) scaled so the mark's body stays within its real-size bounds. `cm` is
 * drawing px per cm.
 */
export const markUnit = (type: LightingType, px: number, cm: number) => {
  const b = MARK_BODY[type] ?? MARK_BODY.spot;
  const real = b.R * cm / px; // the lamp's real size, screen px
  const d = Math.max(real, Math.min(b.N, Math.max(b.floor, MARK_K * real)));
  return px * d / b.N;
};

/** Strokes are sized in screen px (times `px`), within the lamp's real-size bounds (markUnit) */
export const PointLightMark: React.FC<{
  type: LightingType; color: string; x: number; y: number;
  /** drawing px per screen px, and per cm */
  px: number; cm: number;
  /** a track spot turns across the track it sits on (degrees of the track run) */
  angle?: number | null;
}> = ({ type, color, x, y, px: screenPx, cm, angle }) => {
  const px = markUnit(type, screenPx, cm);
  const c = lightColor(color);
  if (type === 'chandelier') {
    const rays = Array.from({ length: 8 }, (_, i) => {
      const a = i * Math.PI / 4, cs = Math.cos(a), sn = Math.sin(a);
      return <Line key={i} points={[cs * 15 * px, sn * 15 * px, cs * 20 * px, sn * 20 * px]} stroke={c} strokeWidth={1.6 * px} lineCap="round" />;
    });
    const k = 8.5 * px;
    return (
      <Group x={x} y={y} listening={false}>
        <Circle radius={22 * px} fill={c} opacity={0.12} />
        {rays}
        <Circle radius={12 * px} fill={BG} stroke={c} strokeWidth={2 * px} />
        <Circle radius={5 * px} stroke={c} strokeWidth={1.4 * px} />
        <Line points={[-k, -k, k, k]} stroke={c} strokeWidth={1.2 * px} />
        <Line points={[k, -k, -k, k]} stroke={c} strokeWidth={1.2 * px} />
      </Group>
    );
  }
  if (type === 'track_spot') {
    // a cone hanging off the rail, its beam across the track
    return (
      <Group x={x} y={y} rotation={angle ?? 0} listening={false}>
        <Line
          points={[-3 * px, -1 * px, 3 * px, -1 * px, 6 * px, -12 * px, -6 * px, -12 * px]} closed
          fill={c} stroke="#16182a" strokeWidth={1 * px}
        />
        <Circle radius={2.8 * px} fill="#16182a" stroke={c} strokeWidth={1.4 * px} />
      </Group>
    );
  }
  // spot (and anything unknown): the crossed circle
  const k = 4.6 * px;
  return (
    <Group x={x} y={y} listening={false}>
      <Circle radius={9.5 * px} fill={c} opacity={0.18} />
      <Circle radius={6.5 * px} fill={BG} stroke={c} strokeWidth={1.8 * px} />
      <Line points={[-k, -k, k, k]} stroke={c} strokeWidth={1.4 * px} />
      <Line points={[k, -k, -k, k]} stroke={c} strokeWidth={1.4 * px} />
    </Group>
  );
};

export const PathLightMark: React.FC<{ type: LightingType; color: string; points: Pt[]; px: number; cm: number }> = ({ type, color, points, px: screenPx, cm }) => {
  const px = markUnit(type, screenPx, cm);
  const pts = flat(points);
  if (type === 'line') {
    // a lit channel: square ends, a mark at each joint where runs meet
    const core = color && color !== '#ffffff' ? color : '#fbfdff';
    return (
      <Group listening={false}>
        <Line points={pts} stroke={LINE_EDGE} strokeWidth={5.5 * px} lineCap="square" lineJoin="miter" />
        <Line points={pts} stroke={core} strokeWidth={3 * px} lineCap="square" lineJoin="miter" />
        {points.slice(1, -1).map((p, i) => (
          <Rect key={i} x={p.x} y={p.y} width={7 * px} height={7 * px} offsetX={3.5 * px} offsetY={3.5 * px} fill={core} stroke={LINE_EDGE} strokeWidth={1.2 * px} />
        ))}
      </Group>
    );
  }
  const c = lightColor(color);
  if (type === 'track') {
    return (
      <Group listening={false}>
        <Line points={pts} stroke={c} strokeWidth={7.5 * px} lineCap="butt" lineJoin="miter" opacity={0.85} />
        <Line points={pts} stroke={RAIL} strokeWidth={5 * px} lineCap="butt" lineJoin="miter" />
        <Line points={pts} stroke={c} strokeWidth={0.8 * px} dash={[2 * px, 2 * px]} opacity={0.8} />
      </Group>
    );
  }
  // strip (and anything unknown): a thin solid line in a soft halo — thinner and
  // warmer than a light line, with round ends instead of square
  return (
    <Group listening={false}>
      <Line points={pts} stroke={c} strokeWidth={8 * px} opacity={0.2} lineCap="round" lineJoin="round" />
      <Line points={pts} stroke={c} strokeWidth={2.2 * px} lineCap="round" lineJoin="round" />
    </Group>
  );
};

/*
 * The glow view shows the lights themselves, not plan symbols: a spot is a
 * bright dot, a chandelier a bigger one, a light line or a strip a lit
 * line, a track a dark rail its spots sit on as dots.
 */
const HOT = '#fff6dc';

const armEnds = (len: number) => Array.from({ length: CHANDELIER_ARMS.count }, (_, i) => {
  const a = (i / CHANDELIER_ARMS.count) * Math.PI * 2 - Math.PI / 2;
  return { x: Math.cos(a) * len, y: Math.sin(a) * len, deg: a * 180 / Math.PI };
});

/**
 * Real sizes of the lights, cm: what they measure on a ceiling. Drawn to the
 * drawing's scale, but never smaller on screen than a few px, so on a whole
 * room view they stay visible; zoomed in they grow as the room does.
 */
export const LIGHT_SIZE_CM = {
  spotLens: 5.5, spotBezel: 9,
  chandelierHub: 10, chandelierLamp: 9, chandelierArm: 1.2,
  trackSpotWidth: 6, trackSpotLength: 14,
  trackWidth: 3.5, lineWidth: 5, stripWidth: 1,
};
const S = LIGHT_SIZE_CM;

export const GlowPointMark: React.FC<{
  type: LightingType; x: number; y: number;
  /** drawing px per screen px, and per cm */
  px: number; cm: number;
  /** a chandelier's arm length, drawing px */
  armR?: number;
  /** a track spot's turn, as for PointLightMark */
  angle?: number | null;
}> = ({ type, x, y, px, cm, armR = 0, angle }) => {
  /** `c` cm to scale, at least `min` screen px */
  const sz = (c: number, min: number) => Math.max(c * cm, min * px);
  if (type === 'chandelier') {
    // the body with its arms, a lamp at the end of each — seen from below
    const arm = Math.max(armR, 10 * px);
    const ends = armEnds(arm);
    const armW = sz(S.chandelierArm, 1);
    return (
      <Group x={x} y={y} listening={false}>
        {ends.map((e, i) => <Line key={`a${i}`} points={[0, 0, e.x, e.y]} stroke="#8a8270" strokeWidth={armW} />)}
        <Circle radius={sz(S.chandelierHub / 2, 3.5)} fill="#2a2d40" stroke="#c9b991" strokeWidth={armW} />
        {ends.map((e, i) => <Circle key={`l${i}`} x={e.x} y={e.y} radius={sz(S.chandelierLamp / 2, 2.2)} fill={HOT} />)}
      </Group>
    );
  }
  if (type === 'track_spot') {
    // the spot's body seen from below — a cylinder across the rail, its lens towards the beam
    const w = sz(S.trackSpotWidth, 5), L = sz(S.trackSpotLength, 9);
    const lens = Math.max(w * 0.22, 1.6 * px);
    return (
      <Group x={x} y={y} rotation={angle ?? 0} listening={false}>
        <Rect x={-w / 2} y={-L * 0.92} width={w} height={L} cornerRadius={w * 0.2} fill="#3a3d50" stroke="#9aa0b8" strokeWidth={1 * px} />
        <Rect x={-w * 0.43} y={-L * 0.92 - lens * 0.5} width={w * 0.86} height={lens} cornerRadius={lens / 2} fill={HOT} />
        <Circle radius={w * 0.28} fill="#9aa0b8" />
      </Group>
    );
  }
  const lens = sz(S.spotLens / 2, 2), bezel = sz(S.spotBezel / 2, 3.5);
  return (
    <Group x={x} y={y} listening={false}>
      <Circle radius={bezel} fill="#cfcfd4" opacity={0.55} />
      <Circle radius={lens} fill={HOT} />
    </Group>
  );
};

export const GlowPathMark: React.FC<{
  type: LightingType; points: Pt[]; px: number; cm: number;
  /** a track with no track spots on it — lit along its length */
  lit?: boolean;
}> = ({ type, points, px, cm, lit }) => {
  const pts = flat(points);
  const sz = (c: number, min: number) => Math.max(c * cm, min * px);
  if (type === 'track') {
    const w = sz(S.trackWidth, 3.5);
    return (
      <Group listening={false}>
        <Line points={pts} stroke="#7b809a" strokeWidth={w} lineCap="butt" lineJoin="miter" />
        <Line points={pts} stroke="#30323f" strokeWidth={w * 0.65} lineCap="butt" lineJoin="miter" />
        {lit && <Line points={pts} stroke={HOT} strokeWidth={w * 0.35} lineCap="butt" lineJoin="miter" />}
      </Group>
    );
  }
  if (type === 'line') return <Line points={pts} stroke="#fff" strokeWidth={sz(S.lineWidth, 2.5)} lineCap="square" lineJoin="miter" listening={false} />;
  return <Line points={pts} stroke="#ffe3a8" strokeWidth={sz(S.stripWidth, 1.4)} lineCap="round" lineJoin="round" listening={false} />;
};

/** The drawing's mark as a small SVG — for the legend and lists */
export const LightIcon: React.FC<{ type: LightingType; color: string; size?: number }> = ({ type, color, size = 16 }) => {
  const c = lightColor(color);
  const s = size;
  switch (type) {
    case 'chandelier':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" aria-hidden>
          <circle cx="8" cy="8" r="6.3" fill="none" stroke={c} strokeWidth="1.5" />
          <circle cx="8" cy="8" r="2.6" fill="none" stroke={c} strokeWidth="1.1" />
          <path d="M3.8 3.8 L12.2 12.2 M12.2 3.8 L3.8 12.2" stroke={c} strokeWidth="0.9" />
        </svg>
      );
    case 'track_spot':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" aria-hidden>
          <path d="M5.5 10 L10.5 10 L13 2.5 L3 2.5 Z" fill={c} />
          <circle cx="8" cy="11" r="2.4" fill="#16182a" stroke={c} strokeWidth="1.3" />
        </svg>
      );
    case 'line':
      return (
        <svg width={s * 1.3} height={s} viewBox="0 0 21 16" aria-hidden>
          <rect x="1" y="5.5" width="19" height="5" fill={color && color !== '#ffffff' ? color : '#fbfdff'} stroke={LINE_EDGE} strokeWidth="1.2" />
        </svg>
      );
    case 'strip':
      return (
        <svg width={s * 1.3} height={s} viewBox="0 0 21 16" aria-hidden>
          <line x1="1.5" y1="8" x2="19.5" y2="8" stroke={c} strokeWidth="6" strokeOpacity="0.22" strokeLinecap="round" />
          <line x1="1.5" y1="8" x2="19.5" y2="8" stroke={c} strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'track':
      return (
        <svg width={s * 1.3} height={s} viewBox="0 0 21 16" aria-hidden>
          <rect x="1" y="5" width="19" height="6" fill={RAIL} stroke={c} strokeWidth="1.3" />
        </svg>
      );
    default:
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" aria-hidden>
          <circle cx="8" cy="8" r="5.6" fill="none" stroke={c} strokeWidth="1.6" />
          <path d="M4.2 4.2 L11.8 11.8 M11.8 4.2 L4.2 11.8" stroke={c} strokeWidth="1.2" />
        </svg>
      );
  }
};

const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
};
// A Gaussian fall-off, exp(-(d/r)²), drawn out to 2.2·r — the same curve lightGlow counts dark spots with
const FALLOFF = [0, 0.2, 0.4, 0.6, 0.8, 1].map(t => [t, Math.exp(-((t * 2.2) ** 2))]);

/*
 * Glow colours are set by the kind of light, not the catalog colour: catalog
 * colours are near-white, and near-white pools on a dark ceiling read as grey
 * haze. Warm gold fading to amber for lamps, a cool white for light lines.
 */
const PALETTE: Record<string, [string, string]> = {
  warm: ['#ffd27a', '#ffb347'],
  bright: ['#ffe2a8', '#ffc56b'],
  cool: ['#e8f3ff', '#bcdcff'],
};
const paletteOf = (type: LightingType) => PALETTE[type === 'line' ? 'cool' : type === 'chandelier' ? 'bright' : 'warm'];

/**
 * The fabric's colour (rgb 0–255) the glow lands on: light that bounces off
 * a coloured fabric takes its colour, a black one swallows it. Only the light
 * is tinted — the fabric's own picture under it stays as it is.
 */
export const GlowTint = createContext<[number, number, number]>([255, 255, 255]);
const tinted = (hex: string, [r, g, b]: [number, number, number]) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number, k: number) => Math.round(v * k / 255).toString(16).padStart(2, '0');
  return `#${c(n >> 16, r)}${c((n >> 8) & 255, g)}${c(n & 255, b)}`;
};
const usePalette = (type: LightingType): [string, string] => {
  const tint = useContext(GlowTint);
  const [core, edge] = paletteOf(type);
  return [tinted(core, tint), tinted(edge, tint)];
};

/** The glow view: a soft pool of light around a point source (radius in drawing px) */
export const PointGlow: React.FC<{ x: number; y: number; r: number; type: LightingType; power: number; scaleY?: number; rotation?: number }> =
  ({ x, y, r, type, power, scaleY = 1, rotation = 0 }) => {
    const [core, edge] = usePalette(type);
    return (
      <Circle
        x={x} y={y} radius={2.2 * r} scaleY={scaleY} rotation={rotation}
        fillRadialGradientStartPoint={{ x: 0, y: 0 }} fillRadialGradientStartRadius={0}
        fillRadialGradientEndPoint={{ x: 0, y: 0 }} fillRadialGradientEndRadius={2.2 * r}
        fillRadialGradientColorStops={FALLOFF.flatMap(([t, v]) => [t, rgba(t < 0.3 ? core : edge, 0.6 * power * v)])}
        globalCompositeOperation="screen" listening={false}
      />
    );
  };

/**
 * The glow view: light along a line or strip — only the canvas shadow of the
 * run, a true Gaussian blur. The run itself is drawn far off to the side
 * (outside the room's clip) and its shadow offset back into place, so no
 * hard-edged stroke shows. Konva scales the blur and the offset with the
 * zoom but not the rotation, so the offset is turned by the drawing's angle.
 */
const AWAY = 10000;
export const PathGlow: React.FC<{ points: Pt[]; r: number; type: LightingType; power: number; angle: number }> = ({ points, r, type, power, angle }) => {
  const pts = flat(points);
  const [core, edge] = usePalette(type);
  const a = angle * Math.PI / 180;
  const back = { x: -AWAY * Math.cos(a), y: -AWAY * Math.sin(a) };
  // canvas blur b spreads as a Gaussian of sigma b/2; exp(-(d/r)²) has sigma r/√2
  const layer = (color: string, alpha: number, width: number, blur: number) => (
    <Line
      x={AWAY} points={pts} stroke={color} strokeWidth={width} lineCap="round" lineJoin="round"
      shadowColor={rgba(color, Math.min(1, alpha))} shadowBlur={blur} shadowOffset={back} shadowForStrokeEnabled
      globalCompositeOperation="screen"
    />
  );
  return (
    <Group listening={false}>
      {/* a strip in its niche and a lit track give a denser band than a light line's */}
      {layer(edge, 0.75 * power, (type === 'strip' || type === 'track' ? 1.1 : 0.5) * r, 1.4 * r)}
      {layer(core, 0.6 * power, 0.15 * r, 0.35 * r)}
    </Group>
  );
};

/**
 * The glow view of a chandelier, unlike a spot's single pool: a wide soft
 * fill of light thrown all round, a bright petal on the ceiling over each
 * lamp, stretched outwards along its arm, and the body's shadow in the middle.
 */
export const ChandelierGlow: React.FC<{ x: number; y: number; r: number; armR: number; power: number }> = ({ x, y, r, armR, power }) => (
  <Group listening={false}>
    <PointGlow x={x} y={y} r={r} type="chandelier" power={0.6 * power} />
    {armEnds(armR * 1.15).map((e, i) => (
      <PointGlow
        key={i} x={x + e.x} y={y + e.y} r={armR * 0.45} type="chandelier" power={0.85 * power}
        scaleY={1.6} rotation={e.deg - 90}
      />
    ))}
    {/* the body hides the ceiling right above it */}
    <Circle
      x={x} y={y} radius={armR * 0.6}
      fillRadialGradientStartPoint={{ x: 0, y: 0 }} fillRadialGradientStartRadius={0}
      fillRadialGradientEndPoint={{ x: 0, y: 0 }} fillRadialGradientEndRadius={armR * 0.6}
      fillRadialGradientColorStops={[0, 'rgba(6,8,18,0.7)', 0.6, 'rgba(6,8,18,0.35)', 1, 'rgba(6,8,18,0)']}
    />
  </Group>
);

/**
 * The glow view of a track spot: a beam, not a pool. A spot throws its light
 * in one direction, so from above it is a cone opening away from the spot,
 * brightest near it and fading out with distance. Its edges are softened
 * like PathGlow's: the cone is drawn off to the side and only its blurred
 * shadow lands in place. A little spill of light rings the spot itself.
 */
export const TrackBeam: React.FC<{
  x: number; y: number;
  /** the spot's turn — its beam goes towards −y in that frame */
  angle: number;
  /** how far the beam reaches, drawing px */
  len: number;
  /** the drawing's own rotation, for the shadow trick */
  drawAngle: number;
  power: number;
}> = ({ x, y, angle, len, drawAngle, power }) => {
  const SPREAD = 38;
  const a = drawAngle * Math.PI / 180;
  const [core] = usePalette('track_spot');
  return (
    <Group listening={false}>
      <Wedge
        x={x + AWAY} y={y} radius={len} angle={SPREAD} rotation={angle - 90 - SPREAD / 2}
        fillRadialGradientStartPoint={{ x: 0, y: 0 }} fillRadialGradientStartRadius={0}
        fillRadialGradientEndPoint={{ x: 0, y: 0 }} fillRadialGradientEndRadius={len}
        fillRadialGradientColorStops={[0, 'rgba(0,0,0,1)', 0.4, 'rgba(0,0,0,0.85)', 0.75, 'rgba(0,0,0,0.4)', 1, 'rgba(0,0,0,0)']}
        shadowColor={rgba(core, Math.min(1, power))} shadowBlur={len * 0.08}
        shadowOffset={{ x: -AWAY * Math.cos(a), y: -AWAY * Math.sin(a) }}
        globalCompositeOperation="screen"
      />
      <PointGlow x={x} y={y} r={len * 0.12} type="track_spot" power={0.9 * power} />
      <Circle
        x={x} y={y} radius={len * 0.5}
        fillRadialGradientStartPoint={{ x: 0, y: 0 }} fillRadialGradientStartRadius={0}
        fillRadialGradientEndPoint={{ x: 0, y: 0 }} fillRadialGradientEndRadius={len * 0.5}
        fillRadialGradientColorStops={[0, rgba(core, 0.12 * power), 1, rgba(core, 0)]}
        globalCompositeOperation="screen"
      />
    </Group>
  );
};
