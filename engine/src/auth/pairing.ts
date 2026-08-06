import type { Store, DeviceRecord } from '../db/types.js';
import { generateDeviceToken, generatePairingNonce, hashNonce, hashToken } from '../util/tokens.js';
import { config } from '../config.js';

/**
 * Device pairing flow (plan §2.2), exactly as specified:
 *
 *   1. POST /api/extension/pairing-nonce (authenticated) -> { nonce, expiresIn }
 *   2. Dashboard -> chrome.runtime.sendMessage(EXT_ID, { type:'pair', nonce })
 *   3. Extension SW validates sender.url origin === prod origin EXACTLY
 *      (browser-side; not implemented here, but see route comments)
 *   4. Extension SW -> POST /api/extension/pair { nonce, label }  -- NO cookies
 *   5. Backend atomically consumes the nonce (single-use, 60s), creates a
 *      Device, returns an opaque 32-byte token. Only its SHA-256 hash is
 *      stored.
 *   6. Extension writes the token to chrome.storage.local
 */
export class PairingService {
  constructor(private store: Store) {}

  async createNonce(userId: string): Promise<{ nonce: string; expiresIn: number }> {
    const nonce = generatePairingNonce();
    const expiresAt = new Date(Date.now() + config.pairingNonceTtlSeconds * 1000);
    await this.store.createPairingNonce(userId, hashNonce(nonce), expiresAt);
    return { nonce, expiresIn: config.pairingNonceTtlSeconds };
  }

  /**
   * Consumes the nonce atomically (single-use) and mints a device token.
   * Returns null if the nonce is missing, already consumed, or expired —
   * callers must treat that as a generic pairing failure (do not leak which
   * case it was, to avoid nonce-guessing oracle behaviour).
   */
  async pair(nonce: string, label: string): Promise<{ token: string; device: DeviceRecord } | null> {
    const consumed = await this.store.consumePairingNonce(hashNonce(nonce));
    if (!consumed) return null;

    const token = generateDeviceToken();
    const expiresAt = new Date(Date.now() + config.deviceTokenTtlDays * 24 * 60 * 60 * 1000);
    const device = await this.store.createDevice(consumed.userId, {
      tokenHash: hashToken(token),
      label,
      lastSeenAt: null,
      expiresAt,
      revokedAt: null,
    });
    return { token, device };
  }
}

export interface DeviceAuthResult {
  userId: string;
  deviceId: string;
  /** Set when the token is within the refresh window and a new one should ship in `config`. */
  refreshedToken?: string;
}

/**
 * Verifies a device token presented over the WS `hello` message, applies
 * revocation ("takes effect on next connect or heartbeat" — plan §2.2), and
 * performs silent refresh when `expiresAt` is < 14 days out.
 */
export class DeviceAuth {
  constructor(private store: Store) {}

  async authenticate(token: string): Promise<DeviceAuthResult | null> {
    const device = await this.store.getDeviceByTokenHash(hashToken(token));
    if (!device) return null;
    if (device.revokedAt) return null;
    if (device.expiresAt.getTime() < Date.now()) return null;

    await this.store.touchDevice(device.id);

    const refreshWindowMs = config.deviceTokenRefreshWindowDays * 24 * 60 * 60 * 1000;
    let refreshedToken: string | undefined;
    if (device.expiresAt.getTime() - Date.now() < refreshWindowMs) {
      const newToken = generateDeviceToken();
      const newExpiresAt = new Date(Date.now() + config.deviceTokenTtlDays * 24 * 60 * 60 * 1000);
      await this.store.rotateDeviceToken(device.id, hashToken(newToken), newExpiresAt);
      refreshedToken = newToken;
    }

    return { userId: device.userId, deviceId: device.id, refreshedToken };
  }
}
