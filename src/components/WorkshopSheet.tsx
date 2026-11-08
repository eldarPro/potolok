import React, { useEffect, useMemo, useState } from 'react';
import { IonIcon, IonModal, IonSpinner, useIonToast } from '@ionic/react';
import { checkmarkOutline, chevronDown, shareOutline } from 'ionicons/icons';
import { Project, Room, Shrink } from '../types';
import { loadMasterProfile } from '../lib/storage';
import {
  SHRINK_MAX, SHRINK_MIN, SHRINK_PRESETS, byAxes, clampShrink, fitBox, fmtPct, fmtShrink, isDrawn,
  loadShrink, placeLabels, saveShrink, shrinkRoom, uprightDeg,
} from '../lib/shrink';
import { buildWorkshopPdf } from '../lib/workshopPdf';
import { sharePdf } from '../lib/sharePdf';
import { useT } from '../lib/i18n';
import RoomThumb from './RoomThumb';
import './WorkshopSheet.css';

type T = (key: string, vars?: Record<string, string | number>) => string;

interface Props {
  project: Project;
  /** null — closed; 'all' — every drawn room ticked; a room id — the same sheet with only that room ticked */
  target: 'all' | string | null;
  onClose: () => void;
  /** a room's own shrink was set or cleared */
  onChange: (project: Project) => void;
}

// ── a percent: − field + ──

const PctField: React.FC<{ value: number; onChange: (v: number) => void; big?: boolean; label: string }> = ({ value, onChange, big, label }) => {
  const [draft, setDraft] = useState(fmtPct(value));
  useEffect(() => { setDraft(fmtPct(value)); }, [value]);
  const set = (v: number) => onChange(clampShrink(v));
  return (
    <div className={`ws-pct${big ? ' ws-pct--big' : ''}`}>
      <button onClick={() => set(Math.round(value - 1))} disabled={value <= SHRINK_MIN} aria-label="−">−</button>
      <div className="ws-pct__val">
        <input
          type="text" inputMode="decimal" aria-label={label}
          value={draft}
          onChange={e => {
            const text = e.target.value.replace(/[^\d.,]/g, '').slice(0, 4);
            setDraft(text);
            const v = parseFloat(text.replace(',', '.'));
            if (Number.isFinite(v)) onChange(clampShrink(v));
          }}
          onBlur={() => setDraft(fmtPct(value))}
        />
        <small>%</small>
      </div>
      <button onClick={() => set(Math.round(value + 1))} disabled={value >= SHRINK_MAX} aria-label="+">+</button>
    </div>
  );
};

/** One percent for the whole sheet, or one along the length and one along the width */
const ShrinkEditor: React.FC<{ value: Shrink; onChange: (s: Shrink) => void; t: T }> = ({ value, onChange, t }) => {
  // both modes keep their figures: switching to one percent keeps the
  // length/width pair (saved with the order or the room) to switch back to
  const axes = byAxes(value);
  return (
    <>
      <div className="ws-seg">
        <button className={axes ? '' : 'ws-seg--on'} onClick={() => axes && onChange({ ...value, one: true })}>{t('ws.shared')}</button>
        <button className={axes ? 'ws-seg--on' : ''} onClick={() => !axes && onChange({ pct: value.pct, axes: value.axes ?? { x: value.pct, y: value.pct } })}>{t('ws.axes')}</button>
      </div>
      {axes && value.axes ? (
        <>
          <div className="ws-axes">
            <div className="ws-axis">
              <div className="ws-axis__name">↔ {t('ws.lengthAx')}</div>
              <PctField value={value.axes.x} label={t('ws.lengthAx')} onChange={x => onChange({ ...value, axes: { ...value.axes!, x } })} />
            </div>
            <div className="ws-axis">
              <div className="ws-axis__name">↕ {t('ws.widthAx')}</div>
              <PctField value={value.axes.y} label={t('ws.widthAx')} onChange={y => onChange({ ...value, axes: { ...value.axes!, y } })} />
            </div>
          </div>
          <div className="ws-hint">{t('ws.axesHint')}</div>
        </>
      ) : (
        <>
          <PctField big value={value.pct} label={t('ws.shrink')} onChange={pct => onChange({ ...value, pct })} />
          <div className="ws-chips">
            {SHRINK_PRESETS.map(v => (
              <button key={v} className={`ws-chip${v === value.pct ? ' ws-chip--on' : ''}`} onClick={() => onChange({ ...value, pct: v })}>{v} %</button>
            ))}
          </div>
        </>
      )}
    </>
  );
};

// ── the room as the workshop will see it ──

const VW = 360, VH = 220;

