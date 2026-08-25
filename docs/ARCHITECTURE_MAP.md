# Stash Live — Complete Architecture & Connection Blueprint

This document maps out how the **Standalone Desktop App (`StashLive.exe`)**, **Backend AI Engine (Render)**, and **Frontend Web Dashboard (Vercel)** connect and communicate in real time.

---

## 🗺️ System Connection Map

```
                                  ┌────────────────────────────────────────┐
                                  │      Frontend Web Dashboard            │
                                  │      (https://stash-live.vercel.app)   │
                                  │      - Control room & topic generator  │
                                  │      - Document & Google Drive sync    │
                                  │      - Live card preview & settings    │
                                  └───────────────────┬────────────────────┘
                                                      │
                                                      │ HTTPS / WSS
                                                      │ REST & WebSockets
                                                      ▼
                                  ┌────────────────────────────────────────┐
                                  │      Backend AI Engine                 │
                                  │      (Render / Cloud Service)          │
                                  │      - Express + WebSocket server      │
                                  │      - AWS Bedrock / Gemini synthesis  │
                                  │      - Wikipedia & Drive grounding     │
                                  │      - Card state broadcast            │
                                  └───────────────────▲────────────────────┘
                                                      │
                                                      │ 1. Voice Utterance (Microphone)
                                                      │ 2. Polling / WS State Sync
                                                      │ 3. CardSpec JSON Response
                                                      │
                                  ┌───────────────────┴────────────────────┐
                                  │      StashLive.exe (User PC)           │
                                  │      - Captures physical webcam 720p   │
                                  │      - Decoupled 30/60 FPS compositor  │
                                  │      - Frosted acrylic GlassCard blur  │
                                  │      - Real-time speech listener       │
                                  └───────────────────┬────────────────────┘
                                                      │
                                                      │ DirectShow Stream (RGB/BGR)
                                                      ▼
                                  ┌────────────────────────────────────────┐
                                  │      OBS Virtual Camera                │
                                  │      (Standard DirectShow Driver)      │
                                  └───────────────────┬────────────────────┘
                                                      │
                                                      │ Camera Feed Input
                                                      ▼
                                  ┌────────────────────────────────────────┐
                                  │      Google Meet / Zoom / Teams        │
                                  │      (Other attendees see live cards   │
                                  │       over your shoulder)              │
                                  └────────────────────────────────────────┘
```

---

## 🔄 End-to-End Data Flow

### Scenario 1: Hands-Free Voice Trigger in Google Meet
1. **User Speaks:** Presenter says: *"Let's review our Q2 revenue traction"*.
2. **Local Capture:** `StashLive.exe`'s background voice listener recognizes the speech.
3. **AI Grounding Request:** `StashLive.exe` sends `POST /api/virtualcam/trigger` with `{ "utterance": "Q2 revenue traction" }` to the Backend Engine.
4. **Card Synthesis:** Backend Engine queries Bedrock AI / Knowledge base and generates a structured `CardSpec` JSON with stats, bullets, and thumbnail.
5. **Real-time Overlay:** `StashLive.exe` receives the `CardSpec` and smoothly composites the glassmorphism card over the presenter's shoulder at 30 FPS.
6. **Broadcast:** Google Meet outputs the combined webcam + card feed to all call participants.

### Scenario 2: Remote / Mobile Control from Web Dashboard
1. **User Action:** Presenter opens `https://stash-live.vercel.app` on their phone or second monitor.
2. **Click Topic:** Presenter taps a card topic (e.g. *"Ranbir Kapoor"*, *"YC Pitch Deck"*).
3. **Backend Sync:** Frontend dispatches the trigger to the Backend Engine.
4. **Instant Update:** `StashLive.exe` receives the update and renders the card live in the meeting.

---

## 📦 Deployment & Setup Blueprint

| Component | Technology | Hosting | Cost |
| :--- | :--- | :--- | :--- |
| **Backend Engine** | Node.js + Express + Bedrock/Gemini | **Render** (via `render.yaml`) | **$0.00 (Free Tier)** |
| **Frontend Web** | Vite + React + Tailwind + Framer | **Vercel** (`stash-live.vercel.app`) | **$0.00 (Free Tier)** |
| **Client App** | Standalone Executable (`StashLive.exe`) | **Direct Download** (`dist/StashLive/`) | **$0.00 (Local PC)** |
| **Virtual Camera** | DirectShow OBS Virtual Cam | **OBS Studio** | **$0.00 (Open Source)** |
