import React from 'react';
import { IonModal } from '@ionic/react';
import {
  AdvanceFilter, DEFAULT_FILTERS, DrawingFilter, PeriodFilter, ProjectFilters, ProjectSort,
} from '../lib/projectFilter';
import { STATUSES, STATUS_COLORS, StatusTab } from '../lib/projectStatus';
import { useT } from '../lib/i18n';
import ActionButton from './ActionButton';
import './ProjectFilterSheet.css';

interface Props {
  isOpen: boolean;
  filters: ProjectFilters;
  /** projects matching the current filters and status */
  found: number;
  /** the status tab of the list — the same choice, kept in sync */
  status: StatusTab;
  statusCounts: Record<StatusTab, number>;
  onStatus: (s: StatusTab) => void;
  onChange: (f: ProjectFilters) => void;
  onClose: () => void;
}

const PERIODS: PeriodFilter[] = ['all', 'today', 'week', 'month', 'quarter', 'custom'];
const DRAWINGS: DrawingFilter[] = ['all', 'without', 'with'];
const ADVANCES: AdvanceFilter[] = ['all', 'with', 'without'];
const STATUS_TABS: StatusTab[] = ['all', ...STATUSES];
const SORTS: ProjectSort[] = ['new', 'old', 'sumDesc', 'sumAsc', 'name'];

const parseSum = (s: string) => {
  const v = parseFloat(s.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(v) && v >= 0 ? v : null;
};

/** Bottom sheet with the project list filters; changes apply immediately */
const ProjectFilterSheet: React.FC<Props> = ({ isOpen, filters, found, status, statusCounts, onStatus, onChange, onClose }) => {
  const { t } = useT();
  const set = (patch: Partial<ProjectFilters>) => onChange({ ...filters, ...patch });

  const chips = <T extends string>(values: T[], current: T, label: (v: T) => React.ReactNode, pick: (v: T) => void) => (
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

  const statusLabel = (s: StatusTab) => (
    <>
      {s !== 'all' && <i className="filter-sheet__dot" style={{ background: STATUS_COLORS[s].dot }} />}
      {t(s === 'all' ? 'ps.all' : `ps.${s}`)}
      <b className="filter-sheet__count">{statusCounts[s]}</b>
    </>
  );

  const dateInput = (key: 'dateFrom' | 'dateTo') => (
    <input
      className="filter-sheet__input filter-sheet__input--date"
      type="date"
      value={filters[key] ?? ''}
      min={key === 'dateTo' ? filters.dateFrom ?? undefined : undefined}
      max={key === 'dateFrom' ? filters.dateTo ?? undefined : undefined}
      onChange={e => set({ [key]: e.target.value || null })}
    />
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
          <button className="filter-sheet__reset" onClick={() => { onChange(DEFAULT_FILTERS); onStatus('all'); }}>
            {t('pf.reset')}
          </button>
        </div>

        <div className="filter-sheet__group">{t('pf.status')}</div>
        {chips(STATUS_TABS, status, statusLabel, onStatus)}

        <div className="filter-sheet__group">{t('pf.period')}</div>
        {chips(PERIODS, filters.period, v => t(`pf.period.${v}`), period => set({ period }))}
        {filters.period === 'custom' && (
          <div className="filter-sheet__range">
            <span className="filter-sheet__dash">{t('pf.from')}</span>
            {dateInput('dateFrom')}
            <span className="filter-sheet__dash">{t('pf.to')}</span>
            {dateInput('dateTo')}
          </div>
        )}

        <div className="filter-sheet__group">{t('pf.advance')}</div>
        {chips(ADVANCES, filters.advance, v => t(`pf.advance.${v}`), advance => set({ advance }))}

        <div className="filter-sheet__group">{t('pf.drawing')}</div>
        {chips(DRAWINGS, filters.drawing, v => t(`pf.drawing.${v}`), drawing => set({ drawing }))}

        <div className="filter-sheet__group">{t('pf.sum')}</div>
        <div className="filter-sheet__range">
          {sumInput('sumMin', t('pf.from'))}
          <span className="filter-sheet__dash">—</span>
          {sumInput('sumMax', t('pf.to'))}
          <span className="filter-sheet__unit">₽</span>
        </div>

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
