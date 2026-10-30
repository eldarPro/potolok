import React, { useState } from 'react';
import { IonIcon, useIonToast } from '@ionic/react';
import { trashOutline } from 'ionicons/icons';
import { NicheItem, ProjectPricing, Room, RoomNicheCross, RoomNicheElement, RoomNichePath, RoomNicheWall } from '../types';
import { Point, nicheFreeEnds, vertexLabels } from '../lib/geometry';
import { chainLengthCm, crossBand, crossCorners, crossWidthCm, inwardNormal, nicheMetrics, nicheShape, nicheSpan, pointAlongChain, wallLengthCm } from '../lib/nicheGeometry';
import { setNicheSizes, changeNicheWalls, setCrossEnd, DEPTH_OPTIONS, clampDepth } from '../lib/nicheEdit';
import { hasCornice, nicheCost } from '../lib/pricing';
import RoomPreview, { PreviewNiche } from './RoomPreview';
import { useT } from '../lib/i18n';
import './NicheSection.css';

interface Props {
  room: Room;
  /** price-list niches a drawn one can be switched to */
  catalog: NicheItem[];
  pricing?: ProjectPricing;
  onChange: (partial: Partial<Room>) => void;
}

const rub = (n: number) => `${Math.round(n).toLocaleString('ru')} ₽`;

/** A cap across the line end `a`, `len` px long */
const capAcross = (a: Point, toward: Point, len: number): [Point, Point] => {
  const dx = toward.x - a.x, dy = toward.y - a.y, l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l * len / 2, ny = dx / l * len / 2;
  return [{ x: a.x + nx, y: a.y + ny }, { x: a.x - nx, y: a.y - ny }];
};

/**
 * Niches page: the room in miniature with every drawn niche, and each niche's
 * sizes right below it — typed in cm, seen at once in the preview, like the
 * diagonals page. New niches go on from the drawing.
 */
