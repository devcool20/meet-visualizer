/**
 * AWS Bedrock & Bedrock Mantle generation provider.
 *
 * Supports two authentication pathways:
 * 1. Bedrock Mantle / Workbench API Key (e.g. ABSK... / MantleApiKey-...) -> calls
 *    https://bedrock-mantle.{region}.api.aws/v1/chat/completions with structured output.
 * 2. AWS IAM Credentials (AKIA... / ASIA...) -> calls ConverseCommand on
 *    @aws-sdk/client-bedrock-runtime.
 */
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import type { GenerationProvider, AiProviderId, StructuredRequest, StructuredResult } from './provider.js';
import { GenerationProviderError } from './provider.js';

export interface BedrockProviderDeps {
  client?: BedrockRuntimeClient;
  fetchImpl?: typeof fetch;
}

export class BedrockGenerationProvider implements GenerationProvider {
  readonly id: AiProviderId = 'bedrock';
  readonly model: string;
  private client?: BedrockRuntimeClient;
  private apiKeyToken?: string;
  private region: string;
  private fetchFn: typeof fetch;

  constructor(
    model: string,
    credentials?: {
      accessKeyId?: string;
      secretAccessKey?: string;
      sessionToken?: string;
      region?: string;
      apiKey?: string;
    },
    deps?: BedrockProviderDeps,
  ) {
    this.model = model || process.env.BEDROCK_MODEL_ID || 'qwen.qwen3-32b-v1:0';
    this.region = credentials?.region || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
    this.fetchFn = deps?.fetchImpl ?? globalThis.fetch;

    const token =
      credentials?.apiKey ||
      process.env.AWS_BEARER_TOKEN_BEDROCK ||
      process.env.AWS_BEDROCK_API_KEY ||
      process.env.BEDROCK_API_KEY ||
      (credentials?.accessKeyId && credentials.accessKeyId.startsWith('ABSK') ? credentials.accessKeyId : '');

    if (token) {
      this.apiKeyToken = token.trim();
    }

    if (deps?.client) {
      this.client = deps.client;
    } else if (credentials?.accessKeyId && credentials?.secretAccessKey && !this.apiKeyToken) {
      const clientConfig: any = { region: this.region };
      clientConfig.credentials = {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
      };
      this.client = new BedrockRuntimeClient(clientConfig);
    }
  }

  async generateStructured(req: StructuredRequest): Promise<StructuredResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), req.timeoutMs);

    try {
      const systemPrompt = `${req.system}

CRITICAL: You must return ONLY a valid, parseable JSON object matching this schema. Do not enclose the output in markdown code blocks, backticks, or any conversational preamble:
${JSON.stringify(req.schema, null, 2)}`;

      // Pathway 1: Bedrock Mantle OpenAI-compatible API Gateway
      if (this.apiKeyToken) {
        const mantleUrl = `https://bedrock-mantle.${this.region}.api.aws/v1/chat/completions`;
        const res = await this.fetchFn(mantleUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKeyToken}`,
          },
          body: JSON.stringify({
            model: this.model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: req.user },
            ],
            response_format: { type: 'json_object' },
            max_tokens: req.maxOutputTokens,
            temperature: 0.1,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          // Retry without response_format if provider doesn't support json_object mode
          const fallbackRes = await this.fetchFn(mantleUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.apiKeyToken}`,
            },
            body: JSON.stringify({
              model: this.model,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: req.user },
              ],
              max_tokens: req.maxOutputTokens,
              temperature: 0.1,
            }),
            signal: controller.signal,
          });

          if (!fallbackRes.ok) {
            const errBody = await fallbackRes.text();
            throw new GenerationProviderError(`Bedrock Mantle API error (${fallbackRes.status}): ${errBody}`, fallbackRes.status >= 500 || fallbackRes.status === 429, fallbackRes.status);
          }

          const json = await fallbackRes.json();
          const rawContent = json.choices?.[0]?.message?.content ?? '';
          return this.parseAndReturn(rawContent, this.model);
        }

        const json = await res.json();
        const rawContent = json.choices?.[0]?.message?.content ?? '';
        return this.parseAndReturn(rawContent, this.model);
      }

      // Pathway 2: AWS Bedrock Runtime Client (IAM Auth)
      if (!this.client) {
        this.client = new BedrockRuntimeClient({ region: this.region });
      }

      const command = new ConverseCommand({
        modelId: this.model,
        messages: [
          {
            role: 'user',
            content: [{ text: req.user }],
          },
        ],
        system: [{ text: systemPrompt }],
        inferenceConfig: {
          maxTokens: req.maxOutputTokens,
          temperature: 0.1,
        },
      });

      const response = await this.client.send(command, { abortSignal: controller.signal });
      const rawText = response.output?.message?.content?.[0]?.text?.trim() ?? '';

      return this.parseAndReturn(rawText, this.model);
    } catch (err: any) {
      if (err instanceof GenerationProviderError) throw err;
      if (err?.name === 'AbortError' || controller.signal.aborted) {
        throw new GenerationProviderError('AWS Bedrock request timed out', true);
      }
      const status = err?.$metadata?.httpStatusCode ?? err?.status ?? 0;
      throw new GenerationProviderError(
        err?.message ?? 'AWS Bedrock request failed',
        status >= 500 || status === 429,
        status,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private parseAndReturn(rawText: string, model: string): StructuredResult {
    if (!rawText || !rawText.trim()) {
      throw new GenerationProviderError('Empty response from AWS Bedrock', false);
    }

    let cleaned = rawText.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Try to match the first JSON object inside the text if surrounding commentary exists
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch {
          throw new GenerationProviderError(`AWS Bedrock returned invalid JSON: ${rawText.slice(0, 200)}`, true);
        }
      } else {
        throw new GenerationProviderError(`AWS Bedrock returned non-JSON: ${rawText.slice(0, 200)}`, true);
      }
    }

    return {
      json: parsed,
      raw: rawText,
      provider: 'bedrock',
      model: model,
    };
  }
}
