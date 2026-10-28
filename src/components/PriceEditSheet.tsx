import React, { useEffect, useState } from 'react';
import { IonModal } from '@ionic/react';
import { EstimateItem, ItemPrices, hasCorners } from '../lib/pricing';
import { KIND_CATALOG_KEY, fmtRub, itemTitle, unitLabel } from '../lib/estimateFormat';
import { useT } from '../lib/i18n';
import ActionButton from './ActionButton';
import './PriceEditSheet.css';

interface Props {
  /** the item to edit; null keeps the sheet closed */
  item: EstimateItem | null;
  roomsCount: number;
  onClose: () => void;
  onSave: (prices: ItemPrices) => void;
  /** back to the prices copied from the price list */
  onReset: () => void;
}

type Draft = Record<keyof ItemPrices, string>;

const toDraft = (p: ItemPrices): Draft => ({
  price: String(p.price), priceCorner: String(p.priceCorner),
  priceInstall: String(p.priceInstall), priceInstallCorner: String(p.priceInstallCorner),
});

const num = (s: string) => {
  const v = parseFloat(s.replace(',', '.'));
  return Number.isFinite(v) && v >= 0 ? v : 0;
};

/** Bottom sheet that sets one item's price for the whole project */
const PriceEditSheet: React.FC<Props> = ({ item, roomsCount, onClose, onSave, onReset }) => {
  const { t } = useT();
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    if (!item) return;
    setDraft(toDraft(item.prices));
  }, [item]);

  const corners = item ? hasCorners(item) : false;
  const u = item ? unitLabel(item.unit, t) : '';

  const field = (key: keyof ItemPrices, label: string) => {
    if (!item || !draft) return null;
    const changed = num(draft[key]) !== item.base[key];
    return (
      <label className="price-sheet__field">
        <span className="price-sheet__label">
          {label}
          <small>{t('pe.default', { v: fmtRub(item.base[key]) })}</small>
        </span>
        <input
          className={`price-sheet__input${changed ? ' price-sheet__input--changed' : ''}`}
          type="text"
          inputMode="decimal"
          value={draft[key]}
          onChange={e => setDraft({ ...draft, [key]: e.target.value })}
          onFocus={e => e.target.select()}
        />
      </label>
    );
  };

  const save = () => {
    if (!draft) return;
    onSave({
      price: num(draft.price), priceCorner: num(draft.priceCorner),
      priceInstall: num(draft.priceInstall), priceInstallCorner: num(draft.priceInstallCorner),
    });
  };

  return (
    <IonModal
      isOpen={!!item}
      onDidDismiss={onClose}
      breakpoints={[0, 1]}
      initialBreakpoint={1}
      className="price-sheet"
    >
      {item && draft && (
        <div className="price-sheet__content">
          <div className="price-sheet__title">{itemTitle(item, t)}</div>
          <div className="price-sheet__sub">
            {t(KIND_CATALOG_KEY[item.kind])} · {t('pe.rooms', { n: roomsCount })}
          </div>

          <div className="price-sheet__group">{t('pe.client')}</div>
          {field('price', t('pe.price', { u }))}
          {corners && field('priceCorner', t('pe.priceCorner'))}

          <div className="price-sheet__group price-sheet__group--worker">{t('pe.worker')}</div>
          {field('priceInstall', t('pe.install', { u }))}
          {corners && field('priceInstallCorner', t('pe.installCorner'))}

          <div className="price-sheet__note">{t('pe.scope')}</div>

          <div className="price-sheet__footer">
            <button className="price-sheet__btn" onClick={onReset} disabled={!item.overridden}>
              {t('pe.reset')}
            </button>
            <ActionButton expand={false} solid onClick={save} className="price-sheet__save">
              {t('common.save')}
            </ActionButton>
          </div>
        </div>
      )}
    </IonModal>
  );
};

export default PriceEditSheet;
