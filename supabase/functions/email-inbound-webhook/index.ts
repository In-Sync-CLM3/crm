import { getSupabaseClient } from '../_shared/supabaseClient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Verify webhook signature using Web Crypto API
async function verifyWebhookSignature(
  secret: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string,
  body: string
): Promise<boolean> {
  try {
    // Extract the signature (format: "v1,signature1 v1,signature2")
    const signatures = svixSignature.split(' ').map(sig => {
      const parts = sig.split(',');
      return parts.length === 2 ? parts[1] : null;
    }).filter(Boolean);

    if (signatures.length === 0) {
      return false;
    }

    // Construct the signed content: id.timestamp.body
    const signedContent = `${svixId}.${svixTimestamp}.${body}`;
    
    // Convert secret to key — secret after 'whsec_' is base64-encoded, must decode first
    const encoder = new TextEncoder();
    const base64Secret = secret.replace('whsec_', '');
    const keyData = Uint8Array.from(atob(base64Secret), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    // Generate signature
    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(signedContent)
    );

    // Convert to base64
    const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));

    // Check if any of the provided signatures match
    return signatures.some(sig => sig === signatureBase64);
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

interface ResendInboundPayload {
  messageId: string;
  from: string;
  fromName?: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    contentType: string;
    size: number;
    url?: string;
  }>;
  threadId?: string;
  inReplyTo?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = getSupabaseClient();

    // Verify webhook signature
    const webhookSecret = Deno.env.get('RESEND_WEBHOOK_SECRET');
    if (!webhookSecret) {
      console.error('RESEND_WEBHOOK_SECRET not configured');
      return new Response(
        JSON.stringify({ error: 'Webhook secret not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract Svix headers
    const svixId = req.headers.get('svix-id');
    const svixTimestamp = req.headers.get('svix-timestamp');
    const svixSignature = req.headers.get('svix-signature');

    if (!svixId || !svixTimestamp || !svixSignature) {
      console.error('Missing Svix headers');
      return new Response(
        JSON.stringify({ error: 'Missing signature headers' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get raw body for verification
    const body = await req.text();

    // Verify the webhook signature
    const isValid = await verifyWebhookSignature(
      webhookSecret,
      svixId,
      svixTimestamp,
      svixSignature,
      body
    );

    if (!isValid) {
      console.error('Webhook signature verification failed');
      return new Response(
        JSON.stringify({ error: 'Invalid signature' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Webhook signature verified successfully');

    // Parse the verified payload
    const payload = JSON.parse(body);
    console.log('Received payload:', JSON.stringify(payload, null, 2));

    // Check if this is a Resend webhook event (has 'type' field)
    if (payload.type) {
      console.log(`Received Resend webhook event: ${payload.type}`);
      const eventData = payload.data;
      
      // Handle domain verification updates
      if (payload.type === 'domain.updated' && eventData) {
        console.log('Processing domain update:', eventData);
        
        // Update email_settings with latest verification status
        const { error: updateError } = await supabaseClient
          .from('email_settings')
          .update({
            verification_status: eventData.status === 'verified' ? 'verified' : 'pending',
            dns_records: eventData.records ? JSON.stringify(eventData.records) : null,
            updated_at: new Date().toISOString(),
          })
          .eq('resend_domain_id', eventData.id);
        
        if (updateError) {
          console.error('Error updating domain status:', updateError);
        } else {
          console.log(`Domain ${eventData.name} status updated to: ${eventData.status}`);
        }
      }
      
      // Handle email delivery events (sent, delivered, bounced, opened, clicked, complained)
      if (eventData && eventData.email_id) {
        const emailId = eventData.email_id;
        console.log(`Processing email event: ${payload.type} for email ${emailId}`);
        
        // Find the campaign recipient by resend_email_id
        const { data: recipient, error: recipientError } = await supabaseClient
          .from('email_campaign_recipients')
          .select('id, status, open_count, click_count')
          .eq('resend_email_id', emailId)
          .single();
        
        const now = new Date().toISOString();

        // --- Marketing sequence action update ---
        const { data: mktAction } = await supabaseClient
          .from('mkt_sequence_actions')
          .select('id, status, org_id, enrollment_id')
          .eq('external_id', emailId)
          .maybeSingle();

        if (mktAction) {
          const mktUpdates: any = {};
          switch (payload.type) {
            case 'email.delivered':
              mktUpdates.delivered_at = now;
              break;
            case 'email.bounced':
              mktUpdates.status = 'bounced';
              mktUpdates.failed_at = now;
              mktUpdates.failure_reason = `Bounced: ${eventData.bounce?.type || 'unknown'}`;
              break;
            case 'email.opened':
              mktUpdates.opened_at = now;
              break;
            case 'email.clicked':
              mktUpdates.clicked_at = now;
              break;
          }
          if (Object.keys(mktUpdates).length > 0) {
            await supabaseClient.from('mkt_sequence_actions').update(mktUpdates).eq('id', mktAction.id);
            console.log(`mkt_sequence_actions ${mktAction.id} updated for ${payload.type}`);
          }

          // Suppress contact on permanent bounce
          if (payload.type === 'email.bounced' && mktAction.enrollment_id) {
            const bounceKind = (eventData.bounce?.type || '').toLowerCase();
            const isPermanent = bounceKind === 'permanent' || bounceKind === 'hard';

            const { data: enrollment } = await supabaseClient
              .from('mkt_sequence_enrollments')
              .select('lead_id')
              .eq('id', mktAction.enrollment_id)
              .single();

            const leadId = enrollment?.lead_id;
            const orgId = mktAction.org_id;

            if (leadId && orgId) {
              if (isPermanent) {
                // Hard suppress: mark contact, add to unsubscribes, cancel enrollments
                await Promise.all([
                  supabaseClient.from('contacts').update({
                    email_bounce_type: 'hard',
                    email_bounced_at: now,
                  }).eq('id', leadId),
                  supabaseClient.from('mkt_unsubscribes').upsert({
                    org_id: orgId,
                    lead_id: leadId,
                    channel: 'email',
                    reason: 'Hard bounce (permanent)',
                    updated_at: now,
                  }, { onConflict: 'org_id,lead_id,channel' }),
                  supabaseClient.from('mkt_sequence_enrollments').update({
                    status: 'cancelled',
                    cancelled_at: now,
                    cancel_reason: 'Hard bounce',
                  }).eq('lead_id', leadId).eq('status', 'active'),
                ]);
                console.log(`Hard bounce suppressed contact ${leadId}`);
              } else {
                // Soft bounce: increment counter, escalate at 3
                const { data: contact } = await supabaseClient
                  .from('contacts')
                  .select('email_soft_bounce_count, email_bounce_type')
                  .eq('id', leadId)
                  .single();

                if (contact?.email_bounce_type !== 'hard') {
                  const newCount = (contact?.email_soft_bounce_count || 0) + 1;
                  const escalate = newCount >= 3;
                  await supabaseClient.from('contacts').update({
                    email_soft_bounce_count: newCount,
                    email_bounce_type: escalate ? 'hard' : 'soft',
                    email_bounced_at: now,
                  }).eq('id', leadId);
                  if (escalate) {
                    await supabaseClient.from('mkt_sequence_enrollments').update({
                      status: 'cancelled',
                      cancelled_at: now,
                      cancel_reason: 'Soft bounce escalated',
                    }).eq('lead_id', leadId).eq('status', 'active');
                  }
                }
              }
            }
          }
        }

        // --- Bulk campaign recipient update ---
        if (recipientError || !recipient) {
          console.log('Recipient not found for email ID:', emailId);
          return new Response(
            JSON.stringify({ success: true, message: 'Webhook acknowledged (recipient not found)' }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const updates: any = {};

        // Handle different event types
        switch (payload.type) {
          case 'email.delivered':
            updates.delivered_at = now;
            break;
          case 'email.bounced':
            updates.status = 'bounced';
            updates.bounced_at = now;
            updates.bounce_reason = eventData.bounce?.message || 'Unknown bounce reason';
            break;
          case 'email.opened':
            updates.open_count = (recipient.open_count || 0) + 1;
            updates.opened_at = now;
            break;
          case 'email.clicked':
            updates.click_count = (recipient.click_count || 0) + 1;
            updates.first_clicked_at = now;
            break;
          case 'email.complained':
            updates.complained_at = now;
            break;
        }

        if (Object.keys(updates).length > 0) {
          const { error: updateError } = await supabaseClient
            .from('email_campaign_recipients')
            .update(updates)
            .eq('id', recipient.id);
          if (updateError) {
            console.error('Error updating recipient:', updateError);
          }
        }
      }
      
      // Acknowledge webhook
      return new Response(
        JSON.stringify({ success: true, message: 'Webhook event processed' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If no 'type' field, this is an inbound email forwarding event
    const inboundEmail: ResendInboundPayload = payload;
    console.log('Processing inbound email from:', inboundEmail.from);

    // --- Marketing Reply Detection ---
    // All emails to @reply.in-sync.co.in are marketing replies — attribute via In-Reply-To header
    const isMktReply = inboundEmail.to?.includes('@reply.in-sync.co.in');
    if (isMktReply) {
      console.log(`[inbound-webhook] Marketing reply detected from: ${inboundEmail.from}`);
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
        const mktReplyResponse = await fetch(`${supabaseUrl}/functions/v1/mkt-handle-email-reply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
          body: JSON.stringify({
            from_email: inboundEmail.from,
            from_name: inboundEmail.fromName,
            subject: inboundEmail.subject,
            text: inboundEmail.text,
            html: inboundEmail.html,
            message_id: inboundEmail.messageId,
            in_reply_to: inboundEmail.inReplyTo,
          }),
        });
        const mktReplyResult = await mktReplyResponse.json();
        console.log('[inbound-webhook] mkt-handle-email-reply response:', mktReplyResult);
        return new Response(
          JSON.stringify({ success: true, message: 'Marketing reply handled', result: mktReplyResult }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (mktErr) {
        console.error('[inbound-webhook] Error forwarding to mkt-handle-email-reply:', mktErr);
        // Fall through to generic inbound processing
      }
    }

    // --- Support Ticket Reply Detection ---
    // Check if this email is a reply to a support ticket by looking for TKT-XXXXX pattern
    const ticketFromSubject = inboundEmail.subject?.match(/\[?(TKT-\d+)\]?/i);
    const ticketFromTo = inboundEmail.to?.match(/support\+(TKT-\d+)@/i);
    const ticketNumber = (ticketFromSubject?.[1] || ticketFromTo?.[1])?.toUpperCase();

    if (ticketNumber) {
      console.log(`[inbound-webhook] Detected support ticket reply for: ${ticketNumber}, forwarding to ticket-email-reply`);
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
        const ticketReplyUrl = `${supabaseUrl}/functions/v1/ticket-email-reply`;
        const ticketReplyResponse = await fetch(ticketReplyUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify(payload),
        });
        const ticketReplyResult = await ticketReplyResponse.json();
        console.log('[inbound-webhook] ticket-email-reply response:', ticketReplyResult);
        return new Response(
          JSON.stringify({ success: true, message: 'Forwarded to ticket-email-reply', result: ticketReplyResult }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (ticketErr) {
        console.error('[inbound-webhook] Error forwarding to ticket-email-reply:', ticketErr);
        // Fall through to normal email processing if ticket handler fails
      }
    }

    // Extract domain from recipient email (inboundEmail.to)
    const recipientEmail = inboundEmail.to;
    const recipientDomain = recipientEmail.split('@')[1];
    console.log('Recipient domain:', recipientDomain);

    // Find organization by matching sending domain
    const { data: emailSettings } = await supabaseClient
      .from('email_settings')
      .select('org_id, verification_status, is_active')
      .eq('sending_domain', recipientDomain)
      .eq('is_active', true)
      .limit(1);

    if (!emailSettings || emailSettings.length === 0) {
      console.log('No active email settings found for domain:', recipientDomain);
      return new Response(
        JSON.stringify({ success: false, message: 'Email sent to unverified domain' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const orgId = emailSettings[0].org_id;
    console.log('Found organization:', orgId);

    // Find existing contact by email and org_id
    const { data: contacts } = await supabaseClient
      .from('contacts')
      .select('id')
      .eq('email', inboundEmail.from)
      .eq('org_id', orgId)
      .limit(1);

    let contactId = contacts?.[0]?.id;

    // If contact doesn't exist, create new contact
    if (!contactId) {
      console.log('Contact not found, creating new contact for:', inboundEmail.from);
      
      // Parse name from inboundEmail
      let firstName = '';
      let lastName = '';
      
      if (inboundEmail.fromName) {
        const nameParts = inboundEmail.fromName.trim().split(' ');
        firstName = nameParts[0] || '';
        lastName = nameParts.slice(1).join(' ') || '';
      } else {
        // Extract name from email (before @)
        firstName = inboundEmail.from.split('@')[0];
      }

      // Create new contact
      const { data: newContact, error: createError } = await supabaseClient
        .from('contacts')
        .insert({
          org_id: orgId,
          email: inboundEmail.from,
          first_name: firstName,
          last_name: lastName || null,
          source: 'email_inbound',
          status: 'new',
        })
        .select('id')
        .single();

      if (createError) {
        console.error('Error creating contact:', createError);
        return new Response(
          JSON.stringify({ error: 'Failed to create contact: ' + createError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      contactId = newContact.id;
      console.log('Created new contact:', contactId);
    }

    // Generate conversation ID from thread or create new
    const conversationId = inboundEmail.threadId || crypto.randomUUID();

    // Store inbound email
    const { error: insertError } = await supabaseClient
      .from('email_conversations')
      .insert({
        org_id: orgId,
        contact_id: contactId,
        conversation_id: conversationId,
        thread_id: inboundEmail.threadId,
        direction: 'inbound',
        from_email: inboundEmail.from,
        from_name: inboundEmail.fromName,
        to_email: inboundEmail.to,
        subject: inboundEmail.subject,
        email_content: inboundEmail.text,
        html_content: inboundEmail.html,
        has_attachments: (inboundEmail.attachments?.length ?? 0) > 0,
        attachments: inboundEmail.attachments ? JSON.stringify(inboundEmail.attachments) : null,
        provider_message_id: inboundEmail.messageId,
        status: 'received',
        is_read: false,
        received_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error('Error inserting inbound email:', insertError);
      return new Response(
        JSON.stringify({ error: insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Stored inbound email from:', inboundEmail.from);

    return new Response(
      JSON.stringify({ success: true, message: 'Inbound email stored' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error processing inbound email webhook:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
