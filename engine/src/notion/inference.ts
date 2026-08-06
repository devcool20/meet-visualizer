import { GoogleGenAI, Type } from '@google/genai';
import { config } from '../config.js';
import type { CardBlock, CardSpec } from '@stash/card-spec';
import { assertCardSpec } from '@stash/card-spec';

/**
 * Notion page -> CardSpec inference (plan §2.6: "LLM inference writes
 * `status: 'draft'` cards for human approval... Rigid-schema and
 * duplicate-a-template remain supported paths").
 *
 * This is intentionally a narrow boundary: given a page's already-extracted
 * plain properties (title, text, numbers, image URLs — see
 * notion/properties.ts), produce a best-effort CardSpec. The LLM is asked to
 * pick a sensible block layout; a rigid-schema fallback (used when there's
 * no API key, i.e. STASH_LOCAL or missing GEMINI_API_KEY) builds a simple
 * `text`/`bullets` card directly from the properties with no network call.
 */
export interface NotionPageSummary {
  pageId: string;
  title: string;
  bodyText: string;
  numbers: Record<string, number>;
  imageUrls: string[];
  lastEditedTime: string;
}

export interface CardInferrer {
  infer(summary: NotionPageSummary): Promise<{ spec: CardSpec; phrases: string[] }>;
}

export class RigidSchemaCardInferrer implements CardInferrer {
  async infer(summary: NotionPageSummary): Promise<{ spec: CardSpec; phrases: string[] }> {
    const blocks: CardBlock[] = [];
    const numberEntries = Object.entries(summary.numbers);
    if (numberEntries.length > 0) {
      blocks.push({
        kind: 'metric_row',
        items: numberEntries.slice(0, 3).map(([label, value]) => ({ label, value: String(value) })),
      });
    }
    if (summary.imageUrls.length > 0) {
      blocks.push({ kind: 'image', url: summary.imageUrls[0], alt: summary.title });
    }
    if (summary.bodyText) {
      blocks.push({ kind: 'text', paragraphs: [summary.bodyText].slice(0, 4) });
    }
    if (blocks.length === 0) {
      blocks.push({ kind: 'text', paragraphs: ['No content extracted from this Notion page yet.'] });
    }
    const spec = assertCardSpec({
      v: 1,
      id: `notion-${summary.pageId}`,
      revision: 1,
      title: summary.title || 'Untitled',
      blocks,
    });
    const phrases = [summary.title.toLowerCase()].filter(Boolean);
    return { spec, phrases };
  }
}

/** Structured-output Gemini inferrer — layered on top of the rigid schema as a fallback on error. */
export class GeminiCardInferrer implements CardInferrer {
  private fallback = new RigidSchemaCardInferrer();
  private ai: GoogleGenAI;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async infer(summary: NotionPageSummary): Promise<{ spec: CardSpec; phrases: string[] }> {
    try {
      const response = await this.ai.models.generateContent({
        model: config.tier3Model,
        contents: `Suggest 3-6 short spoken trigger phrases (lowercase, no punctuation) a presenter might say to bring up this Notion page as an on-screen card. Title: "${summary.title}". Body: "${summary.bodyText.slice(0, 500)}"`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: { type: Type.OBJECT, properties: { phrases: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ['phrases'] },
        },
      });
      const parsed = JSON.parse(response.text || '{}');
      const { spec } = await this.fallback.infer(summary);
      const phrases: string[] = Array.isArray(parsed.phrases) && parsed.phrases.length > 0 ? parsed.phrases : [summary.title.toLowerCase()];
      return { spec, phrases };
    } catch {
      return this.fallback.infer(summary);
    }
  }
}

export function createCardInferrer(): CardInferrer {
  if (config.useMockGemini) return new RigidSchemaCardInferrer();
  return new GeminiCardInferrer(config.geminiApiKey);
}
