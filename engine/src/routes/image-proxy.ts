/**
 * Image proxy route (plan §3.9).
 *
 * GET /img/:token — serves proxied image bytes with ACAO: * so the Meet
 * page's canvas can load them cross-origin without tainting captures.
 * No auth — the HMAC signature is the capability.
 *
 * CRITICAL: This route must override the global cors middleware with
 * ACAO: *, because the image is loaded from meet.google.com.
 */
import { Router, type Request, type Response } from 'express';
import { verifyImageToken } from '../images/proxy-url.js';
import type { ImageFetcher } from '../images/image-fetcher.js';
import type { ImageByteCache } from '../images/image-fetcher.js';

export function createImageProxyRouter(fetcher: ImageFetcher, byteCache: ImageByteCache): Router {
  const router = Router();

  router.get('/img/:token', async (req: Request, res: Response) => {
    const upstream = verifyImageToken(req.params.token);
    if (!upstream) {
      res.status(404).end();
      return;
    }

    // Try cache first
    const cached = byteCache.get(upstream);
    if (cached) {
      setImageHeaders(res, cached.contentType, cached.bytes.length);
      res.end(cached.bytes);
      return;
    }

    // Fetch on miss
    const fetched = await fetcher.fetch(upstream, 4000);
    if (!fetched) {
      res.status(404).end();
      return;
    }

    byteCache.set(upstream, fetched);
    setImageHeaders(res, fetched.contentType, fetched.bytes.length);
    res.end(fetched.bytes);
  });

  return router;
}

function setImageHeaders(res: Response, contentType: string, contentLength: number): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Length', String(contentLength));
  res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}
