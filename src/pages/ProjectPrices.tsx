import React, { useEffect, useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonIcon, useIonViewWillEnter,
} from '@ionic/react';
import { chevronBackOutline, addOutline, chevronForwardOutline } from 'ionicons/icons';
import { useLocation, useParams } from 'react-router-dom';
import { getProject, saveProjectPricing } from '../lib/storage';
import { uuid } from '../lib/uuid';
import { EstimateAdjustment, Project, ProjectPricing } from '../types';
import { EstimateItem, ItemPrices, changedFor, projectEstimate, projectItems, resetSideAll, roomsUsing, withPrices } from '../lib/pricing';
import { KIND_CATALOG_KEY, fmtRub, itemTitle, unitLabel } from '../lib/estimateFormat';
import PriceEditSheet from '../components/PriceEditSheet';
import { useT } from '../lib/i18n';
import { useConfirm, usePrompt } from '../components/Dialogs';
import './ProjectPrices.css';

type LinesKey = 'clientLines' | 'workerLines';

/** Every price and adjustment that makes this project differ from the price list */
const ProjectPrices: React.FC = () => {
  const { t } = useT();
  const { id } = useParams<{ id: string }>();
  // «Цены» from the client tab, «Ставки» from the crew tab: each side sees only its own settings
  const worker = new URLSearchParams(useLocation().search).get('side') === 'worker';
  const side = worker ? 'worker' : 'client';
  const [project, setProject] = useState<Project | null>(null);
  const [editing, setEditing] = useState<EstimateItem | null>(null);
  const prompt = usePrompt();
  const confirm = useConfirm();
  const [discountDraft, setDiscountDraft] = useState('');

  const load = () => {
    const p = getProject(id);
    setProject(p);
    setDiscountDraft(p?.pricing?.discountPct ? String(p.pricing.discountPct) : '');
  };
  useEffect(() => { load(); }, [id]);
  useIonViewWillEnter(() => { load(); });

  if (!project) return null;

  const est = projectEstimate(project);
  const { pricing } = est;
  const items = projectItems(est);
  const save = (next: ProjectPricing) => setProject(saveProjectPricing(project, next));

  const savePrices = (item: EstimateItem, prices: ItemPrices) => {
    save(withPrices(pricing, item, prices));
    setEditing(null);
  };

  const saveDiscount = (raw: string) => {
    setDiscountDraft(raw);
    const v = parseFloat(raw.replace(',', '.'));
    save({ ...pricing, discountPct: Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0 });
  };

  const saveLine = (key: LinesKey, line: EstimateAdjustment | null, title: string, amountRaw: string) => {
    const amount = parseFloat(amountRaw.replace(',', '.').replace('−', '-'));
    if (!title.trim() || !Number.isFinite(amount)) return;
    const next = { id: line?.id ?? uuid(), title: title.trim(), amount };
    const lines = line ? pricing[key].map(l => l.id === line.id ? next : l) : [...pricing[key], next];
    save({ ...pricing, [key]: lines });
  };

  const deleteLine = async (key: LinesKey, line: EstimateAdjustment) => {
    const ok = await confirm({
      title: t('pl.deleteTitle'),
      message: <><b>«{line.title}»</b><br />{t('pl.deleteMsg')}</>,
      confirmText: t('common.delete'),
    });
    if (ok) save({ ...pricing, [key]: pricing[key].filter(l => l.id !== line.id) });
  };

  const openLine = async (key: LinesKey, line: EstimateAdjustment | null) => {
    const v = await prompt({
      title: t(key === 'clientLines' ? 'pp.clientLines' : 'pp.workerLines'),
      message: t(key === 'clientLines' ? 'pp.lineHint' : 'pp.lineHintWorker'),
      confirmText: t('common.save'),
      fields: [
        { name: 'title', placeholder: t('pp.lineTitle'), value: line?.title ?? '', required: true },
        { name: 'amount', type: 'number', placeholder: t('pp.lineAmount'), value: line ? String(line.amount) : '', required: true },
      ],
      destructive: line ? { text: t('common.delete'), onClick: () => deleteLine(key, line) } : undefined,
    });
    if (v) saveLine(key, line, v.title, v.amount);
  };

  const askReset = async () => {
    const ok = await confirm({
      title: t(worker ? 'pp.resetTitleWorker' : 'pp.resetTitle'),
      message: t(worker ? 'pp.resetMsgWorker' : 'pp.resetMsg'),
      confirmText: t('pe.reset'),
      tone: 'warning',
    });
    if (ok) save(resetSideAll(pricing, items, side));
  };

  const linesCard = (key: LinesKey, titleKey: string) => (
    <div className="card prices-card">
      <div className="prices-card__label">{t(titleKey)}</div>
      {pricing[key].length === 0 && <div className="prices-empty">{t('pp.noLines')}</div>}
      {pricing[key].map(l => (
        <button key={l.id} className="prices-row" onClick={() => openLine(key, l)}>
          <span className="prices-row__name">{l.title}</span>
          <span className={`prices-row__value${l.amount < 0 ? ' prices-row__value--minus' : ''}`}>
            {l.amount < 0 ? '−' : '+'}{fmtRub(Math.abs(l.amount))}
          </span>
        </button>
      ))}
      <button className="prices-add" onClick={() => openLine(key, null)}>
        <IonIcon icon={addOutline} />{t('pp.addLine')}
      </button>
    </div>
  );

  const changedCount = items.filter(i => changedFor(i, side)).length;

  return (
    <IonPage>
      <IonHeader className={`blue-header${worker ? ' prices-header--worker' : ''}`}>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton text="" icon={chevronBackOutline} defaultHref={`/project/${id}/summary${worker ? '?tab=worker' : ''}`} />
          </IonButtons>
          <IonTitle>{t(worker ? 'pp.titleWorker' : 'pp.title')}</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className={`prices-content${worker ? ' prices-content--worker' : ''}`}>
        <div className="prices-list">
          {/* ── Client adjustments ── */}
          {!worker && <div className="card prices-card">
            <div className="prices-card__label">{t('pp.clientAdj')}</div>
            <label className="prices-row prices-row--input">
              <span className="prices-row__name">{t('pp.discount')}</span>
              <input
                className="prices-input"
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={discountDraft}
                onChange={e => saveDiscount(e.target.value)}
              />
            </label>
            {est.discount > 0 && (
              <div className="prices-hint">{t('sum.subtotal')} {fmtRub(est.clientSubtotal)} · −{fmtRub(est.discount)}</div>
            )}
          </div>}

          {worker ? linesCard('workerLines', 'pp.workerLines') : linesCard('clientLines', 'pp.clientLines')}

          {/* ── Item prices ── */}
          <div className="card prices-card">
            <div className="prices-card__label">{t('pp.items')}</div>
            {items.length === 0 && <div className="prices-empty">{t('pp.empty')}</div>}
            {items.map((item, i) => {
              const u = unitLabel(item.unit, t);
              const newGroup = i === 0 || items[i - 1].kind !== item.kind;
              return (
                <React.Fragment key={item.itemId}>
                  {newGroup && <div className="prices-group">{t(KIND_CATALOG_KEY[item.kind])}</div>}
                  <button className="prices-row" onClick={() => setEditing(item)}>
                    <span className="prices-row__name">
                      {itemTitle(item, t)}
                      {changedFor(item, side) && <span className="prices-badge">{t('pp.changed')}</span>}
                      <small>
                        {worker
                          ? t('pp.clientPrice', { v: `${fmtRub(item.prices.price)}/${u}` })
                          : t('pp.install', { v: `${fmtRub(item.prices.priceInstall)}/${u}` })}
                      </small>
                    </span>
                    <span className="prices-row__value">
                      {fmtRub(worker ? item.prices.priceInstall : item.prices.price)}/{u}
                      {changedFor(item, side) && (
                        <small>{t('pp.catalog', { v: fmtRub(worker ? item.base.priceInstall : item.base.price) })}</small>
                      )}
                    </span>
                    <IonIcon icon={chevronForwardOutline} className="prices-row__chevron" />
                  </button>
                </React.Fragment>
              );
            })}
          </div>

          {changedCount > 0 && (
            <button className="prices-reset" onClick={() => askReset()}>{t(worker ? 'pp.resetAllWorker' : 'pp.resetAll')}</button>
          )}
        </div>

        <PriceEditSheet
          item={editing}
          roomsCount={editing ? roomsUsing(est, editing.itemId) : 0}
          onClose={() => setEditing(null)}
          side={side}
          onSave={prices => editing && savePrices(editing, prices)}
        />
      </IonContent>


    </IonPage>
  );
};

export default ProjectPrices;