const ShrunkPreview: React.FC<{ room: Room; shrink: Shrink; t: T }> = ({ room, shrink, t }) => {
  const sr = shrinkRoom(room, shrink);
  if (!sr) return null;
  const axes = sr.pct.x !== sr.pct.y;
  const fit = fitBox(sr.outline, VW, VH, axes ? 42 : 34);
  const pts = sr.outline.map(fit);
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  // sizes and letters kept off each other and off the walls (short walls at an inner corner)
  const spots = placeLabels(
    sr.walls.map(w => {
      const a = fit(w.mid), b = fit({ x: w.mid.x + w.dir.x * 100, y: w.mid.y + w.dir.y * 100 });
      const scale = Math.hypot(b.x - a.x, b.y - a.y) / 100;
      return { mid: a, dir: w.dir, out: w.out, len: w.chord * scale, tw: String(w.cm).length * 7.6 + 2, th: 13 };
    }),
    sr.corners.map(c => ({ p: fit(c.p), out: c.out, size: 11 })),
    pts, { w: axes ? VW - 20 : VW, h: axes ? VH - 18 : VH }, 13,
  );
  return (
    <svg className="ws-preview" viewBox={`0 0 ${VW} ${VH}`} width="100%" height={VH}>
      <defs>
        <marker id="ws-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" className="ws-preview__axis-head" />
        </marker>
      </defs>
      <polygon points={pts.map(p => `${p.x},${p.y}`).join(' ')} className="ws-preview__room" />
      {sr.walls.map((w, i) => {
        const { x, y } = spots.walls[i];
        return (
          <text key={i} x={x} y={y} className="ws-preview__wall" textAnchor="middle" dominantBaseline="middle"
            transform={`rotate(${uprightDeg(w.dir)} ${x} ${y})`}>{w.cm}</text>
        );
      })}
      {sr.corners.map((c, i) => {
        const p = fit(c.p), at = spots.corners[i];
        return (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={2.5} className="ws-preview__dot" />
            <text x={at.x} y={at.y} className="ws-preview__corner" textAnchor="middle" dominantBaseline="middle">{c.label}</text>
          </g>
        );
      })}
      {axes && (
        <>
          <line x1={x0} y1={VH - 9} x2={x1} y2={VH - 9} className="ws-preview__axis" markerStart="url(#ws-arrow)" markerEnd="url(#ws-arrow)" />
          <text x={(x0 + x1) / 2} y={VH - 9} className="ws-preview__axis-label" textAnchor="middle" dominantBaseline="middle">
            {t('ws.lenShort', { pct: fmtPct(sr.pct.x) })}
          </text>
          <line x1={VW - 9} y1={y0} x2={VW - 9} y2={y1} className="ws-preview__axis" markerStart="url(#ws-arrow)" markerEnd="url(#ws-arrow)" />
          <text x={VW - 9} y={(y0 + y1) / 2} className="ws-preview__axis-label" textAnchor="middle" dominantBaseline="middle"
            transform={`rotate(-90 ${VW - 9} ${(y0 + y1) / 2})`}>
            {t('ws.widShort', { pct: fmtPct(sr.pct.y) })}
          </text>
        </>
      )}
    </svg>
  );
};

/**
 * A room's shrink: the order's, or its own (kept in the room). Only its own
 * is edited here — the order's is set on the order sheet, for every room.
 */
const RoomShrink: React.FC<{
  room: Room; order: Shrink; own: Shrink | undefined;
  onOwn: (s: Shrink | undefined) => void; t: T;
}> = ({ room, order, own, onOwn, t }) => (
  <>
    <div className="ws-preview-box"><ShrunkPreview room={room} shrink={own ?? order} t={t} /></div>
    <div className="ws-src">
      <button className={`ws-opt${own ? '' : ' ws-opt--on'}`} onClick={() => onOwn(undefined)}>
        <span className="ws-opt__radio" />
        <span><b>{t('ws.asOrder')}</b><small>{t('ws.asOrderSub', { pct: fmtShrink(order) })}</small></span>
      </button>
      <button className={`ws-opt${own ? ' ws-opt--on' : ''}`} onClick={() => !own && onOwn({ ...order })}>
        <span className="ws-opt__radio" />
        <span><b>{t('ws.own')}</b><small>{t('ws.ownSub')}</small></span>
      </button>
    </div>
    {own && (
      <>
        <div className="ws-label">{t('ws.roomShrinkLabel')}</div>
        <ShrinkEditor value={own} onChange={onOwn} t={t} />
      </>
    )}
  </>
);

