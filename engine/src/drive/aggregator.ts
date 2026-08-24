/**
 * Google Drive Docs Aggregator.
 *
 * Ingests, indexes, and queries Google Drive documents to ground AI card generation.
 */

import type { DriveDocument, DriveDocSection, DriveSearchResult, DriveDocQueryOptions } from './types.js';

export class DriveDocsAggregator {
  // Store documents mapped by userId -> Map<docId, DriveDocument>
  private userDocs = new Map<string, Map<string, DriveDocument>>();

  constructor() {
    // Seed initial demo documents for default demo users — including
    // `local-dev-user`, the identity STASH_LOCAL=1 auth maps every request to.
    this.seedDefaultDocs('local-dev-user');
    this.seedDefaultDocs('demo-user');
    this.seedDefaultDocs('dev-user');
  }

  /**
   * Add or update a document for a user.
   */
  public addDocument(userId: string, doc: DriveDocument): void {
    let docs = this.userDocs.get(userId);
    if (!docs) {
      docs = new Map<string, DriveDocument>();
      this.userDocs.set(userId, docs);
    }
    // Auto-parse sections if not explicitly provided
    if (!doc.sections || doc.sections.length === 0) {
      doc.sections = this.parseSections(doc.content);
    }
    docs.set(doc.id, doc);
  }

  /**
   * Retrieve all documents for a user.
   */
  public getDocuments(userId: string): DriveDocument[] {
    const docs = this.userDocs.get(userId);
    if (!docs) return [];
    return Array.from(docs.values());
  }

  /**
   * Retrieve a specific document by ID.
   */
  public getDocument(userId: string, docId: string): DriveDocument | null {
    const docs = this.userDocs.get(userId);
    return docs?.get(docId) ?? null;
  }

  /**
   * Delete a document for a user.
   */
  public deleteDocument(userId: string, docId: string): boolean {
    const docs = this.userDocs.get(userId);
    if (!docs) return false;
    return docs.delete(docId);
  }

