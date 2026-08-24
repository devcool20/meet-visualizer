/**
 * Content script entry point (ISOLATED world, meet.google.com).
 *
 * - injects the MAIN-world compositor script
 * - bridges chrome.runtime <-> window.postMessage in both directions
 * - hosts Web Speech recognition (ambient mode) or PushToTalkController
 *   (hold-to-talk mode) exclusively — exactly one capture path is active.
 * - renders the presenter-only HUD
 * - Alt+Shift+D dismiss, Alt+Shift+S toggle (plan §3.6)
 */
import type { TriggerMode } from '@stash/card-spec';
import type { BackgroundToContentMsg, ContentToBackgroundMsg } from '../shared/messages.js';
import { forwardToInject, installBridge } from './bridge.js';
import { Hud } from './hud.js';
import type { HudPhase } from './hud.js';
import { WebSpeechProvider } from '../stt/web-speech-provider.js';
import { PushToTalkController } from './push-to-talk.js';
import type { CaptureState, StopReason } from './push-to-talk.js';
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

/* ------------------------------------------------------------------ */
/* Capture paths — exactly one active at a time                        */
/* ------------------------------------------------------------------ */

let currentTriggerMode: TriggerMode = 'hold-to-talk';
let ambientProvider: WebSpeechProvider | null = null;
let pushToTalkController: PushToTalkController | null = null;

/** Switch trigger modes, tearing down the old path and starting the new one. */
function setTriggerMode(mode: TriggerMode): void {
  if (mode === currentTriggerMode) return;
  teardownCurrentCapturePath();
  currentTriggerMode = mode;
  startCapturePath();
}

function teardownCurrentCapturePath(): void {
  if (ambientProvider) {
    ambientProvider.stop();
    ambientProvider = null;
  }
  if (pushToTalkController) {
    pushToTalkController.dispose();
    pushToTalkController = null;
  }
}

function startCapturePath(): void {
  if (currentTriggerMode === 'ambient') {
    startAmbientSpeech();
  } else {
    startPushToTalk();
  }
}

/* ------------------------------------------------------------------ */
/* Ambient mode — unchanged from the original startSpeech()            */
/* ------------------------------------------------------------------ */

function startAmbientSpeech(): void {
  const provider = new WebSpeechProvider();
  provider.onPartial((text) => {
    hud.update({ phase: 'idle', lastPhrase: text, tokenWarning: false, message: null });
  });
  provider.onFinal((text) => {
    hud.update({ phase: 'idle', lastPhrase: text, tokenWarning: false, message: null });
    send({ type: 'transcript', text, final: true, ts: Date.now() });
  });
  provider.onError((err) => {
    if (err.fatal) {
      hud.update({ phase: 'idle', lastPhrase: null, tokenWarning: true, message: null });
    }
  });
  provider.start({ lang: navigator.language || 'en-US' }).catch(() => {
    hud.update({ phase: 'idle', lastPhrase: null, tokenWarning: true, message: null });
  });
  ambientProvider = provider;
}

/* ------------------------------------------------------------------ */
/* Hold-to-talk mode — PushToTalkController + STT per hold             */
/* ------------------------------------------------------------------ */

let pttProvider: WebSpeechProvider | null = null;

