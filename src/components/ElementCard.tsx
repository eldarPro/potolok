import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IonIcon } from '@ionic/react';
import {
  closeOutline, checkmarkOutline, chevronBackOutline, chevronForwardOutline, removeOutline, gitCommitOutline, resizeOutline, bulbOutline,
  analyticsOutline, albumsOutline, layersOutline, cutOutline,
  trashOutline, listOutline,
  arrowBackOutline, arrowForwardOutline, arrowUpOutline, arrowDownOutline, sunnyOutline,
} from 'ionicons/icons';
import {
  Room, CatalogItem, LightingCatalogItem, NicheItem, ProjectPricing, RoomLightingPath,
  RoomNichePath, RoomNicheElement, RoomNicheWall, RoomNicheCross,
} from '../types';
import { CanvasSelection } from './CeilingCanvas';
import { NumInput, useNumPadActive, useNumPadHeight } from './NumPad';
import { SheetSection } from './RoomSheet';
import { edgeLabel, edgeLengthM, vertexLabels, countRealCorners, nicheFreeEnds } from '../lib/geometry';
import { pickFrame, frameCoords } from '../lib/lightScales';
import { hasCornice, nicheCapId, nicheCost, NicheCostPart } from '../lib/pricing';
import { nicheMetrics, nicheShape, nicheSpan, crossLine, crossCorners, crossWidthCm, wallLengthCm } from '../lib/nicheGeometry';
import { setNicheSizes, changeNicheWalls, setCrossEnd, DEPTH_OPTIONS, clampDepth } from '../lib/nicheEdit';
import { diagonalCm, diagonalKey, shapeDiagonals, reshapeByDiagonals, diagonalRangeCm } from '../lib/diagonals';
import {
  reshapedRoom, resizedPoints, wallCm, roundEdge, bendEdge, setWallProfile,
  deleteVertex, cornerAngle, squareCorner, cornerPointsAtAngle, nudgeVertex, nudgeLight,
} from '../lib/roomEdit';
import { uuid } from '../lib/uuid';
import { useT } from '../lib/i18n';
import { LightIcon } from './LightMarks';
import { wallArcIcon, wallLineIcon } from '../lib/icons';
import './ElementCard.css';

interface Props {
  room: Room;
  selection: CanvasSelection;
  pricing?: ProjectPricing;
  fabrics: CatalogItem[];
  profiles: CatalogItem[];
  lightings: LightingCatalogItem[];
  niches: NicheItem[];
  onChange: (partial: Partial<Room>) => void;
  onSelect: (s: CanvasSelection | null) => void;
  onSplitWall: (edgeIndex: number) => void;
  onOpenSection: (section: SheetSection) => void;
  onToast: (message: string) => void;
  onHeight: (px: number) => void;
}

const rub = (n: number) => `${Math.round(n).toLocaleString('ru')} ₽`;
const NICHE_COLOR = '#00ACC1';
// A sharper corner sends the point far off along a near-flat arc
const MIN_ANGLE = 30;

/** One choice in the picker list: a colour mark, its unit price and what it'd cost here */
interface PickOption {
  id: string;
  title: string;
  mark: React.ReactNode;
  price: string;
  total?: string;
}

interface PickSpec {
  title: string;
  sub?: string;
  options: PickOption[];
  selectedId: string | null;
  /** label of a «nothing» row, if clearing is allowed */
  noneLabel?: string;
  onPick: (id: string | null) => void;
}

