# Stash Live V1 — what we're building

## The short version

Today the project is a convincing demo. It can show four hand-written cards, it matches
them against whatever you happen to say, and the dashboard runs on fake data by default.

V1 makes it a real thing you can actually use:

- **You hold a key and talk, and a card about what you just said appears in your video.**
  Not one of four pre-written cards — a new one, written on the spot, about anything.
- **The card gets out of your way** instead of always sitting on the right.
- **Notion becomes optional.** Paste an AI key instead and everything works.
- **A guided setup** takes you from the website to a card appearing in a real Google Meet call.

Nothing that exists today is deleted. The four sample cards, the phrase matching, the Notion
sync, the docs pages, and the offline demo modes all keep working.

## What it feels like to use

You're in a Meet call. You hold `Alt+Shift+Space` and say *"I have been a big fan of
Ranbir Kapoor."* You let go. A small badge on your screen says "Generating…". About three
seconds later a glass card slides into your video next to you — his name, a short line about
who he is, two or three facts about his films, a photo, and a small line at the bottom that
says where the information came from. Twelve seconds later it fades out on its own.

Everyone else in the call sees the card burned into your video. They don't need anything
installed.

## The four things we're building

### 1. Cards written by AI, on the spot

When you release the key, the engine takes what you said, works out what the topic is, looks
it up, and writes a card from what it found.

**The honesty tradeoff.** We could let the AI write from memory — fast, works for any topic,
and confidently wrong sometimes with no way to tell. Instead we look the topic up first and
hand the AI the real article text to write from. It's about a second slower and only covers
topics that have an encyclopedia page, but every card says where its facts came from. When
nothing is found, the card still gets written but is visibly marked "Unverified · AI-generated".

To be clear about the promise: V1 guarantees a card is *attributed to a named source* or
*visibly marked unverified*. It does not guarantee the facts are right. Fact-checking is a
different product.

**Two deliberate limits.** Generated cards get no charts — a made-up bar chart is the worst
possible failure for something that looks like a data card. And generated cards don't get
saved into your library by default; they answer one sentence and go. You can save one if you
want it.

### 2. The card moves out of your way

Six times a second, the extension shrinks your camera frame down to a thumbnail and measures
which side of the picture is "busier". A person creates a lot of visual detail; a blank wall
doesn't. The card goes to the quiet side.

**Where this will be wrong, plainly.** It measures busyness — it has no idea what a person is.
A bookshelf or patterned curtain behind you will out-score you and the card will land on your
face. If you use Meet's background blur, the whole frame goes flat, the measurement gives up,
and the card just sits on the right like it does today. Same if you're wearing a plain shirt
against a plain wall.

We chose this over face detection because you asked for the cheap option, and it has one good
property: when it's unsure it falls back to exactly today's behaviour rather than to something
worse. There are also four separate brakes on it so the card can't twitch or flicker between
sides — the price is that it takes about a second to react when you actually move. And
`Position: Left/Right` in settings overrides it completely.

### 3. Hold-to-talk, with the old mode kept

Right now the extension listens to your microphone for the entire call. V1 changes the default
so nothing is listening until you hold the key.

The old always-on behaviour is **kept as a setting**, not deleted. `Ambient` mode is exactly
what happens today: continuous listening, matching against your saved cards. Only one mode runs
at a time. Flipping between them takes effect immediately, even mid-meeting.

### 4. A setup that actually ends in a working meeting

Sign in → install the extension → give it an AI key (or Notion, or neither if the server has a
key) → rehearse on your own camera → join a real call. Five steps, with a checklist that
measures what's genuinely done rather than what you clicked past.

The extension install gets its own screen because it's the step most likely to strand someone.

## Three decisions worth your attention

**We want to adjust three shared design tokens.** The design work found a real legibility
failure: when the card sits over a dark shoulder, muted text measures 2.06:1 contrast, which is
unreadable. Fixing it means changing the glass from 45% to 62% opacity and darkening the muted
text colour. We'd also add two accent colours (a violet and a teal) so a card about a person
doesn't look identical to a card about revenue — both are already in the codebase as avatar
tints, so no new colour enters the brand.

These live in a shared file, so **your four existing cards will look slightly different** —
more opaque glass, slightly darker secondary text. We think it's clearly the right call, but
it's a visible change to already-approved work, so it's yours to confirm.

**Publishing to the Chrome Web Store is something only you can do.** It needs your developer
account, a one-time fee, and a review period of days. The store also re-signs the extension,
which changes its ID and breaks the pairing config unless it's swapped afterwards. So we're
building the extension ID as configuration rather than a hardcoded value, and shipping the
"load unpacked" install path too — that way V1 works the day it's built, and going live later
is a settings change instead of a code change.

**The engine needs its own host.** Vercel can't run a permanently-open WebSocket server, and
that's what the engine is. The dashboard stays on Vercel; the engine moves to Railway/Render/Fly.
Deploying it is a manual step we'll document, not something we can do for you.

## Also fixed along the way

- A real bug in the existing Revenue card: `$240,000` doesn't fit its cell and renders as
  `$240,…`.
- A real bug in the extension: changing your settings mid-call didn't actually reach the
  running compositor, so reduced-motion and position changes were silently ignored.
- Cards have always carried an expiry field that nothing ever read. Now they expire.

## Not in V1

Billing, teams, SSO, non-Chrome browsers, Zoom/Teams, editing a card after it appears,
fact-checking, and persisting generated cards by default.

## How you'll know it works

The real test is one you run yourself: join a Meet call with a second participant, hold the
key, say the Ranbir Kapoor line, and confirm they see a readable card that isn't covering your
face and that disappears on its own. The detailed plan lists the full acceptance walkthrough,
including the things that are easy to get fooled by — Meet's self-view is mirrored, so "on my
left" in your preview means "on the right" for everyone else.
