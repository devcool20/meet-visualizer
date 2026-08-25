# Stash Live — Unified Desktop Studio Proposal & Specification

---

## 📌 Executive Summary

**Stash Live Studio** is an all-in-one desktop application designed to bridge the gap between AI-driven meeting intelligence, local video stream composition, and user document grounding. 

Currently, users must manage three disparate systems:
1. Running a background virtual camera streamer.
2. Navigating to the web dashboard (`stash-live.vercel.app`) on a separate tab or phone.
3. Managing permissions in video conferencing clients (Google Meet, Zoom, Microsoft Teams).

By unifying these components into a single native desktop application (built with **Tauri v2** or **Electron + React**), Stash Live transforms into an intuitive, Apple-grade productivity tool that delivers zero-friction onboarding, instant hardware access, and seamless live meeting presentations.

---

## 🎯 Target User Persona & Pain Points

| Persona | Core Pain Point Today | How Stash Live Studio Solves It |
| :--- | :--- | :--- |
| **Founders & Sales Reps** | Struggling to switch between pitch slides, meeting screens, and notes while speaking. | Floating HUD & voice-triggered cards glide in over their shoulder without touching a window. |
| **Educators & Presenters** | Clunky screen-sharing that blocks their video feed and attendee engagement. | Presenter stays front-and-center while metrics, citations, and visuals float beside them. |
| **Remote Executives** | Managing complex OBS setups, audio routing, and multi-monitor layouts. | 1-Click Launch: Auto-selects webcam, starts virtual camera, and connects cloud AI automatically. |

---

## 🖥️ User Interface & Experience Design

### 1. Dual-Pane Studio Layout (Main Window)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 🎙️ STASH LIVE STUDIO                                                  [—] [口] [✕]     │
├────────────────────────────────────────────────────────┬───────────────────────────────┤
│  LIVE STAGE & CAMERA VIEW (60%)                        │  CONTROL DECK & SOURCES (40%) │
│                                                        │                               │
│  ┌──────────────────────────────────────────────────┐  │  🔍 [Search topic or speak...] │
│  │                                                  │  │                               │
│  │                 [Webcam Feed]                    │  │  ⚡ QUICK PREPARED CARDS     │
│  │                                                  │  │  ┌──────────────────────────┐ │
│  │                   👤                             │  │  │ 📈 Q2 Revenue ($148K)    │ │
│  │            ┌───────────────────┐                 │  │  │ 🚀 YC Pitch Traction     │ │
│  │            │ 📈 Q2 Revenue     │                 │  │  │ 👤 Ranbir Kapoor Bio     │ │
│  │            │ • ARR: $148K      │                 │  │  └──────────────────────────┘ │
│  │            │ • MoM: +28%       │                 │  │                               │
│  │            └───────────────────┘                 │  │  📁 KNOWLEDGE CONNECTIONS     │
│  │                                                  │  │  • Google Drive (4 docs synced│
│  │                                                  │  │  • Notion Workspace (Active)  │
│  │  [● 720p HD @ 30 FPS]  [🪞 Mirror Mode: OFF]      │  │                               │
│  └──────────────────────────────────────────────────┘  │  ⚙️ PREFERENCES & SETTINGS    │
├────────────────────────────────────────────────────────┴───────────────────────────────┤
│ 🔴 LIVE: Broadcasting to 'OBS Virtual Camera'  |  🎙️ Speech Recognition: Active        │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2. Mini / Floating Teleprompter Mode
When minimized or placed in "Meeting Companion Mode", the app collapses into an ultra-compact floating widget (similar to Loom / Rewind) that docks to the side of the Google Meet window, allowing the user to click topic pills or monitor live transcription without obscuring the call.

---

## 🏗️ System Architecture

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                STASH LIVE STUDIO (Client)                              │
│                                                                                        │
│   ┌────────────────────────┐  IPC / Rust Bridge  ┌──────────────────────────────────┐  │
│   │   React / Vite UI      │ ◄─────────────────► │   Tauri Core / VirtualCam Engine │  │
│   │   - Stage & Card View  │                     │   - DirectShow / VirtualCam Sink │  │
│   │   - Control Deck       │                     │   - Real-time Compositor         │  │
│   │   - Source Manager     │                     │   - Voice Audio Listener         │  │
│   └───────────┬────────────┘                     └────────────────┬─────────────────┘  │
└───────────────┼───────────────────────────────────────────────────┼────────────────────┘
                │ HTTPS / WSS                                       │ Virtual Camera
                ▼                                                   ▼
┌───────────────────────────────┐                  ┌─────────────────────────────────────┐
│  Backend AI Engine (Render)   │                  │  Meeting Client                     │
│  - Bedrock / Gemini AI        │                  │  - Google Meet / Zoom / MS Teams    │
│  - Vector Search & Grounding  │                  │  - Remote attendees view live stream│
│  - Real-time Card Generation  │                  └─────────────────────────────────────┘
└───────────────────────────────┘
```

---

## 🛠️ Technical Specifications & Recommended Stack

1. **Desktop Shell:** **Tauri v2 (Rust + React)** or **Electron v30+**
   * *Recommendation:* **Tauri v2** provides superior performance, starts in < 300ms, and produces a lightweight installer (~15MB vs Electron's ~120MB).
2. **Frontend UI:** Reuses the existing `@stash/card-react`, Tailwind CSS, and Framer Motion components directly from the web dashboard.
3. **Compositing & Video:** Hardware-accelerated GPU canvas rendering (DirectX / OpenGL / Vulkan via Rust `wgpu` or OpenCV DirectShow).
4. **Voice Detection:** Integrated Web Audio API / Native PortAudio continuous speech detection with local keyword spotting.
5. **Auto-Updater:** Built-in cryptographic signature auto-updates via GitHub Releases.

---

## 📋 Comprehensive Feature Matrix

### Phase 1: MVP Desktop App
- [x] Standalone executable with integrated Virtual Camera broadcaster.
- [ ] Native Window UI embedding the React Stage & Control Deck.
- [ ] 1-Click camera source selection (built-in webcam, external USB cam).
- [ ] Dynamic Left/Right shoulder card positioning toggle.
- [ ] Floating Tray widget mode.

### Phase 2: Knowledge & Live Capabilities
- [ ] Direct Google Drive / Notion document browser inside the desktop app.
- [ ] Offline card cache (instant 0ms trigger for pre-loaded decks).
- [ ] Global hotkeys (`Alt + Space` to summon/dismiss cards, `Alt + [ / ]` to switch cards).
- [ ] Local meeting recording with baked-in overlays.

---

## 🔒 Security & Privacy Considerations
* **Local Processing:** Raw webcam and microphone audio are processed in memory and never stored locally without explicit user recording.
* **API Credentials:** Enterprise and personal API keys are encrypted in the native OS Keychain (Windows Credential Manager / macOS Keychain).
* **Code Signing:** Binaries signed with EV Code Signing certificates to ensure seamless installation without SmartScreen warnings.
