/**
 * AI provider metadata, key masking, prefix validation, and error-code copy
 * (plan §5.5, §7.1, T2).
 *
 * Every declared error code has a user-facing string. The dashboard never
 * renders the full key back to the user — only a masked preview showing the
 * last 4 characters.
 */

export type AiProvider = 'gemini' | 'openai' | 'anthropic';

export const AI_PROVIDERS: AiProvider[] = ['gemini', 'openai', 'anthropic'];

export const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  gemini: 'Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
};

export const AI_PROVIDER_HELP_URLS: Record<AiProvider, string> = {
  gemini: 'https://aistudio.google.com/app/apikey',
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
};

/** Per-provider key prefix heuristics for early client-side validation. */
const KEY_PREFIXES: Record<AiProvider, string[]> = {
  gemini: ['AIza'],
  openai: ['sk-', 'sk-proj-', 'sk-svc-'],
  anthropic: ['sk-ant-'],
};

/**
 * Masks a key to show only the last 4 characters.
 * Returns "••••a91f" format — never returns the full key.
 * Returns "••••" for keys shorter than 4 chars.
 */
export function maskKey(key: string): string {
  if (!key) return '';
  const last4 = key.slice(-4);
  return '••••' + last4;
}

/**
 * Quick client-side check whether a key plausibly matches the selected
 * provider. Returns `true` if the key starts with a known prefix for that
 * provider. Does not guarantee the key is valid — only the server-side test
 * can do that.
 */
export function looksLikeKeyFor(provider: AiProvider, key: string): boolean {
  const trimmed = key.trim();
  if (provider === 'openai' && trimmed.startsWith('sk-ant-')) {
    return false;
  }
  const prefixes = KEY_PREFIXES[provider];
  return prefixes.some((p) => trimmed.startsWith(p));
}

/**
 * User-facing copy for each AI error code. Every declared code in the
 * AiErrorCode union must have an entry here.
 */
export type AiErrorCode =
  | 'invalid_key'
  | 'unsupported_provider'
  | 'provider_unreachable'
  | 'rate_limited'
  | 'no_provider'
  | 'unsafe_content'
  | 'internal';

export const AI_ERROR_COPY: Record<AiErrorCode, string> = {
  invalid_key:
    'The key was rejected by the provider. Double-check the key and make sure it has the right permissions.',
  unsupported_provider:
    'This provider is not supported yet. Try Gemini, OpenAI, or Anthropic.',
  provider_unreachable:
    "Could not reach the provider's API — it may be down or blocked by your network.",
  rate_limited:
    'The provider returned a rate-limit error. Wait a moment and try again.',
  no_provider:
    'No AI provider is configured. Add an API key or use the shared server key to continue.',
  unsafe_content:
    'The generated content was flagged as unsafe by the provider policy.',
  internal:
    'Something went wrong on our end. Please try again in a moment.',
};

/**
 * Returns user-facing copy for an error code. Falls back to a generic
 * message for unknown codes.
 */
export function aiErrorCopy(code: AiErrorCode | string): string {
  return AI_ERROR_COPY[code as AiErrorCode] ?? 'An unexpected error occurred. Please try again.';
}

/** Server-side AI provider state returned by /api/me/ai-provider. */
export interface AiProviderState {
  provider: AiProvider | null;
  source: 'user' | 'server' | 'none';
  keyPreview: string | null;
  validatedAt: string | null;
  lastError: AiErrorCode | null;
  serverKeyAvailable: boolean;
  serverProvider: AiProvider | null;
}
