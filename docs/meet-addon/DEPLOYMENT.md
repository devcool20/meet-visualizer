# Stash Live — Google Meet Add-on & Cloud Backend Deployment Guide

This guide walks you through registering the **Stash Live Google Meet Add-on** in Google Cloud Console, testing it locally in real Google Meet calls, and deploying the backend engine.

---

## 1. Local Testing in Real Google Meet

You can test the Stash Live Add-on inside `meet.google.com` calls immediately using Google Meet's Developer Preview mode.

### Step 1: Start Frontend and Backend
```bash
# Terminal 1: Start Frontend
npm run dev

# Terminal 2: Start Backend Engine
cd engine
npm run dev
```

### Step 2: Create a Secure Tunnel (for Google Meet iframe)
Google Meet requires all Add-ons to load over HTTPS. Use `ngrok`, `localtunnel`, or Cloudflare Tunnel:
```bash
# Example with ngrok
npx ngrok http 5173
```
Copy your forwarding URL (e.g. `https://xyz.ngrok-free.app`).

### Step 3: Enable Developer Preview in Google Meet
1. Open [meet.google.com](https://meet.google.com) and start or join a call.
2. In Google Meet settings or DevTools, verify the add-on loads in the iframe:
   * Side Panel: `https://xyz.ngrok-free.app/meet-addon?frame=side_panel`
   * Main Stage: `https://xyz.ngrok-free.app/meet-addon?frame=main_stage`
3. Alternatively, test the Standalone Web Studio directly at `http://localhost:5173/studio` and use **Present now ➔ A Tab**.

---

## 2. Google Cloud Console Registration

To distribute Stash Live in the Google Workspace Marketplace for your team or public users:

1. **Create/Open Project in Google Cloud Console**:
   * Go to [console.cloud.google.com](https://console.cloud.google.com).
   * Note your **Google Cloud Project Number** (e.g. `1088492049182`).

2. **Enable APIs**:
   * Enable **Google Workspace Marketplace SDK**.
   * Enable **Google Meet API**.

3. **Configure Google Meet Add-on in Marketplace SDK**:
   * In the Google Cloud Console search for **Google Workspace Marketplace SDK** ➔ **App Configuration**.
   * Under **App Integration**, select **Google Meet Add-on**.
   * Set **Side Panel URL**: `https://app.yourdomain.com/meet-addon?frame=side_panel`
   * Set **Main Stage URL**: `https://app.yourdomain.com/meet-addon?frame=main_stage`
   * Enable **Supports CoDoing** (allows synchronized real-time cards across attendees).
   * Upload logo and description from `docs/meet-addon/manifest.json`.

---

## 3. Backend Engine Deployment (Cloud Hosting)

The Stash Live Engine is a high-performance Node.js / TypeScript WebSocket service located in `engine/`.

### Environment Variables
Configure the following in your cloud host (Railway, Render, AWS ECS, Fly.io, or DigitalOcean):
```bash
PORT=5000
NODE_ENV=production
PUBLIC_ORIGIN=https://api.yourdomain.com
CORS_ORIGIN=https://app.yourdomain.com
AUTH_MODE=mock # or supabase

# LLM Providers (Configure at least one)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
AWS_BEDROCK_MODEL_ID=us.amazon.nova-lite-v1:0

# Or Gemini / OpenAI
GEMINI_API_KEY=your_gemini_key
OPENAI_API_KEY=your_openai_key
```

### Docker Deployment
The engine includes a production Dockerfile:
```bash
# Build engine container
docker build -t stash-live-engine -f engine/Dockerfile .

# Run container
docker run -p 5000:5000 --env-file engine/.env stash-live-engine
```

### 1-Click Cloud Deploy Options:
* **Railway / Render**: Connect this repository, set root directory to `engine/`, and start command `npm start`.
* **Frontend (Vercel / Cloudflare Pages)**: Connect repository, set build command `npm run build`, output dir `dist`, and set `VITE_ENGINE_WS_URL=wss://api.yourdomain.com`.
