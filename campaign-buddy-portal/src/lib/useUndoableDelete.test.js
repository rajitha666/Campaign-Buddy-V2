import { describe, it, expect } from 'vitest';
import { needsConfirm } from './useUndoableDelete';
import { RESOURCES } from '../config/resources';

describe('which deletes ask first (#112)', () => {
  it('asks when the resource says so, or has no restore route', () => {
    expect(needsConfirm({ confirmDelete: true, restoreItem: () => {} })).toBe(true);
    expect(needsConfirm({ deleteItem: () => {} })).toBe(true);
    expect(needsConfirm({ restoreItem: () => {} })).toBe(false);
  });

  it('only campaigns and clients keep the dialog; every other deletable resource has Undo', () => {
    const deletable = Object.entries(RESOURCES).filter(([, c]) => c.deleteItem);
    expect(deletable.length).toBeGreaterThan(5);
    const asking = deletable.filter(([, c]) => needsConfirm(c)).map(([k]) => k).sort();
    expect(asking).toEqual(['campaigns', 'clients']);
  });
});
