import { Project } from '../types';

export type PeriodFilter = 'all' | 'today' | 'week' | 'month' | 'quarter';
export type DrawingFilter = 'all' | 'with' | 'without';
export type ProjectSort = 'new' | 'old' | 'sumDesc' | 'sumAsc' | 'name';

export interface ProjectFilters {
  period: PeriodFilter;
  drawing: DrawingFilter;
  /** null = no bound */
  sumMin: number | null;
  sumMax: number | null;
  /** no phone or no address yet */
  incomplete: boolean;
  sort: ProjectSort;
}

export const DEFAULT_FILTERS: ProjectFilters = {
  period: 'all', drawing: 'all', sumMin: null, sumMax: null, incomplete: false, sort: 'new',
};

/** How many filters differ from the defaults; sort doesn't count */
export const activeFilterCount = (f: ProjectFilters) =>
  (f.period !== 'all' ? 1 : 0) +
  (f.drawing !== 'all' ? 1 : 0) +
  (f.sumMin !== null || f.sumMax !== null ? 1 : 0) +
  (f.incomplete ? 1 : 0);

/** A room counts as drawn once it has a closed contour */
export const hasDrawing = (p: Project) => p.rooms.some(r => r.points.length >= 3);

export const projectDate = (p: Project) => p.updatedAt || p.createdAt;

const PERIOD_DAYS: Record<Exclude<PeriodFilter, 'all'>, number> = { today: 0, week: 7, month: 30, quarter: 90 };

/** Midnight `days` days before `now`; projects dated on or after it are in the period */
const periodStart = (period: Exclude<PeriodFilter, 'all'>, now: Date) =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate() - PERIOD_DAYS[period]).getTime();

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
  const from = f.period === 'all' ? null : periodStart(f.period, now);
  const list = projects.filter(p => {
    if (from !== null && time(projectDate(p)) < from) return false;
    if (f.drawing !== 'all' && hasDrawing(p) !== (f.drawing === 'with')) return false;
    if (f.sumMin !== null && price(p) < f.sumMin) return false;
    if (f.sumMax !== null && price(p) > f.sumMax) return false;
    if (f.incomplete && p.phone.trim() && p.address.trim()) return false;
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