const NicheSection: React.FC<Props> = ({ room, catalog, pricing, onChange }) => {
  const { t } = useT();
  const [presentToast] = useIonToast();
  const drawn = (room.selectedNiches ?? []).filter((n): n is RoomNichePath | RoomNicheWall | RoomNicheCross => n.kind !== 'count');
  const [activeId, setActiveId] = useState<string | null>(drawn[0]?.id ?? null);
  const active = drawn.find(n => n.id === activeId) ?? null;
  const pts = room.points;
  const labels = vertexLabels(pts);
  const perimeterItems = catalog.filter(c => c.unit === 'perimeter');
  const toast = (message: string) => presentToast({ message, duration: 1800, position: 'top' });

  const replace = (next: RoomNicheElement) =>
    onChange({ selectedNiches: (room.selectedNiches ?? []).map(e => e.id === next.id ? next : e) });
  const remove = (id: string) => onChange({ selectedNiches: (room.selectedNiches ?? []).filter(e => e.id !== id) });

  const typeSelect = (n: RoomNicheWall | RoomNicheCross) => (
    <label className="nsec-type">
      <span>{t('ec.type')}</span>
      <select
        value={n.nicheId}
        onChange={e => { const x = perimeterItems.find(c => c.id === e.target.value); if (x) replace({ ...n, nicheId: x.id, niche: { ...x } }); }}
      >
        {perimeterItems.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
      </select>
    </label>
  );
  const corniceToggle = (n: RoomNicheWall | RoomNicheCross) => n.niche.type === 'cornice' && (
    <button className={`nsec-toggle${hasCornice(n) ? ' nsec-toggle--on' : ''}`} onClick={() => replace({ ...n, cornice: !hasCornice(n) })}>
      <span>{t('nc.corniceOurs')}</span>
      <span className="nsec-toggle__knob" />
    </button>
  );

  // 10/15/20/25 cm or any other, typed — a niche's depth or width
  const sizeChips = (value: number, set: (cm: number) => void) => (
    <div className="nsec-chips nsec-chips--row">
      {DEPTH_OPTIONS.map(d => (
        <button key={d} className={`nsec-chip${value === d ? ' nsec-chip--on' : ''}`} onClick={() => set(d)}>
          {d} {t('re.cm')}
        </button>
      ))}
      <div className="nsec-chip-field">
        <CmInput
          value={value} accent={!DEPTH_OPTIONS.includes(value)}
          placeholder={DEPTH_OPTIONS.includes(value) ? t('nc.depthOther') : undefined}
          onCommit={v => set(clampDepth(v))}
        />
      </div>
    </div>
  );

  // ── Preview ──
  const previewNiches: PreviewNiche[] = drawn.flatMap(n => {
    if (n.kind === 'cross') {
      const cb = crossBand(room, n);
      return cb ? [{ id: n.id, band: cb.band, line: cb.line, caps: [] }] : [];
    }
    if (n.kind === 'path') {
      const [s, e] = nicheFreeEnds(pts, n.points);
      const k = n.points.length;
      return [{
        id: n.id, line: n.points,
        caps: [...(s ? [capAcross(n.points[0], n.points[1], 16)] : []), ...(e ? [capAcross(n.points[k - 1], n.points[k - 2], 16)] : [])],
      }];
    }
    const sh = nicheShape(room, n);
    if (!sh) return [];
    const last = sh.wall.length - 1, lastIn = sh.inner.length - 1;
    return [{
      id: n.id, band: [...sh.wall, ...[...sh.inner].reverse()], line: sh.inner,
      caps: [
        ...(sh.freeStart ? [[sh.wall[0], sh.inner[0]] as [Point, Point]] : []),
        ...(sh.freeEnd ? [[sh.wall[last], sh.inner[lastIn]] as [Point, Point]] : []),
      ],
    }];
  });

  // gaps to the corners and the niche's own length, outside its wall
  const dims = (() => {
    const outOf = (edge: number) => { const nr = inwardNormal(pts, edge); return { x: -nr.x, y: -nr.y }; };
    if (active?.kind === 'cross') {
      // each end's gaps to its wall's corners
      const out: { at: Point; out: Point; text: string; main: boolean }[] = [];
      for (const w of [active.a, active.b]) {
        const len = wallLengthCm(pts, w.edge);
        if (w.cm > 0.5) out.push({ at: pointAlongChain(pts, [w.edge], w.cm / 2).point, out: outOf(w.edge), text: `${Math.round(w.cm)}`, main: false });
        if (len - w.cm > 0.5) out.push({ at: pointAlongChain(pts, [w.edge], (w.cm + len) / 2).point, out: outOf(w.edge), text: `${Math.round(len - w.cm)}`, main: false });
      }
      return out;
    }
    if (active?.kind !== 'wall' || !nicheShape(room, active)) return [];
    const { from, to, total } = nicheSpan(room, active);
    const out: { at: Point; out: Point; text: string; main: boolean }[] = [];
    const part = (a: number, b: number, main: boolean) => {
      if (b - a < 0.5) return;
      const { point, edge } = pointAlongChain(pts, active.edges, (a + b) / 2);
      const nr = inwardNormal(pts, edge);
      out.push({ at: point, out: { x: -nr.x, y: -nr.y }, text: `${Math.round(b - a)}`, main });
    };
    part(0, from, false); part(from, to, true); part(to, total, false);
    return out;
  })();

  return (
    <div className="nsec">
      <RoomPreview
        points={pts}
        niches={previewNiches}
        activeNiche={activeId}
        onNicheTap={setActiveId}
        dims={dims}
      />

      {drawn.map((n, idx) => {
        const isActive = n.id === activeId;
        const m = nicheMetrics(room, n) ?? { lengthM: 0, turns: 0, caps: 0 };
        const cost = nicheCost(room, n, pricing);
        const edgeName = (e: number) => `${labels[e]}–${labels[(e + 1) % pts.length]}`;
        const wallName = n.kind === 'wall'
          ? `${t('mat.wall')} ${labels[n.edges[0]]}–${labels[(n.edges[n.edges.length - 1] + 1) % pts.length]}`
          : n.kind === 'cross' ? t('nc.acrossFrom', { a: edgeName(n.a.edge), b: edgeName(n.b.edge) })
          : `${t('mat.line')} ${idx + 1}`;
        const sub = [
          wallName, `${m.lengthM.toFixed(2)} ${t('unit.m')}`,
          m.caps ? `${m.caps} ${t('nc.capsShort')}` : null,
          m.turns ? `${m.turns} ${t('sum.cornersShort')}` : null,
          hasCornice(n) ? t('nc.cornice').toLowerCase() : null,
        ].filter(Boolean).join(' · ');
        return (
          <div key={n.id} className={`nsec-card${isActive ? ' nsec-card--active' : ''}`} onClick={() => setActiveId(n.id)}>
            <div className="nsec-card__head">
              <div className="nsec-card__bar" />
              <div className="nsec-card__titles">
                <div className="nsec-card__title">{n.niche.title}</div>
                <div className="nsec-card__sub">{sub}</div>
              </div>
              <div className="nsec-card__total">{rub(cost.total)}</div>
              <button className="nsec-card__del" onClick={e => { e.stopPropagation(); remove(n.id); }} aria-label={t('common.delete')}>
                <IonIcon icon={trashOutline} />
              </button>
            </div>

            {isActive && n.kind === 'path' && <div className="nsec-hint">{t('nc.drawnByPoints')}</div>}

            {isActive && n.kind === 'cross' && (
              <div className="nsec-edit" onClick={e => e.stopPropagation()}>
                {perimeterItems.length > 1 && typeSelect(n)}
                {(['a', 'b'] as const).map(end => {
                  const w = n[end], len = wallLengthCm(pts, w.edge);
                  const startName = labels[w.edge], endName = labels[(w.edge + 1) % pts.length];
                  return (
                    <React.Fragment key={end}>
                      <div className="nsec-label">{t('mat.wall')} {startName}–{endName}</div>
                      <div className="nsec-nums nsec-nums--two">
                        <CmInput label={t('nc.fromCorner', { c: startName })} value={w.cm} onCommit={v => replace(setCrossEnd(room, n, end, v))} />
                        <CmInput label={t('nc.toCorner', { c: endName })} value={len - w.cm} onCommit={v => replace(setCrossEnd(room, n, end, len - v))} />
                      </div>
                    </React.Fragment>
                  );
                })}
                <div className="nsec-label">{t('nc.width')}</div>
                {sizeChips(crossWidthCm(n), v => replace({ ...n, widthCm: v }))}
                {corniceToggle(n)}
                <div className="nsec-hint">{t('nc.crossHint', { n: crossCorners(room, n) })}</div>
              </div>
            )}

            {isActive && n.kind === 'wall' && (() => {
              const { from, to, total } = nicheSpan(room, n);
              const startName = labels[n.edges[0]], endName = labels[(n.edges[n.edges.length - 1] + 1) % pts.length];
              const walls = (side: 'start' | 'end', delta: 1 | -1) => {
                const next = changeNicheWalls(room, n, side, delta);
                if (next) replace(next); else toast(t('nc.noMoreWalls'));
              };
              const whole = from < 0.5 && total - to < 0.5;
              return (
                <div className="nsec-edit" onClick={e => e.stopPropagation()}>
                  {perimeterItems.length > 1 && typeSelect(n)}

                  <div className="nsec-nums">
                    <CmInput label={t('nc.fromCorner', { c: startName })} value={from} onCommit={v => replace(setNicheSizes(room, n, { start: v }))} />
                    <CmInput label={t('ec.length')} value={to - from} accent onCommit={v => replace(setNicheSizes(room, n, { length: v }))} />
                    <CmInput label={t('nc.toCorner', { c: endName })} value={total - to} onCommit={v => replace(setNicheSizes(room, n, { end: v }))} />
                  </div>

                  <div className="nsec-label">{t('nc.depth')}</div>
                  {sizeChips(n.depthCm, v => replace({ ...n, depthCm: v }))}
                  <div className="nsec-label">{t('nc.walls', { n: n.edges.length })}</div>
                  <div className="nsec-chips">
                    <button className="nsec-chip" onClick={() => walls('start', 1)}>+ {t('nc.wallBefore', { c: startName })}</button>
                    <button className="nsec-chip" onClick={() => walls('end', 1)}>+ {t('nc.wallAfter', { c: endName })}</button>
                    {!whole && <button className="nsec-chip" onClick={() => replace({ ...n, startCm: 0, endCm: 0 })}>{t('nc.wholeWall')}</button>}
                    {n.edges.length > 1 && <>
                      <button className="nsec-chip" onClick={() => walls('start', -1)}>− {startName}</button>
                      <button className="nsec-chip" onClick={() => walls('end', -1)}>− {endName}</button>
                    </>}
                  </div>

                  {corniceToggle(n)}

                  <div className="nsec-hint">{t('nc.chainHint', { a: startName, b: endName, cm: Math.round(chainLengthCm(pts, n.edges)) })}</div>
                </div>
              );
            })()}
          </div>
        );
      })}
    </div>
  );
};

/** A size in cm, applied on Enter or when the field loses focus */
const CmInput: React.FC<{ label?: string; value: number; accent?: boolean; placeholder?: string; onCommit: (cm: number) => void }> = ({ label, value, accent, placeholder, onCommit }) => {
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
    <div className="nsec-num">
      {label && <div className="nsec-num__label">{label}</div>}
      <label className={`nsec-num__field${accent ? ' nsec-num__field--accent' : ''}${draft != null ? ' nsec-num__field--active' : ''}`}>
        <input
          type="number" inputMode="numeric" min="0"
          value={draft ?? (placeholder ? '' : String(shown))}
          placeholder={placeholder}
          onChange={e => setDraft(e.target.value)}
          onFocus={e => e.target.select()}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setDraft(null); }}
        />
        <span>{t('re.cm')}</span>
      </label>
    </div>
  );
};

export default NicheSection;
