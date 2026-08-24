/**
 * Google Drive Docs Aggregator Types.
 */

export interface DriveDocument {
  id: string;
  title: string;
  mimeType: string;
  sourceUrl?: string;
  updatedAt: string;
  content: string;
  sections?: DriveDocSection[];
  metadata?: Record<string, unknown>;
}

export interface DriveDocSection {
  id: string;
  heading: string;
  body: string;
  pageNumber?: number;
}

export interface DriveSearchResult {
  docId: string;
  title: string;
  snippet: string;
  score: number;
  matchedSection?: string;
  sourceUrl?: string;
}

export interface DriveDocQueryOptions {
  limit?: number;
  minScore?: number;
}
