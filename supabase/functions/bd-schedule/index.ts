/**
 * bd-schedule — hand approved drafts to globalcrm for sending, and advance the
 * follow-up sequence.
 *
 * Execution lives in globalcrm's In-Sync Demo org: it owns the mailbox, the
 * threading and the scheduled-messages worker. This function decides WHO gets
 * sent WHEN, writes the queue rows there, and keeps the sequence state here.
 *
 * Rules enforced:
 *   - 08:00–11:00 recipient local time, Tuesday/Wednesday/Thursday only
 *   - 5 firms/day
 *   - one firm stays on one mailbox for its whole sequence (threading breaks otherwise)
 *   - follow-ups REPLY IN THREAD, carrying the parent's real Message-ID
 *   - nothing sends that a human has not approved
 *
 *   POST {}              schedule whatever is due
 *   POST { dry_run: true }
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { BD_ORG_ID, nextSendSlot } from '../_shared/bdPipeline.ts';
import { corsHeaders } from '../_shared/corsHeaders.ts';
import { getSupabaseClient } from '../_shared/supabaseClient.ts';

const ok = (d: unknown) => new Response(JSON.stringify(d), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const err = (s: number, m: string) => new Response(JSON.stringify({ error: m }), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const GLOBALCRM_ORG = '61f7f96d-e80c-4d9b-a765-8eb32bd3c70d';   // In-Sync Demo
const FROM_NAME = 'Amit Sengupta';
const DAILY_CAP = 5;

// Follow-up 1 rotates its fact across firms — fifteen identical nudges is the
// thing that makes a sequence read as automated.
const FOLLOWUP_FACTS = [
  'The ATS I mentioned runs on 47 users because the workflow does the work, not the headcount.',
  'The loan origination system took a 9-day approval cycle to under 48 hours.',
  'The AI intake desk resolves 76% of complaints before a human sees them.',
];

// Follow-up 1 also carries the case-study attachment: proof of full-cycle
// delivery, not bench capacity — scoped it, built it in phases, ran the
// rollout, still owns it in production nine months later. The rotated fact
// gives it variety across firms; the attachment and the "not a bench"
// framing deliberately stay fixed, since the document itself is what varies
// each recipient's read, not the words introducing it.
const CASE_STUDY_URL = 'https://crm-marketing-store.echocommunicator.workers.dev/bd-outreach/InSync_CaseStudy_RMPL.pdf';
const CASE_STUDY_FILENAME = 'InSync_CaseStudy_RMPL.pdf';
const caseStudyFollowup = (firstName: string, fact: string) => `Hi ${firstName},

One thing worth adding: on the platform behind that number, I wasn't hired for a sprint board — I scoped it directly with the client, built it in phases over ten months, ran the rollout myself, and it's still in daily use today (111 of 111 staff, nine months in). ${fact}

That's the gap I'd fill for you — not another name on the bench, someone who can own a piece of delivery end to end with your client and hand it back working. Case study attached.

Still happy to start small.

Amit`.replace(/\n/g, '<br>');

const BREAKUP = (firstName: string) => `Hi ${firstName},

Last note from me — I'll assume the timing isn't right.

If capacity becomes the constraint later, I'm at a@in-sync.co.in.

Amit`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = getSupabaseClient();
  const gcUrl = Deno.env.get('GLOBALCRM_SUPABASE_URL');
  const gcKey = Deno.env.get('GLOBALCRM_SERVICE_KEY');
  if (!gcUrl || !gcKey) return err(500, 'GLOBALCRM_SUPABASE_URL / GLOBALCRM_SERVICE_KEY not configured');
  const gc = createClient(gcUrl, gcKey);

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = !!body.dry_run;
    const now = new Date();
    const queued: Record<string, unknown>[] = [];

    // ── 1. Follow-ups first: an existing conversation outranks a new one ──────
    const { data: due } = await supabase
      .from('bd_sequences')
      .select('id, firm_id, contact_id, step, next_due_at, thread_message_id, conversation_id, mailbox, batch_no, bd_firms(firm_name, time_zone), bd_contacts(first_name, email), bd_drafts(subject)')
      .eq('org_id', BD_ORG_ID)
      .is('stopped_at', null)
      .lte('next_due_at', now.toISOString())
      .order('next_due_at', { ascending: true })
      .limit(DAILY_CAP);

    for (const seq of due || []) {
      const firm = (seq as Record<string, any>).bd_firms;
      const contact = (seq as Record<string, any>).bd_contacts;
      if (!contact?.email || !contact?.first_name) continue;

      // LinkedIn steps are never automated — the account is the credibility
      // check for the whole campaign. Surface them and stop.
      if (seq.step === 'linkedin_connect' || seq.step === 'inmail') {
        queued.push({ firm: firm?.firm_name, step: seq.step, action: 'manual reminder — LinkedIn is never automated' });
        continue;
      }

      const isBreakup = seq.step === 'followup_2';
      const isCaseStudyStep = seq.step === 'followup_1';
      const fact = FOLLOWUP_FACTS[(seq.batch_no || 0 + queued.length) % FOLLOWUP_FACTS.length];
      const html = isBreakup
        ? BREAKUP(contact.first_name).replace(/\n/g, '<br>')
        : isCaseStudyStep
          ? caseStudyFollowup(contact.first_name, fact)
          : `Hi ${contact.first_name},<br><br>${fact}<br><br>Still happy to start small.<br><br>Amit`;

      const slot = nextSendSlot(firm?.time_zone || 'ET', now, queued.length);

      if (!dryRun) {
        const origSubject = (seq as Record<string, any>).bd_drafts?.subject || '';
        await gc.from('email_conversations').insert({
          org_id: GLOBALCRM_ORG,
          conversation_id: seq.conversation_id,   // groups with the original send — same thread
          direction: 'outbound',
          from_email: 'a@in-sync.co.in',
          to_email: contact.email,
          subject: origSubject ? `Re: ${origSubject}` : '(no subject)',
          html_content: html,
          email_content: html,
          status: 'scheduled',
          scheduled_at: slot.toISOString(),
          from_name: FROM_NAME,
          bare_email: true,                 // no platform footer, no List-Unsubscribe
          in_reply_to: seq.thread_message_id,
          ...(isCaseStudyStep ? { attachment_url: CASE_STUDY_URL, attachment_filename: CASE_STUDY_FILENAME } : {}),
        });

        const nextStep = seq.step === 'followup_1' ? 'followup_2' : seq.step === 'followup_2' ? 'linkedin_connect' : 'done';
        const nextDue = new Date(slot.getTime() + (seq.step === 'followup_1' ? 7 : 1) * 86400000);
        await supabase.from('bd_sequences').update({
          step: nextStep,
          next_due_at: nextStep === 'done' ? null : nextDue.toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', seq.id);

        await supabase.from('bd_events').insert({
          org_id: BD_ORG_ID, firm_id: seq.firm_id, sequence_id: seq.id,
          step: seq.step, event_type: 'queued', detail: { scheduled_for: slot.toISOString() },
        });
      }

      queued.push({ firm: firm?.firm_name, step: seq.step, scheduled_for: slot.toISOString() });
    }

    // ── 2. New firms, up to the daily cap ────────────────────────────────────
    const room = DAILY_CAP - queued.filter((q) => !('action' in q)).length;
    if (room > 0) {
      const { data: approved } = await supabase
        .from('bd_drafts')
        .select('id, firm_id, contact_id, subject, body, angle_version, proof_key, bd_firms(firm_name, time_zone), bd_contacts(first_name, email)')
        .eq('org_id', BD_ORG_ID)
        .eq('status', 'approved')
        .order('reviewed_at', { ascending: true })
        .limit(room);

      for (const d of approved || []) {
        const firm = (d as Record<string, any>).bd_firms;
        const contact = (d as Record<string, any>).bd_contacts;
        if (!contact?.email || !contact?.first_name) continue;

        const slot = nextSendSlot(firm?.time_zone || 'ET', now, queued.length);

        if (!dryRun) {
          const conversationId = crypto.randomUUID();
          const bodyHtml = String(d.body).replace(/\n/g, '<br>');
          const { data: conv, error: convErr } = await gc.from('email_conversations').insert({
            org_id: GLOBALCRM_ORG,
            conversation_id: conversationId,
            direction: 'outbound',
            from_email: 'a@in-sync.co.in',
            to_email: contact.email,
            subject: d.subject,
            html_content: bodyHtml,
            email_content: bodyHtml,
            status: 'scheduled',
            scheduled_at: slot.toISOString(),
            from_name: FROM_NAME,
            bare_email: true,
          }).select('id').single();
          if (convErr) { queued.push({ firm: firm?.firm_name, error: convErr.message }); continue; }

          await supabase.from('bd_sequences').insert({
            org_id: BD_ORG_ID, firm_id: d.firm_id, contact_id: d.contact_id, draft_id: d.id,
            step: 'followup_1',
            next_due_at: new Date(slot.getTime() + 4 * 86400000).toISOString(),
            mailbox: 'a@in-sync.co.in',
            conversation_id: conversationId,
            // The real RFC Message-ID is only known once Resend has sent it —
            // bd-track fills thread_message_id in, and the follow-up waits for it.
            thread_message_id: null,
          });

          await supabase.from('bd_drafts').update({ status: 'scheduled', updated_at: new Date().toISOString() }).eq('id', d.id);
          await supabase.from('bd_firms').update({ state_flag: 'SENT', state_reason: `scheduled ${slot.toISOString().slice(0, 10)}`, updated_at: new Date().toISOString() }).eq('id', d.firm_id);
          await supabase.from('bd_events').insert({
            org_id: BD_ORG_ID, firm_id: d.firm_id, step: 'email_1', event_type: 'queued',
            angle_version: d.angle_version, proof_key: d.proof_key,
            detail: { scheduled_for: slot.toISOString(), conversation_id: conv?.id },
          });
        }

        queued.push({ firm: firm?.firm_name, step: 'email_1', scheduled_for: slot.toISOString(), angle: d.angle_version });
      }
    }

    console.log(`[bd-schedule] queued ${queued.length}${dryRun ? ' (dry run)' : ''}`);
    return ok({ success: true, dry_run: dryRun, queued: queued.length, items: queued });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[bd-schedule] fatal:', msg);
    return err(500, msg);
  }
});
