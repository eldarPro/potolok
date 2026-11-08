import { advanceOf, fmtAdvanceDate, remainingAfter } from './advance';
import { Project } from '../types';

const base = { id: 'p', clientName: '', address: '', phone: '', notes: '', createdAt: '', updatedAt: '', rooms: [] } as Project;

describe('advance', () => {
  it('ignores a missing or zero advance', () => {
    expect(advanceOf(base)).toBeNull();
    expect(advanceOf({ ...base, advance: { amount: 0, date: '2026-11-03', method: 'cash' } })).toBeNull();
  });
  it('subtracts the advance, never below zero', () => {
    const adv = { amount: 5000, date: '2026-11-03', method: 'transfer' as const };
    expect(remainingAfter(19921, adv)).toBe(14921);
    expect(remainingAfter(3000, adv)).toBe(0);
    expect(remainingAfter(19921, null)).toBe(19921);
  });
  it('formats the date, year only when needed', () => {
    const y = new Date().getFullYear();
    expect(fmtAdvanceDate(`${y}-11-03`)).toBe('3 ноября');
    expect(fmtAdvanceDate(`${y}-11-03`, true)).toBe(`3 ноября ${y} г.`);
  });
});