  /**
   * Search documents for relevance to a spoken topic or query.
   */
  public search(userId: string, query: string, opts: DriveDocQueryOptions = {}): DriveSearchResult[] {
    const limit = opts.limit ?? 3;
    const minScore = opts.minScore ?? 0.15;
    const docs = this.getDocuments(userId);
    if (docs.length === 0) return [];

    const queryTokens = this.tokenize(query);
    if (queryTokens.length === 0) return [];

    const results: DriveSearchResult[] = [];

    for (const doc of docs) {
      // 1. Check title match
      const titleTokens = this.tokenize(doc.title);
      const titleOverlap = this.calculateOverlap(queryTokens, titleTokens);

      // 2. Check sections match
      let bestSectionScore = 0;
      let bestSection: DriveDocSection | undefined;

      if (doc.sections && doc.sections.length > 0) {
        for (const section of doc.sections) {
          const headingTokens = this.tokenize(section.heading);
          const bodyTokens = this.tokenize(section.body);

          const hScore = this.calculateOverlap(queryTokens, headingTokens) * 1.5;
          const bScore = this.calculateOverlap(queryTokens, bodyTokens);
          const sectionScore = Math.max(hScore, bScore, (hScore + bScore) / 1.8);

          if (sectionScore > bestSectionScore) {
            bestSectionScore = sectionScore;
            bestSection = section;
          }
        }
      }

      // Total score is blend of title affinity and best section match
      const totalScore = titleOverlap * 0.6 + bestSectionScore * 0.8;

      if (totalScore >= minScore) {
        const snippet = bestSection
          ? `${bestSection.heading ? bestSection.heading + ': ' : ''}${bestSection.body.slice(0, 300)}`
          : doc.content.slice(0, 300);

        results.push({
          docId: doc.id,
          title: doc.title,
          snippet: snippet.trim(),
          score: Math.min(1.0, Number(totalScore.toFixed(3))),
          matchedSection: bestSection?.heading,
          sourceUrl: doc.sourceUrl,
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /**
   * Helper: Parse plain markdown/text into sections.
   */
  private parseSections(content: string): DriveDocSection[] {
    const lines = content.split('\n');
    const sections: DriveDocSection[] = [];
    let currentHeading = 'Overview';
    let currentBody: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') || trimmed.startsWith('---') || (trimmed.endsWith(':') && trimmed.length < 50)) {
        if (currentBody.length > 0) {
          sections.push({
            id: `sec-${sections.length + 1}`,
            heading: currentHeading,
            body: currentBody.join('\n').trim(),
          });
          currentBody = [];
        }
        currentHeading = trimmed.replace(/^[#\-\s:]+/, '').trim() || 'Section';
      } else if (trimmed.length > 0) {
        currentBody.push(trimmed);
      }
    }

    if (currentBody.length > 0) {
      sections.push({
        id: `sec-${sections.length + 1}`,
        heading: currentHeading,
        body: currentBody.join('\n').trim(),
      });
    }

    return sections;
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2);
  }

  private calculateOverlap(queryTokens: string[], docTokens: string[]): number {
    if (queryTokens.length === 0 || docTokens.length === 0) return 0;
    const docSet = new Set(docTokens);
    let matches = 0;

    for (const token of queryTokens) {
      if (docSet.has(token)) {
        matches++;
      } else {
        // Substring match for plural/singular variations
        for (const dt of docSet) {
          if (dt.includes(token) || token.includes(dt)) {
            matches += 0.7;
            break;
          }
        }
      }
    }

    return matches / queryTokens.length;
  }

  /**
   * Seed default presentation & knowledge docs for instant use.
   */
  public seedDefaultDocs(userId: string): void {
    this.addDocument(userId, {
      id: 'doc-yc-metrics',
      title: 'Stash Live YC W25 Pitch Metrics & Traction',
      mimeType: 'application/vnd.google-apps.document',
      sourceUrl: 'https://docs.google.com/document/d/yc-pitch-metrics',
      updatedAt: new Date().toISOString(),
      content: `
# Executive Summary & Financial Highlights
Stash Live is the ambient broadcast presenter overlay suite.
ARR: $148,000 Annual Recurring Revenue growing at 28% MoM.
Gross Margin: 84% on SaaS software subscriptions.
Active Enterprise Pilots: 18 Fortune 500 sales teams including Stripe, Figma, and Datadog.
Average Contract Value (ACV): $18,400/year per sales engineering team.

# User Engagement & Retention
Weekly Active Presenters: 4,250 active meeting hosts.
Average Overlay Trigger Latency: 420 milliseconds speech-to-display.
Card Engagement Rate: 92% retention through meeting completion.
Net Promoter Score (NPS): 74 across remote sales professionals.

# Product Unit Economics & Margin
Customer Acquisition Cost (CAC): $1,250 with a payback period of 1.8 months.
LTV/CAC Ratio: 8.8x based on 14-month annualized customer lifetime.
Server composite rendering cost: Less than $0.002 per meeting minute.
      `,
    });

    this.addDocument(userId, {
      id: 'doc-exec-team',
      title: 'Stash Live Leadership & Key Team',
      mimeType: 'application/vnd.google-apps.document',
      sourceUrl: 'https://docs.google.com/document/d/exec-team',
      updatedAt: new Date().toISOString(),
      content: `
# Leadership & Technical Founders
Elena Rostova: Chief Technology Officer. Ex-DeepMind research scientist in ambient WebRTC audio parsing and real-time computer vision.
Dev Sharma: Founder & CEO. Previously product lead scaling distributed video pipelines to 10M+ daily active streams.
Marcus Vance: Head of Design & UX. Former lead designer crafting high-luminance glassmorphic design systems.
Aria Thorne: VP of Enterprise Sales. Led B2B SaaS revenue expansion from $1M to $25M ARR at Loom.
      `,
    });

    this.addDocument(userId, {
      id: 'doc-product-comparison',
      title: 'Stash Live vs Traditional Screen Share Comparison',
      mimeType: 'application/vnd.google-apps.document',
      sourceUrl: 'https://docs.google.com/document/d/product-comparison',
      updatedAt: new Date().toISOString(),
      content: `
# Stash Live vs Traditional Screen Share
Stash Live: Keeps the presenter full screen, maintains direct eye contact, triggers glassmorphic overlays in under 500ms, and aggregates Google Drive / Notion docs in real time.
Traditional Screen Sharing: Shrinks host face to thumbnail, breaks viewer engagement, requires manual window tab hunting, and causes presentation friction.
Key Trade-offs: Stash Live prioritizes audience presence and high-value data cards without interrupting conversation flow.
      `,
    });
  }
}

export const driveDocsAggregator = new DriveDocsAggregator();
