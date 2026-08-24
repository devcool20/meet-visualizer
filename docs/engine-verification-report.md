# Stash Live — Engine Verification & Fix Report

**Date:** 2026-08-21
**Scope:** Complete the extension-based Google Meet path end-to-end; real providers
(env keys / per-user keys), mock only as an explicit local mode. Test-and-fix loop
over the full stack, then full verification.

---

## 1. Final status

| Check | Result |
|---|---|
| `npm run typecheck:all` (root + engine + extension) | ✅ pass |
| Root suite (`packages/**`, `src/**`) | ✅ 248/248 tests, 26 files |
| Engine suite (`engine/src/**`) | ✅ 146/146 tests, 20 files |
| Extension suite | ✅ 53/53 tests, 5 files |
| Dashboard build (`vite build`) | ✅ |
| Engine build (`tsc`) | ✅ |
| Extension build (`vite build`) | ✅ |
| End-to-end flow check (`engine/scripts/e2e-local.mjs`) | ✅ 10/10 checks |

---

## 2. What was broken and fixed

### 2.1 Test-suite timeouts in `card-canvas` (4 failing tests)

The uncommitted WIP had replaced `node-canvas` with a per-pixel JS mock 2D context.
Two defects made each composited frame cost ~1 second instead of ~5 ms:

1. **Per-byte pixel loops.** `fillRect` / `fill` / `getImageData` / `putImageData`
   wrote and read pixels one byte at a time over full-frame buffers.
   - Fix: bulk typed-array operations — row-segment construction with a single
     `TypedArray.set()` per row, `fill(0, start, end)` for clears, subarray row
     copies for `getImageData`/`putImageData`, and a 1:1 fast path in `drawImage`.
     (`packages/card-canvas/src/canvas-factory.ts`)
2. **Fractional coordinates as array indices.** The compositor draws at
   sub-pixel positions (e.g. `dx = 854.6`); the mock used those floats directly
   as typed-array indices, forcing V8 into a path roughly **70× slower**
   (measured: one `drawImage` call went from 587 ms → 7.5 ms after rounding).
   - Fix: `dx/dy/dw/dh` are now rounded to integers on entry to `drawImage`,
     matching what a real canvas rasterizer does.

Result: the two previously-failing files went from timeout (>15 s) to **514 ms and
1603 ms**, all 18 tests green.

### 2.2 Trigger mode never reached the meeting tab (functional bug)

The content script hardcodes `hold-to-talk` at startup and only switched modes when
a `settings:update` arrived — which only happened on an unrelated settings change.
An `ambient` user joining a Meet call silently got the wrong capture mode for the
entire call.

Fixes (`extension/src/background/index.ts`):
- On `hud:ready` from any tab, the service worker immediately pushes the current
  `settings:update` to that tab.
- `UserSettings` received via the engine's `config` frame are now persisted to
  `chrome.storage.local` and reloaded on service-worker startup, so an MV3 SW
  eviction mid-call no longer resets settings to defaults.

### 2.3 Engine origin hardcoded to Vercel (deployment blocker)

The plan requires the WebSocket engine on its own always-on host (Vercel cannot
hold WebSockets). `ENGINE_ORIGIN` was compiled to the Vercel dashboard origin and
the documented `stash.engineOriginOverride` storage key was never read.

Fix (`extension/src/background/index.ts`): `startConnection()` resolves the origin
as `chrome.storage.local['stash.engineOriginOverride']` (must be `http(s)://`) →
compiled-in default. Socket instances are recreated when the override changes;
repeated calls are idempotent.

### 2.4 `/ws/virtualcam` upgrades destroyed by the main WS server

The main WS server was constructed with `{ server, path: '/ws' }`. ws's behavior
for a path-scoped server is to **abort (400) every upgrade for any other path**,
and its listener was registered first — so `/ws/virtualcam` handshakes were killed
before their own handler ran.

Fix: both endpoints now use `noServer: true` plus path-checked `upgrade`
listeners that ignore non-matching paths (`engine/src/ws/server.ts`,
`engine/src/routes/virtualcam.ts`). Verified live: both `/ws` and
`/ws/virtualcam` connect simultaneously.

### 2.5 Mock generation leaked into production (correctness bug)

