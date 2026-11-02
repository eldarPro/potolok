import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { IonIcon, IonToggle } from '@ionic/react';
import {
  resizeOutline, layersOutline, reorderThreeOutline, bulbOutline, albumsOutline, buildOutline, briefcaseOutline,
  closeOutline, chevronBackOutline, chevronDownOutline, checkmarkOutline, ellipsisVerticalOutline,
  trashOutline, searchOutline, cutOutline, addOutline,
} from 'ionicons/icons';
import {
  Room, ProjectPricing, CatalogItem, LightingCatalogItem, NicheItem, Accessory, AdditionalService,
  RoomAccessoryItem, RoomServiceItem, RoomNicheCount, RoomLightingElement,
} from '../types';
import { CanvasSelection } from './CeilingCanvas';
import { Point, edgeLabel, vertexLabels, nextVertexLabel } from '../lib/geometry';
import { roomDiagonals, shapeDiagonals, reshapeByDiagonals, diagonalRangeCm, diagonalCm, diagonalKey } from '../lib/diagonals';
import { reshapedRoom, resizedPoints, wallCm, setWallProfile, setAllProfiles, roundEdge, bendEdge, splitEdge } from '../lib/roomEdit';
import { roomItems, lineTotal, nicheCost, ItemKind } from '../lib/pricing';
import { uuid } from '../lib/uuid';
import { useT } from '../lib/i18n';
import { LightIcon } from './LightMarks';
import { useConfirm } from './Dialogs';
import { wallArcIcon, wallLineIcon } from '../lib/icons';
import { createPortal } from 'react-dom';
import './SectionPanel.css';

export type PanelSection = 'diagonals' | 'fabric' | 'profile' | 'lighting' | 'niche' | 'accessories' | 'services';

const META: Record<PanelSection, { icon: string; color: string; title: string; kind?: ItemKind }> = {
  diagonals:   { icon: resizeOutline,       color: '#F9A825', title: 'sec.diagonals' },
  fabric:      { icon: layersOutline,       color: '#1E88E5', title: 'mat.tabFabric',     kind: 'fabric' },
  profile:     { icon: reorderThreeOutline, color: '#AB47BC', title: 'sec.profile',     kind: 'profile' },
  lighting:    { icon: bulbOutline,         color: '#F9A825', title: 'sec.lighting',    kind: 'lighting' },
  niche:       { icon: albumsOutline,       color: '#00ACC1', title: 'sec.niches',      kind: 'niche' },
  accessories: { icon: buildOutline,        color: '#43A047', title: 'sec.accessories', kind: 'accessory' },
  services:    { icon: briefcaseOutline,    color: '#E53935', title: 'sec.services',    kind: 'service' },
};

/** A list longer than this gets a search field */
const SEARCH_FROM = 8;
const SWIPE_PX = 30;

interface Props {
  section: PanelSection;
  room: Room;
  pricing?: ProjectPricing;
  fabrics: CatalogItem[];
  profiles: CatalogItem[];
  lightings: LightingCatalogItem[];
  niches: NicheItem[];
  accessories: Accessory[];
  services: AdditionalService[];
  onChange: (partial: Partial<Room>) => void;
  onPlaceLighting: (item: LightingCatalogItem) => void;
  onPlaceNiche: (item: NicheItem) => void;
  /** what's highlighted on the drawing — the wall or diagonal being edited here */
  focus: CanvasSelection | null;
  onFocus: (s: CanvasSelection | null) => void;
  /** close the panel and pick the element on the drawing, where its card has the rest */
  onPickElement: (s: CanvasSelection) => void;
  /** the wall being split (a sub-page of profiles), or null */
  splitWall: number | null;
  onSplitWall: (index: number | null) => void;
  /** a not-yet-applied split — the drawing shows the new corner and parts meanwhile */
  onPreviewRoom: (partial: Partial<Room> | null) => void;
  onToast: (message: string) => void;
  /** typed sizes not yet applied — the drawing shows them meanwhile */
  onPreview: (points: Point[] | null) => void;
  expanded: boolean;
  onExpand: (v: boolean) => void;
  onClose: () => void;
  /** open a new item form of this price-list category (from an empty list) */
  onAddToPriceList: (category: string) => void;
}

/**
 * A section can open a sub-page (e.g. picking one wall's profile). Its title
 * and the way back then take over the panel header instead of the list.
 */
interface SubPage { crumb: string; title: string; tag?: string; onBack: () => void }
const SubPageCtx = createContext<(p: SubPage | null) => void>(() => {});
const AddToPriceCtx = createContext<(category: string) => void>(() => {});
const useSubPage = (page: SubPage | null, key: unknown) => {
  const set = useContext(SubPageCtx);
  const ref = useRef(page);
  ref.current = page;
  useEffect(() => {
    if (!ref.current) { set(null); return; }
    set({ ...ref.current, onBack: () => ref.current?.onBack() });
    return () => set(null);
  }, [key]);
};

const rub = (n: number) => `${Math.round(n).toLocaleString('ru')} ₽`;

/**
 * Everything about the room, one section at a time, under the drawing — the
 * drawing itself is the preview: what's edited here is highlighted there, and
 * typed sizes reshape it before they're applied.
 */
