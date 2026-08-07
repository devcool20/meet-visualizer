/**
 * AI provider panel: configure, test, replace, or remove an AI API key.
 * Used in `/setup/data` and in Settings.
 *
 * States: loading, none (with provider selector + key input), validating,
 * invalid, user-key (with masked preview), server-key, server-key-broken,
 * removing (confirmation dialog).
 */

import { useState } from 'react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Skeleton } from '@/app/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/app/components/ui/alert-dialog';
import { useAuth } from '@/app/auth/AuthContext';
import { getApiClient } from '@/lib/api';
import {
  AI_PROVIDERS,
  AI_PROVIDER_LABELS,
  AI_PROVIDER_HELP_URLS,
  looksLikeKeyFor,
  aiErrorCopy,
  type AiProvider,
  type AiProviderState,
  type AiErrorCode,
} from '@/lib/ai-provider';

type PanelMode = 'loading' | 'none' | 'validating' | 'invalid' | 'user-key' | 'server-key' | 'server-key-broken' | 'removing';

export interface AiProviderPanelProps {
  /** Pass in an existing state to show; when null, the panel fetches it. */
  initialState?: AiProviderState | null;
  /** Called after a successful save/delete so the parent can re-check setup. */
  onChange?: () => void;
}

export function AiProviderPanel({ initialState, onChange }: AiProviderPanelProps) {
  const { getAccessToken } = useAuth();
  const [mode, setMode] = useState<PanelMode>(initialState ? deriveMode(initialState) : 'loading');
  const [provider, setProvider] = useState<AiProvider>('gemini');
  const [keyInput, setKeyInput] = useState('');
  const [keyPreview, setKeyPreview] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [validatedAt, setValidatedAt] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  async function loadState() {
    setMode('loading');
    try {
      const api = getApiClient(getAccessToken);
      const state = await api.getAiProvider();
      applyState(state);
    } catch {
      setMode('none');
    }
  }

  function applyState(state: AiProviderState) {
    if (state.provider) setProvider(state.provider);
    if (state.keyPreview) setKeyPreview(state.keyPreview);
    if (state.validatedAt) setValidatedAt(state.validatedAt);
    if (state.source === 'user') {
      setMode('user-key');
      setErrorMessage(null);
    } else if (state.source === 'server') {
      if (state.lastError) {
        setMode('server-key-broken');
        setErrorMessage(aiErrorCopy(state.lastError));
        if (state.serverProvider) setProvider(state.serverProvider);
      } else {
        setMode('server-key');
        setInfoMessage(`Using the shared ${AI_PROVIDER_LABELS[state.provider ?? state.serverProvider ?? 'gemini']} key on this server.`);
      }
    } else {
      setMode('none');
    }
  }

  // If no initial state, fetch on mount.
  if (!initialState && mode === 'loading') {
    loadState();
  }

  async function handleSave() {
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    setMode('validating');
    setErrorMessage(null);

    // Client-side prefix check.
    if (!looksLikeKeyFor(provider, trimmed)) {
      setMode('invalid');
      setErrorMessage(`This doesn't look like a ${AI_PROVIDER_LABELS[provider]} key. Keys for ${AI_PROVIDER_LABELS[provider]} start with "${AI_PROVIDER_LABELS[provider] === 'Gemini' ? 'AIza...' : provider === 'openai' ? 'sk-...' : 'sk-ant-...'}".`);
      return;
    }

    try {
      const api = getApiClient(getAccessToken);
      const state = await api.putAiProvider(provider, trimmed);
      applyState(state);
      onChange?.();
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? 'internal';
      setMode('invalid');
      setErrorMessage(aiErrorCopy(code as AiErrorCode));
    }
  }

  async function handleRemove() {
    setMode('removing');
    try {
      const api = getApiClient(getAccessToken);
      await api.deleteAiProvider();
      // Re-fetch the full state to see if we fell back to server.
      const state = await api.getAiProvider();
      applyState(state);
      onChange?.();
    } catch {
      setMode('user-key');
      setErrorMessage('Failed to remove the key. Please try again.');
    }
  }

  async function handleTest() {
    try {
      const api = getApiClient(getAccessToken);
      const result = await api.testAiProvider();
      setInfoMessage(`Verified working. Latency: ${result.latencyMs}ms`);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? 'internal';
      setErrorMessage(aiErrorCopy(code as AiErrorCode));
    }
  }

  if (mode === 'loading') {
    return (
      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {mode === 'none' && (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="ai-provider-select">Provider</Label>
            <Select value={provider} onValueChange={(v) => setProvider(v as AiProvider)}>
              <SelectTrigger id="ai-provider-select" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AI_PROVIDERS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {AI_PROVIDER_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ai-key-input">API Key</Label>
            <Input
              id="ai-key-input"
              type="password"
              placeholder={`Paste your ${AI_PROVIDER_LABELS[provider]} API key`}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              autoComplete="off"
            />
          </div>
          <a
            href={AI_PROVIDER_HELP_URLS[provider]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs underline"
            style={{ color: '#5A5550' }}
          >
            Where do I get this?
          </a>
          <Button onClick={handleSave} disabled={!keyInput.trim()}>
            Save
          </Button>
        </>
      )}

      {mode === 'validating' && (
        <p className="text-sm" style={{ color: '#5A5550' }}>
          Checking your key with {AI_PROVIDER_LABELS[provider]}…
        </p>
      )}

      {mode === 'invalid' && errorMessage && (
        <div className="space-y-3">
          <p className="text-sm" style={{ color: '#d4183d' }}>
            {errorMessage}
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="ai-provider-select">Provider</Label>
            <Select value={provider} onValueChange={(v) => setProvider(v as AiProvider)}>
              <SelectTrigger id="ai-provider-select" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AI_PROVIDERS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {AI_PROVIDER_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ai-key-input">API Key</Label>
            <Input
              id="ai-key-input"
              type="password"
              placeholder={`Paste your ${AI_PROVIDER_LABELS[provider]} API key`}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              autoComplete="off"
            />
          </div>
          <Button onClick={handleSave} disabled={!keyInput.trim()}>
            Retry
          </Button>
        </div>
      )}

      {mode === 'user-key' && (
        <div className="space-y-3">
          <p className="text-sm" style={{ color: '#2e7d32' }}>
            Your {AI_PROVIDER_LABELS[provider]} key is active · {keyPreview ?? ''}{' '}
            {validatedAt && `· verified ${new Date(validatedAt).toLocaleDateString()}`}
          </p>
          {infoMessage && (
            <p className="text-xs" style={{ color: '#5A5550' }}>
              {infoMessage}
            </p>
          )}
          {errorMessage && (
            <p className="text-sm" style={{ color: '#d4183d' }}>
              {errorMessage}
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleTest}>
              Test again
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setMode('none');
                setKeyInput('');
                setErrorMessage(null);
              }}
            >
              Replace
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" style={{ color: '#d4183d' }}>
                  Remove
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove API key?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {infoMessage
                      ? 'Your key will be removed and the shared server key will be used instead.'
                      : 'Are you sure you want to remove your API key? Without a key, AI card generation will not work.'}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleRemove}>Remove</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      )}

      {mode === 'server-key' && infoMessage && (
        <div className="space-y-3">
          <p className="text-sm" style={{ color: '#5A5550' }}>
            {infoMessage}
          </p>
          {errorMessage && (
            <p className="text-sm" style={{ color: '#d4183d' }}>
              {errorMessage}
            </p>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setMode('none');
              setKeyInput('');
              setErrorMessage(null);
            }}
          >
            Use my own key
          </Button>
        </div>
      )}

      {mode === 'server-key-broken' && (
        <div className="space-y-3">
          <p className="text-sm" style={{ color: '#d4183d' }}>
            The shared server key has an error: {errorMessage}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setMode('none');
              setKeyInput('');
              setErrorMessage(null);
            }}
          >
            Use my own key instead
          </Button>
        </div>
      )}
    </div>
  );
}

function deriveMode(state: AiProviderState): PanelMode {
  if (state.source === 'user') return 'user-key';
  if (state.source === 'server') {
    return state.lastError ? 'server-key-broken' : 'server-key';
  }
  return 'none';
}
