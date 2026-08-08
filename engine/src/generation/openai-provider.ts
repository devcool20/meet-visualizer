/**
 * OpenAI generation provider (plan §3.2).
 *
 * Uses POST /v1/responses with `text.format.json_schema` + `strict:true`.
 * Injectable fetchImpl so tests never hit the real API.
 */
import type { GenerationProvider, AiProviderId, StructuredRequest, StructuredResult } from './provider.js';
import { GenerationProviderError } from './provider.js';

interface OpenAiResponse {
  choices?: Array<{
    message?: { content?: string | null };
  }>;
  output_text?: string;
  output?: Array<{
    content?: Array<{ text?: string }>;
  }>;
}

export class OpenAiGenerationProvider implements GenerationProvider {
  readonly id: AiProviderId = 'openai';
  readonly model: string;

  constructor(
    private apiKey: string,
    model: string,
    private deps?: { fetchImpl?: typeof fetch },
  ) {
    this.model = model;
  }

  private get fetch(): typeof fetch {
    return this.deps?.fetchImpl ?? globalThis.fetch;
  }

  async generateStructured(req: StructuredRequest): Promise<StructuredResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), req.timeoutMs);

    try {
      const res = await this.fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: req.system },
            { role: 'user', content: req.user },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: req.schemaName,
              strict: true,
              schema: req.schema,
            },
          },
          max_tokens: req.maxOutputTokens,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new GenerationProviderError(
          `OpenAI returned ${res.status}: ${body.slice(0, 300)}`,
          res.status >= 500 || res.status === 429,
          res.status,
        );
      }

      const data = (await res.json()) as OpenAiResponse;
      const raw = data.choices?.[0]?.message?.content ?? data.output_text ?? this.extractOutputText(data);
      if (!raw) throw new GenerationProviderError('Empty response from OpenAI', false);

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new GenerationProviderError(`OpenAI returned non-JSON: ${raw.slice(0, 200)}`, true);
      }
      return { json: parsed, raw, provider: 'openai', model: this.model };
    } catch (err: any) {
      if (err instanceof GenerationProviderError) throw err;
      if (err?.name === 'AbortError' || controller.signal.aborted) {
        throw new GenerationProviderError('OpenAI request timed out', true);
      }
      throw new GenerationProviderError(err?.message ?? 'OpenAI request failed', false);
    } finally {
      clearTimeout(timer);
    }
  }

  private extractOutputText(data: OpenAiResponse): string | null {
    if (data.choices?.[0]?.message?.content) return data.choices[0].message.content;
    if (data.output_text) return data.output_text;
    if (data.output) {
      for (const block of data.output) {
        if (block.content) {
          for (const part of block.content) {
            if (part.text) return part.text;
          }
        }
      }
    }
    return null;
  }
}
