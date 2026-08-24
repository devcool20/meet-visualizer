import { Router, type Request, type Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'node:http';
import { VirtualCamEngine } from '../virtualcam/engine.js';
import type { AuthProvider } from '../auth/supabase.js';

export function createVirtualCamRouter(engine: VirtualCamEngine, authProvider?: AuthProvider): Router {
  const router = Router();

  /**
   * GET /api/virtualcam/status — snapshot of engine, active card, and HUD state
   */
  router.get('/api/virtualcam/status', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      state: engine.getState(),
    });
  });

  /**
   * POST /api/virtualcam/trigger — triggers utterance processing, Drive grounding & card synthesis
   */
  router.post('/api/virtualcam/trigger', async (req: Request, res: Response) => {
    const { utterance, userId, forceRecipe } = req.body || {};

    if (!utterance || typeof utterance !== 'string' || !utterance.trim()) {
      res.status(400).json({ ok: false, error: 'utterance is required' });
      return;
    }

    try {
      const card = await engine.triggerUtterance({
        utterance: utterance.trim(),
        userId: userId || 'local-dev-user',
        forceRecipe,
      });

      if (!card) {
        res.status(422).json({ ok: false, error: 'No card could be generated for the utterance' });
        return;
      }

      res.json({
        ok: true,
        card,
        state: engine.getState(),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Trigger failed';
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * POST /api/virtualcam/card — manually pushes a CardSpec into the live compositor
   */
  router.post('/api/virtualcam/card', (req: Request, res: Response) => {
    const { card, source } = req.body || {};

    if (!card || !card.id || !card.title || !card.blocks) {
      res.status(400).json({ ok: false, error: 'Valid card object with id, title, and blocks is required' });
      return;
    }

    engine.pushCard(card, source || 'Manual API');
    res.json({ ok: true, state: engine.getState() });
  });

  /**
   * DELETE /api/virtualcam/card — dismisses the active card
   */
  router.delete('/api/virtualcam/card', (_req: Request, res: Response) => {
    engine.dismissCard();
    res.json({ ok: true, state: engine.getState() });
  });

  /**
   * POST /api/virtualcam/hud — updates HUD state
   */
  router.post('/api/virtualcam/hud', (req: Request, res: Response) => {
    const { state, interim } = req.body || {};
    if (!state || !['idle', 'listening', 'generating', 'error'].includes(state)) {
      res.status(400).json({ ok: false, error: 'Valid HUD state required (idle, listening, generating, error)' });
      return;
    }

    engine.setHudState(state, interim);
    res.json({ ok: true, state: engine.getState() });
  });

  /**
   * POST /api/virtualcam/audio-level — updates real-time audio volume
   */
  router.post('/api/virtualcam/audio-level', (req: Request, res: Response) => {
    const { current, peak, bars } = req.body || {};
    engine.setAudioLevel(
      typeof current === 'number' ? current : 0,
      typeof peak === 'number' ? peak : 0,
      Array.isArray(bars) ? (bars as [number, number, number]) : undefined,
    );
    res.json({ ok: true });
  });

  return router;
}

/**
 * Attaches the Virtual Camera WebSocket endpoint (/ws/virtualcam).
 *
 * Uses `noServer` + a path-checked upgrade listener so it coexists with the
 * main `/ws` endpoint — neither handler may destroy sockets belonging to
 * the other.
 */
export function attachVirtualCamWs(httpServer: HttpServer, engine: VirtualCamEngine): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    let pathname: string;
    try {
      pathname = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`).pathname;
    } catch {
      return;
    }
    if (pathname !== '/ws/virtualcam') return;
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws: WebSocket) => {
    // Send immediate state sync on connect
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'state_sync', state: engine.getState() }));
    }

    // Subscribe to engine broadcasts
    const unsubscribe = engine.subscribe((event) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(event));
      }
    });

    // Handle inbound client messages
    ws.on('message', async (data: Buffer | string) => {
      try {
        const payload = JSON.parse(data.toString());
        switch (payload.action) {
          case 'hold_start':
            engine.setHudState('listening', payload.interim || 'Listening…');
            break;
          case 'hold_end':
            if (payload.utterance && typeof payload.utterance === 'string') {
              await engine.triggerUtterance({
                utterance: payload.utterance,
                userId: payload.userId,
              });
            } else {
              engine.setHudState('idle');
            }
            break;
          case 'audio_meter':
            engine.setAudioLevel(payload.current || 0, payload.peak || 0, payload.bars);
            break;
          case 'dismiss':
            engine.dismissCard();
            break;
          case 'get_state':
            ws.send(JSON.stringify({ type: 'state_sync', state: engine.getState() }));
            break;
        }
      } catch (err) {
        console.error('[VirtualCamWs] error processing message:', err);
      }
    });

    ws.on('close', () => {
      unsubscribe();
    });
  });

  return wss;
}
