import { AdvanceMethod, Project, ProjectAdvance } from '../types';

export const ADVANCE_METHODS: AdvanceMethod[] = ['transfer', 'cash', 'card'];

/** null when the project has no advance (or a zero one) */
export const advanceOf = (p: Project): ProjectAdvance | null =>
  p.advance && p.advance.amount > 0 ? p.advance : null;

/** What the client still owes; never below zero */
export const remainingAfter = (total: number, adv: ProjectAdvance | null) =>
  Math.max(0, total - (adv?.amount ?? 0));

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** «3 ноября»; with the year when it isn't this one (or `withYear`) */
export function fmtAdvanceDate(iso: string, withYear = false): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d);
  const year = withYear || y !== new Date().getFullYear();
  return date.toLocaleDateString('ru', { day: 'numeric', month: 'long', ...(year ? { year: 'numeric' } : {}) });
}
