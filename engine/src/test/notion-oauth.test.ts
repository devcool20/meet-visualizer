import { describe, it, expect, vi } from 'vitest';
import { NotionOAuthService, MockNotionOAuthClient } from '../notion/oauth.js';
import { AesGcmEncryptor, generateEncryptionKey } from '../util/encryption.js';
import { MemoryStore } from '../db/memory-store.js';
import { seedUser } from './helpers.js';

describe('NotionOAuthService', () => {
  it('completes the OAuth round trip and stores an encrypted connection', async () => {
    const store = new MemoryStore();
    await seedUser(store, 'u1');
    const encryptor = new AesGcmEncryptor(generateEncryptionKey());
    const oauth = new NotionOAuthService(store, new MockNotionOAuthClient(), encryptor);

    const state = oauth.createAuthorizeState('u1');
    const result = await oauth.handleCallback(state, 'auth-code-123');
    expect(result.userId).toBe('u1');

    const connection = await store.getConnection('u1', 'notion');
    expect(connection).not.toBeNull();
    expect(connection!.accessToken).not.toContain('mock-access-auth-code-123'); // stored encrypted
    expect(encryptor.decrypt(connection!.accessToken)).toBe('mock-access-auth-code-123');
  });

  it('rejects an unrecognized state param', async () => {
    const store = new MemoryStore();
    const encryptor = new AesGcmEncryptor(generateEncryptionKey());
    const oauth = new NotionOAuthService(store, new MockNotionOAuthClient(), encryptor);
    await expect(oauth.handleCallback('never-issued-state', 'code')).rejects.toThrow(/invalid_or_expired_oauth_state/);
  });

  it('rejects reuse of a state param (single-use)', async () => {
    const store = new MemoryStore();
    await seedUser(store, 'u1');
    const encryptor = new AesGcmEncryptor(generateEncryptionKey());
    const oauth = new NotionOAuthService(store, new MockNotionOAuthClient(), encryptor);

    const state = oauth.createAuthorizeState('u1');
    await oauth.handleCallback(state, 'code-1');
    await expect(oauth.handleCallback(state, 'code-2')).rejects.toThrow();
  });

  it('rejects an expired state param', async () => {
    const store = new MemoryStore();
    await seedUser(store, 'u1');
    const encryptor = new AesGcmEncryptor(generateEncryptionKey());
    const oauth = new NotionOAuthService(store, new MockNotionOAuthClient(), encryptor);

    vi.useFakeTimers();
    try {
      const state = oauth.createAuthorizeState('u1');
      vi.advanceTimersByTime(6 * 60_000); // state TTL is 5 minutes
      await expect(oauth.handleCallback(state, 'code-1')).rejects.toThrow(/invalid_or_expired_oauth_state/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('refreshIfNeeded rotates tokens when near expiry and re-encrypts the new ones', async () => {
    const store = new MemoryStore();
    await seedUser(store, 'u1');
    const encryptor = new AesGcmEncryptor(generateEncryptionKey());
    const client = new MockNotionOAuthClient();
    const oauth = new NotionOAuthService(store, client, encryptor);

    const state = oauth.createAuthorizeState('u1');
    await oauth.handleCallback(state, 'code-1');

    // Force the stored connection to look like it's about to expire.
    const existing = await store.getConnection('u1', 'notion');
    await store.upsertConnection('u1', { ...existing!, tokenExpiresAt: new Date(Date.now() + 60_000) });

    await oauth.refreshIfNeeded('u1');

    const refreshed = await store.getConnection('u1', 'notion');
    expect(encryptor.decrypt(refreshed!.accessToken)).toContain('mock-access-rotated-');
  });

  it('refreshIfNeeded is a no-op when the token is not close to expiry', async () => {
    const store = new MemoryStore();
    await seedUser(store, 'u1');
    const encryptor = new AesGcmEncryptor(generateEncryptionKey());
    const oauth = new NotionOAuthService(store, new MockNotionOAuthClient(), encryptor);

    const state = oauth.createAuthorizeState('u1');
    await oauth.handleCallback(state, 'code-1');
    const before = await store.getConnection('u1', 'notion');

    await oauth.refreshIfNeeded('u1'); // mock client sets tokenExpiresAt 1h out, well beyond the 10-min window
    const after = await store.getConnection('u1', 'notion');
    expect(after!.accessToken).toBe(before!.accessToken);
  });
});
