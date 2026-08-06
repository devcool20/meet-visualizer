import { describe, it, expect } from 'vitest';
import { PairingService, DeviceAuth } from '../auth/pairing.js';
import { MemoryStore } from '../db/memory-store.js';
import { hashNonce, hashToken, generateDeviceToken } from '../util/tokens.js';
import { seedUser } from './helpers.js';

describe('PairingService', () => {
  it('creates a nonce and pairs successfully, minting a device token', async () => {
    const store = new MemoryStore();
    await seedUser(store, 'u1');
    const pairing = new PairingService(store);

    const { nonce, expiresIn } = await pairing.createNonce('u1');
    expect(expiresIn).toBe(60);

    const result = await pairing.pair(nonce, 'My Chrome Extension');
    expect(result).not.toBeNull();
    expect(result!.token.length).toBeGreaterThanOrEqual(16);
    expect(result!.device.userId).toBe('u1');
    expect(result!.device.label).toBe('My Chrome Extension');

    const devices = await store.listDevices('u1');
    expect(devices).toHaveLength(1);
    expect(devices[0].tokenHash).not.toBe(result!.token); // only the hash is stored
  });

  it('rejects reuse of an already-consumed nonce (single-use)', async () => {
    const store = new MemoryStore();
    await seedUser(store, 'u1');
    const pairing = new PairingService(store);

    const { nonce } = await pairing.createNonce('u1');
    const first = await pairing.pair(nonce, 'device-1');
    expect(first).not.toBeNull();

    const second = await pairing.pair(nonce, 'device-2');
    expect(second).toBeNull();
  });

  it('rejects an expired nonce', async () => {
    const store = new MemoryStore();
    await seedUser(store, 'u1');
    // Manually create an already-expired nonce (bypassing the service's own TTL).
    const nonce = 'test-nonce-value';
    await store.createPairingNonce('u1', hashNonce(nonce), new Date(Date.now() - 1000));

    const pairing = new PairingService(store);
    const result = await pairing.pair(nonce, 'device-1');
    expect(result).toBeNull();
  });

  it('rejects an unknown nonce', async () => {
    const store = new MemoryStore();
    const pairing = new PairingService(store);
    expect(await pairing.pair('never-issued-nonce', 'device')).toBeNull();
  });
});

describe('DeviceAuth', () => {
  it('authenticates a valid, non-expired, non-revoked device token', async () => {
    const store = new MemoryStore();
    await seedUser(store, 'u1');
    const pairing = new PairingService(store);
    const { nonce } = await pairing.createNonce('u1');
    const { token } = (await pairing.pair(nonce, 'dev'))!;

    const auth = new DeviceAuth(store);
    const result = await auth.authenticate(token);
    expect(result).not.toBeNull();
    expect(result!.userId).toBe('u1');
    expect(result!.refreshedToken).toBeUndefined(); // fresh token, not near expiry
  });

  it('rejects an unknown token', async () => {
    const store = new MemoryStore();
    const auth = new DeviceAuth(store);
    expect(await auth.authenticate('not-a-real-token')).toBeNull();
  });

  it('rejects a revoked device token', async () => {
    const store = new MemoryStore();
    await seedUser(store, 'u1');
    const pairing = new PairingService(store);
    const { nonce } = await pairing.createNonce('u1');
    const { token, device } = (await pairing.pair(nonce, 'dev'))!;

    await store.revokeDevice('u1', device.id);

    const auth = new DeviceAuth(store);
    expect(await auth.authenticate(token)).toBeNull();
  });

  it('rejects an expired device token', async () => {
    const store = new MemoryStore();
    await seedUser(store, 'u1');
    const device = await store.createDevice('u1', {
      tokenHash: hashToken('some-token-value'),
      label: 'dev',
      lastSeenAt: null,
      expiresAt: new Date(Date.now() - 1000),
      revokedAt: null,
    });
    const auth = new DeviceAuth(store);
    expect(await auth.authenticate('some-token-value')).toBeNull();
    expect(device).toBeTruthy();
  });

  it('rotates the token silently when within the refresh window, and the old token stops working', async () => {
    const store = new MemoryStore();
    await seedUser(store, 'u1');
    const oldToken = generateDeviceToken();
    // expiresAt is 10 days out; refresh window is 14 days -> should rotate.
    await store.createDevice('u1', {
      tokenHash: hashToken(oldToken),
      label: 'dev',
      lastSeenAt: null,
      expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      revokedAt: null,
    });

    const auth = new DeviceAuth(store);
    const result = await auth.authenticate(oldToken);
    expect(result).not.toBeNull();
    expect(result!.refreshedToken).toBeDefined();
    expect(result!.refreshedToken).not.toBe(oldToken);

    // The old token must no longer authenticate (hash was rotated in the store).
    expect(await auth.authenticate(oldToken)).toBeNull();
    // The new token must authenticate successfully.
    const second = await auth.authenticate(result!.refreshedToken!);
    expect(second).not.toBeNull();
    expect(second!.userId).toBe('u1');
  });

  it('touches lastSeenAt on every successful authentication', async () => {
    const store = new MemoryStore();
    await seedUser(store, 'u1');
    const pairing = new PairingService(store);
    const { nonce } = await pairing.createNonce('u1');
    const { token, device } = (await pairing.pair(nonce, 'dev'))!;

    const auth = new DeviceAuth(store);
    await auth.authenticate(token);
    const devices = await store.listDevices('u1');
    expect(devices.find((d) => d.id === device.id)?.lastSeenAt).not.toBeNull();
  });
});
