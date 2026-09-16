import { describe, it, expect } from 'vitest';
import { resolveFileUrl } from './files';

const DEV_BASE = 'http://localhost:4000/v1';

describe('resolveFileUrl', () => {
  it('turns a relative /uploads path returned by the API into an absolute URL on the API origin (#41)', () => {
    // profilePictureUrl is stored as a relative path (served statically from
    // /uploads); RN <Image> can't resolve it without the host.
    expect(resolveFileUrl('/uploads/staff/a.png', DEV_BASE)).toBe('http://localhost:4000/uploads/staff/a.png');
  });

  it('strips the /v1 suffix whether or not the base has a trailing slash', () => {
    expect(resolveFileUrl('/uploads/staff/a.png', 'https://api.campaignbuddy.lk/v1/'))
      .toBe('https://api.campaignbuddy.lk/uploads/staff/a.png');
  });

  it('passes absolute URLs through untouched', () => {
    const url = 'https://cdn.example.com/pic.png';
    expect(resolveFileUrl(url, DEV_BASE)).toBe(url);
  });

  it('passes empty values through', () => {
    expect(resolveFileUrl(null, DEV_BASE)).toBeNull();
    expect(resolveFileUrl(undefined, DEV_BASE)).toBeUndefined();
    expect(resolveFileUrl('', DEV_BASE)).toBe('');
  });
});
