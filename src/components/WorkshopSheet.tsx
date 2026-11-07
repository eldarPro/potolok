import React, { useEffect, useMemo, useState } from 'react';
import { IonIcon, IonModal, IonSpinner, useIonToast } from '@ionic/react';
import { checkmarkOutline, shareOutline } from 'ionicons/icons';
import { Project } from '../types';
import { loadMasterProfile } from '../lib/storage';
import {
  SHRINK_MAX, SHRINK_MIN, SHRINK_PRESETS, clampShrink, fitBox, fmtPct, isDrawn,
  loadShrink, saveShrink, shrinkRoom, uprightDeg,
} from '../lib/shrink';
import { buildWorkshopPdf } from '../lib/workshopPdf';
import { sharePdf } from '../lib/sharePdf';
import { useT } from '../lib/i18n';
import RoomThumb from './RoomThumb';
import './WorkshopSheet.css';

interface Props {
  project: Project;
  /** null — closed; 'all' — the whole project with room checkboxes; a room id — that room, with a preview */
  target: 'all' | string | null;
  onClose: () => void;
}

const VW = 360, VH = 230;

/** The room as the workshop will see it: cut sizes on the walls */
const ShrunkPreview: React.FC<{ project: Project; roomId: string; pct: number }> = ({ project, roomId, pct }) => {
  const room = project.rooms.find(r => r.id === roomId);
  const sr = room ? shrinkRoom(room, pct) : null;
  if (!sr) return null;
  const fit = fitBox(sr.outline, VW, VH, 34);
  const pts = sr.outline.map(fit);
  return (
    <svg className="ws-preview" viewBox={`0 0 ${VW} ${VH}`} width="100%" height={VH}>
      <polygon points={pts.map(p => `${p.x},${p.y}`).join(' ')} className="ws-preview__room" />
      {sr.walls.map((w, i) => {
        const m = fit(w.mid);
        const x = m.x + w.out.x * 13, y = m.y + w.out.y * 13;
        return (
          <text key={i} x={x} y={y} className="ws-preview__wall" textAnchor="middle" dominantBaseline="middle"
            transform={`rotate(${uprightDeg(w.dir)} ${x} ${y})`}>{w.cm}</text>
        );
      })}
      {sr.corners.map((c, i) => {
        const p = fit(c.p);
        return (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={2.5} className="ws-preview__dot" />
            <text x={p.x + c.out.x * 12} y={p.y + c.out.y * 12} className="ws-preview__corner" textAnchor="middle" dominantBaseline="middle">{c.label}</text>
          </g>
        );
      })}
    </svg>
  );
};

const WorkshopSheet: React.FC<Props> = ({ project, target, onClose }) => {
  const { t, nRooms } = useT();
  const [pct, setPctRaw] = useState(loadShrink);
  // the field's text, so it can be cleared and retyped
  const [draft, setDraft] = useState(() => fmtPct(loadShrink()));
  const setPct = (v: number) => { setPctRaw(v); setDraft(fmtPct(v)); };
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [presentToast] = useIonToast();

  const drawn = useMemo(() => project.rooms.filter(isDrawn), [project]);
  const single = target && target !== 'all' ? target : null;

  useEffect(() => {
    if (!target) return;
    setPct(loadShrink());
    setPicked(new Set(single ? [single] : drawn.map(r => r.id)));
  }, [target]);

  const rooms = single ? drawn.filter(r => r.id === single) : drawn.filter(r => picked.has(r.id));
  const step = (d: number) => setPct(clampShrink(Math.round(pct + d)));
  const toggle = (id: string) => setPicked(s => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const send = async () => {
    if (!rooms.length || busy) return;
    setBusy(true);
    try {
      saveShrink(pct);
      const doc = await buildWorkshopPdf(project, rooms, pct, loadMasterProfile(), t);
      const who = project.clientName.trim().replace(/\s+/g, '_') || 'zakaz';
      const name = `ceh_${who}${single ? '_' + rooms[0].name.replace(/\s+/g, '_') : ''}.pdf`;
      await sharePdf(doc, name, t('ws.pdfTitle'));
      onClose();
    } catch (e) {
      console.error(e);
      presentToast({ message: t('ws.shareError'), duration: 2500, color: 'danger', position: 'top' });
    } finally {
      setBusy(false);
    }
  };

  const singleRoom = single ? project.rooms.find(r => r.id === single) : null;

  return (
    <IonModal isOpen={!!target} onDidDismiss={onClose} breakpoints={[0, 1]} initialBreakpoint={1} className="new-room-modal ws-modal">
      <div className="new-room-modal__content">
        <div className="new-room-modal__handle" />
        <div className="ws-title">{singleRoom ? t('ws.titleRoom', { name: singleRoom.name }) : t('ws.title')}</div>
        <div className="ws-sub">{singleRoom ? t('ws.subRoom') : t('ws.sub')}</div>

        {single && <div className="ws-preview-box"><ShrunkPreview project={project} roomId={single} pct={pct} /></div>}

        <div className="ws-label">{t('ws.shrink')}</div>
        <div className="ws-stepper">
          <button onClick={() => step(-1)} disabled={pct <= SHRINK_MIN} aria-label="−">−</button>
          <div className="ws-stepper__val">
            <input
              type="text" inputMode="decimal" aria-label={t('ws.shrink')}
              value={draft}
              onChange={e => {
                const text = e.target.value.replace(/[^\d.,]/g, '').slice(0, 4);
                setDraft(text);
                const v = parseFloat(text.replace(',', '.'));
                if (Number.isFinite(v)) setPctRaw(clampShrink(v));
              }}
              onBlur={() => setDraft(fmtPct(pct))}
            />
            <small>%</small>
          </div>
          <button onClick={() => step(1)} disabled={pct >= SHRINK_MAX} aria-label="+">+</button>
        </div>
        <div className="ws-chips">
          {SHRINK_PRESETS.map(v => (
            <button key={v} className={`ws-chip${v === pct ? ' ws-chip--on' : ''}`} onClick={() => setPct(v)}>{v} %</button>
          ))}
        </div>

        {!single && (
          <>
            <div className="ws-label">{t('pd.rooms')}</div>
            <div className="ws-rooms">
              {project.rooms.map(r => {
                const ok = isDrawn(r);
                const on = ok && picked.has(r.id);
                const corners = ok ? shrinkRoom(r, pct)?.corners.length ?? 0 : 0;
                return (
                  <button key={r.id} className={`ws-room${ok ? '' : ' ws-room--off'}`} disabled={!ok} onClick={() => toggle(r.id)}>
                    <span className="ws-room__thumb">{ok && <RoomThumb points={r.points} size={44} pad={3} strokeWidth={1.5} />}</span>
                    <span className="ws-room__text">
                      <b>{r.name}</b>
                      <small>{ok ? [`${t('pdf.corners')}: ${corners}`, r.fabric?.title].filter(Boolean).join(' · ') : t('pd.noDrawing')}</small>
                    </span>
                    <span className={`ws-check${on ? ' ws-check--on' : ''}`}>{on && <IonIcon icon={checkmarkOutline} />}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        <button className="ws-send" disabled={!rooms.length || busy} onClick={send}>
          {busy ? <IonSpinner name="crescent" /> : <IonIcon icon={shareOutline} />}
          {single || rooms.length === 0 ? t('ws.send') : t('ws.sendN', { n: `${rooms.length} ${nRooms(rooms.length)}` })}
        </button>
        <div className="ws-note">{t('ws.note', { pct: fmtPct(pct) })}</div>
      </div>
    </IonModal>
  );
};

export default WorkshopSheet;