const SectionPanel: React.FC<Props> = props => {
  const { section, room, pricing, expanded, onExpand, onClose } = props;
  const { t } = useT();
  const meta = META[section];
  const touchY = useRef<number | null>(null);
  const [sub, setSub] = useState<SubPage | null>(null);
  /** the lighting catalog, opened from «+ Add» — anchored to the button pressed */
  const [addAt, setAddAt] = useState<DOMRect | null>(null);
  // lighting keeps the catalog behind a header button, so the body is only what's in the room
  // (an empty room has its own big «Add light» button in the body instead)
  const lightCatalog = section === 'lighting' && room.areaSqm > 0 && props.lightings.length > 0;
  const lightAdd = lightCatalog && (room.lighting?.length ?? 0) > 0;

  const total = meta.kind
    ? roomItems(room, pricing).filter(i => i.kind === meta.kind).reduce((s, i) => s + lineTotal(i, 'client'), 0)
    : 0;

  const grab = {
    onTouchStart: (e: React.TouchEvent) => { touchY.current = e.touches[0].clientY; },
    onTouchEnd: (e: React.TouchEvent) => {
      if (touchY.current == null) return;
      const dy = e.changedTouches[0].clientY - touchY.current;
      touchY.current = null;
      if (dy < -SWIPE_PX) onExpand(true);
      else if (dy > SWIPE_PX) { if (expanded) onExpand(false); else onClose(); }
    },
  };

  return (
    <div className={`spanel${section === 'diagonals' ? ' spanel--last' : ''}`} style={{ '--accent': meta.color } as React.CSSProperties}>
      <div className="spanel__head" {...grab}>
        <div className="spanel__grab" onClick={() => onExpand(!expanded)}><i /></div>
        {sub ? (
          <div className="spanel__title">
            <button className="spanel__iconbtn spanel__backbtn" onClick={sub.onBack} aria-label={t('sp.back')}>
              <IonIcon icon={chevronBackOutline} />
            </button>
            <span className="spanel__subname">
              <small>{sub.crumb}</small>
              <span>{sub.title}{sub.tag && <i className="spanel__tag">{sub.tag}</i>}</span>
            </span>
            <button className="spanel__close" onClick={onClose} aria-label={t('sp.close')}>
              <IonIcon icon={closeOutline} />
            </button>
          </div>
        ) : (
          <div className="spanel__title">
            <span className="spanel__icon" style={{ background: `${meta.color}26`, color: meta.color }}>
              <IonIcon icon={meta.icon} />
            </span>
            <span className="spanel__name">{t(meta.title)}</span>
            {lightAdd ? (
              <button className="spanel__add" onClick={e => setAddAt(e.currentTarget.getBoundingClientRect())}>
                <IonIcon icon={addOutline} />{t('common.add')}
              </button>
            ) : total > 0 && <span className="spanel__total">{rub(total)}</span>}
            <button className="spanel__close" onClick={onClose} aria-label={t('sp.close')}>
              <IonIcon icon={closeOutline} />
            </button>
          </div>
        )}
      </div>
      <AddToPriceCtx.Provider value={props.onAddToPriceList}>
      <SubPageCtx.Provider value={setSub}>
      {room.areaSqm === 0 && (section === 'diagonals' || section === 'profile' || section === 'lighting')
        ? <div className="spanel__body"><Empty text={t('mat.drawFirst')} /></div>
        : section === 'diagonals' ? <DiagonalsBody {...props} />
        : section === 'fabric' ? <FabricBody {...props} />
        : section === 'profile' ? <ProfileBody {...props} />
        : section === 'lighting' ? <LightingBody {...props} total={total} onAdd={setAddAt} />
        : section === 'niche' ? <NicheBody {...props} />
        : <CountBody {...props} />}
      </SubPageCtx.Provider>
      </AddToPriceCtx.Provider>
      {lightCatalog && addAt && (
        <LightAddMenu anchor={addAt} lightings={props.lightings} pricing={pricing}
          onPick={props.onPlaceLighting} onClose={() => setAddAt(null)} />
      )}
    </div>
  );
};

/** `addTo` — price-list category: shows a button straight to a new item form; saving it returns here */
const Empty: React.FC<{ text: string; sub?: string; addTo?: string }> = ({ text, sub, addTo }) => {
  const { t } = useT();
  const addToPrice = useContext(AddToPriceCtx);
  return (
    <div className="spanel__empty">
      <b>{text}</b>{sub && <span>{sub}</span>}
      {addTo && (
        <button className="spanel__empty-btn" onClick={() => addToPrice(addTo)}>
          <IonIcon icon={addOutline} />{t('sp.addToPriceList')}
        </button>
      )}
    </div>
  );
};

const Search: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const { t } = useT();
  return (
    <label className="spanel__search">
      <IonIcon icon={searchOutline} />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={t('sp.search')} />
      {value && <button onClick={() => onChange('')}><IonIcon icon={closeOutline} /></button>}
    </label>
  );
};

const matches = (q: string, title: string) => !q.trim() || title.toLowerCase().includes(q.trim().toLowerCase());