`useMockGeneration` defaulted to true whenever **no API keys were configured** —
so in production, a user without a personal AI key silently received mock cards
labelled as if generated. The plan requires `no_provider` ("Add a key in
Settings") on that path.

Fix (`engine/src/config.ts`): mock generation is now explicit only —
`STASH_LOCAL=1` or `STASH_MOCK_GENERATION=1`. With no keys and not local,
`AiKeyResolver` returns null and `CardGenerator` fails with `no_provider`
(`engine/src/generation/card-generator.ts:98`). Key precedence is unchanged:
per-user encrypted key → env key → mock (explicit modes only) → error.

Tests updated to seed a per-user credential through the real encryption path
instead of depending on the implicit mock fallback
(`engine/src/test/card-generator.test.ts`, `virtualcam-engine.test.ts`).

### 2.6 Drive docs not visible to the local user

Seeded demo documents targeted `demo-user`/`dev-user`, but `STASH_LOCAL=1` auth
maps every request to `local-dev-user` — so Drive-grounded search returned zero
results locally. Fixed by seeding `local-dev-user` too
(`engine/src/drive/aggregator.ts`).

---

## 3. End-to-end verification (live engine, zero credentials)

`engine/scripts/e2e-local.mjs` boots against a running engine and exercises the
exact wire path the extension uses. Run:

```bash
cd engine && STASH_LOCAL=1 npm run dev    # terminal 1
cd engine && npm run test:e2e             # terminal 2
```

Checks (all passing):

| # | Check |
|---|---|
| 1 | `GET /health` reports ok/local mode |
| 2 | WS `hello` → `ready` (local auth maps to `local-dev-user`) |
| 3 | WS `config` carries `UserSettings` incl. `triggerMode` |
| 4 | Hold-to-talk `generate` frame → `generating` ack |
| 5 | …→ `show` with a valid multi-block `CardSpec` + `captureId` echo |
| 6 | Malformed frame → clean `error` frame (connection survives) |
| 7 | `POST /api/virtualcam/trigger` → card generated |
| 8 | `GET /api/virtualcam/status` → idle HUD state |
| 9 | `WS /ws/virtualcam` → immediate `state_sync` |
| 10 | `POST /api/drive/search` → grounded results |

---

## 4. Real-provider wiring (verified structurally, keys are operator-supplied)

- **Providers**: Gemini (`@google/genai`), OpenAI
  (`api.openai.com/v1/chat/completions`), Anthropic
  (`api.anthropic.com/v1/messages`) — all make real HTTP calls; all accept an
  injectable fetch client so tests never touch the network.
- **Key resolution order**: per-user AES-256-GCM-encrypted key (dashboard
  Settings, last-4 only ever surfaced) → server env key (`GEMINI_API_KEY` /
  `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`, provider chosen by `STASH_AI_PROVIDER`)
  → explicit mock → `no_provider` error.
- **Grounding**: Wikipedia REST grounding + Google Drive doc grounding composed
  via `CompositeGroundingProvider`; images proxied through the signed engine
  proxy (CORS header pinned by test).
- To run fully real: set one provider env key on the engine host (or add a
  per-user key in dashboard Settings) and do **not** set `STASH_LOCAL` or
  `STASH_MOCK_GENERATION`.

---

## 5. Extension Meet-path audit (no gaps remaining)

Verified against the v1 plan, all present and wired:

- getUserMedia interception → canvas compositing → `captureStream(30)` with audio
  passthrough; camera hot-swap rebuild; never-break-the-call fallbacks.
- Hold-to-talk state machine: chord capture-phase listeners, key-repeat ignored,
  blur/tab-hide ends hold, 30 s hard stop, nothing-heard submits nothing,
  re-hold cancels in-flight generation; `Alt+Shift+D/S` work in both modes.
- Trigger-mode switching fully tears down the active recognizer before starting
  the other; extension stands down on the product `/rehearse` origin.
- TTL countdown lives in the MAIN-world render loop; placeholders bounded by the
  12 s generation timeout; settings propagation to a live compositor works.
- Placement scoring with EMA/margin/consecutive-sample/cooldown brakes and fixed-
  right fallback; degradation ladder gates sampling.

---

## 6. Known limitations / operator steps (unchanged, documented in the v1 plan)

1. **Chrome Web Store publishing** — developer account, review period; store
   re-signs the extension, then swap the ID via `VITE_STASH_EXTENSION_ID` /
   constants. Load-unpacked works today.
2. **Engine hosting** — deploy `engine/` to an always-on host (Railway/Render/
   Fly), set env vars, run migrations, then point the extension at it via
   `stash.engineOriginOverride` (dev) or rebuild with the final
   `ENGINE_ORIGIN` (production).
3. **Rate limiter is in-process** — per-plan V1 limitation, not global across
   replicas.
4. **Meet self-view is mirrored** — verify card side against a second
   participant, never the preview.

---

## 7. Session changelog — every file touched

| File | Change |
|---|---|
| `packages/card-canvas/src/canvas-factory.ts` | Perf: bulk typed-array ops in mock 2D context; integer coercion in `drawImage` (§2.1) |
| `extension/src/background/index.ts` | Settings persistence + push-on-`hud:ready`; `engineOriginOverride` resolution (§2.2, §2.3) |
| `engine/src/ws/server.ts` | `noServer` + path-checked upgrade so `/ws` and `/ws/virtualcam` coexist (§2.4) |
| `engine/src/routes/virtualcam.ts` | Same path-checked upgrade pattern (§2.4) |
| `engine/src/config.ts` | `useMockGeneration` explicit-only via `STASH_MOCK_GENERATION` (§2.5) |
| `engine/src/drive/aggregator.ts` | Seed demo docs for `local-dev-user` (§2.6) |
| `engine/src/test/card-generator.test.ts` | Seed per-user encrypted credential; exercise real key-resolution path |
| `engine/src/test/virtualcam-engine.test.ts` | Same |
| `engine/scripts/e2e-local.mjs` | **New** — permanent 10-check end-to-end flow script |
| `engine/package.json` | **New** `test:e2e` npm script |
| `README.md` | Documented `STASH_MOCK_GENERATION` + e2e run instructions |
| `docs/engine-verification-report.md` | This report |

---

## 8. Runbook — running the stack locally

### 8.1 Engine

```powershell
cd engine
$env:STASH_LOCAL='1'; npm run dev     # or: npx tsx src/server.ts
```

Listens on **:5000**. A detached run (survives the launching terminal) via
`Start-Process cmd.exe '/c set STASH_LOCAL=1&& npx tsx src/server.ts > engine.log 2>&1' -WindowStyle Hidden`
was verified healthy and reachable.

> Gotcha encountered: a server started inside a PowerShell `Start-Job` dies when
> the parent shell exits — use `Start-Process` for a detached instance.

### 8.2 Endpoints & auth

| Route | Auth |
|---|---|
| `GET /health` | none |
| `ws://localhost:5000/ws` | token inside the `hello` frame (any ≥16-char string in local mode) |
| `ws://localhost:5000/ws/virtualcam` | none |
| `/api/virtualcam/*`, `/api/drive/*`, `/api/ai/*`, `/api/me/*`, `/api/cards/*` | `Authorization: Bearer local-dev-token` |

`local-dev-token` is valid only because `STASH_LOCAL=1` maps it to
`local-dev-user` (`engine/src/auth/supabase.ts`). In production this is a
Supabase JWT verified against the auth server.

Use `http://` (no TLS locally) and `ws://` for WebSocket — mixing the schemes
is the most common "can't access the server" cause.

### 8.3 Dashboard frontend

The frontend is the **root Vite app**, not `engine/`:

```powershell
npm run dev    # repo root → http://localhost:5173
```

- `src/app/` — pages (`/dashboard`, `/welcome`, `/setup/extension`,
  `/setup/data`, `/rehearse`, `/meet`)
- `src/lib/api.ts` — API client; mock by default (`VITE_STASH_MOCK=1`)
- To point it at the local engine, `.env.local`:
  ```ini
  VITE_STASH_MOCK=0
  VITE_STASH_API_URL=http://localhost:5000
  ```
- Third UI surface: the Chrome extension popup (`extension/src/popup/`),
  loaded via `chrome://extensions` → Load unpacked → `extension/dist`.

### 8.4 Full verification one-liner

```bash
npm run verify        # typecheck:all + all three test suites + dashboard build
cd engine && npm run test:e2e   # with the engine running per §8.1
```
