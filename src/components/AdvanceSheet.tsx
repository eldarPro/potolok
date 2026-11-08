import React, { useEffect, useRef, useState } from 'react';
import { IonIcon, IonModal } from '@ionic/react';
import { chevronDownOutline } from 'ionicons/icons';
import { AdvanceMethod, Project } from '../types';
import { ADVANCE_METHODS, advanceOf, todayIso } from '../lib/advance';
import { fmtRub } from '../lib/estimateFormat';
import { upsertProject } from '../lib/storage';
import { useT } from '../lib/i18n';
import { NumInput } from './NumPad';
import ActionButton from './ActionButton';
import './AdvanceSheet.css';

/** Chip next to the project status: «Аванс 0 ₽» / «Аванс 5 000 ₽», ▾ like the status pill */
export const AdvanceChip: React.FC<{ project: Project; onClick: () => void }> = ({ project, onClick }) => {
  const { t } = useT();
  const adv = advanceOf(project);
  return (
    <button className={`adv-chip${adv ? '' : ' adv-chip--empty'}`} onClick={onClick}>
      {t('adv.chip', { v: fmtRub(adv?.amount ?? 0) })}
      <IonIcon icon={chevronDownOutline} />
    </button>
  );
};

interface Props {
  project: Project;
  /** client total — shown in the subtitle */
  total: number;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (p: Project) => void;
}

const digits = (s: string) => s.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 7);
const spaced = (s: string) => (s ? Number(s).toLocaleString('ru') : '');

/** Bottom sheet: the advance the client sent — amount, how, when */
const AdvanceSheet: React.FC<Props> = ({ project, total, isOpen, onClose, onSaved }) => {
  const { t } = useT();
  const existing = advanceOf(project);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<AdvanceMethod>('transfer');
  const [date, setDate] = useState(todayIso());
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setAmount(existing ? String(existing.amount) : '');
    setMethod(existing?.method ?? 'transfer');
    setDate(existing?.date ?? todayIso());
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // the advance isn't an edit of the drawing, so updatedAt (the card date) stays — like the status
  const save = (advance: Project['advance']) => {
    const updated = { ...project, advance };
    upsertProject(updated);
    onSaved(updated);
    onClose();
  };

  const value = Number(amount) || 0;
  const submit = () => { if (value > 0) save({ amount: value, date, method }); };

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onClose} breakpoints={[0, 1]} initialBreakpoint={1} className="adv-sheet">
      <div className="adv-sheet__content numpad-reserve">
        <div className="adv-sheet__title">{t('adv.sheetTitle')}</div>
        <div className="adv-sheet__sub">
          {total > 0 ? t('adv.sheetSub', { total: fmtRub(total) }) : t('adv.sheetSubEmpty')}
        </div>

        <label className="adv-sheet__amount">
          {/* our pad opens on a tap on the sum; while it's up the sheet keeps its height free
              below itself (.numpad-reserve). «Готово» only hides the pad — method/date may follow */}
          <NumInput
            inputRef={amountRef}
            label={t('adv.amount')}
            aria-label={t('adv.amount')}
            placeholder="0"
            value={spaced(amount)}
            onChange={v => setAmount(digits(v))}
            actions={[undefined, { label: t('re.done'), primary: true, onClick: () => amountRef.current?.blur() }]}
            style={{ width: `${Math.max(1, spaced(amount).length) + 0.5}ch` }}
          />
          <span>₽</span>
        </label>

        <div className="adv-sheet__label">{t('adv.how')}</div>
        <div className="adv-sheet__seg" role="radiogroup">
          {ADVANCE_METHODS.map(m => (
            <button key={m} role="radio" aria-checked={method === m} className={method === m ? 'on' : ''} onClick={() => setMethod(m)}>
              {t(`adv.m.${m}`)}
            </button>
          ))}
        </div>

        <label className="adv-sheet__date">
          <span>{t('adv.date')}</span>
          <input type="date" value={date} max={todayIso()} onChange={e => e.target.value && setDate(e.target.value)} />
        </label>

        <ActionButton solid disabled={value <= 0} onClick={submit}>{t('adv.save')}</ActionButton>
        {existing && (
          <button className="adv-sheet__remove" onClick={() => save(undefined)}>{t('adv.remove')}</button>
        )}
      </div>
    </IonModal>
  );
};

export default AdvanceSheet;
