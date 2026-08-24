import { Router } from 'express';
import type { AuthProvider } from '../auth/supabase.js';
import { requireAuth, type AuthedRequest } from '../auth/middleware.js';
import type { DriveDocsAggregator } from '../drive/aggregator.js';

export function createDriveRouter(aggregator: DriveDocsAggregator, authProvider: AuthProvider): Router {
  const router = Router();
  router.use(requireAuth(authProvider));

  // List all drive docs for user
  router.get('/api/drive/docs', (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    const docs = aggregator.getDocuments(userId);
    res.json({ docs });
  });

  // Get specific drive doc
  router.get('/api/drive/docs/:id', (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    const doc = aggregator.getDocument(userId, req.params.id);
    if (!doc) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({ doc });
  });

  // Add or update a drive doc
  router.post('/api/drive/docs', (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    const { id, title, content, mimeType, sourceUrl, metadata } = req.body;
    if (!title || !content) {
      res.status(400).json({ error: 'missing_fields', message: 'title and content are required' });
      return;
    }

    const docId = id || `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const doc = {
      id: docId,
      title: String(title),
      content: String(content),
      mimeType: mimeType || 'application/vnd.google-apps.document',
      sourceUrl: sourceUrl || `https://docs.google.com/document/d/${docId}`,
      updatedAt: new Date().toISOString(),
      metadata,
    };

    aggregator.addDocument(userId, doc);
    res.status(201).json({ doc });
  });

  // Search docs
  router.post('/api/drive/search', (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    const { query, limit, minScore } = req.body;
    if (!query) {
      res.status(400).json({ error: 'missing_query', message: 'query is required' });
      return;
    }
    const results = aggregator.search(userId, String(query), { limit, minScore });
    res.json({ results });
  });

  // Delete a doc
  router.delete('/api/drive/docs/:id', (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    const ok = aggregator.deleteDocument(userId, req.params.id);
    if (!ok) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.status(204).end();
  });

  // Re-seed default demo docs
  router.post('/api/drive/seed', (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    aggregator.seedDefaultDocs(userId);
    res.json({ success: true, count: aggregator.getDocuments(userId).length });
  });

  return router;
}
