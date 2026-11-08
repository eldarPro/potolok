import { describe, it, expect } from 'vitest';
import { Project, Room } from '../types';
import { DEFAULT_FILTERS, activeFilterCount, filterProjects } from './projectFilter';

const room = (points: number): Room => ({
  id: 'r', name: 'r',
  points: Array.from({ length: points }, (_, i) => ({ x: i, y: i * i })),
  fabricId: null, fabric: null, profileSegments: [], lighting: [],
  selectedAccessories: [], selectedServices: [], selectedNiches: [],
  areaSqm: 0, perimeterM: 0, visualization: null,
});

const proj = (id: string, date: string, rooms: Room[], extra: Partial<Project> = {}): Project => ({
  id, clientName: id, address: 'ул. Ленина', phone: '+7', notes: '',
  createdAt: date, updatedAt: date, rooms, ...extra,
});

const now = new Date('2026-10-28T15:00:00');
const prices: Record<string, number> = { a: 50000, b: 10000, c: 0, d: 120000 };
const price = (p: Project) => prices[p.id];

const list = [
  proj('a', '2026-10-28T09:00:00', [room(4)]),
  proj('b', '2026-10-24T09:00:00', [room(0)], { phone: '' }),
  proj('c', '2026-09-01T09:00:00', []),
  proj('d', '2026-06-01T09:00:00', [room(0), room(5)]),
];

const ids = (ps: Project[]) => ps.map(p => p.id);

describe('filterProjects', () => {
  it('defaults keep everything, newest first', () => {
    expect(ids(filterProjects(list, DEFAULT_FILTERS, price, now))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('filters by period from local midnight', () => {
    expect(ids(filterProjects(list, { ...DEFAULT_FILTERS, period: 'today' }, price, now))).toEqual(['a']);
    expect(ids(filterProjects(list, { ...DEFAULT_FILTERS, period: 'week' }, price, now))).toEqual(['a', 'b']);
    expect(ids(filterProjects(list, { ...DEFAULT_FILTERS, period: 'quarter' }, price, now))).toEqual(['a', 'b', 'c']);
  });

  it('filters by drawing', () => {
    expect(ids(filterProjects(list, { ...DEFAULT_FILTERS, drawing: 'without' }, price, now))).toEqual(['b', 'c']);
    expect(ids(filterProjects(list, { ...DEFAULT_FILTERS, drawing: 'with' }, price, now))).toEqual(['a', 'd']);
  });

  it('filters by sum range and sorts by sum', () => {
    const f = { ...DEFAULT_FILTERS, sumMin: 10000, sumMax: 100000, sort: 'sumDesc' as const };
    expect(ids(filterProjects(list, f, price, now))).toEqual(['a', 'b']);
  });

  it('filters by a custom period, both days included', () => {
    const f = { ...DEFAULT_FILTERS, period: 'custom' as const };
    expect(ids(filterProjects(list, { ...f, dateFrom: '2026-09-01', dateTo: '2026-10-24' }, price, now))).toEqual(['b', 'c']);
    expect(ids(filterProjects(list, { ...f, dateFrom: '2026-10-01' }, price, now))).toEqual(['a', 'b']);
    expect(ids(filterProjects(list, { ...f, dateTo: '2026-09-01' }, price, now))).toEqual(['c', 'd']);
    expect(activeFilterCount(f)).toBe(0); // «Период» picked, no dates yet
  });

  it('filters by advance', () => {
    const withAdv = list.map(p => p.id === 'b' ? { ...p, advance: { amount: 3000, date: '2026-10-24', method: 'cash' as const } } : p);
    expect(ids(filterProjects(withAdv, { ...DEFAULT_FILTERS, advance: 'with' }, price, now))).toEqual(['b']);
    expect(ids(filterProjects(withAdv, { ...DEFAULT_FILTERS, advance: 'without' }, price, now))).toEqual(['a', 'c', 'd']);
  });

  it('counts active filters without sort', () => {
    expect(activeFilterCount({ ...DEFAULT_FILTERS, sort: 'name' })).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, drawing: 'without', sumMax: 5 })).toBe(2);
  });
});
