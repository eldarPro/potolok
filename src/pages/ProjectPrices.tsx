import React, { useEffect, useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonIcon, IonAlert, useIonViewWillEnter,
} from '@ionic/react';
import { chevronBackOutline, addOutline, chevronForwardOutline } from 'ionicons/icons';
import { useParams } from 'react-router-dom';
import { getProject, saveProjectPricing } from '../lib/storage';
import { uuid } from '../lib/uuid';
import { EstimateAdjustment, Project, ProjectPricing } from '../types';
import { EstimateItem, ItemPrices, projectEstimate, projectItems, roomsUsing, withPrices } from '../lib/pricing';
import { KIND_CATALOG_KEY, fmtRub, itemTitle, unitLabel } from '../lib/estimateFormat';
import PriceEditSheet from '../components/PriceEditSheet';
import { useT } from '../lib/i18n';
import './ProjectPrices.css';

type LinesKey = 'clientLines' | 'workerLines';

/** Every price and adjustment that makes this project differ from the price list */
const ProjectPrices: React.FC = () => {
  const { t } = useT();
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [editing, setEditing] = useState<EstimateItem | null>(null);
  const [lineEdit, setLineEdit] = useState<{ key: LinesKey; line: EstimateAdjustment | null } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
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

  const deleteLine = (key: LinesKey, line: EstimateAdjustment) =>
    save({ ...pricing, [key]: pricing[key].filter(l => l.id !== line.id) });

  const linesCard = (key: LinesKey, titleKey: string) => (
    <div className="card prices-card">
      <div className="prices-card__label">{t(titleKey)}</div>
      {pricing[key].length === 0 && <div className="prices-empty">{t('pp.noLines')}</div>}
      {pricing[key].map(l => (
        <button key={l.id} className="prices-row" onClick={() => setLineEdit({ key, line: l })}>
          <span className="prices-row__name">{l.title}</span>
          <span className={`prices-row__value${l.amount < 0 ? ' prices-row__value--minus' : ''}`}>
            {l.amount < 0 ? '−' : '+'}{fmtRub(Math.abs(l.amount))}
          </span>
        </button>
      ))}
      <button className="prices-add" onClick={() => setLineEdit({ key, line: null })}>
        <IonIcon icon={addOutline} />{t('pp.addLine')}
      </button>
    </div>
  );

  const changedCount = items.filter(i => i.overridden).length;

  return (
    <IonPage>
      <IonHeader className="blue-header">
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton text="" icon={chevronBackOutline} defaultHref={`/project/${id}/summary`} />
          </IonButtons>
          <IonTitle>{t('pp.title')}</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="prices-content">
        <div className="prices-list">
          {/* ── Client adjustments ── */}
          <div className="card prices-card">
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
          </div>

          {linesCard('clientLines', 'pp.clientLines')}
          {linesCard('workerLines', 'pp.workerLines')}

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
                      {item.overridden && <span className="prices-badge">{t('pp.changed')}</span>}
                      <small>{t('pp.install', { v: `${fmtRub(item.prices.priceInstall)}/${u}` })}</small>
                    </span>
                    <span className="prices-row__value">
                      {fmtRub(item.prices.price)}/{u}
                      {item.overridden && <small>{t('pp.catalog', { v: fmtRub(item.base.price) })}</small>}
                    </span>
                    <IonIcon icon={chevronForwardOutline} className="prices-row__chevron" />
                  </button>
                </React.Fragment>
              );
            })}
          </div>

          {changedCount > 0 && (
            <button className="prices-reset" onClick={() => setConfirmReset(true)}>{t('pp.resetAll')}</button>
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

      <IonAlert
        isOpen={!!lineEdit}
        onDidDismiss={() => setLineEdit(null)}
        header={lineEdit ? t(lineEdit.key === 'clientLines' ? 'pp.clientLines' : 'pp.workerLines') : ''}
        message={t('pp.lineHint')}
        inputs={[
          { name: 'title', type: 'text', placeholder: t('pp.lineTitle'), value: lineEdit?.line?.title ?? '' },
          { name: 'amount', type: 'number', placeholder: t('pp.lineAmount'), value: lineEdit?.line ? String(lineEdit.line.amount) : '' },
        ]}
        buttons={[
          ...(lineEdit?.line ? [{
            text: t('common.delete'), role: 'destructive',
            handler: () => { if (lineEdit?.line) deleteLine(lineEdit.key, lineEdit.line); },
          }] : []),
          { text: t('common.cancel'), role: 'cancel' },
          {
            text: t('common.save'),
            handler: (v: { title: string; amount: string }) => {
              if (lineEdit) saveLine(lineEdit.key, lineEdit.line, v.title, v.amount);
            },
          },
        ]}
      />

      <IonAlert
        isOpen={confirmReset}
        onDidDismiss={() => setConfirmReset(false)}
        header={t('pp.resetTitle')}
        message={t('pp.resetMsg')}
        buttons={[
          { text: t('common.cancel'), role: 'cancel' },
          { text: t('pe.reset'), role: 'destructive', handler: () => save({ ...pricing, overrides: {} }) },
        ]}
      />
    </IonPage>
  );
};

export default ProjectPrices;
