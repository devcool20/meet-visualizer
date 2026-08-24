/**
 * Google Drive Grounding Provider.
 *
 * Implements GroundingProvider to ground generated cards in Google Drive documents.
 */

import type { GroundingCandidate, GroundingProvider } from '../generation/grounding.js';
import type { DriveDocsAggregator } from './aggregator.js';

export class DriveGroundingProvider implements GroundingProvider {
  constructor(
    private aggregator: DriveDocsAggregator,
    private defaultUserId = 'demo-user',
  ) {}

  public async search(query: string, limit = 3, _timeoutMs = 3000, userId?: string): Promise<GroundingCandidate[]> {
    const targetUser = userId || this.defaultUserId;
    // Confident match threshold (minScore >= 0.25)
    const results = this.aggregator.search(targetUser, query, { limit, minScore: 0.25 });

    return results.map((res, i) => ({
      index: i,
      title: res.title,
      description: res.matchedSection ? `Google Drive Doc Section: ${res.matchedSection}` : 'Google Drive Document',
      extract: res.snippet.slice(0, 900),
      pageUrl: res.sourceUrl || `https://docs.google.com/document/d/${res.docId}`,
      imageUrl: null,
    }));
  }
}

/**
 * Composite grounding provider:
 * Queries Google Drive docs first; if strong match exists, uses Drive context;
 * otherwise queries Wikipedia/fallback grounding provider.
 */
export class CompositeGroundingProvider implements GroundingProvider {
  constructor(
    private driveProvider: DriveGroundingProvider,
    private fallbackProvider: GroundingProvider,
  ) {}

  public async search(query: string, limit = 3, timeoutMs = 3000, userId?: string): Promise<GroundingCandidate[]> {
    try {
      const driveCandidates = await this.driveProvider.search(query, limit, timeoutMs, userId);
      if (driveCandidates.length > 0) {
        return driveCandidates;
      }
    } catch (err) {
      console.warn('[CompositeGroundingProvider] Drive search error, falling back:', err);
    }

    return this.fallbackProvider.search(query, limit, timeoutMs);
  }
}
