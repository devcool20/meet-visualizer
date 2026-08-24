import type { Request, Response, NextFunction } from 'express';
import type { AuthProvider, AuthenticatedUser } from './supabase.js';
import { config } from '../config.js';

export interface AuthedRequest extends Request {
  user?: AuthenticatedUser;
}

/**
 * Express middleware: requires `Authorization: Bearer <supabase-jwt>` and
 * attaches the verified user to `req.user`. Used by every `/api/*` route
 * except the pairing consume endpoint, which is explicitly NO-cookie /
 * no-session by design (plan §2.2 step 4).
 */
export function requireAuth(authProvider: AuthProvider) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      if (config.isLocal) {
        req.user = { id: 'local-dev-user', email: 'dev@stash.live', name: 'Local Dev User' };
        next();
        return;
      }
      res.status(401).json({ error: 'missing_bearer_token' });
      return;
    }
    const jwt = header.slice('Bearer '.length);
    const user = await authProvider.verifyAccessToken(jwt);
    if (!user) {
      if (config.isLocal) {
        req.user = { id: 'local-dev-user', email: 'dev@stash.live', name: 'Local Dev User' };
        next();
        return;
      }
      res.status(401).json({ error: 'invalid_token' });
      return;
    }
    req.user = user;
    next();
  };
}
