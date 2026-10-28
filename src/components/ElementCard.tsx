import React, { useLayoutEffect, useRef, useState } from 'react';
import { IonIcon } from '@ionic/react';
import {
  closeOutline, checkmarkOutline, chevronForwardOutline, removeOutline, gitCommitOutline, resizeOutline, bulbOutline,
  analyticsOutline, albumsOutline, layersOutline, cutOutline, ellipseOutline,
  copyOutline, addCircleOutline, trashOutline, gitBranchOutline, eyeOffOutline, listOutline,
  arrowBackOutline, arrowForwardOutline, arrowUpOutline, arrowDownOutline, sunnyOutline,
} from 'ionicons/icons';
import {
  Room, CatalogItem, LightingCatalogItem, NicheItem, ProjectPricing, RoomLightingPoint, RoomLightingPath,
  RoomNichePath, RoomNicheElement,
} from '../types';
import { CanvasSelection } from './CeilingCanvas';
import { SheetSection } from './RoomSheet';
import { edgeLabel, edgeLengthM, vertexLabels, countRealCorners, pointInPolygon, tessellateRoom, GRID_SIZE, nicheFreeEnds, pathTurns } from '../lib/geometry';
import { hasCornice, nicheCapId, nicheCorniceId } from '../lib/pricing';
import { diagonalCm, diagonalKey, shapeDiagonals, reshapeByDiagonals, diagonalRangeCm } from '../lib/diagonals';
import {
  reshapedRoom, resizedPoints, wallCm, roundEdge, bendEdge, setWallProfile,
  deleteVertex, cornerAngle, squareCorner, cornerPointsAtAngle, nudgeVertex,
} from '../lib/roomEdit';
import { uuid } from '../lib/uuid';
import { useT } from '../lib/i18n';
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
  onPlaceLighting: (item: LightingCatalogItem) => void;
  onPlaceNiche: (item: NicheItem) => void;
  onToast: (message: string) => void;
  onHeight: (px: number) => void;
}

