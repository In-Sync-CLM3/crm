/**
 * Groq API client for fast classification at volume.
 * Used by feature-signal-extractor and Vapi real-time inference.
 */

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 500;

interface GroqOptions {
  model?: string;
  max_tokens?: number;
  temperature?: number;
  json_mode?: boolean;
}

interface GroqResponse {
  content: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
}

/**
 * Call Groq API for fast inference.
 * Default model: llama-3.3-70b-versatile (fast, good at classification).
 */
export async function callGroq(
  prompt: string,
  options: GroqOptions = {}
): Promise<GroqResponse> {
  const {
    model = 'llama-3.3-70b-versatile',
    max_tokens = 1024,
    temperature = 0.2,
    json_mode = false,
  } = options;

  const apiKey = Deno.env.get('GROQ_API_KEY');
  if (!apiKey) {
    throw new Error('Missing GROQ_API_KEY environment variable');
  }

  const body: Record<string, unknown> = {
    model,
    max_tokens,
    temperature,
    messages: [{ role: 'user', content: prompt }],
  };

  if (json_mode) {
    body.response_format = { type: 'json_object' };
  }

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorBody = await response.text();

        // Rate limit — retry
        if (response.status === 429 && attempt < MAX_RETRIES) {
          const retryAfter = parseInt(response.headers.get('retry-after') || '2', 10);
          await new Promise((r) => setTimeout(r, retryAfter * 1000));
          continue;
        }

        throw new Error(`Groq API error ${response.status}: ${errorBody}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      return {
        content,
        model: data.model || model,
        input_tokens: data.usage?.prompt_tokens || 0,
        output_tokens: data.usage?.completion_tokens || 0,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
        continue;
      }
    }
  }

  throw lastError || new Error('Groq call failed after retries');
}

/**
 * Call Groq and parse response as JSON.
 * Strips markdown code fences if present.
 */
export async function callGroqJson<T = unknown>(
  prompt: string,
  options: Omit<GroqOptions, 'json_mode'> = {}
): Promise<{ data: T; tokens: { input: number; output: number } }> {
  const response = await callGroq(prompt, { ...options, json_mode: true });

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
      `Failed to parse Groq JSON response: ${parseError}. Raw: ${jsonStr.substring(0, 200)}`
    );
  }
}
