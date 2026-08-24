/**
 * Mock generation provider (plan §3.2).
 *
 * Deterministic draft derived from the prompt's topic. Used by STASH_LOCAL
 * and every test. Never makes network calls.
 */
import type { GenerationProvider, AiProviderId, StructuredRequest, StructuredResult } from './provider.js';
import { GenerationProviderError, GenerationTimeoutError } from './provider.js';

export interface MockGenerationOpts {
  /** Override the returned draft (or undefined for the default). */
  draft?: unknown;
  /** Force a specific failure mode for testing. */
  failMode?: 'timeout' | 'garbage' | 'http';
}

export class MockGenerationProvider implements GenerationProvider {
  readonly id: AiProviderId = 'mock';
  readonly model = 'mock-model/v0';

  constructor(private opts?: MockGenerationOpts) {}

  async generateStructured(_req: StructuredRequest): Promise<StructuredResult> {
    if (this.opts?.failMode === 'timeout') {
      // The caller is expected to wrap with withGenerationTimeout; hanging forever is fine.
      return new Promise<never>(() => {});
    }

    if (this.opts?.failMode === 'garbage') {
      return {
        json: null,
        raw: 'definitely not json {{{',
        provider: 'mock',
        model: this.model,
      };
    }

    if (this.opts?.failMode === 'http') {
      throw new GenerationProviderError('Mock HTTP error', true, 500);
    }

    if (this.opts?.draft) {
      return {
        json: this.opts.draft,
        raw: JSON.stringify(this.opts.draft),
        provider: 'mock',
        model: this.model,
      };
    }

    // Dynamic mock synthesis based on utterance and grounding context
    const promptText = _req.user || '';
    const utteranceMatch = promptText.match(/Utterance:\s*"?([^"\n]+)"?/i);
    const rawUtterance = utteranceMatch ? utteranceMatch[1].trim() : 'Live Insight';
    const lower = rawUtterance.toLowerCase();

    // Capitalize words for title
    const cleanTitle = rawUtterance
      .split(' ')
      .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');

    let draft: Record<string, unknown>;

    if (lower.includes('fable') || lower.includes('game') || lower.includes('xbox') || lower.includes('rpg')) {
      draft = {
        relevant: true,
        sourceIndex: 0,
        title: cleanTitle.includes('Fable') ? 'Fable (Reboot)' : cleanTitle,
        subtitle: 'Playground Games · Action RPG',
        accent: 'teal',
        layout: 'explainer',
        imageWanted: false,
        blocks: [
          {
            kind: 'metric_row',
            items: [
              { label: 'ENGINE', value: 'ForzaTech', emphasis: true },
              { label: 'PLATFORM', value: 'XSX/PC', emphasis: false },
              { label: 'RATING', value: '94%', delta: '+12%', emphasis: false },
            ],
          },
          {
            kind: 'bullets',
            items: [
              'Action RPG reboot developed by Playground Games',
              'Set in dynamic open world of Albion',
              'Published by Xbox Game Studios for Series X/S & PC',
            ],
          },
          {
            kind: 'status_list',
            rows: [
              { text: 'Developer: Playground Games', state: 'ok' },
              { text: 'Publisher: Xbox Game Studios', state: 'ok' },
            ],
          },
        ],
      };
    } else if (
      lower.includes('revenue') ||
      lower.includes('arr') ||
      lower.includes('metric') ||
      lower.includes('margin') ||
      lower.includes('growth') ||
      lower.includes('pitch') ||
      lower.includes('yc')
    ) {
      draft = {
        relevant: true,
        sourceIndex: 0,
        title: cleanTitle || 'Revenue & Traction',
        subtitle: 'Stash Live · YC W25 Performance',
        accent: 'amber',
        layout: 'metric_callout',
        imageWanted: false,
        blocks: [
          {
            kind: 'metric_row',
            items: [
              { label: 'ARR', value: '$148K', emphasis: true },
              { label: 'GROWTH', value: '+28%', delta: 'MoM', emphasis: false },
              { label: 'MARGIN', value: '84%', emphasis: false },
            ],
          },
          {
            kind: 'line_chart',
            series: [
              { x: 0, y: 35, label: 'Jan' },
              { x: 20, y: 48 },
              { x: 40, y: 72, label: 'Mar' },
              { x: 60, y: 95 },
              { x: 80, y: 120 },
              { x: 100, y: 148, label: 'Jun' },
            ],
          },
          {
            kind: 'status_list',
            rows: [
              { text: '18 active enterprise pilots', state: 'ok' },
              { text: 'Google Drive · Pitch Deck', state: 'info' },
            ],
          },
        ],
      };
    } else if (lower.includes('ranbir') || lower.includes('kapoor') || lower.includes('person') || lower.includes('founder')) {
      draft = {
        relevant: true,
        sourceIndex: 0,
        title: cleanTitle,
        subtitle: 'Indian Actor & Film Producer',
        accent: 'violet',
        layout: 'person',
        imageWanted: false,
        blocks: [
          {
            kind: 'metric_row',
            items: [
              { label: 'AWARDS', value: '6 Filmfare', emphasis: true },
              { label: 'DEBUT', value: '2007', emphasis: false },
              { label: 'BOX OFFICE', value: '₹917 Cr', delta: 'Peak', emphasis: false },
            ],
          },
          {
            kind: 'bullets',
            items: [
              'Leading Indian actor known for diverse dramatic roles',
              'Starred in Rockstar, Barfi!, Sanju, and Animal',
              'Among the highest-paid actors in Hindi cinema',
            ],
          },
          {
            kind: 'status_list',
            rows: [{ text: 'Attribution: Wikipedia Knowledge Graph', state: 'info' }],
          },
        ],
      };
    } else {
      draft = {
        relevant: true,
        sourceIndex: 0,
        title: cleanTitle,
        subtitle: 'Real-time contextual intelligence',
        accent: 'teal',
        layout: 'explainer',
        imageWanted: false,
        blocks: [
          {
            kind: 'metric_row',
            items: [
              { label: 'CONFIDENCE', value: '98.4%', emphasis: true },
              { label: 'LATENCY', value: '380ms', emphasis: false },
              { label: 'GROUNDING', value: 'Active', emphasis: false },
            ],
          },
          {
            kind: 'bullets',
            items: [
              `Contextual brief for "${rawUtterance}"`,
              'Synthesized from live knowledge aggregator & AI provider',
              'Positioned over-the-shoulder for ambient presentation',
            ],
          },
          {
            kind: 'status_list',
            rows: [{ text: 'Grounded in live speech transcript', state: 'ok' }],
          },
        ],
      };
    }

    return {
      json: draft,
      raw: JSON.stringify(draft),
      provider: 'mock',
      model: this.model,
    };
  }
}
