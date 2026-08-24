/**
 * Stash Live — Direct Google Meet Injector Snippet.
 *
 * This script allows presenters to use Stash Live in Google Meet (meet.google.com)
 * directly without relying on Chrome Extension installation or store approvals.
 *
 * It can be run directly in the Chrome DevTools console on meet.google.com
 * or saved as a bookmarklet.
 */

export const STASH_MEET_INJECTOR_SNIPPET = `
(function() {
  if (window.__stashLiveInjected) {
    console.log('[Stash Live] Already injected into Google Meet.');
    return;
  }
  window.__stashLiveInjected = true;

  console.log('%c[Stash Live] Initializing Direct Google Meet Compositor...', 'background: #1a1512; color: #fb8500; font-weight: bold; padding: 4px 8px; border-radius: 4px;');

  const ENGINE_WS_URL = (window.__STASH_ENGINE_URL || 'ws://localhost:5000').replace(/^http/, 'ws');
  let socket = null;
  let isListening = false;
  let recognition = null;
  let activeStream = null;

  // Initialize Web Speech API for hold-to-talk
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        interim += event.results[i][0].transcript;
      }
      if (interim.trim()) {
        updateHud('listening', interim);
      }
    };
  }

  // Connect to Engine WebSocket
  function connectEngine() {
    try {
      socket = new WebSocket(ENGINE_WS_URL);
      socket.onopen = () => {
        console.log('[Stash Live] Connected to engine WebSocket.');
        socket.send(JSON.stringify({ t: 'hello', token: 'direct-meet-session', protocolVersion: 1 }));
      };
      socket.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.t === 'show' && msg.card) {
            updateHud('idle');
            console.log('[Stash Live] Received card overlay:', msg.card.title);
          } else if (msg.t === 'generating') {
            updateHud('generating');
          } else if (msg.t === 'generate_failed') {
            updateHud('error', msg.message);
          }
        } catch (e) {}
      };
      socket.onerror = () => {
        updateHud('error', 'Engine disconnected');
      };
    } catch (err) {
      console.warn('[Stash Live] Engine connection failed:', err);
    }
  }

  // Build HUD Pill in Meet UI
  let hudEl = document.createElement('div');
  hudEl.id = 'stash-live-meet-hud';
  hudEl.style.cssText = 'position:fixed;bottom:90px;left:24px;z-index:999999;background:rgba(26,21,18,0.85);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,0.15);border-radius:100px;padding:8px 16px;color:#fff;font-family:system-ui,-apple-system,sans-serif;font-size:13px;display:flex;align-items:center;gap:8px;box-shadow:0 8px 32px rgba(0,0,0,0.3);transition:all 0.2s cubic-bezier(0.16,1,0.3,1);';
  hudEl.innerHTML = '<span style="width:8px;height:8px;border-radius:50%;background:#fb8500;display:inline-block;animation:pulse 2s infinite;"></span><span>Stash Live Ready · Hold <kbd style="background:rgba(255,255,255,0.2);padding:2px 6px;border-radius:4px;font-size:11px;">Alt+Shift+Space</kbd></span>';
  document.body.appendChild(hudEl);

  function updateHud(state, text) {
    if (!hudEl) return;
    if (state === 'listening') {
      hudEl.style.borderColor = '#fb8500';
      hudEl.innerHTML = '<span style="width:8px;height:8px;border-radius:50%;background:#fb8500;display:inline-block;"></span><span style="font-weight:600;color:#fb8500;">Listening:</span> <span>' + (text || 'Speak topic…') + '</span>';
    } else if (state === 'generating') {
      hudEl.style.borderColor = '#38bdf8';
      hudEl.innerHTML = '<span style="width:8px;height:8px;border-radius:50%;background:#38bdf8;display:inline-block;"></span><span>Generating overlay from Google Drive docs…</span>';
    } else if (state === 'error') {
      hudEl.style.borderColor = '#ef4444';
      hudEl.innerHTML = '<span style="width:8px;height:8px;border-radius:50%;background:#ef4444;display:inline-block;"></span><span>' + (text || 'Error generating card') + '</span>';
      setTimeout(() => updateHud('idle'), 4000);
    } else {
      hudEl.style.borderColor = 'rgba(255,255,255,0.15)';
      hudEl.innerHTML = '<span style="width:8px;height:8px;border-radius:50%;background:#22c55e;display:inline-block;"></span><span>Stash Live Active · Hold <kbd style="background:rgba(255,255,255,0.2);padding:2px 6px;border-radius:4px;font-size:11px;">Alt+Shift+Space</kbd></span>';
    }
  }

  // Keyboard shortcut listener (Alt+Shift+Space)
  window.addEventListener('keydown', (e) => {
    if (e.altKey && e.shiftKey && e.code === 'Space' && !isListening) {
      isListening = true;
      updateHud('listening');
      if (recognition) {
        try { recognition.start(); } catch (err) {}
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    if (isListening && (e.code === 'Space' || !e.altKey || !e.shiftKey)) {
      isListening = false;
      if (recognition) {
        try { recognition.stop(); } catch (err) {}
      }
      updateHud('generating');
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          t: 'generate',
          captureId: 'cap_' + Date.now(),
          text: 'Current topic',
          ts: Date.now()
        }));
      }
    }
  });

  connectEngine();
})();
`;
