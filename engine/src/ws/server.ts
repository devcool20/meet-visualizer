import { WebSocketServer, type WebSocket } from 'ws';
import type { Server as HttpServer } from 'node:http';
import { Session, type SessionDeps } from './session.js';

/**
 * Attaches the WS protocol v2 server (plan §2.5) to an existing HTTP
 * server. All JSON, no binary frames — enforced implicitly because `Session`
 * only ever calls `JSON.stringify`/`JSON.parse`.
 */
export function attachWsServer(httpServer: HttpServer, deps: SessionDeps): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  wss.on('connection', (ws: WebSocket) => {
    new Session(ws, deps);
  });
  return wss;
}
