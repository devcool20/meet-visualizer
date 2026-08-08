## Summary

V1 of Stash Live: AI-powered card generation, adaptive placement that avoids the presenter, hold-to-talk capture (Alt+Shift+Space), and a 5-step onboarding funnel. Adds generation engine, image proxy, Wikipedia grounding, provider abstraction (Gemini/OpenAI/Anthropic), brightness-based busyness scoring for side selection, four HUD states, card TTL auto-dismiss, and a guided setup from signup to first live card.

## Changes

- **AI card generation** — new `engine/src/generation/` (11 files): `CardGenerator` orchestrator, `GenerationProvider` interface with Gemini/OpenAI/Anthropic/Mock implementations, Wikipedia REST API grounding, structured-draft schema, prompt builder, card spec assembler. Rate-limited (6/min, 40/hour per user), cached (24h exact-match), 8s total budget.
- **Image proxy** — `engine/src/images/` (2 files): HMAC-signed URLs, strict Wikimedia host allow-list, 5MB size cap, manual redirect handling. Serves `Access-Control-Allow-Origin: *` so the compositor can load images from the extension's origin.
- **Encrypted per-user AI keys** — `AiCredential` Prisma model + migration, key resolver (user → env → mock), GET/PUT/DELETE `/api/me/ai-key` that never returns the key value.
- **HTTP card generation endpoint** — `POST /api/ai/generate-card` wraps the orchestrator and pushes the result as a WS `show` frame to the user's connected session.
- **Wire protocol additions** — `generate`/`generating`/`generate_failed` WS frames; `UserSettings.triggerMode` (`hold-to-talk` default, `ambient` preserved); `origin` and `captureId` on `show` frames. Settings changes mid-meeting pushed live via new pub/sub channel.
- **Design token updates** — glass alpha `0.45→0.62` for legibility, `textMuted` `#5A5550→#4A4540` for contrast. New `recipes.ts` with 6 accent keys (amber default) and 4 layout recipes.
- **Adaptive placement** — brightness-based side selector: 64px downscaled frame sampled at ~6fps, luma std-dev + edge energy scoring, hysteresis (EMA α=0.30, 3-sample dwell, 4s cooldown), falls back to right when inconclusive. Side freezes during card enter/leave animation.
- **Hold-to-talk capture** — Alt+Shift+Space chord: keydown starts provider, keyup sends `generate` frame. Mutual exclusion via `setTriggerMode()` — exactly one capture path live at a time. Existing ambient mode preserved verbatim behind the setting.
- **HUD states and placeholders** — 4 HUD phases (idle/listening/generating/error) driven by WS frames. Generating shimmer and error pill rendered as separate non-CardSpec draw paths in the composited video.
- **Card TTL auto-dismiss** — compositor-side timer (MAIN-world, paused when tab backgrounded) + engine-side `hide` backstop (+750ms grace). Default 12s from `UserSettings.autoDismissMs`.
- **Settings-propagation bug fix** — `settings:update` now propagates `reducedMotion`, `position`, and `triggerMode` to the live compositor mid-call.
- **5-step onboarding funnel** — `/welcome` → `/setup/extension` (install + pair) → `/setup/data` (AI key or Notion) → `/rehearse` (first generated card) → `/meet` (pre-join checklist). Steps measured from live signals, not remembered state.
- **Extension ID configuration** — three-tier resolution: localStorage override → `VITE_STASH_EXTENSION_ID` env var → built-in `DEV_EXTENSION_ID`. Origin mismatch diagnostics with named fix.
- **Mock mode preserved** — `VITE_STASH_MOCK=1` walks the full funnel with zero backend credentials.
- **Docs** — `ATTRIBUTIONS.md` updated, README with new env vars, DocsPage with deploy/publish guides.

## Testing

- `npm run verify` — all 429 tests pass (26 test files in dashboard/workspace, 17 in engine, 5 in extension), typecheck clean, production build succeeds.
- Engine tests cover: CardGenerator orchestrator, all 4 providers, key resolver, image proxy (CORS header pinned), draft schema, grounder, assembly, WS session (generate handler, ttlMs backstop, settings push).
- Extension tests cover: placeholder rendering, TTL timer, busyness scoring (synthetic frames), side-selector hysteresis, hold-to-talk controller, trigger mode teardown (call-ledger assertion), message bridge for new frames.
- Dashboard tests cover: setup state machine (22 tests, all step combos, legacy migration, localStorage failure), AI provider panel error-code copy coverage (every code has a mapped string), extension ID resolver precedence, API client mock methods.