function startPushToTalk(): void {
  pushToTalkController = new PushToTalkController(
    {
      now: () => Date.now(),
      setTimer: (fn, ms) => window.setTimeout(fn, ms),
      clearTimer: (h) => window.clearTimeout(h as ReturnType<typeof setTimeout>),
      newCaptureId: () => crypto.randomUUID(),
    },
    {
      onStartCapture(_captureId: string): void {
        // Start a fresh speech recognizer for this hold
        const provider = new WebSpeechProvider();
        provider.onPartial((text) => {
          pushToTalkController?.noteTranscript(text, false);
          hud.update({ phase: 'listening', lastPhrase: text, tokenWarning: false, message: null });
        });
        provider.onFinal((text) => {
          pushToTalkController?.noteTranscript(text, true);
          hud.update({ phase: 'listening', lastPhrase: text, tokenWarning: false, message: null });
        });
        provider.onError((err) => {
          pushToTalkController?.noteSttError({ code: err.code, message: err.message, fatal: err.fatal });
        });
        provider.start({ lang: navigator.language || 'en-US' }).catch(() => {
          pushToTalkController?.noteSttError({ code: 'start_failed', message: 'Speech recognition failed to start', fatal: true });
        });
        pttProvider = provider;
      },
      onStopCapture(_captureId: string, _reason: StopReason): void {
        // Shut down the per-hold recognizer
        if (pttProvider) {
          pttProvider.stop({ flush: true });
          pttProvider = null;
        }
      },
      onSubmit(captureId: string, text: string, ts: number): void {
        send({ type: 'capture:generate', captureId, text, ts });
      },
      onCancelGeneration(_captureId: string): void {
        // User pressed Alt+Shift+Space again mid-generation; the push-to-talk
        // controller already abort-captured. No wire-level cancel exists —
        // the background simply ignores stale captureIds. The generating hover
        // card will time out naturally via GENERATING_TIMEOUT_MS.
      },
      onStateChange(state: CaptureState, detail: { captureId: string | null; text: string | null; message: string | null }): void {
        const phaseMap: Record<CaptureState, HudPhase> = {
          idle: 'idle',
          listening: 'listening',
          generating: 'generating',
          error: 'error',
        };
        hud.update({
          phase: phaseMap[state],
          lastPhrase: detail.text,
          tokenWarning: false,
          message: detail.message,
        });
      },
    },
  );
  pushToTalkController.install();
}

/* ------------------------------------------------------------------ */
/* Background message bridge — extended for hold-to-talk               */
/* ------------------------------------------------------------------ */

function wireBackgroundMessages(): void {
  chrome.runtime.onMessage.addListener((msg: BackgroundToContentMsg) => {
    if (msg.type === 'token:expired') {
      hud.update({ phase: 'idle', lastPhrase: null, tokenWarning: true, message: null });
    } else if (msg.type === 'settings:update') {
      setTriggerMode(msg.settings.triggerMode);
    } else if (msg.type === 'card:show') {
      pushToTalkController?.noteCardShown(msg.captureId ?? null);
      hud.update({ phase: 'idle', lastPhrase: msg.matchedPhrase || null, tokenWarning: false, message: null });
    } else if (msg.type === 'card:generating') {
      pushToTalkController?.noteGenerating(msg.captureId);
      hud.update({ phase: 'generating', lastPhrase: null, tokenWarning: false, message: 'Generating card…' });
    } else if (msg.type === 'card:error') {
      pushToTalkController?.noteGenerationError(msg.captureId, msg.message);
      hud.update({ phase: 'error', lastPhrase: null, tokenWarning: false, message: msg.message });
    }
    forwardToInject(msg);
  });
}

/* ------------------------------------------------------------------ */
/* Mode-independent keyboard shortcuts                                 */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* Bootstrap                                                            */
/* ------------------------------------------------------------------ */

function injectMainWorldScript(): void {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL(injectedScriptUrl);
  script.type = 'module';
  (document.head || document.documentElement).appendChild(script);
}

function startHud(): void {
  hud.mount();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => hud.mount());
  }
  send({ type: 'hud:ready' });
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

  const isRehearsalPage = window.location.pathname === '/rehearse' || window.location.href.includes('/rehearse');
  if (isRehearsalPage) {
    // Stand down extension hold-to-talk hotkeys on the product /rehearse page —
    // the dashboard's useHoldToTalk hook is the sole speech owner here (plan §11).
    return;
  }

  // Ambient mode starts speech immediately; hold-to-talk starts with hotkey listeners
  if (currentTriggerMode === 'ambient') {
    startAmbientSpeech();
  } else {
    startPushToTalk();
  }
}

main();
