import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM encryption for data at rest (plan §2.6 Notion tokens, §2.7
 * opt-in activity snippets).
 *
 * Ciphertext format: base64(iv[12] || authTag[16] || ciphertext). Storing iv
 * and tag alongside the ciphertext (rather than in separate columns) keeps
 * every encrypted field a single opaque string, which is what the Prisma
 * schema expects for `Connection.accessToken` / `refreshToken` and
 * `ActivityEvent.snippet`.
 */
const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export class EncryptionKeyError extends Error {}

function resolveKey(rawKey: string): Buffer {
  if (!rawKey) {
    throw new EncryptionKeyError(
      'STASH_ENCRYPTION_KEY is not set. A 32-byte key (base64 or hex) is required to encrypt tokens/snippets at rest.',
    );
  }
  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(rawKey)) {
    key = Buffer.from(rawKey, 'hex');
  } else {
    key = Buffer.from(rawKey, 'base64');
  }
  if (key.length !== 32) {
    throw new EncryptionKeyError(`STASH_ENCRYPTION_KEY must decode to exactly 32 bytes, got ${key.length}.`);
  }
  return key;
}

export interface Encryptor {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
}

export class AesGcmEncryptor implements Encryptor {
  private key: Buffer;

  constructor(rawKey: string) {
    this.key = resolveKey(rawKey);
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGO, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ciphertext]).toString('base64');
  }

  decrypt(ciphertext: string): string {
    const buf = Buffer.from(ciphertext, 'base64');
    if (buf.length < IV_LENGTH + TAG_LENGTH) {
      throw new Error('Ciphertext too short to contain iv + auth tag');
    }
    const iv = buf.subarray(0, IV_LENGTH);
    const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = createDecipheriv(ALGO, this.key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return plaintext.toString('utf8');
  }
}

/** Generates a fresh base64 32-byte key — for `openssl rand -base64 32` parity in setup docs. */
export function generateEncryptionKey(): string {
  return randomBytes(32).toString('base64');
}
