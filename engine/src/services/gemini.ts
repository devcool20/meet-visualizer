import { GoogleGenAI, Type } from '@google/genai';
import { config } from '../config.js';
import { cacheService } from './cache.js';

export interface GeminiIntentResponse {
  intent_triggered: boolean;
  target_visualization_type: 'graph' | 'image' | 'text_card' | 'null';
  notion_data_key_anchor: string;
  contextual_confidence_score: number;
}

type PreWarmCallback = (anchor: string) => void;
type ActionCallback = (anchor: string, response: GeminiIntentResponse) => void;

class GeminiService {
  private ai: GoogleGenAI | null = null;
  private transcriptBuffer = '';
  private preWarmCallbacks: PreWarmCallback[] = [];
  private actionCallbacks: ActionCallback[] = [];

  // Predictive pre-warm phrase mappings
  private preWarmMatchers = [
    { phrases: ['financial growth', 'q2 financial', 'growth charts', 'the charts', 'financial chart'], anchor: 'q2_financials' },
    { phrases: ['platform architecture', 'architecture map', 'system architecture', 'updated platform'], anchor: 'sys_architecture_v2' },
    { phrases: ['core values', 'security protocols', 'security compliance', 'uncompromising security'], anchor: 'security_compliance' }
  ];

  constructor() {
    if (config.geminiApiKey) {
      this.ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
      console.log('[Gemini] Service initialized with API Key.');
    } else {
      console.log('[Gemini] No API Key found. Operating in simulation mock mode.');
    }
  }

  onPreWarm(cb: PreWarmCallback) {
    this.preWarmCallbacks.push(cb);
  }

  onAction(cb: ActionCallback) {
    this.actionCallbacks.push(cb);
  }

  /**
   * Appends new transcript token and triggers processing
   */
  async processSpeechToken(token: string): Promise<void> {
    this.transcriptBuffer += ' ' + token;
    
    // Maintain a rolling window of the last 600 characters
    if (this.transcriptBuffer.length > 600) {
      this.transcriptBuffer = this.transcriptBuffer.substring(this.transcriptBuffer.length - 600);
    }

    const currentText = this.transcriptBuffer.trim().toLowerCase();
    console.log(`[Gemini STT Window]: "${currentText}"`);

    // 1. Predictive Pre-warm Check (runs mid-sentence, 1.5s ahead)
    this.runPredictivePreWarm(currentText);

    // 2. Full Structured Intent Parsing
    try {
      const parsedIntent = await this.parseIntent(currentText);
      
      if (parsedIntent.intent_triggered) {
        console.log(`[Gemini Intent Flagged]:`, parsedIntent);
        
        // 3. Confidence Gate
        if (parsedIntent.contextual_confidence_score >= config.confidenceThreshold) {
          // Verify anchor exists in cache
          const cacheKey = `notion:${parsedIntent.notion_data_key_anchor}`;
          const exists = await cacheService.exists(cacheKey);
          
          if (exists) {
            console.log(`[Gemini Active Trigger]: Resolution approved for anchor: ${parsedIntent.notion_data_key_anchor}`);
            this.actionCallbacks.forEach(cb => cb(parsedIntent.notion_data_key_anchor, parsedIntent));
          } else {
            console.warn(`[Gemini Trigger Warning]: Intent parsed anchor "${parsedIntent.notion_data_key_anchor}" but it is missing from Notion cache.`);
          }
        } else {
          console.log(`[Gemini Confidence Gate]: Blocked intent. Confidence (${parsedIntent.contextual_confidence_score}) < Threshold (${config.confidenceThreshold})`);
        }
      }
    } catch (err) {
      console.error('[Gemini Parsing Error]:', err);
    }
  }

  clearBuffer() {
    this.transcriptBuffer = '';
  }

  private runPredictivePreWarm(text: string) {
    for (const matcher of this.preWarmMatchers) {
      for (const phrase of matcher.phrases) {
        if (text.includes(phrase)) {
          console.log(`[Predictive Pre-Warm]: Token match for "${phrase}". Pre-warming canvas for anchor "${matcher.anchor}"`);
          this.preWarmCallbacks.forEach(cb => cb(matcher.anchor));
          return; // Trigger only one pre-warm per token wave
        }
      }
    }
  }

  private async parseIntent(text: string): Promise<GeminiIntentResponse> {
    if (!this.ai) {
      return this.simulateGeminiIntent(text);
    }

    // Call Gemini API with Structured Outputs (responseSchema)
    const systemInstruction = 
      `System Role: Low-latency B2B Intent Mapping Parsing Engine.\n` +
      `Context: You are analyzing streaming text inputs from a live sales/corporate presentation.\n` +
      `Objective: Extract the user's intent to display a visualization. Map it to specific structural keys.\n` +
      `Constraint: Do NOT hallucinate data points. Return a structured JSON block matching the schema definitions exactly.\n` +
      `Available notion_data_key_anchor values: 'q2_financials', 'sys_architecture_v2', 'security_compliance'.`;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: `Analyze this streaming text for presentation overlay triggers: "${text}"`,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              intent_triggered: { type: Type.BOOLEAN },
              target_visualization_type: { 
                type: Type.STRING, 
                enum: ['graph', 'image', 'text_card', 'null'] 
              },
              notion_data_key_anchor: { type: Type.STRING },
              contextual_confidence_score: { type: Type.NUMBER }
            },
            required: ['intent_triggered', 'target_visualization_type', 'notion_data_key_anchor', 'contextual_confidence_score']
          }
        }
      });

      const responseText = response.text || '{}';
      const parsed: GeminiIntentResponse = JSON.parse(responseText);
      return parsed;
    } catch (e) {
      console.error('[Gemini API Connection failed]:', e);
      return this.simulateGeminiIntent(text);
    }
  }

  // Smart local simulation for testing when API keys are absent
  private simulateGeminiIntent(text: string): GeminiIntentResponse {
    const textLower = text.toLowerCase();
    
    // Default response: no intent
    const defaultRes: GeminiIntentResponse = {
      intent_triggered: false,
      target_visualization_type: 'null',
      notion_data_key_anchor: '',
      contextual_confidence_score: 0.0
    };

    if (textLower.includes('financial growth') || textLower.includes('q2 financial') || textLower.includes('growth charts')) {
      return {
        intent_triggered: true,
        target_visualization_type: 'graph',
        notion_data_key_anchor: 'q2_financials',
        contextual_confidence_score: 0.95
      };
    }
    
    if (textLower.includes('platform architecture') || textLower.includes('architecture map') || textLower.includes('system architecture')) {
      return {
        intent_triggered: true,
        target_visualization_type: 'image',
        notion_data_key_anchor: 'sys_architecture_v2',
        contextual_confidence_score: 0.92
      };
    }

    if (textLower.includes('security protocols') || textLower.includes('security compliance') || textLower.includes('uncompromising security')) {
      return {
        intent_triggered: true,
        target_visualization_type: 'text_card',
        notion_data_key_anchor: 'security_compliance',
        contextual_confidence_score: 0.96
      };
    }

    // Trigger low confidence for partial queries (used to test the gate)
    if (textLower.includes('charts') || textLower.includes('compliance')) {
      return {
        intent_triggered: true,
        target_visualization_type: 'text_card',
        notion_data_key_anchor: textLower.includes('charts') ? 'q2_financials' : 'security_compliance',
        contextual_confidence_score: 0.72 // Should be rejected by confidence gate
      };
    }

    return defaultRes;
  }
}

export const geminiService = new GeminiService();
