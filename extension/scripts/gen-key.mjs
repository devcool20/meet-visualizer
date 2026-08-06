#!/usr/bin/env node
/**
 * Generates a development RSA keypair for the extension manifest's `key`
 * field and prints the resulting Chrome extension ID.
 *
 * Chrome derives the extension ID deterministically from the SHA-256 hash of
 * the DER-encoded SubjectPublicKeyInfo (the first 16 bytes, each nibble
 * mapped to a-p). This script reproduces that so the ID can be verified
 * against `manifest.json`'s committed `key` and `shared/constants.ts`'s
 * `DEV_EXTENSION_ID`.
 *
 * *** Re-run this and update both files before a real Chrome Web Store
 * submission — the Web Store assigns its own ID from the upload key, not
 * from this development key. ***
 *
 * Usage: node extension/scripts/gen-key.mjs
 */
import { generateKeyPairSync, createHash } from 'node:crypto';

function computeExtensionId(spkiDer) {
  const hash = createHash('sha256').update(spkiDer).digest();
  const idBytes = hash.subarray(0, 16);
  let id = '';
  for (const byte of idBytes) {
    const hi = (byte >> 4) & 0xf;
    const lo = byte & 0xf;
    id += String.fromCharCode('a'.charCodeAt(0) + hi);
    id += String.fromCharCode('a'.charCodeAt(0) + lo);
  }
  return id;
}

const { publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicExponent: 0x10001,
});

const spkiDer = publicKey.export({ type: 'spki', format: 'der' });
const keyBase64 = spkiDer.toString('base64');
const id = computeExtensionId(spkiDer);

console.log('# Paste this into manifest.json "key":');
console.log(keyBase64);
console.log();
console.log('# Update DEV_EXTENSION_ID in src/shared/constants.ts to:');
console.log(id);