// ═══ Diagonals ═══
// The walls stay as they are; typing a diagonal reshapes the outline around
// it. Only n − 3 diagonals are free — for a quad, the one typed last drives
// and the other follows. While typing the drawing previews the shape; leaving
// the field (or Enter) saves it as one undo step, like any other change here.
const DiagonalsBody: React.FC<Props> = ({ room, onChange, focus, onFocus, onPreview, onClose }) => {
  const { t } = useT();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [driver, setDriver] = useState<string | null>(null);
  const shape = room.points.map(p => `${p.x},${p.y}`).join(';');
  useEffect(() => { setDraft({}); setDriver(null); }, [shape]);

  const list = roomDiagonals(room.points);
  const fixing = shapeDiagonals(room.points, driver);
  const targets: Record<string, number> = {};
  for (const [i, j] of fixing) {
    const cm = Math.round(parseFloat(draft[`${i}-${j}`] ?? ''));
    if (cm > 0) targets[`${i}-${j}`] = cm;
  }
  const pts = Object.keys(targets).length > 0 ? reshapeByDiagonals(room.points, fixing, targets) : room.points;
  const dirty = pts != null && Object.entries(targets).some(([k, cm]) => {
    const [i, j] = k.split('-').map(Number);
    return cm !== diagonalCm(room.points, i, j);
  });
  const range = pts == null && driver ? diagonalRangeCm(room.points, fixing, targets, driver) : null;

  const previewKey = dirty ? JSON.stringify(pts) : '';
  useEffect(() => { onPreview(dirty ? pts : null); }, [previewKey]);
  useEffect(() => () => onPreview(null), []);

  const commit = () => {
    if (dirty && pts) { onChange(reshapedRoom(room, pts, fixing)); setDraft({}); setDriver(null); }
  };

  const edit = (key: string, raw: string) => {
    setDriver(key);
    // drafts for diagonals that no longer drive the shape would be stale
    const free = new Set(shapeDiagonals(room.points, key).map(([i, j]) => `${i}-${j}`));
    setDraft(prev => {
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(prev)) if (free.has(k)) next[k] = v;
      next[key] = raw;
      return next;
    });
  };

  if (list.length === 0) return <div className="spanel__body"><Empty text={t('diag.triangle')} /></div>;

  const activeKey = focus?.kind === 'diagonal' ? diagonalKey(focus.i, focus.j) : null;
  return (
    <>
      <div className="spanel__body">
        <div className="spanel__hint">{t('diag.hint')}</div>
        {list.map(d => {
          const bad = pts == null && driver === d.key;
          return (
            <div key={d.key} className={`spanel__row${activeKey === d.key ? ' spanel__row--on' : ''}`}
              onClick={() => onFocus({ kind: 'diagonal', i: d.i, j: d.j })}>
              <span className="spanel__tag">{d.label}</span>
              <span className="spanel__grow">
                {bad && range && <small className="spanel__bad">{t('diag.range', { min: range[0], max: range[1] })}</small>}
              </span>
              <label className={`spanel__num${bad ? ' spanel__num--bad' : ''}`}>
                <input
                  type="number" inputMode="numeric" min="0" step="1"
                  value={draft[d.key] ?? String(diagonalCm(pts ?? room.points, d.i, d.j))}
                  onChange={e => edit(d.key, e.target.value)}
                  onFocus={e => { onFocus({ kind: 'diagonal', i: d.i, j: d.j }); e.target.select(); }}
                  onBlur={commit}
                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                />
                <span>{t('re.cm')}</span>
              </label>
            </div>
          );
        })}
        {/* the panel opens on its own after drawing — a plain way out for newcomers;
            a typed diagonal is already saved by the field's blur */}
        <button className="spanel__split-go spanel__done" onClick={onClose}>
          <IonIcon icon={checkmarkOutline} />{t('diag.done')}
        </button>
      </div>
    </>
  );
};

// ═══ Fabric ═══
const FabricBody: React.FC<Props> = ({ room, pricing, fabrics, onChange }) => {
  const { t } = useT();
  const [q, setQ] = useState('');
  if (fabrics.length === 0) return <div className="spanel__body"><Empty text={t('mat.noFabrics')} addTo="fabrics" /></div>;
  const price = (f: CatalogItem) => pricing?.overrides[f.id]?.price ?? f.price;
  return (
    <div className="spanel__body">
      {fabrics.length > SEARCH_FROM && <Search value={q} onChange={setQ} />}
      {fabrics.filter(f => matches(q, f.title)).map(f => {
        const on = room.fabricId === f.id;
        return (
          <button key={f.id} className={`spanel__row spanel__pick${on ? ' spanel__row--picked' : ''}`}
            onClick={() => onChange(on ? { fabricId: null, fabric: null } : { fabricId: f.id, fabric: { ...f } })}>
            <span className="spanel__swatch" style={{ background: f.color }} />
            <span className="spanel__grow">
              {f.title}
              <small>{rub(price(f))}/{t('unit.sqm')}{room.areaSqm > 0 && ` · ${rub(price(f) * room.areaSqm)}`}</small>
            </span>
            {on && <IonIcon icon={checkmarkOutline} className="spanel__check" />}
          </button>
        );
      })}
    </div>
  );
};

