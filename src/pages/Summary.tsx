import React, { useEffect, useRef, useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonButton, IonIcon,
  useIonRouter, useIonViewWillEnter, useIonViewDidEnter,
} from '@ionic/react';
import { chevronBackOutline, downloadOutline, shareSocialOutline, createOutline, lockClosedOutline, chevronDownOutline } from 'ionicons/icons';
import { useLocation, useParams } from 'react-router-dom';
import { getProject, saveProjectPricing } from '../lib/storage';
import { Project } from '../types';
import {
  EstimateItem, EstimateSide, ItemPrices, changedFor, lineTotal, projectEstimate, roomCorners, roomsUsing, withPrices,
} from '../lib/pricing';
import { fmtRub, lineCalc, sectionedItems } from '../lib/estimateFormat';
import { buildEstimatePdf, loadPdfFonts } from '../lib/estimatePdf';
import PriceEditSheet from '../components/PriceEditSheet';
import { useT } from '../lib/i18n';
import './Summary.css';

const signedRub = (v: number) => `${v < 0 ? '−' : '+'}${fmtRub(Math.abs(v))}`;

const Summary: React.FC = () => {
  const { t, nRooms } = useT();
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const router = useIonRouter();
  const query = new URLSearchParams(location.search);
  // Opened from a room: show that room, fold the others
  const focusRoomId = query.get('room');
  const contentRef = useRef<HTMLIonContentElement>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [side, setSide] = useState<EstimateSide>(query.get('tab') === 'worker' ? 'worker' : 'client');
  const [editing, setEditing] = useState<EstimateItem | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    if (!focusRoomId) return {};
    const rooms = getProject(id)?.rooms ?? [];
    return Object.fromEntries(rooms.filter(r => r.id !== focusRoomId).map(r => [r.id, true]));
  });

  const load = () => setProject(getProject(id));
  useEffect(() => { load(); }, [id]);
  useIonViewWillEnter(() => { load(); });
  useIonViewDidEnter(() => {
    const content = contentRef.current;
    const card = focusRoomId && document.querySelector<HTMLElement>(`.summary-room[data-room-id="${focusRoomId}"]`);
    if (!content || !card) return;
    content.getScrollElement().then(scroller => {
      const top = card.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      content.scrollToPoint(0, top - 12, 300);
    });
  });
  // Warm the PDF font so sharing doesn't lose the tap's user activation to a fetch
  useEffect(() => { loadPdfFonts().catch(() => {}); }, []);

  if (!project) return null;

  const est = projectEstimate(project);
  const { pricing } = est;
  const worker = side === 'worker';
  const totalSqm = est.rooms.reduce((s, r) => s + r.room.areaSqm, 0);
  const total = worker ? est.workerTotal : est.clientTotal;

  const savePrices = (item: EstimateItem, prices: ItemPrices) => {
    setProject(saveProjectPricing(project, withPrices(pricing, item, prices)));
    setEditing(null);
  };

  const pdfFileName = `${worker ? 'naryad' : 'smeta'}_${project.clientName.replace(/\s+/g, '_')}.pdf`;
  const handlePDF = async () => (await buildEstimatePdf(project, est, side, t)).save(pdfFileName);
  const handleShare = async () => {
    const doc = await buildEstimatePdf(project, est, side, t);
    const file = new File([doc.output('blob')], pdfFileName, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: t(worker ? 'pdf.workerTitle' : 'pd.estimate') });
    } else {
      doc.save(pdfFileName);
    }
  };

  const openPrices = () => router.push(`/project/${id}/prices`, 'forward', 'push');
  const date = new Date().toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <IonPage>
      <IonHeader className={`summary-header${worker ? ' summary-header--worker' : ''}`}>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton text="" icon={chevronBackOutline} defaultHref={`/project/${id}`} />
          </IonButtons>
          <IonTitle>{t('pd.estimate')}</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={handleShare}>
              <IonIcon slot="icon-only" icon={shareSocialOutline} />
            </IonButton>
            <IonButton onClick={handlePDF}>
              <IonIcon slot="icon-only" icon={downloadOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent ref={contentRef} className={`summary-content${worker ? ' summary-content--worker' : ''}`}>
        {/* ── Client + tab switch ── */}
        <div className={`summary-hero${worker ? ' summary-hero--worker' : ''}`}>
          <div className="summary-hero__name">{project.clientName}</div>
          <div className="summary-hero__sub">{[project.address, date].filter(Boolean).join(' · ')}</div>
          <div className="summary-tabs" role="tablist">
            {(['client', 'worker'] as EstimateSide[]).map(s => (
              <button
                key={s}
                role="tab"
                aria-selected={side === s}
                className={`summary-tabs__tab${side === s ? ' summary-tabs__tab--on' : ''}`}
                onClick={() => setSide(s)}
              >
                {t(s === 'client' ? 'sum.tabClient' : 'sum.tabWorker')}
              </button>
            ))}
          </div>
        </div>

        {/* ── Total ── */}
        <div className="summary-total card">
          <div className="summary-total__main">
            <b>{fmtRub(total)}</b>
            <small>
              {worker
                ? t('sum.toWorker')
                : `${t('sum.toPay')} · ${totalSqm.toFixed(1)} м² · ${est.rooms.length} ${nRooms(est.rooms.length)}`}
            </small>
          </div>
          <button className="summary-total__prices" onClick={openPrices}>
            <IonIcon icon={createOutline} />
            {t(worker ? 'sum.rates' : 'sum.prices')}
          </button>
        </div>

        <div className="summary-list">
          {/* ── Margin: only the master sees it, never in a PDF ── */}
          {worker && est.clientTotal > 0 && (
            <div className="summary-margin">
              <div className="summary-margin__row">
                <span>{t('sum.margin', { client: fmtRub(est.clientTotal), worker: fmtRub(est.workerTotal) })}</span>
                <b>{fmtRub(est.clientTotal - est.workerTotal)}</b>
              </div>
              <small><IonIcon icon={lockClosedOutline} />{t('sum.marginHint')}</small>
            </div>
          )}

          {/* ── Rooms ── */}
          {est.rooms.map(r => {
            const groups = sectionedItems(r.items, side);
            const roomTotal = worker ? r.worker : r.client;
            const isCollapsed = collapsed[r.room.id];
            const lineCount = groups.reduce((s, g) => s + g.items.length, 0);
            return (
              <div key={r.room.id} className="card summary-room" data-room-id={r.room.id}>
                <button
                  className="summary-room__head"
                  onClick={() => setCollapsed({ ...collapsed, [r.room.id]: !isCollapsed })}
                >
                  <span className="summary-room__name">{r.room.name}</span>
                  {roomTotal > 0 && <span className="summary-room__total">{fmtRub(roomTotal)}</span>}
                  <IonIcon
                    icon={chevronDownOutline}
                    className={`summary-room__chevron${isCollapsed ? ' summary-room__chevron--closed' : ''}`}
                  />
                </button>
                <div className="summary-room__dims">
                  {r.room.areaSqm.toFixed(2)} м² · {r.room.perimeterM.toFixed(2)} {t('unit.m')} · {roomCorners(r.room)} {t('sum.corners')}
                  {isCollapsed && lineCount > 0 && ` · ${t('rs.positions', { n: lineCount })}`}
                </div>
                {!isCollapsed && groups.map(g => (
                  <React.Fragment key={g.key}>
                    <div className="summary-section-label">{t(g.key)}</div>
                    {g.items.map(item => (
                      <button key={item.itemId} className="summary-line" onClick={() => setEditing(item)}>
                        <span className="summary-line__name">
                          {changedFor(item, side) && <i className="summary-line__dot" aria-label={t('pp.changed')} />}
                          {item.title}
                        </span>
                        <span className="summary-line__calc">{lineCalc(item, side, t)}</span>
                        <span className="summary-line__total">{fmtRub(lineTotal(item, side))}</span>
                      </button>
                    ))}
                  </React.Fragment>
                ))}
                {!isCollapsed && worker && groups.length === 0 && (
                  <div className="summary-room__empty">{t('sum.noWorker')}</div>
                )}
              </div>
            );
          })}

          {/* ── Adjustments and the final sum ── */}
          {!worker ? (
            <div className="card summary-sums">
              {(est.discount > 0 || pricing.clientLines.length > 0) && (
                <>
                  <div className="summary-sums__row"><span>{t('sum.subtotal')}</span><span>{fmtRub(est.clientSubtotal)}</span></div>
                  {est.discount > 0 && (
                    <div className="summary-sums__row summary-sums__row--minus">
                      <span>{t('sum.discount', { pct: pricing.discountPct })}</span><span>−{fmtRub(est.discount)}</span>
                    </div>
                  )}
                  {pricing.clientLines.map(l => (
                    <div key={l.id} className={`summary-sums__row${l.amount < 0 ? ' summary-sums__row--minus' : ''}`}>
                      <span>{l.title}</span><span>{signedRub(l.amount)}</span>
                    </div>
                  ))}
                </>
              )}
              <div className="summary-sums__row summary-sums__row--final">
                <span>{t('sum.totalLabel')}</span><span>{fmtRub(est.clientTotal)}</span>
              </div>
            </div>
          ) : (
            <div className="card summary-sums">
              {pricing.workerLines.length > 0 && (
                <>
                  <div className="summary-sums__row"><span>{t('sum.subtotal')}</span><span>{fmtRub(est.workerSubtotal)}</span></div>
                  {pricing.workerLines.map(l => (
                    <div key={l.id} className={`summary-sums__row${l.amount < 0 ? ' summary-sums__row--minus' : ''}`}>
                      <span>{l.title}</span><span>{signedRub(l.amount)}</span>
                    </div>
                  ))}
                </>
              )}
              <div className="summary-sums__row summary-sums__row--final">
                <span>{t('sum.workerTotal')}</span><span>{fmtRub(est.workerTotal)}</span>
              </div>
            </div>
          )}
        </div>

        <PriceEditSheet
          item={editing}
          roomsCount={editing ? roomsUsing(est, editing.itemId) : 0}
          onClose={() => setEditing(null)}
          onSave={prices => editing && savePrices(editing, prices)}
          onReset={() => editing && savePrices(editing, editing.base)}
        />
      </IonContent>
    </IonPage>
  );
};

export default Summary;
