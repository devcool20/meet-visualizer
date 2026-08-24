import { WebSocketServer, type WebSocket } from 'ws';
import type { Server as HttpServer } from 'node:http';
import { Session, type SessionDeps } from './session.js';

/**
 * Attaches the WS protocol v2 server (plan §2.5) to an existing HTTP
 * server. All JSON, no binary frames — enforced implicitly because `Session`
 * only ever calls `JSON.stringify`/`JSON.parse`.
 *
 * Uses `noServer` + a path-checked upgrade listener rather than
 * `{ server, path }`: a path-scoped WSS destroys the socket for ANY other
 * upgrade path, which would kill co-resident WS endpoints (e.g.
 * `/ws/virtualcam`) before their own listeners run.
 */
export function attachWsServer(httpServer: HttpServer, deps: SessionDeps): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });
  httpServer.on('upgrade', (req, socket, head) => {
    let pathname: string;
    try {
      pathname = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`).pathname;
    } catch {
      return;
    }
    if (pathname !== '/ws' && pathname !== '/') return; // not ours — leave the socket for other handlers
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });
  wss.on('connection', (ws: WebSocket) => {
    new Session(ws, deps);
  });
  return wss;
}
