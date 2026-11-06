import { describe, it, expect } from 'vitest';
import { Project } from '../types';
import { byStatusTab, countByStatus, statusOf } from './projectStatus';

const p = (id: string, status?: Project['status']): Project => ({
  id, clientName: id, address: '', phone: '', notes: '', createdAt: '', updatedAt: '', rooms: [], status,
});

describe('project status', () => {
  const list = [p('a', 'cancelled'), p('b'), p('c', 'inWork'), p('d', 'done'), p('e', 'approval')];

  it('treats projects without a status as approval', () => {
    expect(statusOf(p('x'))).toBe('approval');
  });

  it('sinks cancelled projects to the bottom of «all», keeping the order', () => {
    expect(byStatusTab(list, 'all').map(x => x.id)).toEqual(['b', 'c', 'd', 'e', 'a']);
  });

  it('filters by a status tab', () => {
    expect(byStatusTab(list, 'approval').map(x => x.id)).toEqual(['b', 'e']);
    expect(byStatusTab(list, 'cancelled').map(x => x.id)).toEqual(['a']);
  });

  it('counts per status', () => {
    expect(countByStatus(list)).toEqual({ all: 5, approval: 2, inWork: 1, done: 1, cancelled: 1 });
  });
});