// ═══ Profiles: one row per wall — its length and its profile ═══
const ProfileBody: React.FC<Props> = ({ room, pricing, profiles, onChange, focus, onFocus, onPreview, splitWall, onSplitWall, onPreviewRoom, onToast }) => {
  const { t } = useT();
  const [draft, setDraft] = useState<Record<number, string>>({});
  // the wall (or 'all') whose profile is being picked — the list replaces the walls
  const [picking, setPicking] = useState<number | 'all' | 'part1' | 'part2' | null>(null);
  const [q, setQ] = useState('');
  // ⋮ of a wall row: what the row itself can't do (split, round) — anchored to the button
  const [menu, setMenu] = useState<{ i: number; rect: DOMRect } | null>(null);
  const shape = room.points.map(p => `${p.x},${p.y}`).join(';');
  useEffect(() => { setDraft({}); }, [shape]);

  const segOf = (i: number) => room.profileSegments?.find(s => s.edgeIndex === i);
  // Typed lengths go in wall order, each on top of the previous one, so the
  // drawing (and every other field) previews what leaving the field will save.
  let pts: Point[] = room.points;
  for (const [k, raw] of Object.entries(draft).sort((x, y) => +x[0] - +y[0])) {
    const i = +k, cm = Math.round(parseFloat(raw));
    if (cm > 0 && cm !== wallCm(pts, i)) pts = resizedPoints(pts, i, cm) ?? pts;
  }
  const dirty = pts !== room.points;
  const commit = () => { if (dirty) { onChange(reshapedRoom(room, pts)); setDraft({}); } };
  const previewKey = dirty ? JSON.stringify(pts) : '';
  useEffect(() => { onPreview(dirty ? pts : null); }, [previewKey]);
  useEffect(() => () => onPreview(null), []);

  const price = (p: CatalogItem) => pricing?.overrides[p.id]?.price ?? p.price;
  const byId = (id: string | null) => profiles.find(p => p.id === id) ?? null;
  const back = () => { setPicking(null); setQ(''); };

  // ── Splitting a wall: where (from its first corner) and a profile per part ──
  const splitting = splitWall != null && splitWall < room.points.length ? splitWall : null;
  const [split, setSplit] = useState<{ raw: string; first: string | null; second: string | null }>({ raw: '', first: null, second: null });
  const splitTotal = splitting == null ? 0 : wallCm(room.points, splitting);
  useEffect(() => {
    if (splitting == null) return;
    const id = segOf(splitting)?.profileId ?? null;
    setSplit({ raw: String(Math.round(splitTotal / 2)), first: id, second: id });
    setPicking(null);
  }, [splitting]);
  const splitCm = Math.round(parseFloat(split.raw));
  const splitValid = splitting != null && splitCm > 0 && splitCm < splitTotal;
  const splitResult = splitValid ? splitEdge(room, splitting!, splitCm, byId(split.first), byId(split.second)) : null;
  useEffect(() => {
    onPreviewRoom(splitResult);
    // the new corner on the drawing — it's right after the split wall's first corner
    onFocus(splitResult && splitting != null ? { kind: 'corner', index: splitting + 1 } : null);
  }, [splitting, splitValid && splitCm, split.first, split.second, room]);
  useEffect(() => () => onPreviewRoom(null), []);
  const labels = vertexLabels(room.points);
  const splitNames = splitting == null ? null : (() => {
    const la = labels[splitting], lb = labels[(splitting + 1) % room.points.length], mid = nextVertexLabel(room.points);
    return { la, lb, wall: `${la}–${lb}`, part1: `${la}–${mid}`, part2: `${mid}–${lb}` };
  })();
  const cancelSplit = () => { onSplitWall(null); back(); };

  const isPart = picking === 'part1' || picking === 'part2';
  useSubPage(
    splitNames && isPart ? {
      crumb: `${t('mat.splitWall')} ${splitNames.wall}`,
      title: t('prof.sheetTitle'),
      tag: picking === 'part1' ? splitNames.part1 : splitNames.part2,
      onBack: back,
    }
    : splitNames ? { crumb: t('sec.profile'), title: t('mat.splitWall'), tag: splitNames.wall, onBack: cancelSplit }
    : picking == null ? null
    : {
      crumb: t('sec.profile'),
      title: picking === 'all' ? t('mat.applyAll') : t('prof.sheetTitle'),
      tag: picking === 'all' ? undefined : edgeLabel(room.points, picking as number).replace(/ /g, ''),
      onBack: back,
    },
    `${splitting}:${picking}`,
  );

  if (splitNames && !isPart) {
    const setFrom = (raw: string) => setSplit(x => ({ ...x, raw }));
    const toRaw = splitCm > 0 && splitCm < splitTotal ? String(splitTotal - splitCm) : '';
    const setTo = (raw: string) => {
      const v = Math.round(parseFloat(raw));
      setSplit(x => ({ ...x, raw: v > 0 && v < splitTotal ? String(splitTotal - v) : x.raw }));
    };
    const frac = splitValid ? splitCm / splitTotal : 0.5;
    const color = (id: string | null) => byId(id)?.color ?? '#ff6b66';
    const partRow = (part: 'part1' | 'part2', name: string, id: string | null) => {
      const p = byId(id);
      return (
        <button className="spanel__row spanel__split-part" onClick={() => setPicking(part)}>
          <span className="spanel__split-name">{name}</span>
          <span className={`spanel__swatch spanel__swatch--line${p ? '' : ' spanel__swatch--none'}`} style={p ? { background: p.color } : undefined} />
          <span className="spanel__grow">{p ? p.title : t('mat.noProfileBtn')}</span>
          <IonIcon icon={chevronDownOutline} className="spanel__split-chev" />
        </button>
      );
    };
    return (
      <div className="spanel__body">
        <div className="spanel__split-bar" style={{ '--f': `${frac * 100}%`, '--c1': color(split.first), '--c2': color(split.second) } as React.CSSProperties}>
          <input type="range" min={1} max={splitTotal - 1} step={1} value={splitValid ? splitCm : Math.round(splitTotal / 2)}
            onChange={e => setFrom(e.target.value)} aria-label={t('mat.splitWall')} />
        </div>
        <div className="spanel__split-ends"><span>{splitNames.la}</span><span>{splitTotal} {t('re.cm')}</span><span>{splitNames.lb}</span></div>
        <div className="spanel__split-fields">
          {[
            { label: t('split.from', { p: splitNames.la }), value: split.raw, set: setFrom },
            { label: t('split.to', { p: splitNames.lb }), value: toRaw, set: setTo },
          ].map(f => (
            <label key={f.label} className="spanel__split-field">
              <small>{f.label}</small>
              <span className={`spanel__num${splitValid ? '' : ' spanel__num--bad'}`}>
                <input type="number" inputMode="numeric" min="1" step="1" value={f.value}
                  onChange={e => f.set(e.target.value)} onFocus={e => e.target.select()} />
                <span>{t('re.cm')}</span>
              </span>
            </label>
          ))}
        </div>
        {profiles.length > 0 && <>
          {partRow('part1', splitNames.part1, split.first)}
          {partRow('part2', splitNames.part2, split.second)}
        </>}
        <button className="spanel__split-go" disabled={!splitResult}
          onClick={() => { if (splitResult) { onChange(splitResult); onPreviewRoom(null); cancelSplit(); } }}>
          <IonIcon icon={cutOutline} />{t('mat.split')}
        </button>
      </div>
    );
  }

  if (picking != null) {
    const current = picking === 'all' ? null
      : picking === 'part1' ? split.first : picking === 'part2' ? split.second
      : segOf(picking)?.profileId ?? null;
    const choose = (p: CatalogItem | null) => {
      if (picking === 'all') { if (p) onChange(setAllProfiles(room, p)); }
      else if (picking === 'part1') setSplit(x => ({ ...x, first: p?.id ?? null }));
      else if (picking === 'part2') setSplit(x => ({ ...x, second: p?.id ?? null }));
      else onChange(setWallProfile(room, picking, p));
      back();
    };
    return (
      <div className="spanel__body">
        {profiles.length === 0 && <Empty text={t('mat.noProfiles')} addTo="profiles" />}
        {profiles.length > SEARCH_FROM && <Search value={q} onChange={setQ} />}
        {profiles.filter(p => matches(q, p.title)).map(p => (
          <button key={p.id} className={`spanel__row spanel__pick${p.id === current ? ' spanel__row--picked' : ''}`} onClick={() => choose(p)}>
            <span className="spanel__swatch spanel__swatch--line" style={{ background: p.color }} />
            <span className="spanel__grow">{p.title}<small>{rub(price(p))}/{t('unit.m')}</small></span>
            {p.id === current && <IonIcon icon={checkmarkOutline} className="spanel__check" />}
          </button>
        ))}
        {picking !== 'all' && (
          <button className={`spanel__row spanel__pick${current == null ? ' spanel__row--picked' : ''}`} onClick={() => choose(null)}>
            <span className="spanel__swatch spanel__swatch--none" />
            <span className="spanel__grow">{t('mat.noProfileBtn')}</span>
            {current == null && <IonIcon icon={checkmarkOutline} className="spanel__check" />}
          </button>
        )}
      </div>
    );
  }

  const activeWall = focus?.kind === 'wall' ? focus.index : null;
  return (
    <>
      <div className="spanel__body">
        <div className="spanel__bar">
          <span className="spanel__hint">{t('prof.tapSize')}</span>
          {profiles.length > 0 && <button className="spanel__link" onClick={() => setPicking('all')}>{t('mat.applyAll')}</button>}
        </div>
        {room.points.map((p, i) => {
          const seg = segOf(i);
          const edited = draft[i] != null && Math.round(parseFloat(draft[i])) !== wallCm(room.points, i);
          return (
            <div key={i} className={`spanel__row spanel__wall${activeWall === i ? ' spanel__row--on' : ''}`}
              onClick={() => onFocus({ kind: 'wall', index: i })}>
              <span className="spanel__wallcolor" style={{ background: seg?.profile.color ?? '#ff6b66' }} />
              <span className="spanel__walllabel">
                {edgeLabel(room.points, i).replace(/ /g, '')}
              </span>
              <label className={`spanel__num spanel__num--wall${edited ? ' spanel__num--edited' : ''}`}>
                <input
                  type="number" inputMode="numeric" min="1" step="1"
                  value={draft[i] ?? String(wallCm(pts, i))}
                  onChange={e => { const v = e.target.value; setDraft(d => ({ ...d, [i]: v })); }}
                  onFocus={e => { onFocus({ kind: 'wall', index: i }); e.target.select(); }}
                  onBlur={commit}
                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                />
                <span>{t('re.cm')}</span>
              </label>
              <button className={`spanel__select${seg ? '' : ' spanel__select--none'}`}
                onClick={e => { e.stopPropagation(); onFocus({ kind: 'wall', index: i }); setPicking(i); }}>
                <span>{seg ? seg.profile.title : t('mat.noProfile')}</span>
                <IonIcon icon={chevronDownOutline} />
              </button>
              <button className="spanel__iconbtn" aria-label={t('sp.more')}
                onClick={e => { e.stopPropagation(); onFocus({ kind: 'wall', index: i }); setMenu({ i, rect: e.currentTarget.getBoundingClientRect() }); }}>
                <IonIcon icon={ellipsisVerticalOutline} />
              </button>
            </div>
          );
        })}
      </div>
      {menu && menu.i < room.points.length && (() => {
        const i = menu.i;
        const curved = !!room.points[i]?.bulge;
        return (
          <WallMenu
            anchor={menu.rect}
            title={`${t('mat.wall')} ${edgeLabel(room.points, i).replace(/ /g, '')}`}
            onClose={() => setMenu(null)}
            actions={[
              { icon: cutOutline, label: t('mat.split'), onClick: () => onSplitWall(i) },
              curved
                ? { icon: wallLineIcon, label: t('ec.straighten'), onClick: () => { const r = bendEdge(room, i, 0); if (r) onChange(r); } }
                : {
                  icon: wallArcIcon, label: t('ec.round'), onClick: () => {
                    const r = roundEdge(room, i);
                    if (r) onChange(r); else onToast(t('ec.cantRound'));
                  },
                },
            ]}
          />
        );
      })()}
    </>
  );
};

