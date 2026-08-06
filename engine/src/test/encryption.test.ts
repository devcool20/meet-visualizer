import { describe, it, expect } from 'vitest';
import { AesGcmEncryptor, EncryptionKeyError, generateEncryptionKey } from '../util/encryption.js';

describe('AesGcmEncryptor', () => {
  it('round-trips plaintext through encrypt/decrypt', () => {
    const enc = new AesGcmEncryptor(generateEncryptionKey());
    const plaintext = 'notion-access-token-super-secret';
    const ciphertext = enc.encrypt(plaintext);
    expect(ciphertext).not.toContain(plaintext);
    expect(enc.decrypt(ciphertext)).toBe(plaintext);
  });

  it('produces different ciphertext for the same plaintext each time (random IV)', () => {
    const enc = new AesGcmEncryptor(generateEncryptionKey());
    const a = enc.encrypt('same plaintext');
    const b = enc.encrypt('same plaintext');
    expect(a).not.toBe(b);
  });

  it('accepts a hex-encoded 32-byte key', () => {
    const hexKey = '00'.repeat(32);
    const enc = new AesGcmEncryptor(hexKey);
    expect(enc.decrypt(enc.encrypt('hello'))).toBe('hello');
  });

  it('rejects a missing key', () => {
    expect(() => new AesGcmEncryptor('')).toThrow(EncryptionKeyError);
  });

  it('rejects a key that does not decode to exactly 32 bytes', () => {
    const shortKey = Buffer.alloc(16, 1).toString('base64');
    expect(() => new AesGcmEncryptor(shortKey)).toThrow(EncryptionKeyError);
  });

  it('fails to decrypt ciphertext tampered with after encryption (auth tag check)', () => {
    const enc = new AesGcmEncryptor(generateEncryptionKey());
    const ciphertext = enc.encrypt('sensitive value');
    const buf = Buffer.from(ciphertext, 'base64');
    buf[buf.length - 1] ^= 0xff; // flip a bit in the ciphertext body
    const tampered = buf.toString('base64');
    expect(() => enc.decrypt(tampered)).toThrow();
  });

  it('fails to decrypt with the wrong key', () => {
    const enc1 = new AesGcmEncryptor(generateEncryptionKey());
    const enc2 = new AesGcmEncryptor(generateEncryptionKey());
    const ciphertext = enc1.encrypt('secret');
    expect(() => enc2.decrypt(ciphertext)).toThrow();
  });

  it('generateEncryptionKey always produces a usable 32-byte base64 key', () => {
    for (let i = 0; i < 5; i++) {
      const key = generateEncryptionKey();
      expect(() => new AesGcmEncryptor(key)).not.toThrow();
    }
  });
});
