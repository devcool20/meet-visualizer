/**
 * Popup script (plan §3.6).
 *
 * Signed-out -> "Sign in" linking to the dashboard.
 * Signed-in -> connection status, mic state, active cards, master toggle,
 * dashboard link.
 */
import { PRODUCT_ORIGIN, STORAGE_KEYS } from '../shared/constants.js';
import type { ConnectionStatus } from '../shared/messages.js';

interface PopupState {
  paired: boolean;
  connectionStatus: ConnectionStatus;
}

async function queryBackground(): Promise<PopupState | null> {
  try {
    return await chrome.runtime.sendMessage({ type: 'popup:query-state' });
  } catch {
    return null;
  }
}

function setPill(el: HTMLElement, text: string, kind: 'ok' | 'warn' | 'err'): void {
  el.textContent = text;
  el.className = `pill ${kind}`;
}

async function render(): Promise<void> {
  const signedOut = document.getElementById('signed-out')!;
  const signedIn = document.getElementById('signed-in')!;
  const signInLink = document.getElementById('sign-in-link') as HTMLAnchorElement;
  const dashboardLink = document.getElementById('dashboard-link') as HTMLAnchorElement;
  signInLink.href = `${PRODUCT_ORIGIN}/welcome`;
  dashboardLink.href = `${PRODUCT_ORIGIN}/dashboard`;

  const state = await queryBackground();
  const paired = state?.paired ?? false;

  signedOut.hidden = paired;
  signedIn.hidden = !paired;
  if (!paired) return;

  const connPill = document.getElementById('conn-pill')!;
  const micPill = document.getElementById('mic-pill')!;
  const cardCount = document.getElementById('card-count')!;

  const status = state!.connectionStatus;
  if (status.phase === 'connected') {
    setPill(connPill, 'Connected', 'ok');
    cardCount.textContent = String(status.cardCount);
  } else if (status.phase === 'connecting') {
    setPill(connPill, 'Connecting…', 'warn');
  } else if (status.phase === 'error') {
    setPill(connPill, status.code === 'token_expired' ? 'Token expired' : 'Error', 'err');
  } else {
    setPill(connPill, 'Disconnected', 'err');
  }

  // Mic state is owned by the content script on the active Meet tab; the
  // popup has no direct visibility into it, so this stays a static
  // "unknown" pill until a content script explicitly reports otherwise via
  // a future `mic:state` message. Documented as a known popup limitation.
  setPill(micPill, 'Unknown', 'warn');

  const toggle = document.getElementById('master-toggle') as HTMLInputElement;
  const stored = await chrome.storage.local.get(STORAGE_KEYS.userSettings);
  toggle.checked = stored[STORAGE_KEYS.userSettings]?.enabled !== false;
  toggle.addEventListener('change', () => {
    void chrome.storage.local.set({
      [STORAGE_KEYS.userSettings]: { ...(stored[STORAGE_KEYS.userSettings] ?? {}), enabled: toggle.checked },
    });
  });
}

void render();
