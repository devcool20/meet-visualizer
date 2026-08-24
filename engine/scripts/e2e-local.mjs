/**
 * Temporary end-to-end flow test: boots the real engine (STASH_LOCAL=1,
 * zero credentials) and exercises the exact wire path the extension uses:
 * REST health -> WS hello/auth -> generate -> show, plus the virtualcam
 * trigger route. Deleted after the verification run.
 */
import WebSocket from 'ws';

const PORT = parseInt(process.env.PORT || '5000', 10);
const BASE = `http://127.0.0.1:${PORT}`;
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function http(pathname, opts = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    ...opts,
    headers: { 'content-type': 'application/json', authorization: 'Bearer local-dev-token', ...(opts.headers || {}) },
  });
  return { status: res.status, body: await res.json().catch(() => null), headers: res.headers };
}

function wsSend(ws, obj) { ws.send(JSON.stringify(obj)); }
function waitFor(ws, pred, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for frame')), timeoutMs);
    const onMsg = (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }
      if (pred(msg)) { clearTimeout(timer); ws.off('message', onMsg); resolve(msg); }
      else if (msg.t === 'error') { clearTimeout(timer); ws.off('message', onMsg); reject(new Error(`server error: ${msg.code} ${msg.message}`)); }
    };
    ws.on('message', onMsg);
  });
}

async function main() {
  // 1. Health
  const health = await http('/health');
  check('GET /health', health.status === 200 && health.body?.status === 'ok', JSON.stringify(health.body)?.slice(0, 120));

  // 2. WS auth + config
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  wsSend(ws, { t: 'hello', token: 'local-e2e-token-0123456789', client: 'e2e', version: '0.0.0' });
  const ready = await waitFor(ws, (m) => m.t === 'ready');
  check('WS hello -> ready', typeof ready.userId === 'string' && typeof ready.cardCount === 'number', `userId=${ready.userId} cards=${ready.cardCount}`);
  const cfg = await waitFor(ws, (m) => m.t === 'config');
  check('WS config with settings', cfg.settings && typeof cfg.settings.triggerMode === 'string', `triggerMode=${cfg.settings?.triggerMode}`);

  // 3. Hold-to-talk generate path (the Ranbir acceptance line)
  const captureId = 'e2e-cap-1';
  wsSend(ws, { t: 'generate', captureId, text: 'I have been a big fan of Ranbir Kapoor', ts: Date.now() });
  const gen = await waitFor(ws, (m) => m.t === 'generating');
  check('WS generating ack', gen.captureId === captureId);
  const shown = await waitFor(ws, (m) => m.t === 'show' || m.t === 'generate_failed');
  check(
    'WS generate -> show/generate_failed',
    shown.t === 'show' ? shown.captureId === captureId && shown.card?.id && Array.isArray(shown.card.blocks) : !!shown.message,
    shown.t === 'show' ? `card="${shown.card.title}" blocks=${shown.card.blocks.length}` : `${shown.code}: ${shown.message}`,
  );

  // 4. Malformed frame rejected cleanly
  ws.send('not json');
  const err1 = await new Promise((resolve) => ws.once('message', (d) => resolve(JSON.parse(d.toString()))));
  check('Malformed frame -> error frame', err1.t === 'error', err1.message);

  // 5. Virtualcam trigger route
  const trig = await http('/api/virtualcam/trigger', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ utterance: 'Tell me about our ARR and growth' }),
  });
  check('POST /api/virtualcam/trigger', trig.status === 200 && trig.body?.card?.id, trig.status === 200 ? `card="${trig.body.card.title}"` : JSON.stringify(trig.body));

  const vcStatus = await http('/api/virtualcam/status');
  check('GET /api/virtualcam/status', vcStatus.status === 200 && vcStatus.body?.state?.hudState === 'idle');

  // 6. Virtualcam WS state sync
  const vws = new WebSocket(`ws://127.0.0.1:${PORT}/ws/virtualcam`);
  await new Promise((res, rej) => { vws.once('open', res); vws.once('error', rej); });
  const sync = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('no state_sync')), 5000);
    vws.once('message', (d) => { clearTimeout(t); resolve(JSON.parse(d.toString())); });
  });
  check('WS /ws/virtualcam state_sync', sync.type === 'state_sync' && typeof sync.state.hudState === 'string');

  // 7. Drive docs search route (POST + auth)
  const drive = await http('/api/drive/search', { method: 'POST', body: JSON.stringify({ query: 'ARR growth' }) });
  check('POST /api/drive/search', drive.status === 200 && Array.isArray(drive.body?.results) && drive.body.results.length > 0, `${drive.body?.results?.length ?? 0} results`);

  ws.close();
  vws.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error('E2E FAILED:', err.message);
  process.exit(1);
});
