/**
 * Content script entry point (ISOLATED world, meet.google.com).
 *
 * - injects the MAIN-world compositor script
 * - bridges chrome.runtime <-> window.postMessage in both directions
 * - hosts Web Speech recognition and forwards transcripts to background
 * - renders the presenter-only HUD
 * - Alt+Shift+D dismiss, Alt+Shift+S toggle (plan §3.6)
 */
import type { BackgroundToContentMsg, ContentToBackgroundMsg } from '../shared/messages.js';
import { forwardToInject, installBridge } from './bridge.js';
import { Hud } from './hud.js';
import { WebSpeechProvider } from '../stt/web-speech-provider.js';
// The `?script&module` suffix is @crxjs/vite-plugin's convention for
// bundling a TS entry as a standalone MAIN-world script and exposing it as a
// web-accessible resource automatically — see extension/src/vite-env.d.ts.
import injectedScriptUrl from '../inject/compositor.ts?script&module';

const hud = new Hud(() => {
  send({ type: 'dismiss' });
});

function send(msg: ContentToBackgroundMsg): void {
  chrome.runtime.sendMessage(msg).catch(() => {
    // Background may be restarting; the heartbeat/reconnect logic there
    // will recover the socket, so a dropped message here is non-fatal.
  });
}

function injectMainWorldScript(): void {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL(injectedScriptUrl);
  script.type = 'module';
  (document.head || document.documentElement).appendChild(script);
}

function startHud(): void {
  hud.mount();
  send({ type: 'hud:ready' });
}

function startSpeech(): void {
  const provider = new WebSpeechProvider();
  provider.onPartial((text) => {
    hud.update({ listening: true, lastPhrase: text, tokenWarning: false });
  });
  provider.onFinal((text) => {
    hud.update({ listening: true, lastPhrase: text, tokenWarning: false });
    send({ type: 'transcript', text, final: true, ts: Date.now() });
  });
  provider.onError((err) => {
    if (err.fatal) {
      hud.update({ listening: false, lastPhrase: null, tokenWarning: true });
    }
  });
  provider.start({ lang: navigator.language || 'en-US' }).catch(() => {
    hud.update({ listening: false, lastPhrase: null, tokenWarning: true });
  });
}

function wireBackgroundMessages(): void {
  chrome.runtime.onMessage.addListener((msg: BackgroundToContentMsg) => {
    if (msg.type === 'token:expired') {
      hud.update({ listening: true, lastPhrase: null, tokenWarning: true });
    }
    forwardToInject(msg);
  });
}

function wireKeyboardShortcuts(): void {
  window.addEventListener('keydown', (event) => {
    if (!event.altKey || !event.shiftKey) return;
    if (event.code === 'KeyD') {
      hud.dismiss();
      send({ type: 'dismiss' });
    } else if (event.code === 'KeyS') {
      hud.toggleVisible();
    }
  });
}

function main(): void {
  injectMainWorldScript();
  installBridge(() => {
    // inject:ready / compositor:active / compositor:error — currently only
    // used for future diagnostics; nothing to relay upstream today.
  });
  startHud();
  wireBackgroundMessages();
  wireKeyboardShortcuts();
  startSpeech();
}

main();
