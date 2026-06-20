# Stash Live: The Cloud Stream Presenter Overlay Suite

Stash Live is a zero-friction, cloud-integrated ambient broadcast engine that redefines executive presence and enterprise communication for the remote era. By shifting the video conferencing paradigm away from manual screen sharing, the application introduces a unified workflow where spoken topics act as the **content generator**, automatically projecting visual overlays directly into the presenter's video stream.

Running as a SaaS integration platform, Stash Live connects with your existing B2B workspace hooks (Airtable, Notion, Google Drive, Salesforce) to inject context-aware, high-luminance glassmorphic data cards directly into the outbound webcam video feed.

---

## 🚀 Architectural Paradigm Shift

```
[ TRADITIONAL SCREEN SHARING ]
Presenter ──► Clicks "Share Screen" ──► Minimizes Windows ──► Face Shrinks ──► Engagement Drops

[ STASH LIVE STREAM ENGINE ]
Presenter ──► Speaks Naturally ──► Cloud Voice Parsing ──► SaaS Workspace Hook ──► Stream Overlay Ingestion
```

Traditional presentation workflows break critical communication loops: sharing a window shrinks the presenter's face into a tiny thumbnail, destroys direct eye contact, and stalls momentum while the host searches through desktop tabs.

Stash Live preserves human connection and authority by allowing presenters to remain full-sized on screen. Data assets glide into the video feed automatically based on spoken context, delivering real-time, in-the-moment value during high-stakes sales engineering pitches and executive corporate keynotes.

---

## 🛠️ High-Level Core Architecture

The system utilizes a secure cloud processing pipeline to map spoken phrases to authenticated B2B workspaces with minimal latency.

```
                      +---------------------------------------+
                      |         STASH LIVE CLOUD PIPELINE     |
                      +---------------------------------------+
                                          │
                ┌─────────────────────────┴─────────────────────────┐
                ▼                                                   ▼
   [VOICE PARSING ENGINE]                              [INTEGRATION DATA RESOLVER]
                │                                                   │
Stream Audio Ingestion                                   - Notion API Data Pulls
Cloud Transcription (STT)                                - Airtable Record Queries
Intent Mapping & Keyphrase Matching                      - Google Drive File Embeds
│                                                                   │
└─────────────────────────────────┬─────────────────────────────────┘
                                  ▼
                    [DYNAMIC OVERLAY COMPOSER]
                                  │
                                  ▼
                     [MEETING APP OVERLAY FEED]
                     (Zoom / Meet / Teams / Webex)
```

### 1. Ingestion & Sync Layer
* **Audio Capture:** Ingests the meeting stream audio feed to parse spoken vocabulary.
* **Workspace Sync:** Maintains live API hooks to authenticated CRM and project management tools.

### 2. Cloud Intent Recognition
* **The Voice Context Engine:** A real-time cloud-based speech-to-text model maps intent, entities, and anchoring keyphrases (e.g., *"Let's look at the metrics..."*) to corresponding document queries.
* **The Overlay Layout Engine:** Composes the data panels dynamically, adjusting coordinates next to the presenter's outline to prevent facial occlusion.

### 3. State Orchestrator & Live Resolving
As an anchoring phrase is spoken, the orchestrator queries your connected integrations (Airtable, Notion, Drive) to retrieve the latest data points. The dynamic asset is then built off-screen and animated smoothly into the video composition feed.

---

## ⚡ Compression-Aware Rendering (CAR) Engine

Virtual cameras and overlays can degrade over WebRTC streams because platform encoders aggressively compress video feeds via **4:2:0 Chroma Subsampling**, transforming thin lines, fine text, and subtle blurs into pixelated artifacts under poor network conditions. Stash Live forces crisp rendering on remote client screens through two specialized protocols:

### Protocol A: High-Luminance Contrast Mapping
All visual elements use hardcoded, high-luminance alpha channels (`rgba(255,255,255,0.45)`) combined with an ultra-thin `1px` high-contrast gradient outline border. Codecs preserve these sharp brightness edges perfectly, keeping text legible even on downscaled meeting streams.

### Protocol B: Dynamic Spatial Bitrate Optimization
When a data overlay remains static, the composition engine optimizes the stream refresh rate for that specific vector coordinates zone, reducing compression artifacts and freeing up bandwidth for the presenter’s camera feed.

---

## 📅 Zero-Friction Enterprise Integration

Stash Live requires zero manual asset mapping or pre-meeting preparation:
1. **Calendar Ingestion:** The engine syncs with Google Calendar and Microsoft Outlook, parsing upcoming meeting invites to identify client domains and meeting context.
2. **Enterprise Knowledge Fetching:** The system pre-queries authenticated enterprise hubs (HubSpot, Salesforce, Notion, Google Drive) to cache active contract records, charts, or pitch metrics.
3. **Stream Triggering:** Spoken keywords automatically pull and animate the relevant workspace data directly into the video stream overlay in real time.

---

## 🎨 Design System & Frontend Tokens

The design framework adopts a highly polished, editorial **Light Mode** aesthetic built on premium whitespace allocations, micro-borders, and high-contrast structural typography.

### Core Tokens
* **Canvas Base Background:** Warm Cream / Soft Alabaster (`#FBF9F6`).
* **Primary Text & Interface Solids:** Deep Espresso / Roasted Charcoal (`#1A1512`).
* **Accent Highlight States:** Pale Mint (`#10B981`) for success indicators and verified telemetry nodes.
* **Typography Hierarchy:**
  - *Display Headings:* Classic, tight-letterspaced serif font (e.g., *Garamond*, *Editorial New*) for a high-end, authoritative cinematic feel.
  - *Body, Interface & Logs:* Crisp, high-scannability geometric sans-serif (e.g., *Geist*, *Inter*) paired with *JetBrains Mono* for system logs.