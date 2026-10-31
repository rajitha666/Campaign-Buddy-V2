import { describe, it, expect, vi } from 'vitest';
import { withLocationDisclosure } from './locationDisclosure';

function setup(over: { granted?: boolean; shown?: boolean; accept?: boolean } = {}) {
  const request = vi.fn().mockResolvedValue({ status: 'granted' });
  const markShown = vi.fn().mockResolvedValue(undefined);
  const show = vi.fn().mockResolvedValue(over.accept ?? true);
  const wrapped = withLocationDisclosure(request, {
    isGranted: async () => over.granted ?? false,
    wasShown: async () => over.shown ?? false,
    markShown,
    show,
  });
  return { request, markShown, show, wrapped };
}

describe('withLocationDisclosure', () => {
  it('shows the disclosure before the first system prompt, then asks', async () => {
    const { request, show, markShown, wrapped } = setup();
    expect((await wrapped()).status).toBe('granted');
    expect(show).toHaveBeenCalledOnce();
    expect(markShown).toHaveBeenCalledOnce();
    expect(show.mock.invocationCallOrder[0]).toBeLessThan(request.mock.invocationCallOrder[0]);
  });
  it('does not ask the system for permission when the person declines the disclosure', async () => {
    const { request, wrapped } = setup({ accept: false });
    expect((await wrapped()).status).toBe('denied');
    expect(request).not.toHaveBeenCalled();
  });
  it('does not show it again once seen, or when permission is already granted', async () => {
    const seen = setup({ shown: true });
    await seen.wrapped();
    expect(seen.show).not.toHaveBeenCalled();
    expect(seen.request).toHaveBeenCalledOnce();
    const granted = setup({ granted: true });
    await granted.wrapped();
    expect(granted.show).not.toHaveBeenCalled();
  });
});
