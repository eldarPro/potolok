import React, { useEffect, useRef, useState } from 'react';
import { IonIcon, IonToggle } from '@ionic/react';
import {
  resizeOutline, layersOutline, reorderThreeOutline, bulbOutline, albumsOutline, buildOutline, briefcaseOutline,
  closeOutline, chevronBackOutline, chevronDownOutline, checkmarkOutline, ellipsisVerticalOutline,
  trashOutline, searchOutline,
} from 'ionicons/icons';
import {
  Room, ProjectPricing, CatalogItem, LightingCatalogItem, NicheItem, Accessory, AdditionalService,
  RoomAccessoryItem, RoomServiceItem, RoomNicheCount, RoomLightingElement,
} from '../types';
import { CanvasSelection } from './CeilingCanvas';
import { Point, edgeLabel } from '../lib/geometry';
import { roomDiagonals, shapeDiagonals, reshapeByDiagonals, diagonalRangeCm, diagonalCm, diagonalKey } from '../lib/diagonals';
import { reshapedRoom, resizedPoints, wallCm, setWallProfile, setAllProfiles } from '../lib/roomEdit';
import { roomItems, lineTotal, nicheCost, ItemKind } from '../lib/pricing';
import { uuid } from '../lib/uuid';
import { useT } from '../lib/i18n';
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
  /** typed sizes not yet applied — the drawing shows them meanwhile */
  onPreview: (points: Point[] | null) => void;
  expanded: boolean;
  onExpand: (v: boolean) => void;
  onClose: () => void;
}

const rub = (n: number) => `${Math.round(n).toLocaleString('ru')} ₽`;
const lightColor = (color: string) => (color === '#ffffff' ? '#ffeb3b' : color);

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
    <div className="spanel" style={{ '--accent': meta.color } as React.CSSProperties}>
      <div className="spanel__head" {...grab}>
        <div className="spanel__grab" onClick={() => onExpand(!expanded)}><i /></div>
        <div className="spanel__title">
          <span className="spanel__icon" style={{ background: `${meta.color}26`, color: meta.color }}>
            <IonIcon icon={meta.icon} />
          </span>
          <span className="spanel__name">{t(meta.title)}</span>
          {total > 0 && <span className="spanel__total">{rub(total)}</span>}
          <button className="spanel__close" onClick={onClose} aria-label={t('sp.close')}>
            <IonIcon icon={closeOutline} />
          </button>
        </div>
      </div>
      {room.areaSqm === 0 && (section === 'diagonals' || section === 'profile' || section === 'lighting')
        ? <div className="spanel__body"><Empty text={t('mat.drawFirst')} /></div>
        : section === 'diagonals' ? <DiagonalsBody {...props} />
        : section === 'fabric' ? <FabricBody {...props} />
        : section === 'profile' ? <ProfileBody {...props} />
        : section === 'lighting' ? <LightingBody {...props} />
        : section === 'niche' ? <NicheBody {...props} />
        : <CountBody {...props} />}
    </div>
  );
};

const Empty: React.FC<{ text: string; sub?: string }> = ({ text, sub }) => (
  <div className="spanel__empty"><b>{text}</b>{sub && <span>{sub}</span>}</div>
);

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

/** The apply button pinned under a scrolling list of typed sizes */
const ApplyBar: React.FC<{ label: string; onApply: () => void; onReset: () => void }> = ({ label, onApply, onReset }) => {
  const { t } = useT();
  return (
    <div className="spanel__apply">
      <button className="spanel__btn spanel__btn--ghost" onClick={onReset}>{t('common.cancel')}</button>
      <button className="spanel__btn" onClick={onApply}>{label}</button>
    </div>
  );
};

// ═══ Diagonals ═══
// The walls stay as they are; typing a diagonal reshapes the outline around
// it. Only n − 3 diagonals are free — for a quad, the one typed last drives
// and the other follows.
const DiagonalsBody: React.FC<Props> = ({ room, onChange, focus, onFocus, onPreview }) => {
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
                />
                <span>{t('re.cm')}</span>
              </label>
            </div>
          );
        })}
      </div>
      {dirty && pts && (
        <ApplyBar label={t('diag.apply')} onReset={() => { setDraft({}); setDriver(null); }}
          onApply={() => { onChange(reshapedRoom(room, pts, fixing)); setDraft({}); }} />
      )}
    </>
  );
};

