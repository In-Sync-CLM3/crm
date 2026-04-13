import { getSupabaseClient } from '../_shared/supabaseClient.ts';
import { jsonResponse, errorResponse, handleCors } from '../_shared/responseHelpers.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const supabase = getSupabaseClient();

    console.log('Starting daily lead scoring job...');

    // Get all contacts with pipeline stage info
    const { data: allContacts, error: contactsError } = await supabase
      .from('contacts')
      .select(`
        id,
        org_id,
        first_name,
        last_name,
        email,
        phone,
        company,
        job_title,
        status,
        source,
        city,
        state,
        country,
        website,
        notes,
        created_at,
        pipeline_stage_id,
        pipeline_stages!inner(
          id,
          name,
          stage_order,
          probability
        )
      `)
      .limit(100); // Process 100 contacts per run to avoid timeouts

    if (contactsError) {
      console.error('Error fetching contacts:', contactsError);
      throw contactsError;
    }

    // Get existing scores
    const { data: existingScores, error: scoresError } = await supabase
      .from('contact_lead_scores')
      .select('contact_id, last_calculated');

    if (scoresError) {
      console.error('Error fetching scores:', scoresError);
      throw scoresError;
    }

    // Filter contacts that need scoring - TEMPORARILY PROCESS ALL
    const contacts = allContacts || [];

    console.log(`Found ${contacts.length} contacts to score`);

    if (contacts.length === 0) {
      return jsonResponse({ message: 'No contacts need scoring', processed: 0 });
    }

    let processed = 0;
    let failed = 0;

    // Batch-fetch all activities for all contacts at once (eliminates N+1)
    const contactIds = contacts.map(c => c.id);
    const { data: allActivities } = await supabase
      .from('contact_activities')
      .select('contact_id, activity_type, created_at, completed_at')
      .in('contact_id', contactIds)
      .order('created_at', { ascending: false });

    // Group activities by contact_id
    const activitiesByContact: Record<string, any[]> = {};
    for (const act of allActivities || []) {
      if (!activitiesByContact[act.contact_id]) activitiesByContact[act.contact_id] = [];
      // Keep only last 20 per contact
      if (activitiesByContact[act.contact_id].length < 20) {
        activitiesByContact[act.contact_id].push(act);
      }
    }

    // Build enriched payloads for all contacts
    const now = new Date();
    const contactPayloads = contacts.map(contact => {
      const activities = activitiesByContact[contact.id] || [];
      const lastActivity = activities[0]?.created_at
        ? new Date(activities[0].created_at)
        : null;
      const daysSinceLastActivity = lastActivity
        ? Math.floor((now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24))
        : 999;
      const activityCounts = activities.reduce((acc: any, act: any) => {
        acc[act.activity_type] = (acc[act.activity_type] || 0) + 1;
        return acc;
      }, {});

      return {
        contact,
        body: {
          contact: {
            id: contact.id,
            first_name: contact.first_name,
            last_name: contact.last_name,
            email: contact.email,
            phone: contact.phone,
            company: contact.company,
            job_title: contact.job_title,
            status: contact.status,
            source: contact.source,
            city: contact.city,
            state: contact.state,
            country: contact.country,
            website: contact.website,
            notes: contact.notes,
            created_at: contact.created_at,
            pipeline_stage: contact.pipeline_stages,
            engagement_metrics: {
              total_activities: activities.length,
              last_activity_date: lastActivity?.toISOString(),
              days_since_last_activity: daysSinceLastActivity,
              meetings_count: activityCounts['meeting'] || 0,
              calls_count: activityCounts['call'] || 0,
              emails_count: activityCounts['email'] || 0,
            }
          }
        }
      };
    });

    // Batch invoke analyze-lead with concurrency limit of 10
    const CONCURRENCY = 10;
    for (let i = 0; i < contactPayloads.length; i += CONCURRENCY) {
      const batch = contactPayloads.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(async ({ contact, body }) => {
          console.log(`Scoring contact: ${contact.first_name} ${contact.last_name} (${contact.id})`);

          const { data: scoreData, error: scoreError } = await supabase.functions.invoke('analyze-lead', { body });

          if (scoreError) throw new Error(`Score error: ${scoreError.message}`);
          if (!scoreData?.score) throw new Error('Invalid score data');

          const { error: upsertError } = await supabase
            .from('contact_lead_scores')
            .upsert({
              contact_id: contact.id,
              org_id: contact.org_id,
              score: scoreData.score,
              score_category: scoreData.category?.toLowerCase() || 'cold',
              score_breakdown: scoreData.breakdown || {},
              last_calculated: new Date().toISOString(),
            }, { onConflict: 'contact_id' });

          if (upsertError) throw upsertError;

          console.log(`Successfully scored contact ${contact.id}: ${scoreData.score}/100 (${scoreData.category})`);
          return contact.id;
        })
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          processed++;
        } else {
          console.error('Scoring failed:', result.reason);
          failed++;
        }
      }
    }

    console.log(`Daily lead scoring complete. Processed: ${processed}, Failed: ${failed}`);

    return jsonResponse({
      message: 'Daily lead scoring complete',
      processed,
      failed,
      total: contacts.length,
    });

  } catch (error) {
    console.error('Error in daily-lead-scoring function:', error);
    return errorResponse(error);
  }
});
