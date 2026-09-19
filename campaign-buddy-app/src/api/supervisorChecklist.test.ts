import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls: Array<{ method: string; path: string; body?: unknown; config?: any }> = [];
vi.mock('./client', () => {
  const rec = (method: string) => (path: string, a?: unknown, b?: unknown) => {
    const hasBody = method === 'put' || method === 'post';
    calls.push({ method, path, body: hasBody ? a : undefined, config: hasBody ? b : a });
    return Promise.resolve({
      data: { data: { photos: [{ url: '/uploads/visit-photos/x.jpg', uploadedAt: '2026-09-18T09:00:00.000Z' }], saved: 1 } },
    });
  };
  return { apiClient: { get: rec('get'), put: rec('put'), post: rec('post'), delete: rec('delete') } };
});

import * as checklist from './supervisorChecklist';

beforeEach(() => {
  calls.length = 0;
});

describe('supervisor checklist api', () => {
  it('reads the checklist for an assignment', async () => {
    await checklist.getChecklist('a1');
    expect(calls[0]).toMatchObject({ method: 'get', path: '/me/assignments/a1/supervisor-tasks' });
  });

  it('saves answers with PUT .../responses', async () => {
    await checklist.saveResponses('a1', [{ taskId: 't1', rating: 4 }]);
    expect(calls[0]).toMatchObject({
      method: 'put',
      path: '/me/assignments/a1/supervisor-tasks/responses',
      body: { responses: [{ taskId: 't1', rating: 4 }] },
    });
  });

  // The app's fetch adapter passes the body straight to fetch, so axios must
  // not stamp a urlencoded Content-Type on it or the multipart boundary is lost.
  // The device fetch (expo/fetch on SDK 57) rejects React Native's {uri} FormData
  // parts with "Unsupported FormDataPart implementation" (#? android upload bug),
  // so the photo must be materialized into a real Blob before appending.
  it('uploads the photo as a Blob part, multipart with Content-Type suppressed, and returns the new url list', async () => {
    const blob = new Blob(['jpeg-bytes'], { type: 'image/jpeg' });
    const fetchCalls: string[] = [];
    vi.stubGlobal('fetch', (uri: string) => {
      fetchCalls.push(uri);
      return Promise.resolve({ blob: () => Promise.resolve(blob) });
    });
    try {
      const urls = await checklist.uploadPhoto('a1', 't1', { uri: 'file:///p.jpg', name: 'p.jpg', type: 'image/jpeg' });
      expect(fetchCalls).toEqual(['file:///p.jpg']);
      expect(calls[0].method).toBe('post');
      expect(calls[0].path).toBe('/me/assignments/a1/supervisor-tasks/t1/photos');
      expect(calls[0].body).toBeInstanceOf(FormData);
      const part = (calls[0].body as FormData).get('image') as { type?: string; size?: number; name?: string };
      expect(part.type).toBe('image/jpeg');
      expect(part.size).toBe(10);
      // A filename on the part is what the multipart boundary encodes — the
      // rejected {uri} part never carried one through the fetch layer.
      expect(part.name).toBe('p.jpg');
      expect(calls[0].config.headers['Content-Type']).toBe(false);
      expect(urls).toEqual([{ url: '/uploads/visit-photos/x.jpg', uploadedAt: '2026-09-18T09:00:00.000Z' }]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // expo/fetch guesses the Blob's MIME from the temp file's extension; when the
  // manipulator's cache path has no ext it comes back empty/octet-stream and the
  // backend rejects the upload. The picker-provided type is the source of truth.
  it('falls back to the picked photo type when the fetched Blob has no usable MIME type', async () => {
    const untyped = new Blob(['jpeg-bytes'], { type: 'application/octet-stream' });
    vi.stubGlobal('fetch', () => Promise.resolve({ blob: () => Promise.resolve(untyped) }));
    try {
      await checklist.uploadPhoto('a1', 't1', { uri: 'file:///cache/abc', name: 'outlet-1.jpg', type: 'image/jpeg' });
      const part = (calls[0].body as FormData).get('image') as { type?: string };
      expect(part.type).toBe('image/jpeg');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('removes a photo by url', async () => {
    await checklist.deletePhoto('a1', 't1', '/uploads/visit-photos/x.jpg');
    expect(calls[0]).toMatchObject({ method: 'delete', path: '/me/assignments/a1/supervisor-tasks/t1/photos' });
    expect(calls[0].config.params).toEqual({ url: '/uploads/visit-photos/x.jpg' });
  });
});