// ═══ Fabric ═══
const FabricBody: React.FC<Props> = ({ room, pricing, fabrics, onChange }) => {
  const { t } = useT();
  const [q, setQ] = useState('');
  if (fabrics.length === 0) return <div className="spanel__body"><Empty text={t('mat.noFabrics')} /></div>;
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
const ProfileBody: React.FC<Props> = ({ room, pricing, profiles, onChange, focus, onFocus, onPickElement, onPreview }) => {
  const { t } = useT();
  const [draft, setDraft] = useState<Record<number, string>>({});
  // the wall (or 'all') whose profile is being picked — the list replaces the walls
  const [picking, setPicking] = useState<number | 'all' | null>(null);
  const [q, setQ] = useState('');
  const shape = room.points.map(p => `${p.x},${p.y}`).join(';');
  useEffect(() => { setDraft({}); }, [shape]);

  const segOf = (i: number) => room.profileSegments?.find(s => s.edgeIndex === i);
  // Typed lengths go in wall order, each on top of the previous one, so the
  // drawing (and every other field) shows exactly what «Применить» will save.
  let pts: Point[] = room.points;
  for (const [k, raw] of Object.entries(draft).sort((x, y) => +x[0] - +y[0])) {
    const i = +k, cm = Math.round(parseFloat(raw));
    if (cm > 0 && cm !== wallCm(pts, i)) pts = resizedPoints(pts, i, cm) ?? pts;
  }
  const dirty = pts !== room.points;
  const previewKey = dirty ? JSON.stringify(pts) : '';
  useEffect(() => { onPreview(dirty ? pts : null); }, [previewKey]);
  useEffect(() => () => onPreview(null), []);

  const price = (p: CatalogItem) => pricing?.overrides[p.id]?.price ?? p.price;

  if (picking != null) {
    const current = picking === 'all' ? null : segOf(picking)?.profileId ?? null;
    const choose = (p: CatalogItem | null) => {
      if (picking === 'all') { if (p) onChange(setAllProfiles(room, p)); }
      else onChange(setWallProfile(room, picking, p));
      setPicking(null); setQ('');
    };
    return (
      <div className="spanel__body">
        <button className="spanel__back" onClick={() => { setPicking(null); setQ(''); }}>
          <IonIcon icon={chevronBackOutline} />
          {picking === 'all' ? t('mat.applyAllHeader') : `${t('prof.sheetTitle')} ${edgeLabel(room.points, picking).replace(/ /g, '')}`}
        </button>
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
                {p.bulge ? <span className="spanel__curve">⌒</span> : null}
              </span>
              <label className={`spanel__num spanel__num--wall${edited ? ' spanel__num--edited' : ''}`}>
                <input
                  type="number" inputMode="numeric" min="1" step="1"
                  value={draft[i] ?? String(wallCm(pts, i))}
                  onChange={e => { const v = e.target.value; setDraft(d => ({ ...d, [i]: v })); }}
                  onFocus={e => { onFocus({ kind: 'wall', index: i }); e.target.select(); }}
                />
                <span>{t('re.cm')}</span>
              </label>
              <button className={`spanel__select${seg ? '' : ' spanel__select--none'}`}
                onClick={e => { e.stopPropagation(); onFocus({ kind: 'wall', index: i }); setPicking(i); }}>
                <span>{seg ? seg.profile.title : t('mat.noProfile')}</span>
                <IonIcon icon={chevronDownOutline} />
              </button>
              <button className="spanel__iconbtn" onClick={e => { e.stopPropagation(); onPickElement({ kind: 'wall', index: i }); }}>
                <IonIcon icon={ellipsisVerticalOutline} />
              </button>
            </div>
          );
        })}
      </div>
      {dirty && (
        <ApplyBar label={t('prof.applySize')} onReset={() => setDraft({})}
          onApply={() => { onChange(reshapedRoom(room, pts)); setDraft({}); }} />
      )}
    </>
  );
};

// ═══ Lighting: pick a type to place it, then what's in the room ═══
const LightingBody: React.FC<Props> = ({ room, pricing, lightings, onChange, onPlaceLighting, onPickElement }) => {
  const { t } = useT();
  const [q, setQ] = useState('');
  if (lightings.length === 0) return <div className="spanel__body"><Empty text={t('mat.noLightCatalog')} sub={t('mat.noLightCatalogSub')} /></div>;
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
  const price = (l: LightingCatalogItem) => pricing?.overrides[l.id]?.price ?? l.price;

  return (
    <div className="spanel__body">
      <div className="spanel__hint">{t('qa.pickToPlace')}</div>
      {lightings.length > SEARCH_FROM && <Search value={q} onChange={setQ} />}
      <div className="spanel__tiles">
        {lightings.filter(l => matches(q, l.title)).map(l => (
          <Tile key={l.id} symbol={l.symbol} color={lightColor(l.color)} title={l.title}
            sub={`${rub(price(l))}/${l.placement === 'path' ? t('unit.m') : t('unit.pcs')}`}
            onClick={() => onPlaceLighting(l)} />
        ))}
      </div>
      {groups.length > 0 && <div className="spanel__sub">{t('sp.inRoom')}</div>}
      {groups.map(g => (
        <div key={g.item.id} className="spanel__row">
          <span className="spanel__sym" style={{ color: lightColor(g.item.color) }}>{g.item.symbol}</span>
          <button className="spanel__grow spanel__plain" onClick={() => onPickElement({ kind: 'light', id: g.els[0].id })}>
            {g.item.title}<small>{amount(g)}</small>
          </button>
          <button className="spanel__iconbtn spanel__iconbtn--danger" aria-label={t('common.delete')}
            onClick={() => onChange({ lighting: els.filter(e => !g.els.includes(e)) })}>
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
  if (niches.length === 0) return <div className="spanel__body"><Empty text={t('mat.noNicheCatalog')} sub={t('mat.noNicheCatalogSub')} /></div>;
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
              onClick={() => onChange({ selectedNiches: list.filter(e => e !== n) })}>
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
      ? <Empty text={t('mat.noAccessoryCatalog')} sub={t('mat.noAccessoryCatalogSub')} />
      : <Empty text={t('mat.noServiceCatalog')} sub={t('mat.noServiceCatalogSub')} />}</div>;
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
  symbol: string; title: string; sub: string; color: string;
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
