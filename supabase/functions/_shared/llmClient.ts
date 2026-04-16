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

// Groq equivalents — used as fallback when Anthropic credits are exhausted
const GROQ_MODEL_MAP: Record<LLMModel, string> = {
  haiku: 'llama-3.1-8b-instant',
  sonnet: 'llama-3.3-70b-versatile',
};

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Call Groq (OpenAI-compatible API) as a fallback when Anthropic is unavailable.
 */
async function callGroq(
  prompt: string,
  model: LLMModel,
  options: { max_tokens: number; temperature: number; system?: string; json_mode: boolean }
): Promise<LLMResponse> {
  const apiKey = Deno.env.get('GROQ_API_KEY');
  if (!apiKey) throw new Error('Missing GROQ_API_KEY — cannot fall back to Groq');

  const groqModel = GROQ_MODEL_MAP[model];

  const messages: Array<{ role: string; content: string }> = [];
  if (options.system) {
    messages.push({ role: 'system', content: options.system });
  }

  let userContent = prompt;
  if (options.json_mode && !prompt.includes('Return JSON')) {
    userContent = prompt + '\n\nReturn your response as valid JSON only, with no additional text.';
  }
  messages.push({ role: 'user', content: userContent });

  const body: Record<string, unknown> = {
    model: groqModel,
    messages,
    max_tokens: options.max_tokens,
    temperature: options.temperature,
  };

  if (options.json_mode) {
    body.response_format = { type: 'json_object' };
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';

  return {
    content,
    model: groqModel,
    input_tokens: data.usage?.prompt_tokens || 0,
    output_tokens: data.usage?.completion_tokens || 0,
  };
}

/**
 * Unified LLM caller for Claude Haiku and Sonnet.
 * Falls back to Groq automatically if Anthropic credits are exhausted.
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
    return callGroq(prompt, model, { max_tokens, temperature, system, json_mode });
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
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        const errorBody = await response.text();

        // Credit exhausted — fall back to Groq immediately (no retry)
        if (response.status === 400 && errorBody.includes('credit balance is too low')) {
          return callGroq(prompt, model, { max_tokens, temperature, system, json_mode });
        }

        // Rate limit — wait and retry (cap at 8s to avoid function timeout)
        if (response.status === 429 && attempt < MAX_RETRIES) {
          const retryAfter = parseInt(response.headers.get('retry-after') || '2', 10);
          const waitMs = Math.min(retryAfter * 1000, 8000);
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }

        // Overloaded — retry with backoff (cap at 8s)
        if (response.status === 529 && attempt < MAX_RETRIES) {
          const waitMs = Math.min(RETRY_DELAY_MS * attempt * 2, 8000);
          await new Promise((r) => setTimeout(r, waitMs));
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
        const backoff = Math.min(RETRY_DELAY_MS * Math.pow(2, attempt - 1), 8000);
        await new Promise((r) => setTimeout(r, backoff));
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
