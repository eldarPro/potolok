import React from 'react';
import { IonModal } from '@ionic/react';
import {
  DEFAULT_FILTERS, DrawingFilter, PeriodFilter, ProjectFilters, ProjectSort,
} from '../lib/projectFilter';
import { useT } from '../lib/i18n';
import ActionButton from './ActionButton';
import './ProjectFilterSheet.css';

interface Props {
  isOpen: boolean;
  filters: ProjectFilters;
  /** projects matching the current filters */
  found: number;
  onChange: (f: ProjectFilters) => void;
  onClose: () => void;
}

const PERIODS: PeriodFilter[] = ['all', 'today', 'week', 'month', 'quarter'];
const DRAWINGS: DrawingFilter[] = ['all', 'without', 'with'];
const SORTS: ProjectSort[] = ['new', 'old', 'sumDesc', 'sumAsc', 'name'];

const parseSum = (s: string) => {
  const v = parseFloat(s.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(v) && v >= 0 ? v : null;
};

/** Bottom sheet with the project list filters; changes apply immediately */
const ProjectFilterSheet: React.FC<Props> = ({ isOpen, filters, found, onChange, onClose }) => {
  const { t } = useT();
  const set = (patch: Partial<ProjectFilters>) => onChange({ ...filters, ...patch });

  const chips = <T extends string>(values: T[], current: T, label: (v: T) => string, pick: (v: T) => void) => (
    <div className="filter-sheet__chips">
      {values.map(v => (
        <button
          key={v}
          className={`filter-sheet__chip${v === current ? ' filter-sheet__chip--on' : ''}`}
          onClick={() => pick(v)}
        >
          {label(v)}
        </button>
      ))}
    </div>
  );

  const sumInput = (key: 'sumMin' | 'sumMax', placeholder: string) => (
    <input
      className="filter-sheet__input"
      type="text"
      inputMode="numeric"
      placeholder={placeholder}
      value={filters[key] ?? ''}
      onChange={e => set({ [key]: parseSum(e.target.value) })}
    />
  );

  return (
    <IonModal
      isOpen={isOpen}
      onDidDismiss={onClose}
      breakpoints={[0, 1]}
      initialBreakpoint={1}
      className="filter-sheet"
    >
      <div className="filter-sheet__content">
        <div className="filter-sheet__head">
          <div className="filter-sheet__title">{t('pf.title')}</div>
          <button className="filter-sheet__reset" onClick={() => onChange(DEFAULT_FILTERS)}>
            {t('pf.reset')}
          </button>
        </div>

        <div className="filter-sheet__group">{t('pf.period')}</div>
        {chips(PERIODS, filters.period, v => t(`pf.period.${v}`), period => set({ period }))}

        <div className="filter-sheet__group">{t('pf.drawing')}</div>
        {chips(DRAWINGS, filters.drawing, v => t(`pf.drawing.${v}`), drawing => set({ drawing }))}

        <div className="filter-sheet__group">{t('pf.sum')}</div>
        <div className="filter-sheet__range">
          {sumInput('sumMin', t('pf.from'))}
          <span className="filter-sheet__dash">—</span>
          {sumInput('sumMax', t('pf.to'))}
          <span className="filter-sheet__unit">₽</span>
        </div>

        <div className="filter-sheet__group">{t('pf.other')}</div>
        {chips(['off', 'on'] as const, filters.incomplete ? 'on' : 'off',
          v => t(v === 'on' ? 'pf.incomplete' : 'pf.anyContacts'),
          v => set({ incomplete: v === 'on' }))}

        <div className="filter-sheet__group">{t('pf.sort')}</div>
        {chips(SORTS, filters.sort, v => t(`pf.sort.${v}`), sort => set({ sort }))}

        <ActionButton solid onClick={onClose} className="filter-sheet__show">
          {found > 0 ? t('pf.show', { n: found }) : t('proj.noResults')}
        </ActionButton>
      </div>
    </IonModal>
  );
};

export default ProjectFilterSheet;
