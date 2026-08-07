/**
 * Anthropic generation provider (plan §3.2).
 *
 * Uses POST /v1/messages with a single forced tool (`tool_choice:{type:'tool', name:'emit_card'}`,
 * `input_schema` = our schema). Injectable fetchImpl so tests never hit the real API.
 */
import type { GenerationProvider, AiProviderId, StructuredRequest, StructuredResult } from './provider.js';
import { GenerationProviderError } from './provider.js';

interface AnthropicResponse {
  content: Array<{ type: string; name?: string; input?: unknown; text?: string }>;
}

export class AnthropicGenerationProvider implements GenerationProvider {
  readonly id: AiProviderId = 'anthropic';
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
      const res = await this.fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: req.maxOutputTokens,
          system: req.system,
          messages: [{ role: 'user', content: req.user }],
          tools: [{ name: 'emit_card', input_schema: req.schema }],
          tool_choice: { type: 'tool', name: 'emit_card' },
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new GenerationProviderError(
          `Anthropic returned ${res.status}: ${body.slice(0, 300)}`,
          res.status >= 500 || res.status === 429,
          res.status,
        );
      }

      const data = (await res.json()) as AnthropicResponse;
      const toolUse = data.content?.find((c) => c.type === 'tool_use' && c.name === 'emit_card');

      if (!toolUse?.input) {
        // Fall back: check for text content
        const textBlock = data.content?.find((c) => c.type === 'text');
        if (textBlock?.text) {
          try {
            const parsed = JSON.parse(textBlock.text);
            return { json: parsed, raw: textBlock.text, provider: 'anthropic', model: this.model };
          } catch {
            throw new GenerationProviderError('Anthropic returned text but not valid JSON', true);
          }
        }
        throw new GenerationProviderError('Anthropic did not return a tool_use block', true);
      }

      const raw = JSON.stringify(toolUse.input);
      return { json: toolUse.input, raw, provider: 'anthropic', model: this.model };
    } catch (err: any) {
      if (err instanceof GenerationProviderError) throw err;
      if (err?.name === 'AbortError' || controller.signal.aborted) {
        throw new GenerationProviderError('Anthropic request timed out', true);
      }
      throw new GenerationProviderError(err?.message ?? 'Anthropic request failed', false);
    } finally {
      clearTimeout(timer);
    }
  }
}