const ElementCard: React.FC<Props> = props => {
  const { room, selection, pricing, onChange, onSelect, onHeight } = props;
  const { t } = useT();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Typed size (wall length / diagonal), null while showing the drawing's value
  const [draft, setDraft] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Typing a size: the card rides up on the number pad (it lies over the screen, nothing
  // is resized) and shows just the sizes; the canvas keeps the element clear of both
  const padEl = useNumPadActive();
  const padH = useNumPadHeight();
  const typing = !!padEl && !!rootRef.current?.contains(padEl);
  const lift = typing ? padH : 0;
  const liftRef = useRef(lift);
  liftRef.current = lift;

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => onHeight(el.offsetHeight + liftRef.current));
    obs.observe(el);
    onHeight(el.offsetHeight);
    return () => { obs.disconnect(); onHeight(0); };
  }, []);
  useLayoutEffect(() => { if (rootRef.current) onHeight(rootRef.current.offsetHeight + lift); }, [lift]);

  const pts = room.points;
  const labels = vertexLabels(pts);
  const priceOf = (item: { id: string; price: number }) => pricing?.overrides[item.id]?.price ?? item.price;
  const installOf = (item: { id: string; priceInstall: number }) => pricing?.overrides[item.id]?.priceInstall ?? item.priceInstall;
  const close = () => onSelect(null);

  // ── Shared bits ──
  const head = (icon: string, color: string, title: string, sub: string) => (
    <div className="ecard__head">
      <div className="ecard__icon" style={{ background: `${color}26`, color }}><IonIcon icon={icon} /></div>
      <div className="ecard__titles">
        <div className="ecard__title">{title}</div>
        <div className="ecard__sub">{sub}</div>
      </div>
      <button className="ecard__close" onClick={close}><IonIcon icon={closeOutline} /></button>
    </div>
  );

  type Action = { icon: string; label: string; onClick: () => void; danger?: boolean; disabled?: boolean };
  const actions = (list: Action[]) => (
    <div className="ecard__actions">
      {list.map(a => (
        <button
          key={a.label}
          className={`ecard__action${a.danger ? ' ecard__action--danger' : ''}`}
          disabled={a.disabled}
          onClick={a.onClick}
        >
          <IonIcon icon={a.icon} />
          {a.label}
        </button>
      ))}
    </div>
  );

  /** Delete at the right end of a row of buttons (the arrows) */
  const deleteBtn = (onClick: () => void, disabled = false) => (
    <button className="ecard__btn ecard__btn--delete" disabled={disabled} onClick={onClick}>
      <IonIcon icon={trashOutline} />
      <span>{t('common.delete')}</span>
    </button>
  );

  /** Size field: − [value] + ✓ — typing doesn't touch the drawing until ✓ / Enter.
   *  Instant: no ✓ — − / + and every valid number typed go straight onto the
   *  drawing; `valid` says which numbers can be applied */
  const sizeField = (
    current: number, apply: (cm: number) => void, error: boolean, step = true, unit = t('re.cm'), decimals = 0,
    instant?: { valid: (v: number) => boolean },
  ) => {
    const k = 10 ** decimals;
    const typed = draft == null ? current : Math.round(parseFloat(draft) * k) / k;
    const dirty = draft != null && typed > 0 && typed !== current;
    const commit = () => { if (dirty && !error) { apply(typed); setDraft(null); inputRef.current?.blur(); } };
    const bump = (d: number) => {
      const v = Math.max(1, Math.round(((typed > 0 ? typed : current) + d) * k) / k);
      if (!instant) { setDraft(String(v)); return; }
      setDraft(null);
      if (instant.valid(v)) apply(v);
    };
    const type = (text: string) => {
      setDraft(text);
      const v = Math.round(parseFloat(text) * k) / k;
      if (instant && v > 0 && v !== current && instant.valid(v)) apply(v);
    };
    return (
      <div className="ecard__row">
        {step && <button className="ecard__btn" onClick={() => bump(-1)}>−</button>}
        <label className={`ecard__field${error ? ' ecard__field--error' : dirty ? ' ecard__field--active' : ''}`}>
          <NumInput
            inputRef={inputRef} sticky group="ecard"
            decimal={decimals > 0}
            label={unit === '°' ? t('ec.angle') : `${t('ec.length')}, ${unit}`}
            value={draft ?? String(current)}
            onChange={type}
            onBlur={() => { if (instant) setDraft(null); }}
            onEnter={() => { if (instant) setDraft(null); else commit(); }}
            onEscape={() => setDraft(null)}
          />
          <span className="ecard__unit">{unit}</span>
        </label>
        {step && <button className="ecard__btn" onClick={() => bump(1)}>+</button>}
        {!instant && (
          <button className="ecard__btn ecard__btn--primary" disabled={!dirty || error} onClick={commit}>
            <IonIcon icon={checkmarkOutline} />
          </button>
        )}
      </div>
    );
  };

  /** The current choice as one row; the full list opens over everything on tap */
  const selectRow = (label: string, mark: React.ReactNode, title: string, price: string) => (
    <>
      <div className="ecard__label">{label}</div>
      <button className="ecard__select" onClick={() => setPickerOpen(true)}>
        {mark}
        <span className="ecard__select-title">{title}</span>
        {price && <span className="ecard__select-price">{price}</span>}
        <IonIcon icon={chevronForwardOutline} className="ecard__select-chevron" />
      </button>
    </>
  );

  const swatch = (color: string) => <span className="ecard__swatch" style={{ background: color }} />;
  const lineMark = (color: string) => <span className="ecard__swatch ecard__swatch--line" style={{ background: color }} />;

  let body: React.ReactNode = null;
  let pick: PickSpec | null = null;

  // ═══ Wall ═══
  if (selection.kind === 'wall') {
    const i = selection.index;
    const seg = (room.profileSegments ?? []).find(s => s.edgeIndex === i);
    const curved = !!pts[i]?.bulge;
    const name = edgeLabel(pts, i).replace(/ /g, '');
    const cm = wallCm(pts, i);
    const wallM = edgeLengthM(pts, i);
    pick = {
      title: `${t('prof.sheetTitle')} ${name}`,
      sub: `${wallM.toFixed(2)} ${t('unit.m')}`,
      options: props.profiles.map(p => ({
        id: p.id, title: p.title, mark: swatch(p.color),
        price: `${priceOf(p)} ₽/${t('unit.m')}`, total: `≈ ${rub(priceOf(p) * wallM)}`,
      })),
      selectedId: seg?.profileId ?? null,
      noneLabel: t('mat.noProfileBtn'),
      onPick: id => onChange(setWallProfile(room, i, props.profiles.find(p => p.id === id) ?? null)),
    };
    body = <>
      {head(removeOutline, '#F9A825', `${t('mat.wall')} ${name}`,
        `${curved ? t('ec.curved') : t('ec.straight')} · ${seg ? seg.profile.title : t('mat.noProfile')}`)}
      <div className="ecard__label">{t('ec.length')}</div>
      {sizeField(cm, v => {
        const newPts = resizedPoints(pts, i, v);
        if (newPts) onChange(reshapedRoom(room, newPts));
      }, false)}
      {props.profiles.length > 0 && selectRow(
        t('ec.profile'),
        seg ? swatch(seg.profile.color) : null,
        seg ? seg.profile.title : t('mat.noProfile'),
        seg ? `${priceOf(seg.profile)} ₽/${t('unit.m')}` : '',
      )}
      {actions([
        { icon: cutOutline, label: t('mat.split'), onClick: () => props.onSplitWall(i) },
        curved
          ? { icon: wallLineIcon, label: t('ec.straighten'), onClick: () => { const r = bendEdge(room, i, 0); if (r) onChange(r); } }
          : {
            icon: wallArcIcon, label: t('ec.round'), onClick: () => {
              const r = roundEdge(room, i);
              if (r) onChange(r); else props.onToast(t('ec.cantRound'));
            },
          },
      ])}
    </>;
  }

  // ═══ Corner ═══
  if (selection.kind === 'corner') {
    const i = selection.index;
    const n = pts.length;
    const angle = cornerAngle(pts, i);
    const shown = Math.round(angle * 10) / 10;
    const offSquare = Math.min(Math.abs(angle - 90), Math.abs(angle - 270));
    const prevWall = edgeLabel(pts, (i - 1 + n) % n).replace(/ /g, '');
    const nextWall = edgeLabel(pts, i).replace(/ /g, '');
    const nudge = (dx: number, dy: number) => onChange(nudgeVertex(room, i, dx, dy));
    // Typed angle → where the corner would go; null when the walls would cross
    const typed = draft == null ? NaN : Math.round(parseFloat(draft) * 10) / 10;
    const target = typed > 0 && typed !== shown ? typed : null;
    const inRange = target == null || (target >= MIN_ANGLE && target <= 360 - MIN_ANGLE);
    const moved = target == null ? pts : inRange ? cornerPointsAtAngle(pts, i, target) : null;
    body = <>
      {head(gitCommitOutline, '#4C9AFF', `${t('ec.corner')} ${labels[i]}`,
        `${prevWall} ${wallCm(pts, (i - 1 + n) % n)} ${t('re.cm')} · ${nextWall} ${wallCm(pts, i)} ${t('re.cm')}`)}
      <div className="ecard__label">{t('ec.angle')}</div>
      {sizeField(shown, deg => {
        const m = cornerPointsAtAngle(pts, i, deg);
        if (m && m !== pts) onChange(reshapedRoom(room, m));
      }, moved == null, true, '°', 1, { valid: deg => deg >= MIN_ANGLE && deg <= 360 - MIN_ANGLE && cornerPointsAtAngle(pts, i, deg) != null })}
      <div className={`ecard__hint${moved == null ? ' ecard__hint--error' : ''}`}>
        {!inRange ? t('ec.angleRange', { min: MIN_ANGLE, max: 360 - MIN_ANGLE })
          : moved == null ? t('ec.angleError')
          : moved !== pts ? `${prevWall} ${wallCm(pts, (i - 1 + n) % n)} → ${wallCm(moved, (i - 1 + n) % n)} · ${nextWall} ${wallCm(pts, i)} → ${wallCm(moved, i)} ${t('re.cm')}`
          : t('ec.angleHint', { a: prevWall, b: nextWall })}
      </div>
      <button
        className="ecard__btn ecard__btn--wide ecard__btn--block"
        disabled={offSquare < 0.05 || offSquare > 30}
        onClick={() => { const r = squareCorner(room, i); if (r) { setDraft(null); onChange(r); } }}
      >
        {t('ec.makeSquare', { deg: angle > 180 ? 270 : 90 })}
      </button>
      <div className="ecard__label">{t('ec.nudge')}</div>
      <div className="ecard__row">
        <button className="ecard__btn" onClick={() => nudge(-1, 0)}><IonIcon icon={arrowBackOutline} /></button>
        <button className="ecard__btn" onClick={() => nudge(0, -1)}><IonIcon icon={arrowUpOutline} /></button>
        <button className="ecard__btn" onClick={() => nudge(0, 1)}><IonIcon icon={arrowDownOutline} /></button>
        <button className="ecard__btn" onClick={() => nudge(1, 0)}><IonIcon icon={arrowForwardOutline} /></button>
        {deleteBtn(() => { const r = deleteVertex(room, i); if (r) { onChange(r); close(); } }, n <= 3)}
      </div>
    </>;
  }

  // ═══ Diagonal ═══
  if (selection.kind === 'diagonal') {
    const { i, j } = selection;
    const key = diagonalKey(i, j);
    const cm = diagonalCm(pts, i, j);
    const fixing = shapeDiagonals(pts, key);
    const typed = draft == null ? NaN : Math.round(parseFloat(draft));
    const target = typed > 0 && typed !== cm ? typed : null;
    const reshaped = target != null ? reshapeByDiagonals(pts, fixing, { [key]: target }) : pts;
    const range = reshaped == null ? diagonalRangeCm(pts, fixing, {}, key) : null;
    body = <>
      {head(resizeOutline, '#F9A825', `${t('ec.diagonal')} ${labels[i]}–${labels[j]}`, t('ec.byDrawing', { cm }))}
      <div className="ecard__label">{t('ec.measured')}</div>
      {sizeField(cm, () => { if (reshaped && reshaped !== pts) onChange(reshapedRoom(room, reshaped, fixing)); }, reshaped == null, false)}
      <div className={`ecard__hint${range ? ' ecard__hint--error' : ''}`}>
        {range ? t('diag.range', { min: range[0], max: range[1] }) : t('ec.diagHint')}
      </div>
      {actions([
        { icon: listOutline, label: t('ec.allDiagonals'), onClick: () => props.onOpenSection('diagonals') },
      ])}
    </>;
  }

  // ═══ Light ═══
  if (selection.kind === 'light') {
    const el = (room.lighting ?? []).find(e => e.id === selection.id)!;
    const item = el.catalogItem;
    const isPath = el.kind === 'path';
    const qty = el.kind === 'path' ? el.lengthM : 1;
    const unit = isPath ? t('unit.m') : t('mc.pcs');
    const same = props.lightings.filter(l => l.placement === (isPath ? 'path' : 'point'));
    const replace = (l: LightingCatalogItem) =>
      onChange({ lighting: (room.lighting ?? []).map(e => e.id === el.id ? { ...e, catalogItemId: l.id, catalogItem: { ...l } } : e) });
    const lightMark = (l: LightingCatalogItem) => <span className="ecard__symbol"><LightIcon type={l.type} color={l.color} size={20} /></span>;
    pick = {
      title: t('ec.type'),
      sub: isPath ? `${qty.toFixed(2)} ${t('unit.m')}` : undefined,
      options: same.map(l => ({
        id: l.id, title: l.title, mark: lightMark(l),
        price: `${priceOf(l)} ₽/${unit}`, total: isPath ? `≈ ${rub(priceOf(l) * qty)}` : undefined,
      })),
      selectedId: el.catalogItemId,
      onPick: id => { const l = same.find(x => x.id === id); if (l) replace(l); },
    };
    body = <>
      {head(isPath ? analyticsOutline : bulbOutline, '#F9A825', item.title,
        isPath ? `${qty.toFixed(2)} ${t('unit.m')} · ${priceOf(item)} ₽/${unit}` : `${priceOf(item)} ₽ + ${t('mat.install')} ${installOf(item)} ₽`)}
      {same.length > 1 && selectRow(t('ec.type'), lightMark(item), item.title, `${priceOf(item)} ₽/${unit}`)}
      <div className="ecard__price">
        <span>{isPath ? `${qty.toFixed(2)} ${t('unit.m')} × ${priceOf(item)} ₽` : `1 ${t('mc.pcs')} × ${priceOf(item)} ₽`}</span>
        <b>{rub(priceOf(item) * qty)}</b>
      </div>
      {!isPath && <>
        {(() => {
          // its two set-out numbers — the same as on the scales, which the card may cover
          if (item.type === 'track_spot' || pts.length < 3) return null;
          const f = pickFrame(pts, (room.lighting ?? []).flatMap(e => e.kind === 'point' && e.catalogItem.type !== 'track_spot' ? [{ x: e.x, y: e.y }] : []));
          if (!f) return null;
          const n = pts.length, c = frameCoords(f, el);
          const wallV = edgeLabel(pts, (f.corner - 1 + n) % n).replace(/ /g, ''), wallU = edgeLabel(pts, f.corner).replace(/ /g, '');
          return <>
            <div className="ecard__label">{t('ec.toWalls')}</div>
            <div className="ecard__hint">{`${wallV} ${Math.round(c.u)} · ${wallU} ${Math.round(c.v)} ${t('re.cm')}`}</div>
          </>;
        })()}
        <div className="ecard__label">{t('ec.nudge')}</div>
        <div className="ecard__row">
          <button className="ecard__btn" onClick={() => onChange(nudgeLight(room, el.id, -1, 0))}><IonIcon icon={arrowBackOutline} /></button>
          <button className="ecard__btn" onClick={() => onChange(nudgeLight(room, el.id, 0, -1))}><IonIcon icon={arrowUpOutline} /></button>
          <button className="ecard__btn" onClick={() => onChange(nudgeLight(room, el.id, 0, 1))}><IonIcon icon={arrowDownOutline} /></button>
          <button className="ecard__btn" onClick={() => onChange(nudgeLight(room, el.id, 1, 0))}><IonIcon icon={arrowForwardOutline} /></button>
          {deleteBtn(() => { onChange({ lighting: (room.lighting ?? []).filter(e => e.id !== el.id) }); close(); })}
        </div>
      </>}
      {/* a run has no arrows — its delete stays a full button */}
      {isPath && actions([
        {
          icon: trashOutline, label: t('common.delete'), danger: true,
          onClick: () => { onChange({ lighting: (room.lighting ?? []).filter(e => e.id !== el.id) }); close(); },
        },
      ])}
    </>;
  }

  // ═══ Niche ═══
  if (selection.kind === 'niche') {
    const el = (room.selectedNiches ?? []).find(e => e.id === selection.id)!;
    const path = el.kind === 'path' ? el : null;
    const wall = el.kind === 'wall' ? el : null;
    const cross = el.kind === 'cross' ? el : null;
    const m = nicheMetrics(room, el) ?? { lengthM: 0, turns: 0, caps: 0 };
    const lengthM = m.lengthM;
    const nc = el.niche;
    const same = props.niches.filter(x => x.unit === 'perimeter');
    const remove = () => onChange({ selectedNiches: (room.selectedNiches ?? []).filter(e => e.id !== el.id) });
    const replace = (next: RoomNicheElement) =>
      onChange({ selectedNiches: (room.selectedNiches ?? []).map(e => e.id === el.id ? next : e) });
    const patch = (p: Partial<Omit<RoomNichePath, 'kind'> & Omit<RoomNicheWall, 'kind'> & Omit<RoomNicheCross, 'kind'>>) => replace({ ...el, ...p } as RoomNicheElement);
    const freeEnds = path ? nicheFreeEnds(pts, path.points).filter(Boolean).length : 0;
    const cornice = hasCornice(el);
    const cost = nicheCost(room, el, pricing);
    const capRate = cost.parts.find(p => p.part === 'caps')?.rate ?? pricing?.overrides[nicheCapId(el.nicheId)]?.price ?? nc.priceCap ?? 0;
    const partText = (p: NicheCostPart) =>
      p.part === 'length' ? `${p.qty.toFixed(2)} ${t('unit.m')} × ${p.rate} ₽`
      : p.part === 'corners' ? `${p.qty} ${t('sum.cornersShort')} × ${p.rate} ₽`
      : p.part === 'caps' ? `${p.qty} ${t('nc.capsShort')} × ${p.rate} ₽`
      : `${t('nc.cornice')} ${p.qty.toFixed(2)} ${t('unit.m')} × ${p.rate} ₽`;
    // LED strip along the canvas edge of the niche (the line of a niche drawn by points)
    const lightPts = path ? path.points : wall ? nicheShape(room, wall)?.inner ?? null : cross ? crossLine(room, cross) : null;
    const addLight = () => {
      if (!lightPts) return;
      const key = JSON.stringify(lightPts);
      const existing = (room.lighting ?? []).find(l => l.kind === 'path' && JSON.stringify(l.points) === key);
      if (existing) { onSelect({ kind: 'light', id: existing.id }); return; }
      const strips = props.lightings.filter(l => l.placement === 'path');
      const strip = strips.find(l => l.type === 'strip') ?? strips[0];
      if (!strip) { props.onToast(t('nc.noStrip')); return; }
      const light: RoomLightingPath = {
        id: uuid(), kind: 'path', catalogItemId: strip.id, catalogItem: { ...strip },
        points: lightPts.map(p => ({ x: p.x, y: p.y })), lengthM,
      };
      onChange({ lighting: [...(room.lighting ?? []), light] });
      onSelect({ kind: 'light', id: light.id });
    };
    const n = pts.length;
    const chainName = wall ? `${labels[wall.edges[0]]}–${labels[(wall.edges[wall.edges.length - 1] + 1) % n]}` : '';
    const wallName = (e: number) => `${labels[e]}–${labels[(e + 1) % n]}`;
    const sub = [
      wall ? `${t('mat.wall')} ${chainName}` : null,
      cross ? t('nc.acrossFrom', { a: wallName(cross.a.edge), b: wallName(cross.b.edge) }) : null,
      `${lengthM.toFixed(2)} ${t('unit.m')}`,
      m.caps ? `${m.caps} ${t('nc.capsShort')}` : null,
      m.turns ? `${m.turns} ${t('sum.cornersShort')}` : null,
    ].filter(Boolean).join(' · ');
    pick = {
      title: t('ec.type'),
      sub: `${lengthM.toFixed(2)} ${t('unit.m')}`,
      options: same.map(x => ({
        id: x.id, title: x.title, mark: lineMark(NICHE_COLOR),
        price: `${priceOf(x)} ₽/${t('unit.m')}`, total: `≈ ${rub(priceOf(x) * lengthM)}`,
      })),
      selectedId: el.nicheId,
      onPick: id => {
        const x = same.find(y => y.id === id);
        if (x) patch({ nicheId: x.id, niche: { ...x } });
      },
    };

    // Where a wall niche stands: its sizes from the corners
    let placement: React.ReactNode = null;
    if (cross) {
      // each end: its gap to both corners of its wall — one follows the other
      const endFields = (end: 'a' | 'b') => {
        const w = cross[end], len = wallLengthCm(pts, w.edge);
        const startName = labels[w.edge], endName = labels[(w.edge + 1) % n];
        return <>
          <div className="ecard__label">{t('mat.wall')} {startName}–{endName}</div>
          <div className="ecard__nums ecard__nums--two">
            <NumField label={t('nc.fromCorner', { c: startName })} value={w.cm} onCommit={v => replace(setCrossEnd(room, cross, end, v))} />
            <NumField label={t('nc.toCorner', { c: endName })} value={len - w.cm} onCommit={v => replace(setCrossEnd(room, cross, end, len - v))} />
          </div>
        </>;
      };
      const width = crossWidthCm(cross);
      placement = <>
        {endFields('a')}
        {endFields('b')}
        <div className="ecard__label">{t('nc.width')}</div>
        <div className="ecard__chips">
          {DEPTH_OPTIONS.map(d => (
            <button key={d} className={`ecard__chip${width === d ? ' ecard__chip--on' : ''}`} onClick={() => patch({ widthCm: d })}>
              {d} {t('re.cm')}
            </button>
          ))}
          <div className="ecard__chip-field">
            {DEPTH_OPTIONS.includes(width)
              ? <NumField value={width} placeholder={t('nc.depthOther')} onCommit={v => patch({ widthCm: clampDepth(v) })} />
              : <NumField value={width} accent onCommit={v => patch({ widthCm: clampDepth(v) })} />}
          </div>
        </div>
        <div className="ecard__hint">{t('nc.crossHint', { n: crossCorners(room, cross) })}</div>
      </>;
    }
    if (wall) {
      const { from, to, total } = nicheSpan(room, wall);
      const startName = labels[wall.edges[0]], endName = labels[(wall.edges[wall.edges.length - 1] + 1) % n];
      const walls = (side: 'start' | 'end', delta: 1 | -1) => {
        const next = changeNicheWalls(room, wall, side, delta);
        if (next) replace(next); else props.onToast(t('nc.noMoreWalls'));
      };
      placement = <>
        <div className="ecard__nums">
          <NumField label={t('nc.fromCorner', { c: startName })} value={from} onCommit={v => replace(setNicheSizes(room, wall, { start: v }))} />
          <NumField label={t('ec.length')} value={to - from} accent onCommit={v => replace(setNicheSizes(room, wall, { length: v }))} />
          <NumField label={t('nc.toCorner', { c: endName })} value={total - to} onCommit={v => replace(setNicheSizes(room, wall, { end: v }))} />
        </div>
        <div className="ecard__label">{t('nc.depth')}</div>
        <div className="ecard__chips">
          {DEPTH_OPTIONS.map(d => (
            <button key={d} className={`ecard__chip${wall.depthCm === d ? ' ecard__chip--on' : ''}`} onClick={() => patch({ depthCm: d })}>
              {d} {t('re.cm')}
            </button>
          ))}
          {/* any other depth — a deep plasterboard box, several curtain rows */}
          <div className="ecard__chip-field">
            {DEPTH_OPTIONS.includes(wall.depthCm)
              ? <NumField value={wall.depthCm} placeholder={t('nc.depthOther')} onCommit={v => patch({ depthCm: clampDepth(v) })} />
              : <NumField value={wall.depthCm} accent onCommit={v => patch({ depthCm: clampDepth(v) })} />}
          </div>
        </div>
        <div className="ecard__label">{t('nc.walls', { n: wall.edges.length })}</div>
        <div className="ecard__chips">
          <button className="ecard__chip" onClick={() => walls('start', 1)}>+ {t('nc.wallBefore', { c: startName })}</button>
          <button className="ecard__chip" onClick={() => walls('end', 1)}>+ {t('nc.wallAfter', { c: endName })}</button>
          {(from > 0.5 || total - to > 0.5) && (
            <button className="ecard__chip" onClick={() => patch({ startCm: 0, endCm: 0 })}>{t('nc.wholeWall')}</button>
          )}
          {wall.edges.length > 1 && <>
            <button className="ecard__chip" onClick={() => walls('start', -1)}>−</button>
            <button className="ecard__chip" onClick={() => walls('end', -1)}>−</button>
          </>}
        </div>
      </>;
    }

    body = <>
      {head(albumsOutline, NICHE_COLOR, nc.title, sub)}
      {same.length > 1 && selectRow(t('ec.type'), lineMark(NICHE_COLOR), nc.title, `${priceOf(nc)} ₽/${t('unit.m')}`)}
      {placement}
      {path && <>
        <div className="ecard__label">{t('nc.caps')}</div>
        <div className="ecard__row">
          <button className="ecard__btn" disabled={m.caps <= 0} onClick={() => patch({ caps: m.caps - 1 })}>−</button>
          <div className="ecard__count">
            <b>{m.caps}</b> {t('unit.pcs')}
            {capRate > 0 && <span> · {capRate} ₽/{t('unit.pcs')}</span>}
          </div>
          <button className="ecard__btn" disabled={m.caps >= 2} onClick={() => patch({ caps: m.caps + 1 })}>+</button>
        </div>
        <div className="ecard__hint">{t(freeEnds ? 'nc.capsHintFree' : 'nc.capsHintWall', { n: freeEnds })}</div>
      </>}
      {nc.type === 'cornice' && (
        <button className={`ecard__toggle${cornice ? ' ecard__toggle--on' : ''}`} onClick={() => patch({ cornice: !cornice })}>
          <span>{t('nc.corniceOurs')}</span>
          <span className="ecard__toggle-knob" />
        </button>
      )}
      <div className="ecard__price">
        <span>{cost.parts.map(partText).join(' + ')}</span>
        <b>{rub(cost.total)}</b>
      </div>
      {actions([
        { icon: sunnyOutline, label: t('nc.light'), onClick: addLight },
        { icon: trashOutline, label: t('common.delete'), danger: true, onClick: () => { remove(); close(); } },
      ])}
    </>;
  }

  // ═══ Fabric ═══
  if (selection.kind === 'fabric') {
    const fabric = room.fabric;
    pick = {
      title: t('ec.fabric'),
      sub: `${room.areaSqm.toFixed(2)} м²`,
      options: props.fabrics.map(f => ({
        id: f.id, title: f.title, mark: swatch(f.color),
        price: `${priceOf(f)} ₽/м²`, total: `≈ ${rub(priceOf(f) * room.areaSqm)}`,
      })),
      selectedId: room.fabricId,
      onPick: id => { const f = props.fabrics.find(x => x.id === id); if (f) onChange({ fabricId: f.id, fabric: { ...f } }); },
    };
    body = <>
      {head(layersOutline, '#4C9AFF', fabric ? fabric.title : t('mat.tabFabric'),
        `${room.areaSqm.toFixed(2)} м² · ${room.perimeterM.toFixed(2)} ${t('unit.m')} · ${t('re.corners')}: ${countRealCorners(pts)}`)}
      {props.fabrics.length > 0 && selectRow(
        t('ec.fabric'),
        fabric ? swatch(fabric.color) : null,
        fabric ? fabric.title : t('rs.notSelected'),
        fabric ? `${priceOf(fabric)} ₽/м²` : '',
      )}
      {fabric && (
        <div className="ecard__price">
          <span>{room.areaSqm.toFixed(2)} м² × {priceOf(fabric)} ₽</span>
          <b>{rub(priceOf(fabric) * room.areaSqm)}</b>
        </div>
      )}
    </>;
  }

  return (
    <div className={`ecard${typing ? ' ecard--typing' : ''}`} ref={rootRef}>
      <div className="ecard__handle" />
      {body}
      {pickerOpen && pick && <PickerSheet spec={pick} onClose={() => setPickerOpen(false)} />}
    </div>
  );
};

