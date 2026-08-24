import { describe, it, expect } from 'vitest';
import { DriveDocsAggregator } from '../drive/aggregator.js';
import { DriveGroundingProvider, CompositeGroundingProvider } from '../drive/grounding.js';
import { MockGroundingProvider } from '../generation/grounding.js';

describe('DriveDocsAggregator', () => {
  it('seeds default presentation documents', () => {
    const aggregator = new DriveDocsAggregator();
    const docs = aggregator.getDocuments('demo-user');
    expect(docs.length).toBeGreaterThanOrEqual(3);
    expect(docs.some((d) => d.title.includes('Pitch Metrics'))).toBe(true);
  });

  it('adds and retrieves a new custom document with auto-parsed sections', () => {
    const aggregator = new DriveDocsAggregator();
    aggregator.addDocument('user-1', {
      id: 'doc-alpha',
      title: 'Q4 Product Roadmap',
      mimeType: 'application/vnd.google-apps.document',
      updatedAt: new Date().toISOString(),
      content: `
# Feature Deliverables
Real-time Google Meet stream overlay at 60fps.
Sub-500ms voice triggered card generation.

# Milestones
Release beta in October.
General availability in November.
      `,
    });

    const doc = aggregator.getDocument('user-1', 'doc-alpha');
    expect(doc).not.toBeNull();
    expect(doc?.sections?.length).toBe(2);
    expect(doc?.sections?.[0].heading).toBe('Feature Deliverables');
  });

  it('searches documents by query keywords and section matching', () => {
    const aggregator = new DriveDocsAggregator();
    const results = aggregator.search('demo-user', 'What are our pitch metrics and ARR?');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toContain('Pitch Metrics');
    expect(results[0].snippet).toContain('ARR');
  });

  it('deletes documents cleanly', () => {
    const aggregator = new DriveDocsAggregator();
    aggregator.addDocument('user-2', {
      id: 'doc-temp',
      title: 'Temporary Note',
      mimeType: 'text/plain',
      updatedAt: new Date().toISOString(),
      content: 'Short test note',
    });

    expect(aggregator.getDocument('user-2', 'doc-temp')).not.toBeNull();
    const deleted = aggregator.deleteDocument('user-2', 'doc-temp');
    expect(deleted).toBe(true);
    expect(aggregator.getDocument('user-2', 'doc-temp')).toBeNull();
  });
});

describe('DriveGroundingProvider & CompositeGroundingProvider', () => {
  it('converts drive search matches into grounding candidates', async () => {
    const aggregator = new DriveDocsAggregator();
    const provider = new DriveGroundingProvider(aggregator, 'demo-user');
    const candidates = await provider.search('leadership and CTO Elena', 2);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].title).toContain('Leadership');
    expect(candidates[0].extract).toContain('Elena');
  });

  it('CompositeGroundingProvider falls back to Wikipedia when no Drive match', async () => {
    const aggregator = new DriveDocsAggregator();
    const driveProvider = new DriveGroundingProvider(aggregator, 'empty-user');
    const mockWiki = new MockGroundingProvider();
    const composite = new CompositeGroundingProvider(driveProvider, mockWiki);

    const candidates = await composite.search('quantum computing research', 2);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].title).toBe('Mock Search Result');
  });
});
