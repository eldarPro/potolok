import { Project } from '../types';
import { advanceOf } from './advance';

export type PeriodFilter = 'all' | 'today' | 'week' | 'month' | 'quarter' | 'custom';
export type DrawingFilter = 'all' | 'with' | 'without';
export type AdvanceFilter = 'all' | 'with' | 'without';
export type ProjectSort = 'new' | 'old' | 'sumDesc' | 'sumAsc' | 'name';

export interface ProjectFilters {
  period: PeriodFilter;
  /** period «custom»: YYYY-MM-DD, both ends included; null = open end */
  dateFrom: string | null;
  dateTo: string | null;
  drawing: DrawingFilter;
  advance: AdvanceFilter;
  /** null = no bound */
  sumMin: number | null;
  sumMax: number | null;
  sort: ProjectSort;
}

export const DEFAULT_FILTERS: ProjectFilters = {
  period: 'all', dateFrom: null, dateTo: null, drawing: 'all', advance: 'all', sumMin: null, sumMax: null, sort: 'new',
};

/** How many filters differ from the defaults; sort doesn't count (nor the status — the tabs show it) */
export const activeFilterCount = (f: ProjectFilters) =>
  (f.period !== 'all' && (f.period !== 'custom' || f.dateFrom || f.dateTo) ? 1 : 0) +
  (f.drawing !== 'all' ? 1 : 0) +
  (f.advance !== 'all' ? 1 : 0) +
  (f.sumMin !== null || f.sumMax !== null ? 1 : 0);

/** A room counts as drawn once it has a closed contour */
export const hasDrawing = (p: Project) => p.rooms.some(r => r.points.length >= 3);

export const projectDate = (p: Project) => p.updatedAt || p.createdAt;

const PERIOD_DAYS: Record<Exclude<PeriodFilter, 'all' | 'custom'>, number> = { today: 0, week: 7, month: 30, quarter: 90 };

/** Midnight `days` days before `now`; projects dated on or after it are in the period */
const periodStart = (period: Exclude<PeriodFilter, 'all' | 'custom'>, now: Date) =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate() - PERIOD_DAYS[period]).getTime();

/** Local midnight of a YYYY-MM-DD day (+ `plus` days); null for no day */
const dayStart = (day: string | null, plus = 0) => {
  if (!day) return null;
  const [y, m, d] = day.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d + plus).getTime() : null;
};

const time = (iso: string) => {
  const v = new Date(iso).getTime();
  return isNaN(v) ? 0 : v;
};

export function filterProjects(
  projects: Project[],
  f: ProjectFilters,
  price: (p: Project) => number,
  now = new Date(),
): Project[] {
  const custom = f.period === 'custom';
  const from = f.period === 'all' ? null : f.period === 'custom' ? dayStart(f.dateFrom) : periodStart(f.period, now);
  // the «to» day is included: anything before the next midnight
  const to = custom && f.dateTo ? dayStart(f.dateTo, 1) : null;
  const list = projects.filter(p => {
    const d = time(projectDate(p));
    if (from !== null && d < from) return false;
    if (to !== null && d >= to) return false;
    if (f.advance !== 'all' && !!advanceOf(p) !== (f.advance === 'with')) return false;
    if (f.drawing !== 'all' && hasDrawing(p) !== (f.drawing === 'with')) return false;
    if (f.sumMin !== null && price(p) < f.sumMin) return false;
    if (f.sumMax !== null && price(p) > f.sumMax) return false;
    return true;
  });

  const byDate = (a: Project, b: Project) => time(projectDate(b)) - time(projectDate(a));
  const cmp: Record<ProjectSort, (a: Project, b: Project) => number> = {
    new: byDate,
    old: (a, b) => -byDate(a, b),
    sumDesc: (a, b) => price(b) - price(a) || byDate(a, b),
    sumAsc: (a, b) => price(a) - price(b) || byDate(a, b),
    name: (a, b) => a.clientName.localeCompare(b.clientName) || byDate(a, b),
  };
  return list.sort(cmp[f.sort]);
}
