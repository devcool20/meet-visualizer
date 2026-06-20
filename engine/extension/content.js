// Content script running at document_start.
// Injects the WebRTC interceptor script directly into the page execution context.

const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
(document.head || document.documentElement).appendChild(script);

script.onload = function() {
  console.log('[Stash Live Extension] Interceptor hook injected successfully.');
  script.remove();
};