/** The lighting catalog under «+ Add»: picking a type goes straight to placing it on the drawing */
const LightAddMenu: React.FC<{
  anchor: DOMRect;
  lightings: LightingCatalogItem[];
  pricing?: ProjectPricing;
  onPick: (item: LightingCatalogItem) => void;
  onClose: () => void;
}> = ({ anchor, lightings, pricing, onPick, onClose }) => {
  const { t } = useT();
  const [q, setQ] = useState('');
  const up = anchor.top > window.innerHeight / 2;
  // right edge under the button, but never off either side of the screen
  const width = Math.min(300, window.innerWidth - 16);
  const pos: React.CSSProperties = {
    width,
    left: Math.min(Math.max(8, anchor.right - width), window.innerWidth - width - 8),
    maxHeight: (up ? anchor.top : window.innerHeight - anchor.bottom) - 16,
    ...(up ? { bottom: window.innerHeight - anchor.top + 6 } : { top: anchor.bottom + 6 }),
  };
  const price = (l: LightingCatalogItem) => pricing?.overrides[l.id]?.price ?? l.price;
  return createPortal(
    <div className="spanel-menu">
      <div className="spanel-menu__backdrop spanel-menu__backdrop--dim" onClick={onClose} />
      <div className="spanel-menu__panel spanel-menu__panel--list" style={pos}>
        <div className="spanel-menu__title">{t('re.pickLighting')}</div>
        {lightings.length > SEARCH_FROM && <div className="spanel-menu__search"><Search value={q} onChange={setQ} /></div>}
        <div className="spanel-menu__scroll">
          {lightings.filter(l => matches(q, l.title)).map(l => (
            <button key={l.id} className="spanel-menu__item" onClick={() => { onClose(); onPick(l); }}>
              <span className="spanel-menu__sym"><LightIcon type={l.type} color={l.color} size={20} /></span>
              <span className="spanel-menu__label">{l.title}</span>
              <small className="spanel-menu__price">
                {rub(price(l))}/{l.placement === 'path' ? t('unit.m') : t('unit.pcs')}
              </small>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
};

/** Popover next to a row's ⋮ — opens upwards when the row sits low on screen */
const WallMenu: React.FC<{
  anchor: DOMRect;
  title: string;
  actions: { icon: string; label: string; onClick: () => void }[];
  onClose: () => void;
}> = ({ anchor, title, actions, onClose }) => {
  const up = anchor.top > window.innerHeight / 2;
  const pos: React.CSSProperties = {
    right: Math.max(8, window.innerWidth - anchor.right),
    ...(up ? { bottom: window.innerHeight - anchor.top + 4 } : { top: anchor.bottom + 4 }),
  };
  // portalled: the page header sits above the panel's stacking context
  return createPortal(
    <div className="spanel-menu">
      <div className="spanel-menu__backdrop" onClick={onClose} />
      <div className="spanel-menu__panel" style={pos}>
        <div className="spanel-menu__title">{title}</div>
        {actions.map(a => (
          <button key={a.label} className="spanel-menu__item" onClick={() => { onClose(); a.onClick(); }}>
            <IonIcon icon={a.icon} />
            <span>{a.label}</span>
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
};

// ═══ Lighting: only what's in the room — the catalog opens from «+ Add» in the header ═══
const LightingBody: React.FC<Props & { total: number; onAdd: (anchor: DOMRect) => void }> = ({
  room, lightings, total, onChange, onAdd, onPickElement,
}) => {
  const { t } = useT();
  const confirm = useConfirm();
  if (lightings.length === 0) return <div className="spanel__body"><Empty text={t('mat.noLightCatalog')} sub={t('mat.noLightCatalogSub')} addTo="lightings" /></div>;
  const els = room.lighting ?? [];
  const groups = lightings
    .map(l => ({ item: l, els: els.filter(e => e.catalogItemId === l.id) }))
    .filter(g => g.els.length > 0);
  // lights whose price-list item is gone still show
  for (const e of els) if (!lightings.some(l => l.id === e.catalogItemId)) {
    const g = groups.find(x => x.item.id === e.catalogItemId);
    if (g) g.els.push(e); else groups.push({ item: e.catalogItem, els: [e] });
  }
  const amount = (g: { item: LightingCatalogItem; els: RoomLightingElement[] }) => g.item.placement === 'path'
    ? `${g.els.reduce((s, e) => s + (e.kind === 'path' ? e.lengthM : 0), 0).toFixed(2)} ${t('unit.m')}`
    : `${g.els.length} ${t('unit.pcs')}`;

  if (els.length === 0) return (
    <div className="spanel__body">
      <div className="spanel__empty">
        <b>{t('sp.noLights')}</b><span>{t('qa.pickToPlace')}</span>
        <button className="spanel__empty-btn spanel__empty-btn--accent" onClick={e => onAdd(e.currentTarget.getBoundingClientRect())}>
          <IonIcon icon={addOutline} />{t('sp.addLight')}
        </button>
      </div>
    </div>
  );

  return (
    <div className="spanel__body">
      <div className="spanel__sub spanel__sub--bar">
        <span>{t('sp.inRoom')}</span>
        {total > 0 && <b>{rub(total)}</b>}
      </div>
      {groups.map(g => (
        <div key={g.item.id} className="spanel__row">
          <span className="spanel__sym"><LightIcon type={g.item.type} color={g.item.color} size={18} /></span>
          <button className="spanel__grow spanel__plain" onClick={() => onPickElement({ kind: 'light', id: g.els[0].id })}>
            {g.item.title}<small>{amount(g)}</small>
          </button>
          <button className="spanel__iconbtn spanel__iconbtn--danger" aria-label={t('common.delete')}
            onClick={async () => {
              if (await confirm({ title: t('sp.removeTitle'), message: `«${g.item.title}», ${amount(g)}`, confirmText: t('common.delete'), dark: true }))
                onChange({ lighting: els.filter(e => !g.els.includes(e)) });
            }}>
            <IonIcon icon={trashOutline} />
          </button>
        </div>
      ))}
    </div>
  );
};

// ═══ Niches: along a wall — placed on the drawing; pieces — counted here ═══
const NicheBody: React.FC<Props> = ({ room, pricing, niches, onChange, onPlaceNiche, onPickElement }) => {
  const { t } = useT();
  const confirm = useConfirm();
  if (niches.length === 0) return <div className="spanel__body"><Empty text={t('mat.noNicheCatalog')} sub={t('mat.noNicheCatalogSub')} addTo="niches" /></div>;
  const list = room.selectedNiches ?? [];
  const placed = list.filter(n => n.kind !== 'count');
  const price = (n: NicheItem) => pricing?.overrides[n.id]?.price ?? n.price;
  const perim = niches.filter(n => n.unit === 'perimeter');
  const pieces = niches.filter(n => n.unit === 'pcs');

  const setQty = (n: NicheItem, qty: number) => {
    const existing = list.find((e): e is RoomNicheCount => e.kind === 'count' && e.nicheId === n.id);
    onChange({
      selectedNiches: qty <= 0 ? list.filter(e => e !== existing)
        : existing ? list.map(e => e === existing ? { ...existing, quantity: qty } : e)
        : [...list, { id: uuid(), kind: 'count', nicheId: n.id, niche: { ...n }, quantity: qty }],
    });
  };

  return (
    <div className="spanel__body">
      {perim.length > 0 && <div className="spanel__hint">{room.areaSqm > 0 ? t('qa.pickToPlace') : t('mat.drawFirst')}</div>}
      {perim.length > 0 && (
        <div className="spanel__tiles">
          {perim.map(n => (
            <Tile key={n.id} symbol={n.type === 'cornice' ? '▤' : '▭'} color="#00ACC1" title={n.title}
              sub={`${rub(price(n))}/${t('unit.m')}`}
              disabled={room.areaSqm === 0} onClick={() => onPlaceNiche(n)} />
          ))}
        </div>
      )}
      {pieces.map(n => (
        <Stepper key={n.id} title={n.title} sub={`${rub(price(n))}/${t('unit.pcs')}`}
          qty={list.find((e): e is RoomNicheCount => e.kind === 'count' && e.nicheId === n.id)?.quantity ?? 0}
          onSet={q => setQty(n, q)} />
      ))}
      {placed.length > 0 && <div className="spanel__sub">{t('sp.inRoom')}</div>}
      {placed.map(n => {
        const len = nicheCost(room, n, pricing).parts.find(p => p.part === 'length')?.qty ?? 0;
        return (
          <div key={n.id} className="spanel__row">
            <span className="spanel__sym" style={{ color: '#00ACC1' }}>{n.niche.type === 'cornice' ? '▤' : '▭'}</span>
            <button className="spanel__grow spanel__plain" onClick={() => onPickElement({ kind: 'niche', id: n.id })}>
              {n.niche.title}<small>{len.toFixed(2)} {t('unit.m')}</small>
            </button>
            <button className="spanel__iconbtn spanel__iconbtn--danger" aria-label={t('common.delete')}
              onClick={async () => {
                if (await confirm({ title: t('sp.removeTitle'), message: `«${n.niche.title}», ${len.toFixed(2)} ${t('unit.m')}`, confirmText: t('common.delete'), dark: true }))
                  onChange({ selectedNiches: list.filter(e => e !== n) });
              }}>
              <IonIcon icon={trashOutline} />
            </button>
          </div>
        );
      })}
    </div>
  );
};

// ═══ Accessories and services: no drawing needed, the count is set right here ═══
const CountBody: React.FC<Props> = ({ section, room, pricing, accessories, services, onChange }) => {
  const { t } = useT();
  const [q, setQ] = useState('');
  const isAcc = section === 'accessories';
  const catalog: { id: string; title: string; price: number; unit?: string }[] = isAcc ? accessories : services;
  if (catalog.length === 0) {
    return <div className="spanel__body">{isAcc
      ? <Empty text={t('mat.noAccessoryCatalog')} sub={t('mat.noAccessoryCatalogSub')} addTo="accessories" />
      : <Empty text={t('mat.noServiceCatalog')} sub={t('mat.noServiceCatalogSub')} addTo="services" />}</div>;
  }
  const accList = room.selectedAccessories ?? [];
  const svcList = room.selectedServices ?? [];
  const qtyOf = (id: string) => (isAcc ? accList.find(a => a.accessoryId === id) : svcList.find(s => s.serviceId === id))?.quantity ?? 0;

  const setQty = (id: string, qty: number) => {
    if (isAcc) {
      const a = accessories.find(x => x.id === id)!;
      const existing = accList.find(x => x.accessoryId === id);
      const item: RoomAccessoryItem = existing ? { ...existing, quantity: qty } : { id: uuid(), accessoryId: id, accessory: { ...a }, quantity: qty };
      onChange({ selectedAccessories: qty <= 0 ? accList.filter(x => x !== existing) : existing ? accList.map(x => x === existing ? item : x) : [...accList, item] });
    } else {
      const s = services.find(x => x.id === id)!;
      const existing = svcList.find(x => x.serviceId === id);
      const item: RoomServiceItem = existing ? { ...existing, quantity: qty } : { id: uuid(), serviceId: id, service: { ...s }, quantity: qty };
      onChange({ selectedServices: qty <= 0 ? svcList.filter(x => x !== existing) : existing ? svcList.map(x => x === existing ? item : x) : [...svcList, item] });
    }
  };

  // what's already in the room goes first, so a long price list doesn't hide it
  const shown = catalog.filter(c => matches(q, c.title))
    .sort((a, b) => Number(qtyOf(b.id) > 0) - Number(qtyOf(a.id) > 0));
  return (
    <div className="spanel__body">
      <div className="spanel__hint">{t('qa.countHere')}</div>
      {catalog.length > SEARCH_FROM && <Search value={q} onChange={setQ} />}
      {shown.map(c => (
        <Stepper key={c.id} title={c.title}
          sub={`${rub(pricing?.overrides[c.id]?.price ?? c.price)}${c.unit ? `/${c.unit}` : ''}`}
          qty={qtyOf(c.id)} onSet={qty => setQty(c.id, qty)} />
      ))}
    </div>
  );
};

const Tile: React.FC<{
  symbol: React.ReactNode; title: string; sub: string; color: string;
  disabled?: boolean; onClick: () => void;
}> = ({ symbol, title, sub, color, disabled, onClick }) => (
  <button className="spanel__tile" disabled={disabled} onClick={onClick}>
    <span className="spanel__tilesym" style={{ color }}>{symbol}</span>
    <b>{title}</b>
    <small>{sub}</small>
  </button>
);

const Stepper: React.FC<{ title: string; sub: string; qty: number; onSet: (qty: number) => void }> = ({ title, sub, qty, onSet }) => (
  <div className={`spanel__row${qty > 0 ? ' spanel__row--has' : ''}`}>
    <span className="spanel__grow">{title}<small>{sub}</small></span>
    <span className="spanel__stepper">
      <button disabled={qty <= 0} onClick={() => onSet(qty - 1)}>−</button>
      <b>{qty}</b>
      <button onClick={() => onSet(qty + 1)}>+</button>
    </span>
  </div>
);

export default SectionPanel;
