# Stash Live V1 — Implementation Plan

## 1. Goal and scope

Turn the current demo into something that works end to end for a first-time user: land on the
site, follow a guided setup, join a Google Meet call, hold a key, speak, and have an
AI-generated card composite into the outbound video.

**Preservation is a hard requirement.** Everything already built stays working: the four
fixture cards, the Tier 1/2/3 phrase matcher, the Notion sync path, `/docs` and `/help`,
`STASH_LOCAL=1` engine mode, `VITE_STASH_MOCK=1` dashboard mode, and every existing test.
Changes are additive wherever possible.

**This is a working V1, not a production launch.** No billing, teams, SSO, quotas, provider
fallback chains, multi-region, or non-Chromium support.

### Current state (verified in the repo)

| Area | Today | V1 |
|---|---|---|
| Card content | 4 hand-authored fixtures + Notion-derived | Plus AI-generated from arbitrary speech |
| Trigger | Continuous mic, phrase matching | Hold-to-talk default; ambient kept as a setting |
| Placement | Fixed right third; face detection explicitly rejected | Brightness/busyness heuristic, falls back to fixed right |
| Notion | Required step in onboarding | Optional branch; AI key is the alternative |
| AI keys | None; all mocked | Per-user encrypted key, server env key fallback |
| Dashboard data | Mock by default | Real path, mock preserved |
| Engine hosting | Points at Vercel (can't host a long-lived WS server) | Separate always-on host |
| Extension identity | Hardcoded dev ID | Configuration, Web Store ready |
| `CardSpec.ttlMs` | Read by nothing | Drives auto-expiry |

### Settled decisions

Confirmed by the user during planning:

1. **Hold-to-talk** on `Alt+Shift+Space` — capture on keydown, generate on keyup.
2. **Both key sources** — per-user key in dashboard Settings takes precedence, server env key
   as fallback. Gemini, OpenAI, Anthropic.
3. **Images proxied through the engine** — mandatory, see §4.3.
4. **Brightness/busyness placement heuristic** — explicitly not face detection, not ML.
5. **Engine on a separate always-on host**; dashboard stays on Vercel.
6. **Chrome Web Store distribution**, with load-unpacked as the interim path.

---

## 2. Architecture

Three slices, built largely in parallel:

- **A — Engine / AI generation.** New `engine/src/generation/` and `engine/src/images/`.
  Solely owns `packages/card-spec/` for V1.
- **B — Extension / placement + capture.** Placement scoring, hold-to-talk, HUD, TTL.
  Imports the card-spec contract; never edits it.
- **C — Dashboard / setup flow.** Routes, setup screens, AI-key UX, trigger-mode toggle.

### Ownership (prevents the two collisions found during planning)

| Artifact | Owner | Everyone else |
|---|---|---|
| `packages/card-spec/src/types.ts`, `validate.ts` | A | imports only |
| `packages/card-core/src/recipes.ts` shape | A | design supplies values |
| `packages/card-core/src/placement.ts`, `card-canvas/` | B | — |
| `extension/src/` | B | C owns the `/rehearse` hook only |
| `src/app/**`, `src/lib/**` | C | — |
| Design tokens (`card-core/src/tokens.ts`) | A lands, design specifies | see §6.1 |

### Wire contract (settled — build to exactly this)

Added to `packages/card-spec/src/types.ts` by slice A:

```
// client -> engine
{ t: 'generate';        captureId: string; text: string; ts: number }
// engine -> client
{ t: 'generating';      captureId: string }
{ t: 'generate_failed'; captureId: string; code: string; message: string }
```

**The failure classifier field is `code`, not `reason`.** Slice A's draft used `reason`; this
is the reconciliation. Slice B renders `message` only and treats the classifier as opaque.

`UserSettings` gains `triggerMode: 'hold-to-talk' | 'ambient'`, default `'hold-to-talk'`, with
`.default('hold-to-talk')` in the Zod schema so rows written before this field parse correctly —
no backfill migration.

**`generate` is deliberately a separate frame from `transcript`.** That disjointness is what
stops one spoken sentence from firing both an AI generation and a fixture match at once.

---

## 3. Slice A — AI card generation

### 3.1 Generation pipeline

New `engine/src/generation/`. On a `generate` frame:

1. **Extract the topic** from the utterance.
2. **Ground it** — search Wikipedia REST for the topic, fetch the summary.
3. **Generate** — hand the model the real article text and a restricted output schema.
4. **Illustrate** — resolve an image through the proxy (§4.3), only if bytes are in hand.
5. **Assemble and validate** — build the `CardSpec` engine-side, run it through the real
   `parseCardSpec`, then send `show`.

**The model emits a restricted draft, not a `CardSpec`.** It returns four block kinds, no
colours, no URLs, no ids, no chart series. The engine assembles the real spec. A malformed
model response is therefore structurally incapable of reaching the render loop.

**Grounding tradeoff (accepted).** Retrieval-first costs ~1s and only covers topics with an
encyclopedia page, but every card carries attribution. Ungrounded cards render with an
`Unverified · AI-generated` footer. V1 guarantees attribution or a visible unverified mark —
not factual correctness.

**No charts or avatar grids on generated cards.** Fabricated series is the worst failure mode
for something that reads as a data card. One constant to re-enable later.

**Not persisted to the `Card` table.** Persisting would put them into the phrase index and
embedding search and change fixture behaviour. They live for the session; §5.4 covers opt-in
saving.

### 3.2 Providers and keys

One `LlmProvider` interface, three implementations, plus the existing mock — matching the
pattern of `matching/embedding-provider.ts` so tests never touch the network.

Key resolution: **per-user key → server env key → clear "add a key in Settings" error.**
Per-user keys encrypted with the existing AES-256-GCM helper (`engine/src/util/encryption.ts`),
same as Notion tokens. Never returned to the client; surfaced as last-4 only.

New: `PATCH /api/me/ai-key`, `DELETE /api/me/ai-key`, and a validation endpoint that makes a
real cheap call before the dashboard lets the user depend on the key.

### 3.3 Image proxy — the highest-stakes piece

The card canvas *becomes the user's webcam*. Drawing a CORS-tainted image onto it permanently
breaks the camera for the rest of the call. `imageBlock.ts` already defends by silently
skipping such images, which leaves a hole where the picture should be.

So: the engine fetches image bytes itself, validates content-type and size, caches them, and
serves from its own origin with correct CORS headers. Host allow-list limited to Wikimedia;
URLs signed by the engine to prevent SSRF. **The image block is only added to the spec once
the engine holds the bytes** — so a card never renders with a hole.

A test pins the exact CORS header string. If it is ever removed, cameras break.

### 3.4 Budgets and limits

8s total generation budget then clean failure; 6 generations/minute and 40/hour per user;
24h cache on identical utterances (exact match only).

**V1 limitation — not global.** The rate limiter is in-process inside `CardGenerator` and does
not span replicas. If the engine runs on multiple nodes, a user can make 6×N generations per
minute. Acceptable for V1 (no billing); a future version should add a Redis-backed counter.

### 3.5 Live settings push

`Session` currently reads settings once at `hello`; there is no path to push a change to a
live client. Tolerable for `autoDismissMs`, not for `triggerMode`, which must switch the
capture path mid-meeting. Adds a settings pub/sub channel mirroring the existing invalidation
one, published by `PATCH /api/me/settings`, re-sending `{t:'config'}` **without** a token so a
settings push can't disturb the device token.

Fix required: the inline settings fallback in `session.ts` must use `DEFAULT_USER_SETTINGS` or
it will silently drift.

### 3.6 Coexistence with the existing matcher

`handleTranscript`, `TranscriptWindow`, `MatchPipeline`, `CooldownManager`, prewarm and
near-miss activity are **unchanged and still wired** — only unexercised in hold-to-talk mode.
One addition: `MatchPipeline.noteExternalCardShown()` reuses the existing `CooldownManager` so
a fixture can't overwrite a just-summoned generated card.

The engine does not reject off-mode frames; gating is client-side. Both paths are already
authenticated and rate-limited, so a server-side reject would add a failure mode with no
security benefit.

---

## 4. Slice B — Placement and capture

### 4.1 Placement scoring

Every 160ms (~6×/second, **not** per frame), downscale the frame to 64×36 into a canvas
allocated once and reused (the pattern `GlassBackdropRenderer` already uses), read pixels, and
score both candidate rectangles as `stdDev(luma) + 2 × edgeEnergy`. Quieter side wins.

Four brakes so it can't twitch:

| Brake | Value |
|---|---|
| Exponential moving average | alpha 0.30 |
| Switch margin | 0.06 |
| Consecutive confirming samples | 3 (~480ms) |
| Post-switch cooldown | 4s |

Below a 0.02 signal floor on both sides — flat backdrop, virtual background, dark room — the
result is **inconclusive** and the card stays exactly where today's code puts it: right side.
Side changes spring across using the existing spring (stiffness 120, damping 20); reduced
motion snaps. Explicit `Left`/`Right` in settings bypasses scoring entirely.

`computePlacement`'s existing signature and numbers are unchanged; it delegates to a new
`computePlacementForSide`.

### 4.2 Frame budget

~0.8ms on sampling frames, ~0.13ms amortised against a 33ms budget. Sampling happens **inside**
`composite()`, so its cost is measured by the existing degradation ladder rather than hiding
from it. The ladder throttles it: full rate at `full`, half at `fps24`, off at `quarterBlur`
and `flatFill` with the side frozen. A struggling machine does not also start moving the card.

Any readback failure (including a tainted canvas) disables the sampler permanently and falls
back to fixed placement — never retried inside the frame loop, because a `SecurityError`
escaping there costs the user their camera.

### 4.3 Hold-to-talk

Capture on keydown of `Alt+Shift+Space`, generate on keyup. On release the client mints a
`captureId` and sends exactly one `generate` frame.

Defined answers for every edge case: key repeat ignored; releasing Alt before Space still ends
the hold; window blur and tab-hide end it; 30s hard stop catches a lost keyup; releasing
without speaking submits nothing at all; holding again mid-generation cancels the old one.
Listeners run at capture phase with `preventDefault` so Meet can't swallow the chord.
`Alt+Shift+D` and `Alt+Shift+S` keep working in both modes; D also cancels an in-flight capture.

Existing `WebSpeechProvider` and `RestartMachine` are kept; the only change is letting `stop()`
flush a trailing final result instead of discarding it.

### 4.4 Trigger modes

`setTriggerMode(mode)` is a single entry point that fully tears down the active path before
starting the other — never two recognizers, never two emitters for one sentence. `startSpeech()`
is **re-gated, not rewritten**: its body and its `transcript` send are kept byte-for-byte, only
the call site becomes conditional.

### 4.5 Card expiry

`ttlMs` has been in the contract since the start and read by nothing. The countdown lives in
the MAIN-world compositor next to the animator — **not** the service worker, which Chrome can
evict mid-countdown — and is driven off the render loop, so a backgrounded tab pauses rather
than expiring a card the presenter can't see.

Precedence: **`spec.ttlMs` → `UserSettings.autoDismissMs` → 12000ms.** Clock starts when the
card is actually visible, not on frame receipt. A new card replaces rather than stacks. Cleared
on manual dismiss, `hide`, and matching `invalidate`, so dismissing early can't fire a phantom
second dismiss later. A live countdown is not retargeted if settings change mid-flight —
retiming a card someone is reading is worse than honouring the value in effect when it appeared.
Placeholders never get a TTL; they're bounded by the generation timeout.

### 4.6 Bug fix included

`extension/src/inject/compositor.ts` stores `settings:update` into `currentSettings` but never
propagates it to an already-built `CardCompositor` — so `reducedMotion` and `position` changes
are currently ignored mid-call.

---

## 5. Slice C — Setup flow and dashboard

### 5.1 The funnel

`/signup` → `/welcome` (1/5) → `/setup/extension` (2/5) → `/setup/data` (3/5) → `/rehearse`
(4/5) → `/meet` (5/5).

Setup status is **measured, not remembered** — is a device paired, is a key valid — so pairing
from Settings or deleting a key updates the checklist truthfully. The persisted step is only a
resume hint. `src/lib/onboarding.ts` and its test are left untouched; the V1 funnel is a new
module with a one-way migration of the stored value.

### 5.2 Extension install — treated as the hard part

Its own screen, with both install paths present: **Add to Chrome** once the listing is live,
and numbered load-unpacked steps as the documented interim. Live polling instead of a page
reload. A skip that keeps the funnel moving.

Two diagnostics that distinguish the common silent failures: **wrong origin** (names the origin
and the fix) and **engine unreachable** (disables pairing, since the nonce request can't
succeed).

**Extension ID becomes configuration**: `localStorage` override → `VITE_STASH_EXTENSION_ID` →
`DEV_EXTENSION_ID`. The Web Store re-signs with its own key, so the published ID is unknowable
until review clears; going live is an env change plus redeploy, not a code change.

### 5.3 Data step — Notion optional

One step satisfied by **either** an AI key **or** Notion **or** neither (if the server has a
key). The old `/notion-connect` page and every Notion feature stay exactly where they are,
reached from an optional card. Skipping must not read as failure.

Key panel states: empty, validating, success, failure with an actionable message, and
already-configured (last-4 only, with replace/remove).

### 5.4 Rehearse, Meet, and settings

`/rehearse` runs the real pipeline on the user's own camera — hold the chord, speak, see a
generated card composited on their own face before risking it in front of anyone. Fixture
preview remains as the no-extension fallback.

**Correction to the design mockups: there is no "Stash Live Camera" device.** Verified in
`extension/src/inject/compositor.ts` — the extension intercepts `getUserMedia` and returns
`canvas.captureStream(30)` on the *existing* device. No new entry appears in Meet's camera
picker. The `/meet` instructions must therefore say **"keep your normal webcam selected"** —
never "select Stash Live Camera", which would be a dead end at the most important step. A
critical clarification: the extension patches `getUserMedia` at document start, so any camera
that was already granted *before* the extension loaded is not intercepted. The `/meet` page
should include this fallback copy: *"If you installed Stash Live while a Meet tab was already
open, that tab still sees your raw camera. Refresh the Meet tab, or open Settings → Video and
re-select your camera to force Meet to re-negotiate the stream."* The mockup copy is wrong and
must not be implemented verbatim.

**Rehearsal card push path:** `/rehearse` sends the utterance via `POST /api/ai/generate-card`
(Task 4b). The engine generates the card and pushes it as a `show` frame over the user's
existing WebSocket session, which the extension's compositor renders into the outbound video.
This choice (WS push rather than bridge-inject from the dashboard page) avoids needing the
extension bridge API from the product origin and keeps the push path consistent with real
Meet sessions.

Settings gains the AI-key panel and a trigger-mode **radio group** (not a switch, so
single-active is visually obvious), and states plainly that changes reach a meeting already in
progress without rejoining.

Generated cards appear under "Recent AI cards" for the session and only enter the library — as
a disabled draft through the existing Review Drafts flow — if explicitly saved. Keeps the
library meaningful and keeps transcript-derived text out of storage by default, matching the
existing snippets-off default.

### 5.5 Hold-to-talk ownership split

The dashboard owns the chord on `/rehearse`; the extension owns it in Meet. This ships
rehearsal without waiting on slice B, with divergence confined to one hook.

**Documented hazard:** the extension's content script already runs on the product origin and
starts speech recognition unconditionally, so once it binds the same chord there will be two
recognizers on one page. The fix, when someone unifies them, is for the extension to stand down
when `location.origin === PRODUCT_ORIGIN`.

---

## 6. Design

43 mockups across 13 sections are attached. They define the visual contract: card archetypes
(person with and without image, business metrics, comparison, timeline, team), in-video context
at true 720p scale, the four HUD states, the pending/error placeholders, and every setup screen
state.

### 6.1 Token changes — needs explicit sign-off

The design work found a genuine legibility failure and proposes three changes to
`packages/card-core/src/tokens.ts`, which is **shared by both renderers and the four existing
fixtures**:

| Change | From | To | Why |
|---|---|---|---|
| Glass alpha | 0.45 | 0.62 | Muted text over a dark shoulder measures **2.06:1** — a fail. At 0.62 it is 3.26:1 and primary text 8.01:1. |
| `textMuted` | `#5A5550` | `#4A4540` | 4.19:1 on dark glass, 8.24:1 on bright; no visible change over bright backdrops. |
| Topic accents | orange only | plus violet `#6D28D9`, teal `#0F766E` | So a person card doesn't look identical to a revenue card. Both already exist as `AVATAR_TINTS` values in `format.ts`, so no new hue enters the brand, and both are darker than `#fb8500` so they carry more contrast. |

**Consequence: the four existing approved cards will look slightly different** — more opaque
glass, slightly darker secondary text. Orange remains the default for business and system data.
This is a visible change to already-approved work and is called out here rather than landing
silently inside a build task.

### 6.2 Unresolved design choices

Two mockup pairs need a pick during build; either is workable and neither blocks: the setup
checklist shape (sticky rail vs top stepper — rail recommended, since the install page scrolls)
and the cards library layout (two zones vs one filtered grid).

### 6.3 Bug found by design

`REVENUE_CARD`'s `$240,000` at metricValue 26/700 overflows its cell in a 3-up `metric_row` and
ellipsises to `$240,…`. Fix by compacting to `$240K` and codifying a six-glyph limit on
emphasised values.

---

## 7. Build order

Slices A, B and C start in parallel. The only hard cross-slice gate is that **A must land the
card-spec additions before B's capture task can typecheck** — B is specified to hard-stop rather
than redeclare the types locally, since a local redeclaration would compile and then silently
diverge.

| # | Task | Slice | Depends on |
|---|---|---|---|
| 1 | Card-spec frames, `triggerMode`, `recipes.ts` shape, token changes; **audit and update existing test assertions** that reference old token values (pixel-comparison golden files, color/contrast assertions) | A | — |
| 2 | Provider abstraction, encrypted per-user keys, key endpoints | A | 1 |
| 3 | Image proxy | A | 1 |
| 4 | Grounding, prompt, assembly, orchestrator | A | 2, 3 |
| 4b | **POST /api/ai/generate-card** — HTTP endpoint wrapping `CardGenerator.generate()`, pushes the card as a `show` frame over the user's existing WS session. Required by Slice C's rehearsal flow. | A | 4 |
| 5 | WS wiring, live settings push, coexistence | A | 4 |
| 6 | Placement scoring + side selector | B | — |
| 7 | Hold-to-talk, trigger modes, HUD | B | 1 |
| 8 | Compositor wiring, TTL, placeholders, settings-propagation fix | B | 6, 7 |
| 9 | Setup state machine, routes, checklist | C | — |
| 10 | AI-key UX, Notion-optional data step | C | 9 |
| 11 | Install/pairing screens, origin diagnostics, ID config | C | 9 |
| 12 | Rehearse pipeline, Meet step, AI card surfacing, docs | C | 4b, 10, 11 |

Review passes after tasks 5, 8 and 12.

### Manual operator steps (documented, not code)

1. **Publish the extension** — developer account, one-time fee, listing assets including the
   permission justification and data-usage disclosure the mic/camera access will trigger,
   review period, then swap the store-assigned ID via env var.
2. **Deploy the engine** — service setup on an always-on host, env vars, migrations, then
   repoint the dashboard and rebuild the extension. Ordering matters: the extension must be
   rebuilt *after* the engine origin is final.

---

## 8. Testing

Tests must pass with **no network access** — every external call sits behind an injectable
interface, matching the existing convention.

- **Unit.** Placement scoring against synthetic frames (bright-left, bright-right, uniform,
  noisy, moving subject); hysteresis and cooldown; trigger-mode teardown with a call-ledger
  assertion that live recognizer count never exceeds 1; TTL precedence and replace-not-stack;
  model-output validation and repair-or-reject; key resolution order; image-proxy allow-list
  and the pinned CORS header. **Every declared error code** (`empty`, `no_provider`, `timeout`,
  `invalid_output`, `rate_limited`, `internal`) has a mapped user-facing string — cover with a
  table-driven test that iterates all codes.
- **Integration.** Generation end to end against a mock provider; settings push to a live
  session; cross-tenant isolation.
- **Playwright.** Extends `hud-not-in-stream.spec.ts` — the card avoids the busy region, and
  the HUD never appears in the outbound stream. HUD tests assert on a `data-phase` attribute
  rather than mockup-owned colours, so design iteration can't break them.
- **Regression.** `npm run verify` (typecheck + all three suites + build). `STASH_LOCAL=1` with
  zero credentials must still run — losing it is treated as a regression.

## 9. Acceptance walkthrough

Verified by a human, in this order:

1. Visit the dashboard signed out → one sign-in screen; signed in → resume where you left off.
2. Welcome shows the three seeded sample cards.
3. Install screen detects the extension and pairs silently. Wrong origin and unreachable engine
   each produce a named, actionable diagnostic.
4. Configure an AI key **without touching Notion**; an invalid key fails with a message telling
   you what to do; the key is never shown back.
5. On `/rehearse`, hold `Alt+Shift+Space`, say *"I have been a big fan of Ranbir Kapoor"*,
   release. Badge shows "Generating…" within ~400ms; a card with a photo, 2-3 lines, and a
   source footer appears within ~8s.
6. Join a real Meet call with a **second participant**. Repeat the gesture. The second
   participant sees a readable card burned into the video.
7. Sit left of frame → card goes right. Sit right → card goes left. Sit centred with a
   symmetric background → card goes right and never moves. Rock side to side → it moves at most
   once every 4s.
8. Set `Position: Left` → always left regardless of framing.
9. A card with an 8s TTL disappears on its own; dismissing it early does not fire a second
   dismiss later.
10. Switch to `ambient` mid-call → today's behaviour returns exactly: continuous listening,
    fixture phrases raise fixture cards, the chord is inert. Switch back → the reverse. Neither
    requires rejoining.
11. Throughout: the second participant never sees the HUD.

**Testing gotcha:** Meet's self-view is mirrored and the outbound stream is not. "Card on my
left in self-view" means it's on the right for everyone else — always verify against the second
participant, not the preview.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Busyness heuristic puts the card on your face (bookshelf, patterned curtain) | Degrades to today's fixed placement when unsure; `Position` override is one click. Main known failure mode, accepted. |
| Background blur flattens the frame → feature silently does nothing | Falls back to today's behaviour; documented so it isn't read as a bug. |
| Generation latency feels long on slow networks | 8s cap then clean failure, never a hang; placeholder within 400ms. |
| Wrong Wikipedia article for a misheard phrase | Card names its source, so the error is obvious rather than sneaky. |
| Image proxy CORS header removed → cameras break | Pinned by a test asserting the exact header string. |
| Web Store review delays launch | Load-unpacked path ships too; ID is configuration. |
| Two recognizers on the dashboard origin | Hazard documented with the origin-based fix. |
| Ambient mode is no longer default, so the demo appears to have stopped | Preserved behind a setting; discoverability cost accepted deliberately. |
| Token changes alter the four approved cards | Called out in §6.1 for explicit sign-off. |

---

## Appendix — source plans

Full detail per slice: `/code/.plans/parts/ai-generation-detail.md`,
`/code/.plans/parts/placement-capture-detail.md`, `/code/.plans/parts/onboarding-flow-detail.md`.
