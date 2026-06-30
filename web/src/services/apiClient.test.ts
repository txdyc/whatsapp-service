import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { api, TOKEN_KEY } from './apiClient';

describe('apiClient', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    localStorage.clear();
    // jsdom does not implement window.location.assign and it cannot be
    // redefined via vi.spyOn, so replace location with a stub for this suite.
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { ...originalLocation, pathname: '/', assign: vi.fn() },
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
  });

  it('attaches Bearer token from localStorage', async () => {
    localStorage.setItem(TOKEN_KEY, 'tok123');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    await api.get('/admin/dashboard');
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok123');
  });

  it('clears token and throws on 401', async () => {
    localStorage.setItem(TOKEN_KEY, 'tok123');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 401 }));
    await expect(api.get('/admin/dashboard')).rejects.toThrow();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});