const WorkshopSheet: React.FC<Props> = ({ project, target, onClose, onChange }) => {
  const { t, nRooms } = useT();
  const [order, setOrder] = useState<Shrink>(loadShrink);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  // the room whose shrink is open on top of the order sheet, and its pending own shrink
  const [editing, setEditing] = useState<string | null>(null);
  const [editOwn, setEditOwn] = useState<Shrink | undefined>(undefined);
  const [presentToast] = useIonToast();

  const drawn = useMemo(() => project.rooms.filter(isDrawn), [project]);

  useEffect(() => {
    if (!target) return;
    setOrder(loadShrink());
    setPicked(new Set(target === 'all' ? drawn.map(r => r.id) : [target]));
  }, [target]);

  const setRoomShrink = (p: Project, roomId: string, s: Shrink | undefined): Project => ({
    ...p,
    rooms: p.rooms.map(r => {
      if (r.id !== roomId) return r;
      const next = { ...r, shrink: s };
      if (!s) delete next.shrink;
      return next;
    }),
    updatedAt: new Date().toISOString(),
  });

  const rooms = drawn.filter(r => picked.has(r.id));
  const toggle = (id: string) => setPicked(s => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const openRoom = (r: Room) => { setEditOwn(r.shrink); setEditing(r.id); };
  const saveRoom = () => {
    if (editing) onChange(setRoomShrink(project, editing, editOwn));
    setEditing(null);
  };
  const editingRoom = editing ? project.rooms.find(r => r.id === editing) ?? null : null;

  const send = async () => {
    if (!rooms.length || busy) return;
    setBusy(true);
    try {
      saveShrink(order);
      const doc = await buildWorkshopPdf(project, rooms, order, loadMasterProfile(), t);
      const who = project.clientName.trim().replace(/\s+/g, '_') || 'zakaz';
      const one = rooms.length === 1 && drawn.length > 1 ? '_' + rooms[0].name.replace(/\s+/g, '_') : '';
      const name = `ceh_${who}${one}.pdf`;
      await sharePdf(doc, name, t('ws.pdfTitle'));
      onClose();
    } catch (e) {
      console.error(e);
      presentToast({ message: t('ws.shareError'), duration: 2500, color: 'danger', position: 'top' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <IonModal isOpen={!!target} onDidDismiss={onClose} breakpoints={[0, 1]} initialBreakpoint={1} className="new-room-modal ws-modal">
      <div className="new-room-modal__content">
        <div className="new-room-modal__handle" />
        <div className="ws-title">{t('ws.title')}</div>
        <div className="ws-sub">{t('ws.sub')}</div>

        <div className="ws-label">{t('ws.orderShrink')}</div>
        <ShrinkEditor value={order} onChange={setOrder} t={t} />
        <div className="ws-label">{t('pd.rooms')}</div>
        <div className="ws-rooms">
          {project.rooms.map(r => {
            const ok = isDrawn(r);
            const on = ok && picked.has(r.id);
            return (
              <div key={r.id} className={`ws-room${ok ? '' : ' ws-room--off'}`}>
                <button className="ws-room__main" disabled={!ok} onClick={() => toggle(r.id)}>
                  <span className="ws-room__thumb">{ok && <RoomThumb points={r.points} size={44} pad={3} strokeWidth={1.5} />}</span>
                  <span className="ws-room__text">
                    <b>{r.name}</b>
                    <small>{ok ? [r.fabric?.title, r.shrink && t('ws.ownTag')].filter(Boolean).join(' · ') : t('pd.noDrawing')}</small>
                  </span>
                </button>
                {ok && (
                  <button className={`ws-pill${r.shrink ? ' ws-pill--own' : ''}`} onClick={() => openRoom(r)} aria-label={t('ws.roomShrink', { name: r.name })}>
                    {fmtShrink(r.shrink ?? order)}
                    <IonIcon icon={chevronDown} />
                  </button>
                )}
                <button className={`ws-check${on ? ' ws-check--on' : ''}`} disabled={!ok} onClick={() => toggle(r.id)} aria-label={r.name}>
                  {on && <IonIcon icon={checkmarkOutline} />}
                </button>
              </div>
            );
          })}
        </div>

        <button className="ws-send" disabled={!rooms.length || busy} onClick={send}>
          {busy ? <IonSpinner name="crescent" /> : <IonIcon icon={shareOutline} />}
          {rooms.length === 0 ? t('ws.send') : t('ws.sendN', { n: `${rooms.length} ${nRooms(rooms.length)}` })}
        </button>
      </div>

      <IonModal isOpen={!!editingRoom} onDidDismiss={() => setEditing(null)} breakpoints={[0, 1]} initialBreakpoint={1} className="new-room-modal ws-modal">
        {editingRoom && (
          <div className="new-room-modal__content">
            <div className="new-room-modal__handle" />
            <div className="ws-title">{t('ws.roomShrink', { name: editingRoom.name })}</div>
            <div className="ws-sub">{editingRoom.fabric?.title ?? ''}</div>
            <RoomShrink room={editingRoom} order={order} own={editOwn} onOwn={setEditOwn} t={t} />
            <button className="ws-send" onClick={saveRoom}>{t('ws.done')}</button>
          </div>
        )}
      </IonModal>
    </IonModal>
  );
};

export default WorkshopSheet;
