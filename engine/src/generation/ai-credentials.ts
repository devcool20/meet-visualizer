/**
 * AI key resolution (plan §3.3).
 *
 * Precedence: per-user encrypted key → server env key → mock (local only) → null.
 * Decryption failure is treated as "no user key" and logged once.
 */
import type { Store } from '../db/types.js';
import type { Encryptor } from '../util/encryption.js';
import type { AiProviderId } from './provider.js';
import { config } from '../config.js';

export interface ResolvedAiKey {
  provider: AiProviderId;
  apiKey: string;
  model: string;
  origin: 'user' | 'env' | 'mock';
}

export class AiKeyResolver {
  private loggedDecryptFailure = new Set<string>();

  constructor(
    private store: Store,
    private encryptor: Encryptor,
  ) {}

  async resolve(userId: string): Promise<ResolvedAiKey | null> {
    // 1. Per-user encrypted key (highest precedence)
    const credential = await this.store.getAiCredential(userId);
    if (credential) {
      try {
        const apiKey = this.encryptor.decrypt(credential.apiKey);
        return {
          provider: credential.provider as AiProviderId,
          apiKey,
          model: credential.model ?? config.aiModels[credential.provider as keyof typeof config.aiModels] ?? '',
          origin: 'user',
        };
      } catch {
        if (!this.loggedDecryptFailure.has(userId)) {
          console.error(`[AiKeyResolver] Failed to decrypt AI credential for user ${userId}`);
          this.loggedDecryptFailure.add(userId);
        }
      }
    }

    // 3. Server env key
    const envProvider = config.aiProviderDefault;
    const envKey = config.aiKeys[envProvider];
    if (envKey) {
      return {
        provider: envProvider,
        apiKey: envKey,
        model: config.aiModels[envProvider],
        origin: 'env',
      };
    }

    // 4. Explicit Mock generation mode (when explicitly enabled and no keys)
    if (config.useMockGeneration) {
      return {
        provider: 'mock',
        apiKey: '',
        model: 'mock-model/v0',
        origin: 'mock',
      };
    }

    // 5. Nothing available
    return null;
  }
}
