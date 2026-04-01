import { getSupabaseClient } from './supabaseClient.ts';
import { callLLM } from './llmClient.ts';

interface TimelineEntry {
  channel: string;
  direction: 'inbound' | 'outbound';
  summary: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

interface ConversationContext {
  timeline: TimelineEntry[];
  key_facts: string[];
  objections: string[];
  interests: string[];
  next_steps: string[];
}

interface MemoryRecord {
  id: string;
  lead_id: string;
  org_id: string;
  context: ConversationContext;
  token_count: number;
  last_channel: string | null;
  last_interaction_at: string | null;
  summary_count: number;
}

const DEFAULT_CONTEXT: ConversationContext = {
  timeline: [],
  key_facts: [],
  objections: [],
  interests: [],
  next_steps: [],
};

// Approximate token limit before summarisation kicks in
const TOKEN_LIMIT = 3000;
// Rough estimate: 1 token ≈ 4 characters
const CHARS_PER_TOKEN = 4;

function estimateTokens(context: ConversationContext): number {
  const jsonStr = JSON.stringify(context);
  return Math.ceil(jsonStr.length / CHARS_PER_TOKEN);
}

/**
 * Fetch conversation memory for a lead.
 * Returns the unified cross-channel context.
 */
export async function getMemory(leadId: string): Promise<ConversationContext> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('mkt_conversation_memory')
    .select('context')
    .eq('lead_id', leadId)
    .single();

  if (error || !data) {
    return { ...DEFAULT_CONTEXT };
  }

  return data.context as ConversationContext;
}

/**
 * Get the full memory record (including metadata).
 */
export async function getMemoryRecord(leadId: string): Promise<MemoryRecord | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('mkt_conversation_memory')
    .select('*')
    .eq('lead_id', leadId)
    .single();

  if (error || !data) return null;
  return data as MemoryRecord;
}

/**
 * Update conversation memory with a new interaction.
 * Appends to timeline, updates metadata, and summarises if needed.
 */
export async function updateMemory(
  leadId: string,
  orgId: string,
  channel: string,
  interaction: {
    direction: 'inbound' | 'outbound';
    summary: string;
    details?: Record<string, unknown>;
    key_facts?: string[];
    objections?: string[];
    interests?: string[];
    next_steps?: string[];
  }
): Promise<void> {
  const supabase = getSupabaseClient();

  // Fetch existing memory
  let context = await getMemory(leadId);

  // Append to timeline
  context.timeline.push({
    channel,
    direction: interaction.direction,
    summary: interaction.summary,
    timestamp: new Date().toISOString(),
    details: interaction.details,
  });

  // Merge arrays (deduplicate)
  if (interaction.key_facts) {
    context.key_facts = [...new Set([...context.key_facts, ...interaction.key_facts])];
  }
  if (interaction.objections) {
    context.objections = [...new Set([...context.objections, ...interaction.objections])];
  }
  if (interaction.interests) {
    context.interests = [...new Set([...context.interests, ...interaction.interests])];
  }
  if (interaction.next_steps) {
    // Replace next_steps rather than append — latest is most relevant
    context.next_steps = interaction.next_steps;
  }

  // Check if we need to summarise
  let tokenCount = estimateTokens(context);
  let summaryCount = 0;

  const existingRecord = await getMemoryRecord(leadId);
  if (existingRecord) {
    summaryCount = existingRecord.summary_count;
  }

  if (tokenCount > TOKEN_LIMIT) {
    context = await summariseContext(context);
    tokenCount = estimateTokens(context);
    summaryCount++;
  }

  // Upsert memory
  const { error } = await supabase
    .from('mkt_conversation_memory')
    .upsert(
      {
        lead_id: leadId,
        org_id: orgId,
        context,
        token_count: tokenCount,
        last_channel: channel,
        last_interaction_at: new Date().toISOString(),
        summary_count: summaryCount,
      },
      { onConflict: 'lead_id' }
    );

  if (error) {
    console.error('[ConversationMemory] Upsert failed:', error);
    throw error;
  }
}

/**
 * Summarise conversation context using Haiku when it gets too long.
 * Keeps the last 5 timeline entries intact, summarises the rest.
 */
async function summariseContext(context: ConversationContext): Promise<ConversationContext> {
  const recentEntries = context.timeline.slice(-5);
  const olderEntries = context.timeline.slice(0, -5);

  if (olderEntries.length === 0) return context;

  const olderText = olderEntries
    .map((e) => `[${e.timestamp}] ${e.channel} ${e.direction}: ${e.summary}`)
    .join('\n');

  const prompt = `Summarise this conversation history into 3-5 key bullet points. Keep only information that would be useful for personalising future outreach. Be concise.

Conversation history:
${olderText}

Existing key facts: ${context.key_facts.join(', ') || 'none'}
Existing objections: ${context.objections.join(', ') || 'none'}
Existing interests: ${context.interests.join(', ') || 'none'}

Return a JSON object:
{
  "summary_points": ["point1", "point2", ...],
  "key_facts": ["fact1", "fact2", ...],
  "objections": ["objection1", ...],
  "interests": ["interest1", ...]
}`;

  try {
    const response = await callLLM(prompt, {
      model: 'haiku',
      json_mode: true,
      max_tokens: 512,
      temperature: 0.2,
    });

    let jsonStr = response.content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(jsonStr);

    // Create a summary timeline entry to replace the older entries
    const summaryEntry: TimelineEntry = {
      channel: 'summary',
      direction: 'outbound',
      summary: `[Summarised ${olderEntries.length} interactions] ${parsed.summary_points?.join('; ') || ''}`,
      timestamp: olderEntries[olderEntries.length - 1]?.timestamp || new Date().toISOString(),
    };

    return {
      timeline: [summaryEntry, ...recentEntries],
      key_facts: parsed.key_facts || context.key_facts,
      objections: parsed.objections || context.objections,
      interests: parsed.interests || context.interests,
      next_steps: context.next_steps,
    };
  } catch (error) {
    console.error('[ConversationMemory] Summarisation failed, keeping as-is:', error);
    // On failure, just trim the timeline to prevent unbounded growth
    return {
      ...context,
      timeline: context.timeline.slice(-10),
    };
  }
}

/**
 * Build a context string for LLM personalisation prompts.
 * Returns a human-readable summary of the lead's conversation history.
 */
export function buildContextString(context: ConversationContext): string {
  const parts: string[] = [];

  if (context.key_facts.length > 0) {
    parts.push(`Key facts: ${context.key_facts.join('; ')}`);
  }

  if (context.interests.length > 0) {
    parts.push(`Interests: ${context.interests.join('; ')}`);
  }

  if (context.objections.length > 0) {
    parts.push(`Objections raised: ${context.objections.join('; ')}`);
  }

  if (context.next_steps.length > 0) {
    parts.push(`Next steps discussed: ${context.next_steps.join('; ')}`);
  }

  const recentInteractions = context.timeline.slice(-3);
  if (recentInteractions.length > 0) {
    parts.push(
      'Recent interactions:\n' +
        recentInteractions
          .map((e) => `- ${e.channel} (${e.direction}): ${e.summary}`)
          .join('\n')
    );
  }

  return parts.join('\n') || 'No prior conversation history.';
}