/** A size in cm typed in place; applied on Enter or when the field loses focus */
const NumField: React.FC<{
  label?: string; value: number; accent?: boolean; onCommit: (cm: number) => void;
  /** show an empty field with this hint instead of the value (it's picked elsewhere, e.g. by a chip) */
  placeholder?: string;
}> = ({ label, value, accent, onCommit, placeholder }) => {
  const { t } = useT();
  const [draft, setDraft] = useState<string | null>(null);
  const shown = Math.round(value);
  const commit = () => {
    if (draft == null) return;
    const v = parseFloat(draft.replace(',', '.'));
    setDraft(null);
    if (Number.isFinite(v) && v >= 0 && Math.round(v) !== shown) onCommit(v);
  };
  return (
    <div className="ecard__num">
      {label && <div className="ecard__num-label">{label}</div>}
      <label className={`ecard__field${accent ? ' ecard__field--accent' : ''}${draft != null ? ' ecard__field--active' : ''}`}>
        <NumInput
          sticky group="ecard"
          label={`${label ?? placeholder ?? ''}, ${t('re.cm')}`.replace(/^, /, '')}
          value={draft ?? (placeholder ? '' : String(shown))}
          placeholder={placeholder}
          onChange={setDraft}
          onBlur={commit}
          onEscape={() => setDraft(null)}
        />
        <span className="ecard__unit">{t('re.cm')}</span>
      </label>
    </div>
  );
};