const lightColor = (color: string) => (color === '#ffffff' ? '#ffeb3b' : color);
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

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => onHeight(el.offsetHeight));
    obs.observe(el);
    onHeight(el.offsetHeight);
    return () => { obs.disconnect(); onHeight(0); };
  }, []);

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

  /** Size field: − [value] + ✓ — typing doesn't touch the drawing until ✓ / Enter */
  const sizeField = (current: number, apply: (cm: number) => void, error: boolean, step = true, unit = t('re.cm'), decimals = 0) => {
    const k = 10 ** decimals;
    const typed = draft == null ? current : Math.round(parseFloat(draft) * k) / k;
    const dirty = draft != null && typed > 0 && typed !== current;
    const commit = () => { if (dirty && !error) { apply(typed); setDraft(null); inputRef.current?.blur(); } };
    const bump = (d: number) => setDraft(String(Math.max(1, Math.round(((typed > 0 ? typed : current) + d) * k) / k)));
    return (
      <div className="ecard__row">
        {step && <button className="ecard__btn" onClick={() => bump(-1)}>−</button>}
        <label className={`ecard__field${error ? ' ecard__field--error' : dirty ? ' ecard__field--active' : ''}`}>
          <input
            ref={inputRef}
            type="number" inputMode={decimals ? 'decimal' : 'numeric'} min="1" step={decimals ? 1 / k : 1}
            value={draft ?? String(current)}
            onChange={e => setDraft(e.target.value)}
            onFocus={e => e.target.select()}
            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setDraft(null); }}
          />
          <span className="ecard__unit">{unit}</span>
        </label>
        {step && <button className="ecard__btn" onClick={() => bump(1)}>+</button>}
        <button className="ecard__btn ecard__btn--primary" disabled={!dirty || error} onClick={commit}>
          <IonIcon icon={checkmarkOutline} />
        </button>
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
          ? { icon: removeOutline, label: t('ec.straighten'), onClick: () => { const r = bendEdge(room, i, 0); if (r) onChange(r); } }
          : {
            icon: ellipseOutline, label: t('ec.round'), onClick: () => {
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
      {sizeField(shown, () => { if (moved && moved !== pts) onChange(reshapedRoom(room, moved)); }, moved == null, true, '°', 1)}
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
      </div>
      {actions([
        {
          icon: trashOutline, label: t('common.delete'), danger: true, disabled: n <= 3,
          onClick: () => { const r = deleteVertex(room, i); if (r) { onChange(r); close(); } },
        },
      ])}
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
        {
          icon: eyeOffOutline, label: t('ec.hideDiagonal'),
          onClick: () => { onChange({ hiddenDiagonals: [...(room.hiddenDiagonals ?? []), key] }); close(); },
        },
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
    const lightMark = (l: LightingCatalogItem) => isPath
      ? lineMark(lightColor(l.color))
      : <span className="ecard__symbol" style={{ color: lightColor(l.color) }}>{l.symbol}</span>;
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
    const copy = () => {
      const p = el as RoomLightingPoint;
      const outline = tessellateRoom(pts, true);
      const spot = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]
        .map(([dx, dy]) => ({ x: p.x + dx * GRID_SIZE, y: p.y + dy * GRID_SIZE }))
        .find(q => pointInPolygon(q, outline));
      if (!spot) { props.onToast(t('ec.noRoom')); return; }
      const dup: RoomLightingPoint = { ...p, id: uuid(), ...spot };
      onChange({ lighting: [...(room.lighting ?? []), dup] });
      onSelect({ kind: 'light', id: dup.id });
    };
    body = <>
      {head(isPath ? analyticsOutline : bulbOutline, '#F9A825', item.title,
        isPath ? `${qty.toFixed(2)} ${t('unit.m')} · ${priceOf(item)} ₽/${unit}` : `${priceOf(item)} ₽ + ${t('mat.install')} ${installOf(item)} ₽`)}
      {same.length > 1 && selectRow(t('ec.type'), lightMark(item), item.title, `${priceOf(item)} ₽/${unit}`)}
      <div className="ecard__price">
        <span>{isPath ? `${qty.toFixed(2)} ${t('unit.m')} × ${priceOf(item)} ₽` : `1 ${t('mc.pcs')} × ${priceOf(item)} ₽`}</span>
        <b>{rub(priceOf(item) * qty)}</b>
      </div>
      {actions([
        ...(!isPath ? [{ icon: copyOutline, label: t('ec.copy'), onClick: copy }] : []),
        { icon: addCircleOutline, label: t('ec.addMore'), onClick: () => props.onPlaceLighting(item) },
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
    const lengthM = path?.lengthM ?? 0;
    const nc = el.niche;
    const same = props.niches.filter(x => x.unit === 'perimeter');
    const remove = () => onChange({ selectedNiches: (room.selectedNiches ?? []).filter(e => e.id !== el.id) });
    const patch = (p: Partial<RoomNichePath>) =>
      onChange({ selectedNiches: (room.selectedNiches ?? []).map(e => e.id === el.id ? { ...e, ...p } as RoomNicheElement : e) });
    // Project prices of the niche's own lines (see roomItems)
    const ov = pricing?.overrides ?? {};
    const turns = path ? pathTurns(path.points) : 0;
    const caps = path?.caps ?? 0;
    const freeEnds = path ? nicheFreeEnds(pts, path.points).filter(Boolean).length : 0;
    const cornice = path ? hasCornice(path) : false;
    const rate = ov[el.nicheId]?.price ?? nc.price;
    const cornerRate = ov[el.nicheId]?.priceCorner ?? nc.priceCorner ?? 0;
    const capRate = ov[nicheCapId(el.nicheId)]?.price ?? nc.priceCap ?? 0;
    const corniceRate = ov[nicheCorniceId(el.nicheId)]?.price ?? nc.priceCornice ?? 0;
    const parts: { text: string; sum: number }[] = [
      { text: `${lengthM.toFixed(2)} ${t('unit.m')} × ${rate} ₽`, sum: rate * lengthM },
      ...(turns > 0 && cornerRate > 0 ? [{ text: `${turns} ${t('sum.cornersShort')} × ${cornerRate} ₽`, sum: cornerRate * turns }] : []),
      ...(caps > 0 && capRate > 0 ? [{ text: `${caps} ${t('nc.capsShort')} × ${capRate} ₽`, sum: capRate * caps }] : []),
      ...(cornice && corniceRate > 0 ? [{ text: `${t('nc.cornice')} ${lengthM.toFixed(2)} ${t('unit.m')} × ${corniceRate} ₽`, sum: corniceRate * lengthM }] : []),
    ];
    const addLight = () => {
      if (!path) return;
      const existing = (room.lighting ?? []).find(l => l.kind === 'path' && JSON.stringify(l.points) === JSON.stringify(path.points));
      if (existing) { onSelect({ kind: 'light', id: existing.id }); return; }
      const strips = props.lightings.filter(l => l.placement === 'path');
      const strip = strips.find(l => l.type === 'strip') ?? strips[0];
      if (!strip) { props.onToast(t('nc.noStrip')); return; }
      const light: RoomLightingPath = {
        id: uuid(), kind: 'path', catalogItemId: strip.id, catalogItem: { ...strip },
        points: path.points.map(p => ({ ...p })), lengthM: path.lengthM,
      };
      onChange({ lighting: [...(room.lighting ?? []), light] });
      onSelect({ kind: 'light', id: light.id });
    };
    const sub = [
      `${lengthM.toFixed(2)} ${t('unit.m')}`,
      nc.type ? t(nc.type === 'curtain' ? 'nc.typeCurtain' : 'nc.typeCornice') : null,
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
    body = <>
      {head(albumsOutline, NICHE_COLOR, nc.title, sub)}
      {same.length > 1 && selectRow(t('ec.type'), lineMark(NICHE_COLOR), nc.title, `${priceOf(nc)} ₽/${t('unit.m')}`)}
      {path && <>
        <div className="ecard__label">{t('nc.caps')}</div>
        <div className="ecard__row">
          <button className="ecard__btn" disabled={caps <= 0} onClick={() => patch({ caps: caps - 1 })}>−</button>
          <div className="ecard__count">
            <b>{caps}</b> {t('unit.pcs')}
            {capRate > 0 && <span> · {capRate} ₽/{t('unit.pcs')}</span>}
          </div>
          <button className="ecard__btn" disabled={caps >= 2} onClick={() => patch({ caps: caps + 1 })}>+</button>
        </div>
        <div className="ecard__hint">{t(freeEnds ? 'nc.capsHintFree' : 'nc.capsHintWall', { n: freeEnds })}</div>
        {nc.type === 'cornice' && (
          <button className={`ecard__toggle${cornice ? ' ecard__toggle--on' : ''}`} onClick={() => patch({ cornice: !cornice })}>
            <span>{t('nc.corniceOurs')}</span>
            <span className="ecard__toggle-knob" />
          </button>
        )}
      </>}
      <div className="ecard__price">
        <span>{parts.map(p => p.text).join(' + ')}</span>
        <b>{rub(parts.reduce((s, p) => s + p.sum, 0))}</b>
      </div>
      {actions([
        { icon: sunnyOutline, label: t('nc.light'), onClick: addLight },
        { icon: gitBranchOutline, label: t('ec.redraw'), onClick: () => { remove(); close(); props.onPlaceNiche(nc); } },
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
      {head(layersOutline, '#4C9AFF', fabric ? fabric.title : t('sec.fabric'),
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
    <div className="ecard" ref={rootRef}>
      <div className="ecard__handle" />
      {body}
      {pickerOpen && pick && <PickerSheet spec={pick} onClose={() => setPickerOpen(false)} />}
    </div>
  );
};

/** Bottom list of all choices for the picked element, with what each would cost here */
const PickerSheet: React.FC<{ spec: PickSpec; onClose: () => void }> = ({ spec, onClose }) => {
  const choose = (id: string | null) => { spec.onPick(id); onClose(); };
  return (
    <div className="epick">
      <div className="epick__backdrop" onClick={onClose} />
      <div className="epick__panel">
        <div className="ecard__handle" />
        <div className="epick__head">
          <div className="epick__title">{spec.title}</div>
          {spec.sub && <div className="epick__sub">{spec.sub}</div>}
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
