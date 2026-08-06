/**
 * Offscreen document — fallback host for Web Speech (plan §3.5).
 *
 * Used ONLY if the content-script host is ruled out at runtime (e.g. Meet's
 * own mic contention prevents `SpeechRecognition` from starting there — the
 * "Spike 0.1" risk called out in the plan). This document cannot reliably
 * prompt for microphone permission itself; the content script primes
 * permission on the Meet origin first and only asks the background to open
 * this document after that succeeds.
 */
import { WebSpeechProvider } from '../stt/web-speech-provider.js';
import type { STTError } from '../stt/provider.js';

const provider = new WebSpeechProvider();

provider.onPartial((text) => {
  chrome.runtime.sendMessage({ type: 'offscreen:partial', text });
});
provider.onFinal((text, confidence) => {
  chrome.runtime.sendMessage({ type: 'offscreen:final', text, confidence });
});
provider.onError((err: STTError) => {
  chrome.runtime.sendMessage({ type: 'offscreen:error', err });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'offscreen:start') {
    provider
      .start({ lang: msg.lang ?? 'en-US' })
      .then(() => sendResponse({ ok: true }))
      .catch((err: unknown) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (msg.type === 'offscreen:stop') {
    provider
      .stop()
      .then(() => sendResponse({ ok: true }))
      .catch((err: unknown) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  return undefined;
});