/** Bottom list of all choices for the picked element, with what each would cost here */
const PickerSheet: React.FC<{ spec: PickSpec; onClose: () => void }> = ({ spec, onClose }) => {
  const choose = (id: string | null) => { spec.onPick(id); onClose(); };
  // Hardware «back» closes the list instead of leaving the page
  useEffect(() => {
    const onBack = (e: Event) => {
      (e as CustomEvent).detail.register(150, onClose);
    };
    document.addEventListener('ionBackButton', onBack);
    return () => document.removeEventListener('ionBackButton', onBack);
  }, [onClose]);
  return (
    <div className="epick">
      <div className="epick__backdrop" onClick={onClose} />
      <div className="epick__panel">
        <div className="ecard__handle" />
        <div className="epick__head">
          <button className="epick__back" onClick={onClose} aria-label="back">
            <IonIcon icon={chevronBackOutline} />
          </button>
          <div className="epick__head-text">
            <div className="epick__title">{spec.title}</div>
            {spec.sub && <div className="epick__sub">{spec.sub}</div>}
          </div>
        </div>
        <div className="epick__list">
          {spec.options.map(o => (
            <button key={o.id} className={`epick__row${o.id === spec.selectedId ? ' epick__row--on' : ''}`} onClick={() => choose(o.id)}>
              <span className="epick__mark">{o.mark}</span>
              <span className="epick__name">
                {o.title}
                <span className="epick__price">{o.price}</span>
              </span>
              {o.total && <span className="epick__total">{o.total}</span>}
              <IonIcon icon={checkmarkOutline} className="epick__check" />
            </button>
          ))}
          {spec.noneLabel && (
            <button className={`epick__row epick__row--none${spec.selectedId == null ? ' epick__row--on' : ''}`} onClick={() => choose(null)}>
              <span className="epick__mark" />
              <span className="epick__name">{spec.noneLabel}</span>
              <IonIcon icon={checkmarkOutline} className="epick__check" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ElementCard;
