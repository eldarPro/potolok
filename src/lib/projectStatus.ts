import { Project, ProjectStatus } from '../types';

export const STATUSES: ProjectStatus[] = ['approval', 'inWork', 'done', 'cancelled'];

/** Dot / soft background / text colors of each status (CSS reads them via --st-*) */
export const STATUS_COLORS: Record<ProjectStatus, { dot: string; bg: string; fg: string }> = {
  approval:  { dot: '#F59E0B', bg: '#FEF3C7', fg: '#B45309' },
  inWork:    { dot: '#1E88E5', bg: '#E3F2FD', fg: '#1565C0' },
  done:      { dot: '#16A34A', bg: '#DCFCE7', fg: '#15803D' },
  cancelled: { dot: '#9CA3AF', bg: '#F3F4F6', fg: '#6B7280' },
};

export const statusOf = (p: Project): ProjectStatus => p.status ?? 'approval';

export type StatusTab = 'all' | ProjectStatus;

/** Projects of one tab; «all» keeps the order but sinks cancelled ones to the bottom */
export function byStatusTab(projects: Project[], tab: StatusTab): Project[] {
  if (tab !== 'all') return projects.filter(p => statusOf(p) === tab);
  return [
    ...projects.filter(p => statusOf(p) !== 'cancelled'),
    ...projects.filter(p => statusOf(p) === 'cancelled'),
  ];
}

export function countByStatus(projects: Project[]): Record<StatusTab, number> {
  const counts: Record<StatusTab, number> = { all: projects.length, approval: 0, inWork: 0, done: 0, cancelled: 0 };
  for (const p of projects) counts[statusOf(p)]++;
  return counts;
}
