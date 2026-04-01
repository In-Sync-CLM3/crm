import { logEngine } from './engineLogger.ts';

type LLMModel = 'haiku' | 'sonnet';

interface LLMOptions {
  model?: LLMModel;
  json_mode?: boolean;
  max_tokens?: number;
  temperature?: number;
  system?: string;
}

interface LLMResponse {
  content: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
}

const MODEL_MAP: Record<LLMModel, string> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
};

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Unified LLM caller for Claude Haiku and Sonnet.
 * Routes to the correct model, handles retries, tracks tokens.
 */
export async function callLLM(
  prompt: string,
  options: LLMOptions = {}
): Promise<LLMResponse> {
  const {
    model = 'haiku',
    json_mode = false,
    max_tokens = 1024,
    temperature = 0.3,
    system,
  } = options;

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY environment variable');
  }

  const modelId = MODEL_MAP[model];
  const messages = [{ role: 'user', content: prompt }];

  const body: Record<string, unknown> = {
    model: modelId,
    max_tokens,
    temperature,
    messages,
  };

  if (system) {
    body.system = system;
  }

  // Force JSON output by adding instruction if json_mode is true
  if (json_mode && !prompt.includes('Return JSON')) {
    messages[0].content = prompt + '\n\nReturn your response as valid JSON only, with no additional text.';
  }

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorBody = await response.text();

        // Rate limit — wait and retry
        if (response.status === 429 && attempt < MAX_RETRIES) {
          const retryAfter = parseInt(response.headers.get('retry-after') || '5', 10);
          await new Promise((r) => setTimeout(r, retryAfter * 1000));
          continue;
        }

        // Overloaded — retry with backoff
        if (response.status === 529 && attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
          continue;
        }

        throw new Error(`Anthropic API error ${response.status}: ${errorBody}`);
      }

      const data = await response.json();
      const textBlock = data.content?.find((b: { type: string }) => b.type === 'text');
      const content = textBlock?.text || '';

      return {
        content,
        model: modelId,
        input_tokens: data.usage?.input_tokens || 0,
        output_tokens: data.usage?.output_tokens || 0,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
        continue;
      }
    }
  }

  throw lastError || new Error('LLM call failed after retries');
}

/**
 * Call LLM and parse the response as JSON.
 * Handles markdown code fences that the LLM sometimes wraps JSON in.
 */
export async function callLLMJson<T = unknown>(
  prompt: string,
  options: Omit<LLMOptions, 'json_mode'> = {}
): Promise<{ data: T; tokens: { input: number; output: number } }> {
  const response = await callLLM(prompt, { ...options, json_mode: true });

  let jsonStr = response.content.trim();

  // Strip markdown code fences if present
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  try {
    const data = JSON.parse(jsonStr) as T;
    return {
      data,
      tokens: {
        input: response.input_tokens,
        output: response.output_tokens,
      },
    };
  } catch (parseError) {
    throw new Error(
      `Failed to parse LLM JSON response: ${parseError}. Raw content: ${jsonStr.substring(0, 200)}`
    );
  }
}
