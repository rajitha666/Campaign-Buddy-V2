import { describe, it, expect, beforeEach } from 'vitest';
import { readCampaignChoice, writeCampaignChoice, pickCampaign } from './campaignChoice';

const store = {};
beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
});

const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

describe('campaign choice', () => {
  it('remembers a campaign per user', () => {
    writeCampaignChoice('u1', 'b');
    expect(readCampaignChoice('u1')).toBe('b');
    expect(readCampaignChoice('u2')).toBeNull(); // another login on the same browser sees nothing
  });

  it('clears the choice when given no campaign', () => {
    writeCampaignChoice('u1', 'b');
    writeCampaignChoice('u1', null);
    expect(readCampaignChoice('u1')).toBeNull();
  });

  it('uses the remembered campaign only if the user can still access it', () => {
    expect(pickCampaign(list, 'c')).toBe('c');
    expect(pickCampaign(list, 'revoked')).toBe('a'); // falls back to the first
    expect(pickCampaign(list, null)).toBe('a');
    expect(pickCampaign([], 'c')).toBeNull();
  });

  it('never throws when storage is unavailable', () => {
    globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
    expect(readCampaignChoice('u1')).toBeNull();
    expect(() => writeCampaignChoice('u1', 'a')).not.toThrow();
  });

  it('ignores a missing user id', () => {
    writeCampaignChoice(null, 'a');
    expect(Object.keys(store)).toHaveLength(0);
    expect(readCampaignChoice(undefined)).toBeNull();
  });
});
