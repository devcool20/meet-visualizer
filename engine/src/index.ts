import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { notionService } from './services/notion.js';
import { geminiService } from './services/gemini.js';
import { compositorService } from './services/compositor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Serve static templates and dashboard assets
app.use(express.static(path.join(__dirname, 'public')));

// Explicit route to check service health
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    mode: config.useMockNotion ? 'simulation' : 'notion-active',
    port: config.port,
    timestamp: new Date().toISOString()
  });
});

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket Server
const wss = new WebSocketServer({ server });

// Set of active client sockets (dashboard, virtual cameras, etc.)
const activeClients = new Set<WebSocket>();

wss.on('connection', (ws) => {
  activeClients.add(ws);
  console.log(`[Server] WebSocket Client connected. Total clients: ${activeClients.size}`);
  
  // Send welcome log
  sendLog(ws, 'system', `Connected to Stash Live Core Orchestrator. Running in ${config.useMockNotion ? 'Sandbox simulation' : 'Live Notion'} mode.`);

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());
      
      if (msg.type === 'speech') {
        const text = msg.text || '';
        sendLog(ws, 'system', `Processing transcript tokens...`);
        
        // Feed transcript token into Gemini Intent recognizer
        await geminiService.processSpeechToken(text);
      } else if (msg.type === 'dismiss') {
        sendLog(ws, 'system', 'Gesture offramp registered. Dismissing visual canvas.');
        await compositorService.hideCard();
      }
    } catch (err) {
      console.error('[Server] Failed to process socket message:', err);
    }
  });

  ws.on('close', () => {
    activeClients.delete(ws);
    console.log(`[Server] WebSocket Client disconnected. Remaining: ${activeClients.size}`);
  });
});

// Setup Gemini Event Listeners to pipe back to clients and trigger compositor
geminiService.onPreWarm((anchor) => {
  broadcastLog('prewarm', `Predictive pre-warm threshold hit for anchor "${anchor}". Pre-rendering overlay 1.5s early.`);
  compositorService.preWarm(anchor).catch(err => {
    console.error('[Compositor] Pre-warm failed:', err);
  });
});

geminiService.onAction((anchor, response) => {
  broadcastLog('gemini', `Intent Confirmed! Type: ${response.target_visualization_type.toUpperCase()} | Anchor: "${anchor}" | Confidence: ${response.contextual_confidence_score * 100}%`);
  compositorService.showCard(anchor).catch(err => {
    console.error('[Compositor] Render showCard failed:', err);
  });
});

// Setup Compositor Frame Listener to stream binary frames back to clients
compositorService.onFrame((frameBuffer) => {
  activeClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      // Send raw binary buffer representing the transparent frame
      client.send(frameBuffer);
    }
  });
});

// Helper: send logs to specific socket
function sendLog(ws: WebSocket, source: string, text: string) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'log', source, text }));
  }
}

// Helper: broadcast logs to all connected dashboards
function broadcastLog(source: string, text: string) {
  activeClients.forEach((client) => {
    sendLog(client, source, text);
  });
}

// Bootstrapping the pipeline services
async function bootstrap() {
  console.log('==================================================');
  console.log('       STASH LIVE CLOUD CORE ENGINE BOOTING       ');
  console.log('==================================================');

  // 1. Sync Notion Cache
  await notionService.sync();

  // 2. Start HTTP & WebSocket Server
  server.listen(config.port, async () => {
    console.log(`[Server] Express HTTP listening on http://localhost:${config.port}`);
    
    // 3. Initialize Headless Compositor Canvas (requires HTTP server to be running)
    await compositorService.init();
    
    console.log('[Server] Stash Live pipeline fully operational.');
  });
}

bootstrap().catch((err) => {
  console.error('[Bootstrap Failed]:', err);
  process.exit(1);
});

// Graceful termination
const shutdown = async () => {
  console.log('\n[Shutdown] Tearing down pipeline services...');
  await compositorService.close();
  server.close(() => {
    console.log('[Shutdown] Server socket closed. Exit completed.');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
