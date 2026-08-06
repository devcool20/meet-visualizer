/**
 * Playwright smoke-test driver for the compositor fixture page.
 *
 * Imports the REAL MAIN-world compositor entry point
 * (`src/inject/compositor.ts`) for its side effect: installing the
 * `getUserMedia` monkeypatch exactly as it runs on meet.google.com. This
 * file does not reimplement the interception — it only wires up
 * page-visible hooks (`window.__stashTest`) so the Playwright test can drive
 * `getUserMedia`, push a card via the same bridge envelope the content
 * script uses, and read back pixels.
 *
 * `window.__originalGetUserMedia` is captured by an inline `<script>` in
 * compositor-fixture.html BEFORE this module (and therefore the patch) runs,
 * so the test has a genuine unpatched baseline to diff against.
 */
import '../src/inject/compositor.ts';
import { wrapBridgeMessage } from '../src/shared/messages.js';
import type { CardSpec } from '@stash/card-spec';

declare global {
  interface Window {
    __originalGetUserMedia: typeof navigator.mediaDevices.getUserMedia;
    __stashTest: {
      requestRawCamera: () => Promise<{ streamId: string }>;
      requestPatchedCamera: () => Promise<{ streamId: string }>;
      showCard: (card: CardSpec) => void;
      hideCard: (cardId: string) => void;
    };
  }
}

const rawPreview = document.getElementById('raw-preview') as HTMLVideoElement;
const compositedPreview = document.getElementById('composited-preview') as HTMLVideoElement;

window.__stashTest = {
  async requestRawCamera() {
    const stream = await window.__originalGetUserMedia({ video: true, audio: true });
    rawPreview.srcObject = stream;
    await rawPreview.play().catch(() => undefined);
    return { streamId: stream.id };
  },
  async requestPatchedCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    compositedPreview.srcObject = stream;
    await compositedPreview.play().catch(() => undefined);
    return { streamId: stream.id };
  },
  showCard(card: CardSpec) {
    window.postMessage(
      wrapBridgeMessage({ type: 'card:show', card, matchedPhrase: 'test phrase', score: 0.99 }),
      window.location.origin,
    );
  },
  hideCard(cardId: string) {
    window.postMessage(wrapBridgeMessage({ type: 'card:hide', cardId }), window.location.origin);
  },
};

// Debug-only: surface every bridge envelope InjectToPageMsg to the console so
// Playwright test runs can see compositor:error/compositor:active without
// needing extra chrome.* plumbing (there is none in this fixture).
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const data = event.data as { source?: string; payload?: unknown } | undefined;
  if (data && data.source === 'stash-live-bridge-v1') {
    console.log('[bridge]', JSON.stringify(data.payload));
  }
});
