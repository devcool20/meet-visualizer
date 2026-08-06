/**
 * `handlePairMessage` — the full pairing exchange (plan §2.2), with `fetch`
 * and token storage injected so this never makes a real network call.
 */
import { describe, expect, it, vi } from 'vitest';
import { handlePairMessage } from '../src/background/pairing';

const PROD_ORIGIN_URL = 'https://meet-visualizer.vercel.app/dashboard';

describe('handlePairMessage', () => {
  it('rejects a sender that is not the exact production origin, without calling fetch', async () => {
    const fetchImpl = vi.fn();
    const storeToken = vi.fn();
    const result = await handlePairMessage(
      { type: 'pair', nonce: 'abc' },
      'https://evil.example.com/',
      { fetchImpl, storeToken },
    );
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(storeToken).not.toHaveBeenCalled();
  });

  it('rejects a malformed message even from the correct origin', async () => {
    const fetchImpl = vi.fn();
    const result = await handlePairMessage({ type: 'pair' }, PROD_ORIGIN_URL, {
      fetchImpl,
      storeToken: vi.fn(),
    });
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('POSTs without credentials and stores the returned token on success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'device-token-123' }),
    });
    const storeToken = vi.fn().mockResolvedValue(undefined);

    const result = await handlePairMessage({ type: 'pair', nonce: 'nonce-1' }, PROD_ORIGIN_URL, {
      fetchImpl,
      storeToken,
    });

    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, init] = fetchImpl.mock.calls[0];
    expect(init.credentials).toBe('omit');
    expect(JSON.parse(init.body)).toMatchObject({ nonce: 'nonce-1' });
    expect(storeToken).toHaveBeenCalledWith('device-token-123');
  });

  it('reports an error result when the pairing endpoint responds non-OK', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 400 });
    const result = await handlePairMessage({ type: 'pair', nonce: 'n' }, PROD_ORIGIN_URL, {
      fetchImpl,
      storeToken: vi.fn(),
    });
    expect(result.ok).toBe(false);
  });

  it('reports an error result when the response has no token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    const result = await handlePairMessage({ type: 'pair', nonce: 'n' }, PROD_ORIGIN_URL, {
      fetchImpl,
      storeToken: vi.fn(),
    });
    expect(result.ok).toBe(false);
  });

  it('never throws even if fetch itself rejects', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));
    const result = await handlePairMessage({ type: 'pair', nonce: 'n' }, PROD_ORIGIN_URL, {
      fetchImpl,
      storeToken: vi.fn(),
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('network down');
  });
});
