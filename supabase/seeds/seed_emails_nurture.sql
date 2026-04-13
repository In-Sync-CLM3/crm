-- =============================================================================
-- SEED: mkt_email_templates — Follow-up, Nurture, Re-engagement, Event-triggered
-- Product: In-Sync (B2B SaaS vendor financial due diligence platform)
-- Total: 76 email templates
-- =============================================================================

-- =============================================================================
-- A. FOLLOW-UP SEQUENCES (6 ICPs × 3 steps = 18 emails)
--    Category: follow_up
-- =============================================================================

DO $$
DECLARE
  _org_id uuid;
BEGIN
  FOR _org_id IN SELECT id FROM public.organizations LOOP

    -- -------------------------------------------------------------------------
    -- A1. CFO Follow-up Sequence
    -- -------------------------------------------------------------------------

    -- CFO — Post-demo follow-up (Day 1)
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Follow-up: CFO Post-Demo Day 1',
      '{{first_name}}, your vendor risk blind spots',
      '<p>{{first_name}}, thanks for taking the time yesterday to walk through In-Sync with us.</p><p>One thing that stood out during our conversation: {{company}} is handling vendor verifications manually — which means your finance team is spending 7-10 days per vendor when it could take under 5 minutes.</p><p>We currently serve 100+ businesses that had the same bottleneck. On average, CFOs report a 40% reduction in vendor onboarding costs within the first quarter.</p><p>I have attached the custom ROI estimate we discussed. The numbers are conservative — most of our clients see results faster than projected.</p><p>Would Thursday or Friday work for a 20-minute call to walk through pricing options that fit {{company}}''s vendor volume?</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, thanks for taking the time yesterday to walk through In-Sync with us.

One thing that stood out during our conversation: {{company}} is handling vendor verifications manually — which means your finance team is spending 7-10 days per vendor when it could take under 5 minutes.

We currently serve 100+ businesses that had the same bottleneck. On average, CFOs report a 40% reduction in vendor onboarding costs within the first quarter.

I have attached the custom ROI estimate we discussed. The numbers are conservative — most of our clients see results faster than projected.

Would Thursday or Friday work for a 20-minute call to walk through pricing options that fit {{company}}''s vendor volume?

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'follow_up',
      'CFO-FU-1',
      '["first_name","company","sender_name"]',
      true
    );

    -- CFO — Pricing discussion follow-up (Day 3)
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Follow-up: CFO Pricing Day 3',
      'Quick math on In-Sync for {{company}}',
      '<p>{{first_name}}, I ran the numbers based on what you shared about {{company}}''s vendor volume.</p><p>At your current pace, manual due diligence is costing roughly 12-15 hours per vendor when you factor in GST verification, PAN validation, credit checks, and bank statement analysis. Multiply that across your vendor base and the cost adds up fast.</p><p>Our quarterly plans start at ₹2,999 — which typically pays for itself within the first week of use. The Growth plan at ₹7,499 is where most mid-size finance teams land.</p><p>We also offer 3 free verifications so your team can test the platform with real vendors before committing. No credit card, no strings.</p><p>Want me to set up those free verifications for {{company}} today?</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, I ran the numbers based on what you shared about {{company}}''s vendor volume.

At your current pace, manual due diligence is costing roughly 12-15 hours per vendor when you factor in GST verification, PAN validation, credit checks, and bank statement analysis. Multiply that across your vendor base and the cost adds up fast.

Our quarterly plans start at ₹2,999 — which typically pays for itself within the first week of use. The Growth plan at ₹7,499 is where most mid-size finance teams land.

We also offer 3 free verifications so your team can test the platform with real vendors before committing. No credit card, no strings.

Want me to set up those free verifications for {{company}} today?

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'follow_up',
      'CFO-FU-2',
      '["first_name","company","sender_name"]',
      true
    );

    -- CFO — Decision nudge (Day 7)
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Follow-up: CFO Decision Nudge Day 7',
      '{{first_name}}, one week — quick update',
      '<p>{{first_name}}, it has been a week since we walked through In-Sync, and I wanted to share a quick update before this falls off your radar.</p><p>Since our call, two companies in a similar space to {{company}} have gone live on the platform. One of them reduced their vendor onboarding cycle from 8 days to 47 minutes — with full GST, PAN, and credit verification included.</p><p>I understand budgets and approvals take time. If it helps, I am happy to jump on a 10-minute call with anyone else on your team who needs to see the platform — your controller, VP Finance, or procurement lead.</p><p>Also worth noting: our current quarterly pricing locks in for the first year. We are reviewing rates next quarter as we add more government API integrations.</p><p>What makes sense as a next step for {{company}}?</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, it has been a week since we walked through In-Sync, and I wanted to share a quick update before this falls off your radar.

Since our call, two companies in a similar space to {{company}} have gone live on the platform. One of them reduced their vendor onboarding cycle from 8 days to 47 minutes — with full GST, PAN, and credit verification included.

I understand budgets and approvals take time. If it helps, I am happy to jump on a 10-minute call with anyone else on your team who needs to see the platform — your controller, VP Finance, or procurement lead.

Also worth noting: our current quarterly pricing locks in for the first year. We are reviewing rates next quarter as we add more government API integrations.

What makes sense as a next step for {{company}}?

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'follow_up',
      'CFO-FU-3',
      '["first_name","company","sender_name"]',
      true
    );

    -- -------------------------------------------------------------------------
    -- A2. COO Follow-up Sequence
    -- -------------------------------------------------------------------------

    -- COO — Post-demo follow-up (Day 1)
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Follow-up: COO Post-Demo Day 1',
      '{{first_name}}, streamlining ops at {{company}}',
      '<p>{{first_name}}, great conversation yesterday. Your point about operational bottlenecks in vendor onboarding really resonated — we hear the same thing from COOs across industries.</p><p>The core problem is clear: your operations team is waiting 7-10 days for vendor verifications that touch multiple departments — finance, compliance, procurement. In-Sync collapses that into a single automated workflow that takes under 5 minutes.</p><p>One COO we work with told us that eliminating manual vendor checks freed up 22 hours per week across their operations team. That is time going back into strategic work instead of chasing GST certificates.</p><p>I have put together a brief operational impact summary for {{company}} based on our discussion. Happy to walk through it whenever works for you.</p><p>Would a quick call Thursday work?</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, great conversation yesterday. Your point about operational bottlenecks in vendor onboarding really resonated — we hear the same thing from COOs across industries.

The core problem is clear: your operations team is waiting 7-10 days for vendor verifications that touch multiple departments — finance, compliance, procurement. In-Sync collapses that into a single automated workflow that takes under 5 minutes.

One COO we work with told us that eliminating manual vendor checks freed up 22 hours per week across their operations team. That is time going back into strategic work instead of chasing GST certificates.

I have put together a brief operational impact summary for {{company}} based on our discussion. Happy to walk through it whenever works for you.

Would a quick call Thursday work?

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'follow_up',
      'COO-FU-1',
      '["first_name","company","sender_name"]',
      true
    );

    -- COO — Pricing discussion follow-up (Day 3)
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Follow-up: COO Pricing Day 3',
      'Operational ROI breakdown for {{company}}',
      '<p>{{first_name}}, following up on our pricing conversation — I wanted to frame this in terms that matter to operations.</p><p>Right now, every new vendor at {{company}} likely touches 3-4 people across departments before they are cleared. That cross-functional coordination is where the real cost hides — not just in hours, but in delayed purchase orders and missed delivery windows.</p><p>At ₹7,499/quarter (our most popular plan for operations-heavy teams), you are looking at roughly ₹25 per vendor verification. Compare that to the fully loaded cost of manual checks and the math is straightforward.</p><p>We offer 3 free verifications to start — no commitment needed. Your team can run real vendors through the system and see the time savings firsthand.</p><p>Should I activate those free verifications for {{company}}?</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, following up on our pricing conversation — I wanted to frame this in terms that matter to operations.

Right now, every new vendor at {{company}} likely touches 3-4 people across departments before they are cleared. That cross-functional coordination is where the real cost hides — not just in hours, but in delayed purchase orders and missed delivery windows.

At ₹7,499/quarter (our most popular plan for operations-heavy teams), you are looking at roughly ₹25 per vendor verification. Compare that to the fully loaded cost of manual checks and the math is straightforward.

We offer 3 free verifications to start — no commitment needed. Your team can run real vendors through the system and see the time savings firsthand.

Should I activate those free verifications for {{company}}?

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'follow_up',
      'COO-FU-2',
      '["first_name","company","sender_name"]',
      true
    );

    -- COO — Decision nudge (Day 7)
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Follow-up: COO Decision Nudge Day 7',
      '{{first_name}}, closing the loop on In-Sync',
      '<p>{{first_name}}, wanted to circle back one more time before the week ends.</p><p>I know operational decisions at {{company}} involve multiple stakeholders. If it would help move things forward, I am happy to do a 15-minute demo for your procurement team or anyone else who would be hands-on with the platform.</p><p>Quick context: a manufacturing COO we work with told us last month that In-Sync cut their vendor onboarding backlog from 45 pending verifications to zero within two weeks of going live. Their procurement team now onboards vendors same-day.</p><p>Our current pricing is locked for early adopters through this quarter. After that, rates adjust upward as we expand our government API coverage.</p><p>What would be the most helpful next step for you?</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, wanted to circle back one more time before the week ends.

I know operational decisions at {{company}} involve multiple stakeholders. If it would help move things forward, I am happy to do a 15-minute demo for your procurement team or anyone else who would be hands-on with the platform.

Quick context: a manufacturing COO we work with told us last month that In-Sync cut their vendor onboarding backlog from 45 pending verifications to zero within two weeks of going live. Their procurement team now onboards vendors same-day.

Our current pricing is locked for early adopters through this quarter. After that, rates adjust upward as we expand our government API coverage.

What would be the most helpful next step for you?

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'follow_up',
      'COO-FU-3',
      '["first_name","company","sender_name"]',
      true
    );

    -- -------------------------------------------------------------------------
    -- A3. CTO Follow-up Sequence
    -- -------------------------------------------------------------------------

    -- CTO — Post-demo follow-up (Day 1)
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Follow-up: CTO Post-Demo Day 1',
      '{{first_name}}, the API architecture behind In-Sync',
      '<p>{{first_name}}, appreciate you digging into the technical details yesterday. It is not every day we get to talk architecture with someone who asks the right questions.</p><p>To recap the key technical points: In-Sync connects directly to GST, PAN, Aadhaar, credit bureau, and bank statement APIs. All verification workflows run through a single REST API — your engineering team can integrate it into {{company}}''s existing vendor management system in under a day.</p><p>We handle the complexity of maintaining government API connections, managing rate limits, parsing inconsistent response formats, and keeping up with schema changes. That is the part most teams underestimate when they try to build in-house.</p><p>I have attached our API documentation and a sample integration guide. Our sandbox environment is also available if your team wants to test before committing.</p><p>Should I set up sandbox access for {{company}}''s dev team?</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, appreciate you digging into the technical details yesterday. It is not every day we get to talk architecture with someone who asks the right questions.

To recap the key technical points: In-Sync connects directly to GST, PAN, Aadhaar, credit bureau, and bank statement APIs. All verification workflows run through a single REST API — your engineering team can integrate it into {{company}}''s existing vendor management system in under a day.

We handle the complexity of maintaining government API connections, managing rate limits, parsing inconsistent response formats, and keeping up with schema changes. That is the part most teams underestimate when they try to build in-house.

I have attached our API documentation and a sample integration guide. Our sandbox environment is also available if your team wants to test before committing.

Should I set up sandbox access for {{company}}''s dev team?

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'follow_up',
      'CTO-FU-1',
      '["first_name","company","sender_name"]',
      true
    );

    -- CTO — Pricing discussion follow-up (Day 3)
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Follow-up: CTO Pricing Day 3',
      'Build vs. buy: the numbers for {{company}}',
      '<p>{{first_name}}, I know CTOs always weigh build vs. buy. So here is the honest math.</p><p>Building vendor verification in-house means integrating with 5+ government APIs, each with different auth mechanisms, response formats, and uptime patterns. Our engineering team spent 18 months getting this right — and we still dedicate 3 engineers full-time to API maintenance.</p><p>At ₹14,999/quarter for our Enterprise plan (or ₹7,499 for Growth), you get all of that maintained, monitored, and updated — plus a clean API your team can integrate in hours, not months.</p><p>The free tier gives you 3 verifications to test with real data. Most CTOs run it through their staging environment first — happy to provide sandbox credentials too.</p><p>Want me to set up both sandbox and free production access for {{company}}?</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, I know CTOs always weigh build vs. buy. So here is the honest math.

Building vendor verification in-house means integrating with 5+ government APIs, each with different auth mechanisms, response formats, and uptime patterns. Our engineering team spent 18 months getting this right — and we still dedicate 3 engineers full-time to API maintenance.

At ₹14,999/quarter for our Enterprise plan (or ₹7,499 for Growth), you get all of that maintained, monitored, and updated — plus a clean API your team can integrate in hours, not months.

The free tier gives you 3 verifications to test with real data. Most CTOs run it through their staging environment first — happy to provide sandbox credentials too.

Want me to set up both sandbox and free production access for {{company}}?

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'follow_up',
      'CTO-FU-2',
      '["first_name","company","sender_name"]',
      true
    );

    -- CTO — Decision nudge (Day 7)
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Follow-up: CTO Decision Nudge Day 7',
      '{{first_name}}, quick technical update',
      '<p>{{first_name}}, quick update from our engineering side that might be relevant for {{company}}.</p><p>We just shipped our v3 API with batch verification support — you can now submit up to 50 vendors in a single API call and get results in under 2 minutes. A fintech CTO we work with called it "the feature that made the integration a no-brainer for their procurement system."</p><p>I also wanted to mention: our current API rate limits and pricing tiers are locked for all accounts created this quarter. We are scaling infrastructure next quarter and pricing will reflect the expanded capacity.</p><p>If your team has any technical blockers or questions about the integration, I can connect you directly with our lead engineer for a 15-minute architecture call.</p><p>What would be most useful for {{company}} right now?</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, quick update from our engineering side that might be relevant for {{company}}.

We just shipped our v3 API with batch verification support — you can now submit up to 50 vendors in a single API call and get results in under 2 minutes. A fintech CTO we work with called it "the feature that made the integration a no-brainer for their procurement system."

I also wanted to mention: our current API rate limits and pricing tiers are locked for all accounts created this quarter. We are scaling infrastructure next quarter and pricing will reflect the expanded capacity.

If your team has any technical blockers or questions about the integration, I can connect you directly with our lead engineer for a 15-minute architecture call.

What would be most useful for {{company}} right now?

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'follow_up',
      'CTO-FU-3',
      '["first_name","company","sender_name"]',
      true
    );

    -- -------------------------------------------------------------------------
    -- A4. CCO (Chief Compliance Officer) Follow-up Sequence
    -- -------------------------------------------------------------------------

    -- CCO — Post-demo follow-up (Day 1)
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Follow-up: CCO Post-Demo Day 1',
      '{{first_name}}, compliance gaps we spotted',
      '<p>{{first_name}}, thank you for the detailed conversation yesterday. Your compliance challenges at {{company}} are more common than you might think — and more solvable.</p><p>The biggest risk we see with manual vendor verification is inconsistency. When different team members verify vendors differently, compliance gaps emerge that only show up during audits — by which point the damage is done.</p><p>In-Sync standardizes every verification against government databases: GST status, PAN validation, Aadhaar authentication, credit reports, and bank statement analysis. Every check is logged, timestamped, and audit-ready. No human variation, no missed steps.</p><p>One compliance head we work with said it best: "In-Sync turned our vendor compliance from a quarterly fire drill into a background process."</p><p>Shall I send over a compliance workflow map showing how In-Sync fits into {{company}}''s existing processes?</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, thank you for the detailed conversation yesterday. Your compliance challenges at {{company}} are more common than you might think — and more solvable.

The biggest risk we see with manual vendor verification is inconsistency. When different team members verify vendors differently, compliance gaps emerge that only show up during audits — by which point the damage is done.

In-Sync standardizes every verification against government databases: GST status, PAN validation, Aadhaar authentication, credit reports, and bank statement analysis. Every check is logged, timestamped, and audit-ready. No human variation, no missed steps.

One compliance head we work with said it best: "In-Sync turned our vendor compliance from a quarterly fire drill into a background process."

Shall I send over a compliance workflow map showing how In-Sync fits into {{company}}''s existing processes?

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'follow_up',
      'CCO-FU-1',
      '["first_name","company","sender_name"]',
      true
    );

    -- CCO — Pricing discussion follow-up (Day 3)
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Follow-up: CCO Pricing Day 3',
      'Cost of a compliance miss vs. In-Sync',
      '<p>{{first_name}}, I wanted to put the pricing conversation in compliance terms.</p><p>A single vendor compliance failure — an expired GST registration that slips through, an unverified PAN, a vendor with adverse credit history — can cost anywhere from ₹5 lakh to ₹50 lakh in penalties, lost revenue, or legal fees. We have seen it happen.</p><p>In-Sync''s Enterprise plan at ₹14,999/quarter covers unlimited verifications with full audit trails. That is less than what most companies spend on a single compliance consultant for a week.</p><p>Start with our 3 free verifications — run them on your highest-risk vendors and see the depth of reporting. Every check produces a compliance-ready PDF that your auditors will appreciate.</p><p>Want me to activate the free tier for {{company}} so your team can test it this week?</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, I wanted to put the pricing conversation in compliance terms.

A single vendor compliance failure — an expired GST registration that slips through, an unverified PAN, a vendor with adverse credit history — can cost anywhere from ₹5 lakh to ₹50 lakh in penalties, lost revenue, or legal fees. We have seen it happen.

In-Sync''s Enterprise plan at ₹14,999/quarter covers unlimited verifications with full audit trails. That is less than what most companies spend on a single compliance consultant for a week.

Start with our 3 free verifications — run them on your highest-risk vendors and see the depth of reporting. Every check produces a compliance-ready PDF that your auditors will appreciate.

Want me to activate the free tier for {{company}} so your team can test it this week?

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'follow_up',
      'CCO-FU-2',
      '["first_name","company","sender_name"]',
      true
    );

    -- CCO — Decision nudge (Day 7)
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Follow-up: CCO Decision Nudge Day 7',
      '{{first_name}}, DPDP deadline is approaching',
      '<p>{{first_name}}, quick flag on timing: the DPDP Act enforcement timeline is tightening, and vendor data handling practices are squarely in scope.</p><p>Companies that cannot demonstrate systematic vendor due diligence — including verified identity, financial health checks, and data processing assessments — face significant penalties under the new framework.</p><p>In-Sync gives {{company}} a defensible, auditable vendor verification process that maps directly to DPDP requirements. Every verification is logged with timestamps, data sources, and results — exactly what regulators want to see.</p><p>Two compliance heads signed up last week specifically because of the DPDP angle. They realized that manual spreadsheets would not pass regulatory scrutiny.</p><p>I would hate for {{company}} to get caught flat-footed. Can we get your team set up this week?</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, quick flag on timing: the DPDP Act enforcement timeline is tightening, and vendor data handling practices are squarely in scope.

Companies that cannot demonstrate systematic vendor due diligence — including verified identity, financial health checks, and data processing assessments — face significant penalties under the new framework.

In-Sync gives {{company}} a defensible, auditable vendor verification process that maps directly to DPDP requirements. Every verification is logged with timestamps, data sources, and results — exactly what regulators want to see.

Two compliance heads signed up last week specifically because of the DPDP angle. They realized that manual spreadsheets would not pass regulatory scrutiny.

I would hate for {{company}} to get caught flat-footed. Can we get your team set up this week?

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'follow_up',
      'CCO-FU-3',
      '["first_name","company","sender_name"]',
      true
    );

    -- -------------------------------------------------------------------------
    -- A5. Procurement Head Follow-up Sequence
    -- -------------------------------------------------------------------------

    -- Procurement Head — Post-demo follow-up (Day 1)
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Follow-up: Procurement Post-Demo Day 1',
      '{{first_name}}, faster vendor onboarding starts here',
      '<p>{{first_name}}, thanks for the candid conversation yesterday about {{company}}''s vendor onboarding challenges.</p><p>What struck me most was the backlog — you mentioned vendors waiting over a week for basic verification before they can be added to your approved list. Every day of delay is a day your teams cannot place orders, and your vendors are losing patience.</p><p>In-Sync pulls GST, PAN, credit, and bank data in under 5 minutes per vendor. Your procurement team can verify and approve vendors same-day, with full documentation auto-generated for your records.</p><p>A procurement head at a manufacturing firm told us: "We went from a 40-vendor backlog to zero in the first week. My team finally had time to focus on negotiations instead of paperwork."</p><p>Can I set up a quick pilot for {{company}} — 3 free verifications on your most urgent pending vendors?</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, thanks for the candid conversation yesterday about {{company}}''s vendor onboarding challenges.

What struck me most was the backlog — you mentioned vendors waiting over a week for basic verification before they can be added to your approved list. Every day of delay is a day your teams cannot place orders, and your vendors are losing patience.

In-Sync pulls GST, PAN, credit, and bank data in under 5 minutes per vendor. Your procurement team can verify and approve vendors same-day, with full documentation auto-generated for your records.

A procurement head at a manufacturing firm told us: "We went from a 40-vendor backlog to zero in the first week. My team finally had time to focus on negotiations instead of paperwork."

Can I set up a quick pilot for {{company}} — 3 free verifications on your most urgent pending vendors?

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'follow_up',
      'PROC-FU-1',
      '["first_name","company","sender_name"]',
      true
    );

    -- Procurement Head — Pricing discussion follow-up (Day 3)
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Follow-up: Procurement Pricing Day 3',
      'Per-vendor cost comparison for {{company}}',
      '<p>{{first_name}}, here is a simple way to think about the investment.</p><p>Your team currently spends an estimated 8-12 hours per vendor on due diligence — collecting GST certificates, validating PAN, checking credit history, reviewing bank statements. At fully loaded costs, that is ₹3,000-5,000 per vendor in staff time alone.</p><p>With In-Sync''s Growth plan at ₹7,499/quarter, each verification costs a fraction of that — and takes under 5 minutes instead of days. The Starter plan at ₹2,999 works well for smaller vendor volumes.</p><p>Start with our free 3 verifications. Pick your three most complex pending vendors — the ones with the thickest files — and see what In-Sync produces in minutes.</p><p>Want me to get {{company}} set up today?</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, here is a simple way to think about the investment.

Your team currently spends an estimated 8-12 hours per vendor on due diligence — collecting GST certificates, validating PAN, checking credit history, reviewing bank statements. At fully loaded costs, that is ₹3,000-5,000 per vendor in staff time alone.

With In-Sync''s Growth plan at ₹7,499/quarter, each verification costs a fraction of that — and takes under 5 minutes instead of days. The Starter plan at ₹2,999 works well for smaller vendor volumes.

Start with our free 3 verifications. Pick your three most complex pending vendors — the ones with the thickest files — and see what In-Sync produces in minutes.

Want me to get {{company}} set up today?

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'follow_up',
      'PROC-FU-2',
      '["first_name","company","sender_name"]',
      true
    );

    -- Procurement Head — Decision nudge (Day 7)
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Follow-up: Procurement Decision Nudge Day 7',
      '{{first_name}}, your vendor backlog is growing',
      '<p>{{first_name}}, I will be direct — every week without automated vendor verification is another week your backlog grows and your team stays buried in manual checks.</p><p>Since we spoke, three procurement teams have gone live on In-Sync. One cleared a 30-vendor backlog in a single afternoon. Their procurement lead said the time savings alone justified the annual cost within the first month.</p><p>If you need internal buy-in from finance or compliance, I can join a quick call with your CFO or compliance lead to address their specific concerns. We have done this for several clients and it speeds up the decision significantly.</p><p>Our current early-adopter pricing locks in at sign-up. Should I hold a slot for {{company}} before rates adjust next quarter?</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, I will be direct — every week without automated vendor verification is another week your backlog grows and your team stays buried in manual checks.

Since we spoke, three procurement teams have gone live on In-Sync. One cleared a 30-vendor backlog in a single afternoon. Their procurement lead said the time savings alone justified the annual cost within the first month.

If you need internal buy-in from finance or compliance, I can join a quick call with your CFO or compliance lead to address their specific concerns. We have done this for several clients and it speeds up the decision significantly.

Our current early-adopter pricing locks in at sign-up. Should I hold a slot for {{company}} before rates adjust next quarter?

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'follow_up',
      'PROC-FU-3',
      '["first_name","company","sender_name"]',
      true
    );

    -- -------------------------------------------------------------------------
    -- A6. Supply Chain Head Follow-up Sequence
    -- -------------------------------------------------------------------------

    -- Supply Chain Head — Post-demo follow-up (Day 1)
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Follow-up: Supply Chain Post-Demo Day 1',
      '{{first_name}}, de-risking {{company}}''s supply chain',
      '<p>{{first_name}}, thanks for walking us through {{company}}''s supply chain challenges yesterday. The vendor visibility gap you described is exactly the problem In-Sync was built to solve.</p><p>In supply chain, an unverified vendor is not just a compliance risk — it is an operational risk. A vendor with a cancelled GST registration or deteriorating credit score can disrupt your entire production schedule. By the time you find out through manual checks, the damage is already done.</p><p>In-Sync gives your supply chain team real-time vendor health monitoring: GST status changes, credit score shifts, PAN discrepancies — flagged automatically before they become supply disruptions.</p><p>A supply chain director at an automotive parts company told us: "We caught a Tier-2 supplier''s GST cancellation 3 weeks before it would have halted our production line. That single alert saved us ₹80 lakh in potential losses."</p><p>Can we set up a pilot with your top 3 critical vendors this week?</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, thanks for walking us through {{company}}''s supply chain challenges yesterday. The vendor visibility gap you described is exactly the problem In-Sync was built to solve.

In supply chain, an unverified vendor is not just a compliance risk — it is an operational risk. A vendor with a cancelled GST registration or deteriorating credit score can disrupt your entire production schedule. By the time you find out through manual checks, the damage is already done.

In-Sync gives your supply chain team real-time vendor health monitoring: GST status changes, credit score shifts, PAN discrepancies — flagged automatically before they become supply disruptions.

A supply chain director at an automotive parts company told us: "We caught a Tier-2 supplier''s GST cancellation 3 weeks before it would have halted our production line. That single alert saved us ₹80 lakh in potential losses."

Can we set up a pilot with your top 3 critical vendors this week?

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'follow_up',
      'SC-FU-1',
      '["first_name","company","sender_name"]',
      true
    );

    -- Supply Chain Head — Pricing discussion follow-up (Day 3)
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Follow-up: Supply Chain Pricing Day 3',
      'Supply disruption vs. ₹7,499/quarter',
      '<p>{{first_name}}, let me frame this in supply chain terms.</p><p>A single supply disruption from an unverified vendor — a missed delivery because their GST was suspended, a quality issue from a financially distressed supplier — costs most companies 10-50x what In-Sync costs per year.</p><p>At ₹7,499/quarter for our Growth plan, you get continuous monitoring across your vendor base. The Enterprise plan at ₹14,999 adds priority API access and dedicated support — which supply chain teams usually prefer because speed matters when a disruption alert fires.</p><p>We offer 3 free verifications to start. I would suggest running them on your most critical single-source suppliers — the ones where a disruption would hurt the most.</p><p>Want me to set those up for {{company}} today?</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, let me frame this in supply chain terms.

A single supply disruption from an unverified vendor — a missed delivery because their GST was suspended, a quality issue from a financially distressed supplier — costs most companies 10-50x what In-Sync costs per year.

At ₹7,499/quarter for our Growth plan, you get continuous monitoring across your vendor base. The Enterprise plan at ₹14,999 adds priority API access and dedicated support — which supply chain teams usually prefer because speed matters when a disruption alert fires.

We offer 3 free verifications to start. I would suggest running them on your most critical single-source suppliers — the ones where a disruption would hurt the most.

Want me to set those up for {{company}} today?

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'follow_up',
      'SC-FU-2',
      '["first_name","company","sender_name"]',
      true
    );

    -- Supply Chain Head — Decision nudge (Day 7)
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Follow-up: Supply Chain Decision Nudge Day 7',
      '{{first_name}}, vendor risk does not wait',
      '<p>{{first_name}}, one last thought before the week closes out.</p><p>In the past 7 days, In-Sync flagged 23 GST status changes and 8 credit score drops across our client base. Some of those alerts prevented real supply disruptions. Without automated monitoring, those changes would have gone unnoticed until the next manual review — weeks or months later.</p><p>I understand supply chain teams at {{company}} have a lot of moving parts. If it helps, I can run a free risk assessment on your top 3 vendors — no commitment, just a snapshot of what In-Sync can surface.</p><p>Our current pricing tier locks in for 12 months at sign-up. With our expanded government API coverage launching next quarter, rates will adjust accordingly.</p><p>Should I run that free vendor risk check for {{company}}?</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, one last thought before the week closes out.

In the past 7 days, In-Sync flagged 23 GST status changes and 8 credit score drops across our client base. Some of those alerts prevented real supply disruptions. Without automated monitoring, those changes would have gone unnoticed until the next manual review — weeks or months later.

I understand supply chain teams at {{company}} have a lot of moving parts. If it helps, I can run a free risk assessment on your top 3 vendors — no commitment, just a snapshot of what In-Sync can surface.

Our current pricing tier locks in for 12 months at sign-up. With our expanded government API coverage launching next quarter, rates will adjust accordingly.

Should I run that free vendor risk check for {{company}}?

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'follow_up',
      'SC-FU-3',
      '["first_name","company","sender_name"]',
      true
    );

  END LOOP;
END $$;

-- =============================================================================
-- B. NURTURE SEQUENCES (5 topics × 4 emails = 20 emails)
--    Category: nurture
-- =============================================================================

DO $$
DECLARE
  _org_id uuid;
BEGIN
  FOR _org_id IN SELECT id FROM public.organizations LOOP

    -- -------------------------------------------------------------------------
    -- B1. Vendor Risk Management Insights (4 emails)
    -- -------------------------------------------------------------------------

    -- VRM Insight #1
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Nurture: VRM Insight 1 — Hidden Costs',
      'The hidden cost of vendor fraud in India',
      '<p>{{first_name}}, Indian businesses lose an estimated ₹1.2 lakh crore annually to vendor fraud and financial misrepresentation. Most of these losses come from vendors with fabricated GST registrations, inactive PAN cards, or inflated bank statements.</p><p>The uncomfortable truth: 1 in 7 vendor submissions contains at least one discrepancy when checked against government databases. That number jumps to 1 in 4 for vendors onboarded without automated verification.</p><p>The fix is not more manual checks — it is smarter checks. Automated verification against GST, PAN, Aadhaar, and credit bureau APIs catches discrepancies that human reviewers routinely miss, especially when processing high volumes.</p><p>Three questions to stress-test your current process:<br/>1. How many vendors were onboarded last quarter without real-time GST verification?<br/>2. When was the last time you re-verified an existing vendor''s financial health?<br/>3. Can your team produce a compliance audit trail for every vendor in under an hour?</p><p>If any of those gave you pause, it might be worth a conversation. Reply to this email and I will share our Vendor Risk Assessment Framework — free, no strings.</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, Indian businesses lose an estimated ₹1.2 lakh crore annually to vendor fraud and financial misrepresentation. Most of these losses come from vendors with fabricated GST registrations, inactive PAN cards, or inflated bank statements.

The uncomfortable truth: 1 in 7 vendor submissions contains at least one discrepancy when checked against government databases. That number jumps to 1 in 4 for vendors onboarded without automated verification.

The fix is not more manual checks — it is smarter checks. Automated verification against GST, PAN, Aadhaar, and credit bureau APIs catches discrepancies that human reviewers routinely miss, especially when processing high volumes.

Three questions to stress-test your current process:
1. How many vendors were onboarded last quarter without real-time GST verification?
2. When was the last time you re-verified an existing vendor''s financial health?
3. Can your team produce a compliance audit trail for every vendor in under an hour?

If any of those gave you pause, it might be worth a conversation. Reply to this email and I will share our Vendor Risk Assessment Framework — free, no strings.

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'nurture',
      'VRM-NUR-1',
      '["first_name","company","sender_name"]',
      true
    );

    -- VRM Insight #2
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Nurture: VRM Insight 2 — GST Red Flags',
      '5 GST red flags your team is probably missing',
      '<p>{{first_name}}, GST verification seems simple on the surface — check if the number is valid and move on. But there are subtle signals in GST data that separate risky vendors from reliable ones.</p><p>Here are 5 red flags that most manual processes miss:<br/>1. <strong>Recent registration changes</strong> — A vendor who changed their registration type in the last 90 days deserves extra scrutiny.<br/>2. <strong>Filing gaps</strong> — Consistent GST return filing indicates financial stability. Gaps signal cash flow problems or worse.<br/>3. <strong>Address mismatches</strong> — When the registered address does not match the operational address, dig deeper.<br/>4. <strong>Multiple GSTIN cancellations</strong> — A vendor with a history of cancelled registrations across states is a risk multiplier.<br/>5. <strong>Composition scheme status</strong> — Vendors on composition scheme have turnover caps. If their invoices exceed those caps, something does not add up.</p><p>Automated verification systems can flag all five of these in seconds by cross-referencing government databases. Manual checks typically catch only #1 and sometimes #3.</p><p>We built a free GST Red Flag Checklist that your procurement and finance teams can use immediately — even without any software. Reply "send it" and I will drop it in your inbox.</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, GST verification seems simple on the surface — check if the number is valid and move on. But there are subtle signals in GST data that separate risky vendors from reliable ones.

Here are 5 red flags that most manual processes miss:
1. Recent registration changes — A vendor who changed their registration type in the last 90 days deserves extra scrutiny.
2. Filing gaps — Consistent GST return filing indicates financial stability. Gaps signal cash flow problems or worse.
3. Address mismatches — When the registered address does not match the operational address, dig deeper.
4. Multiple GSTIN cancellations — A vendor with a history of cancelled registrations across states is a risk multiplier.
5. Composition scheme status — Vendors on composition scheme have turnover caps. If their invoices exceed those caps, something does not add up.

Automated verification systems can flag all five of these in seconds by cross-referencing government databases. Manual checks typically catch only #1 and sometimes #3.

We built a free GST Red Flag Checklist that your procurement and finance teams can use immediately — even without any software. Reply "send it" and I will drop it in your inbox.

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'nurture',
      'VRM-NUR-2',
      '["first_name","company","sender_name"]',
      true
    );

    -- VRM Insight #3
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Nurture: VRM Insight 3 — Vendor Tiers',
      'Why your vendor risk tiers are probably wrong',
      '<p>{{first_name}}, most companies tier their vendors by spend — high value, medium, low. Makes sense on the surface. But spend-based tiering misses the vendors that actually blow up.</p><p>Our data across 100+ businesses shows that 68% of vendor-related compliance incidents come from mid-tier and low-tier vendors. Why? Because they get less scrutiny during onboarding and almost zero ongoing monitoring.</p><p>A better approach: risk-based tiering that combines financial health, compliance status, and operational dependency. A low-spend vendor who is your sole source for a critical component is actually your highest-risk vendor — but spend-based tiering would put them at the bottom of the pile.</p><p>Here is a simple framework to get started:<br/>- <strong>Tier 1 (Critical)</strong>: Single-source suppliers, vendors with regulatory exposure, vendors handling sensitive data<br/>- <strong>Tier 2 (Important)</strong>: Multi-source but high volume, vendors in regulated industries<br/>- <strong>Tier 3 (Standard)</strong>: Easily replaceable, low volume, minimal regulatory impact</p><p>The key is that verification depth should match the tier — not just at onboarding, but on an ongoing basis. Tier 1 vendors need continuous monitoring, not annual reviews.</p><p>We put together a Vendor Tiering Template that maps risk factors to verification requirements. Free to share — just reply and I will send it over.</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, most companies tier their vendors by spend — high value, medium, low. Makes sense on the surface. But spend-based tiering misses the vendors that actually blow up.

Our data across 100+ businesses shows that 68% of vendor-related compliance incidents come from mid-tier and low-tier vendors. Why? Because they get less scrutiny during onboarding and almost zero ongoing monitoring.

A better approach: risk-based tiering that combines financial health, compliance status, and operational dependency. A low-spend vendor who is your sole source for a critical component is actually your highest-risk vendor — but spend-based tiering would put them at the bottom of the pile.

Here is a simple framework to get started:
- Tier 1 (Critical): Single-source suppliers, vendors with regulatory exposure, vendors handling sensitive data
- Tier 2 (Important): Multi-source but high volume, vendors in regulated industries
- Tier 3 (Standard): Easily replaceable, low volume, minimal regulatory impact

The key is that verification depth should match the tier — not just at onboarding, but on an ongoing basis. Tier 1 vendors need continuous monitoring, not annual reviews.

We put together a Vendor Tiering Template that maps risk factors to verification requirements. Free to share — just reply and I will send it over.

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'nurture',
      'VRM-NUR-3',
      '["first_name","company","sender_name"]',
      true
    );

    -- VRM Insight #4
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Nurture: VRM Insight 4 — Continuous Monitoring',
      'One-time verification is not enough anymore',
      '<p>{{first_name}}, here is a stat that surprises most people: 12% of vendors who pass initial verification develop compliance or financial issues within 6 months. That means roughly 1 in 8 of your "approved" vendors may be a ticking time bomb.</p><p>The traditional approach — verify once at onboarding, maybe re-check annually — was designed for a slower era. Today, GST registrations can be suspended overnight, credit scores shift quarterly, and regulatory status changes without notice.</p><p>Continuous vendor monitoring catches these changes in real-time. Instead of discovering a problem during your next audit (or worse, when a payment fails), you get alerted the moment something changes in a government database.</p><p>Three things you can do this week to improve vendor monitoring, even without new software:<br/>1. Set calendar reminders to re-check your top 10 vendors'' GST status quarterly<br/>2. Request updated credit reports for any vendor with a contract renewal coming up<br/>3. Cross-check bank details before every large payment — not just the first one</p><p>Of course, doing all of this manually does not scale. That is why we built In-Sync with continuous monitoring at its core. But the principles above will help even if you are not ready for automation yet.</p><p>Thoughts? I would genuinely love to hear how {{company}} handles ongoing vendor monitoring today.</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, here is a stat that surprises most people: 12% of vendors who pass initial verification develop compliance or financial issues within 6 months. That means roughly 1 in 8 of your "approved" vendors may be a ticking time bomb.

The traditional approach — verify once at onboarding, maybe re-check annually — was designed for a slower era. Today, GST registrations can be suspended overnight, credit scores shift quarterly, and regulatory status changes without notice.

Continuous vendor monitoring catches these changes in real-time. Instead of discovering a problem during your next audit (or worse, when a payment fails), you get alerted the moment something changes in a government database.

Three things you can do this week to improve vendor monitoring, even without new software:
1. Set calendar reminders to re-check your top 10 vendors'' GST status quarterly
2. Request updated credit reports for any vendor with a contract renewal coming up
3. Cross-check bank details before every large payment — not just the first one

Of course, doing all of this manually does not scale. That is why we built In-Sync with continuous monitoring at its core. But the principles above will help even if you are not ready for automation yet.

Thoughts? I would genuinely love to hear how {{company}} handles ongoing vendor monitoring today.

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'nurture',
      'VRM-NUR-4',
      '["first_name","company","sender_name"]',
      true
    );

    -- -------------------------------------------------------------------------
    -- B2. DPDP Compliance Updates (4 emails)
    -- -------------------------------------------------------------------------

    -- DPDP Compliance #1
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Nurture: DPDP Compliance 1 — What It Means',
      'DPDP Act: what it means for vendor management',
      '<p>{{first_name}}, the Digital Personal Data Protection Act is no longer theoretical — enforcement is real and the implications for vendor management are significant.</p><p>Here is what most companies are overlooking: the DPDP Act does not just regulate how you handle customer data. It regulates how your vendors handle data too. If a vendor you work with mishandles personal data, your company shares the liability.</p><p>This means vendor due diligence is no longer just a financial exercise — it is a data protection obligation. You need to verify not just who your vendors are, but how they handle data, what security practices they follow, and whether they are compliant with the same standards you are held to.</p><p>Key DPDP requirements that affect vendor management:<br/>- Data processors (your vendors) must be verifiable entities<br/>- You must maintain records of vendor data processing activities<br/>- Vendor compliance must be demonstrable to the Data Protection Board<br/>- Penalties for non-compliance: up to ₹250 crore per incident</p><p>We have compiled a DPDP Vendor Compliance Checklist that maps specific DPDP requirements to vendor verification actions. It is practical, not theoretical. Reply to this email and I will send it right over.</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, the Digital Personal Data Protection Act is no longer theoretical — enforcement is real and the implications for vendor management are significant.

Here is what most companies are overlooking: the DPDP Act does not just regulate how you handle customer data. It regulates how your vendors handle data too. If a vendor you work with mishandles personal data, your company shares the liability.

This means vendor due diligence is no longer just a financial exercise — it is a data protection obligation. You need to verify not just who your vendors are, but how they handle data, what security practices they follow, and whether they are compliant with the same standards you are held to.

Key DPDP requirements that affect vendor management:
- Data processors (your vendors) must be verifiable entities
- You must maintain records of vendor data processing activities
- Vendor compliance must be demonstrable to the Data Protection Board
- Penalties for non-compliance: up to ₹250 crore per incident

We have compiled a DPDP Vendor Compliance Checklist that maps specific DPDP requirements to vendor verification actions. It is practical, not theoretical. Reply to this email and I will send it right over.

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'nurture',
      'DPDP-NUR-1',
      '["first_name","company","sender_name"]',
      true
    );

    -- DPDP Compliance #2
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Nurture: DPDP Compliance 2 — Audit Trail',
      'Can you prove your vendor diligence to DPDP?',
      '<p>{{first_name}}, one of the trickiest parts of DPDP compliance is the audit trail requirement. It is not enough to verify vendors — you must prove that you verified them, when you did it, what data sources you used, and what the results were.</p><p>Most companies today rely on a combination of email threads, shared drives, and spreadsheets for vendor verification records. Under DPDP scrutiny, that patchwork falls apart fast. The Data Protection Board expects systematic, timestamped, reproducible records.</p><p>What a DPDP-ready vendor audit trail looks like:<br/>- Verification timestamp with data source attribution<br/>- Complete results log (GST status, PAN validation, credit score, bank verification)<br/>- Change history showing when vendor status was last checked<br/>- Automated flagging of vendors due for re-verification<br/>- Export-ready reports for regulatory submissions</p><p>Here is the good news: building this audit trail does not require an army of compliance analysts. Automated verification platforms generate audit-grade records as a byproduct of the verification process itself.</p><p>We have published a free guide: "Building a DPDP-Ready Vendor Audit Trail — 5 Steps." It covers what you need regardless of what tools you use. Want me to send it over?</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, one of the trickiest parts of DPDP compliance is the audit trail requirement. It is not enough to verify vendors — you must prove that you verified them, when you did it, what data sources you used, and what the results were.

Most companies today rely on a combination of email threads, shared drives, and spreadsheets for vendor verification records. Under DPDP scrutiny, that patchwork falls apart fast. The Data Protection Board expects systematic, timestamped, reproducible records.

What a DPDP-ready vendor audit trail looks like:
- Verification timestamp with data source attribution
- Complete results log (GST status, PAN validation, credit score, bank verification)
- Change history showing when vendor status was last checked
- Automated flagging of vendors due for re-verification
- Export-ready reports for regulatory submissions

Here is the good news: building this audit trail does not require an army of compliance analysts. Automated verification platforms generate audit-grade records as a byproduct of the verification process itself.

We have published a free guide: "Building a DPDP-Ready Vendor Audit Trail — 5 Steps." It covers what you need regardless of what tools you use. Want me to send it over?

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'nurture',
      'DPDP-NUR-2',
      '["first_name","company","sender_name"]',
      true
    );

    -- DPDP Compliance #3
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Nurture: DPDP Compliance 3 — Vendor Contracts',
      'DPDP compliance starts in your vendor contracts',
      '<p>{{first_name}}, most companies are scrambling to update their internal data protection policies for DPDP. Fewer are updating their vendor contracts — and that is where the real exposure sits.</p><p>Under DPDP, every vendor who processes personal data on your behalf is a "Data Processor." Your contracts need to explicitly address: what data they can access, how they must secure it, breach notification timelines, and audit rights.</p><p>But here is the catch: you cannot enforce contract terms you cannot verify. If your vendor contract says they must maintain a valid GST registration and adequate financial health, you need a mechanism to verify that continuously — not just at contract signing.</p><p>Key clauses your vendor contracts should include post-DPDP:<br/>1. Right to verify vendor identity and financial health at any time<br/>2. Requirement for vendors to maintain active GST and PAN registration<br/>3. Automatic termination triggers for compliance failures<br/>4. Data processing audit rights with 48-hour notice<br/>5. Vendor obligation to report material changes in financial or compliance status</p><p>We created a DPDP Vendor Contract Clause Library — ready-to-use language your legal team can adapt. Free for any company taking vendor compliance seriously. Reply and I will share it.</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, most companies are scrambling to update their internal data protection policies for DPDP. Fewer are updating their vendor contracts — and that is where the real exposure sits.

Under DPDP, every vendor who processes personal data on your behalf is a "Data Processor." Your contracts need to explicitly address: what data they can access, how they must secure it, breach notification timelines, and audit rights.

But here is the catch: you cannot enforce contract terms you cannot verify. If your vendor contract says they must maintain a valid GST registration and adequate financial health, you need a mechanism to verify that continuously — not just at contract signing.

Key clauses your vendor contracts should include post-DPDP:
1. Right to verify vendor identity and financial health at any time
2. Requirement for vendors to maintain active GST and PAN registration
3. Automatic termination triggers for compliance failures
4. Data processing audit rights with 48-hour notice
5. Vendor obligation to report material changes in financial or compliance status

We created a DPDP Vendor Contract Clause Library — ready-to-use language your legal team can adapt. Free for any company taking vendor compliance seriously. Reply and I will share it.

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'nurture',
      'DPDP-NUR-3',
      '["first_name","company","sender_name"]',
      true
    );

    -- DPDP Compliance #4
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Nurture: DPDP Compliance 4 — Penalties',
      'DPDP penalties: the numbers are not theoretical',
      '<p>{{first_name}}, let us talk about the numbers that keep compliance teams up at night.</p><p>The DPDP Act prescribes penalties of up to ₹250 crore for significant data breaches, ₹200 crore for failure to implement adequate security measures, and ₹150 crore for non-compliance with data processing obligations. These are not abstract maximums — the Data Protection Board has the authority to impose them.</p><p>What does this mean for vendor management? If a vendor you work with causes a data breach because their financial distress led to security cutbacks, or because they were a fraudulent entity you failed to verify — your company is on the hook alongside them.</p><p>Three steps every company should take now to reduce DPDP vendor risk:<br/>1. Audit your current vendor base: How many vendors were onboarded without identity verification against government databases?<br/>2. Implement continuous monitoring: GST status and credit health changes should trigger automatic reviews<br/>3. Document everything: Every verification, every check, every decision should be logged and timestamped</p><p>The companies that move now will be compliant before enforcement accelerates. The companies that wait will be scrambling under pressure — which is when mistakes happen and costs multiply.</p><p>If you want to discuss how {{company}} can get ahead of this, I am happy to set up a 15-minute call — no pitch, just practical guidance on DPDP readiness for your vendor base.</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, let us talk about the numbers that keep compliance teams up at night.

The DPDP Act prescribes penalties of up to ₹250 crore for significant data breaches, ₹200 crore for failure to implement adequate security measures, and ₹150 crore for non-compliance with data processing obligations. These are not abstract maximums — the Data Protection Board has the authority to impose them.

What does this mean for vendor management? If a vendor you work with causes a data breach because their financial distress led to security cutbacks, or because they were a fraudulent entity you failed to verify — your company is on the hook alongside them.

Three steps every company should take now to reduce DPDP vendor risk:
1. Audit your current vendor base: How many vendors were onboarded without identity verification against government databases?
2. Implement continuous monitoring: GST status and credit health changes should trigger automatic reviews
3. Document everything: Every verification, every check, every decision should be logged and timestamped

The companies that move now will be compliant before enforcement accelerates. The companies that wait will be scrambling under pressure — which is when mistakes happen and costs multiply.

If you want to discuss how {{company}} can get ahead of this, I am happy to set up a 15-minute call — no pitch, just practical guidance on DPDP readiness for your vendor base.

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'nurture',
      'DPDP-NUR-4',
      '["first_name","company","sender_name"]',
      true
    );

    -- -------------------------------------------------------------------------
    -- B3. Industry Benchmarks & Stats (4 emails)
    -- -------------------------------------------------------------------------

    -- Benchmarks #1
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Nurture: Benchmarks 1 — Onboarding Speed',
      'How fast are other companies onboarding vendors?',
      '<p>{{first_name}}, we recently analyzed vendor onboarding data across 100+ Indian businesses. The numbers tell an interesting story about where your industry stands.</p><p><strong>Average vendor onboarding time by approach:</strong><br/>- Fully manual process: 7-10 business days<br/>- Semi-automated (some digital checks): 3-5 business days<br/>- Fully automated verification: Under 1 business day (median: 47 minutes)</p><p>The gap between manual and automated is not just about speed — it is about capacity. Companies using automated verification onboard 8x more vendors per quarter with the same team size. That is not theoretical; it is what we measure across our client base.</p><p><strong>Other benchmarks worth noting:</strong><br/>- Average cost per manual vendor verification: ₹3,200 (staff time + opportunity cost)<br/>- Error rate in manual GST checks: 14%<br/>- Percentage of companies re-verifying vendors annually: only 23%</p><p>If {{company}} is benchmarking its vendor operations, I can share the full industry report — broken down by sector and company size. Just let me know your industry and I will pull the relevant data.</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, we recently analyzed vendor onboarding data across 100+ Indian businesses. The numbers tell an interesting story about where your industry stands.

Average vendor onboarding time by approach:
- Fully manual process: 7-10 business days
- Semi-automated (some digital checks): 3-5 business days
- Fully automated verification: Under 1 business day (median: 47 minutes)

The gap between manual and automated is not just about speed — it is about capacity. Companies using automated verification onboard 8x more vendors per quarter with the same team size. That is not theoretical; it is what we measure across our client base.

Other benchmarks worth noting:
- Average cost per manual vendor verification: ₹3,200 (staff time + opportunity cost)
- Error rate in manual GST checks: 14%
- Percentage of companies re-verifying vendors annually: only 23%

If {{company}} is benchmarking its vendor operations, I can share the full industry report — broken down by sector and company size. Just let me know your industry and I will pull the relevant data.

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'nurture',
      'BENCH-NUR-1',
      '["first_name","company","sender_name"]',
      true
    );

    -- Benchmarks #2
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Nurture: Benchmarks 2 — Fraud Detection',
      'What percentage of your vendors would fail a check?',
      '<p>{{first_name}}, across our platform, we run thousands of vendor verifications monthly. Here is what the data reveals — and it consistently surprises even experienced procurement teams.</p><p><strong>Verification failure rates by check type:</strong><br/>- GST status issues (suspended, cancelled, inactive): 8.3% of vendors<br/>- PAN validation failures (mismatches, inactive): 4.7%<br/>- Adverse credit indicators: 11.2%<br/>- Bank account discrepancies: 6.1%<br/>- At least one red flag across all checks: 19.4%</p><p>That last number is the one that matters: nearly 1 in 5 vendors has at least one issue that should trigger additional review. Most of these are not outright fraud — they are operational issues like expired registrations or deteriorating financial health. But left unchecked, they become real problems.</p><p>The companies that catch these issues early spend 73% less on vendor-related remediation compared to those that discover problems reactively (during audits, payment failures, or supply disruptions).</p><p>Curious how {{company}}''s vendor base would score? We offer a free benchmark assessment for your top 3 vendors — real data, no commitment. Reply if you would like to try it.</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, across our platform, we run thousands of vendor verifications monthly. Here is what the data reveals — and it consistently surprises even experienced procurement teams.

Verification failure rates by check type:
- GST status issues (suspended, cancelled, inactive): 8.3% of vendors
- PAN validation failures (mismatches, inactive): 4.7%
- Adverse credit indicators: 11.2%
- Bank account discrepancies: 6.1%
- At least one red flag across all checks: 19.4%

That last number is the one that matters: nearly 1 in 5 vendors has at least one issue that should trigger additional review. Most of these are not outright fraud — they are operational issues like expired registrations or deteriorating financial health. But left unchecked, they become real problems.

The companies that catch these issues early spend 73% less on vendor-related remediation compared to those that discover problems reactively (during audits, payment failures, or supply disruptions).

Curious how {{company}}''s vendor base would score? We offer a free benchmark assessment for your top 3 vendors — real data, no commitment. Reply if you would like to try it.

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'nurture',
      'BENCH-NUR-2',
      '["first_name","company","sender_name"]',
      true
    );

    -- Benchmarks #3
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Nurture: Benchmarks 3 — Team Productivity',
      'Your team is spending 22 hrs/week on this',
      '<p>{{first_name}}, we surveyed procurement and finance teams across our client base. The average time spent on vendor verification and related tasks before adopting automation: 22 hours per week.</p><p><strong>Where those hours go:</strong><br/>- Collecting vendor documents (GST certificates, PAN copies, bank details): 6 hours<br/>- Manually verifying documents against government portals: 5 hours<br/>- Chasing vendors for missing or updated information: 4 hours<br/>- Data entry and record keeping: 3 hours<br/>- Cross-departmental coordination (finance ↔ procurement ↔ compliance): 4 hours</p><p><strong>After automation, that 22 hours drops to 3 hours per week.</strong> The remaining 3 hours are for exception handling — reviewing flagged vendors that need human judgment. Everything else runs automatically.</p><p>That is 19 hours per week returned to strategic work: negotiating better terms, diversifying the vendor base, building supplier relationships, or simply reducing overtime.</p><p>One procurement manager told us: "I did not realize how much of my week was consumed by verification until it was gone. Now I actually have time to do the job I was hired for."</p><p>If you want to see how this maps to {{company}}''s team size and vendor volume, I can run a quick productivity analysis — takes about 5 minutes on your end. Interested?</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, we surveyed procurement and finance teams across our client base. The average time spent on vendor verification and related tasks before adopting automation: 22 hours per week.

Where those hours go:
- Collecting vendor documents (GST certificates, PAN copies, bank details): 6 hours
- Manually verifying documents against government portals: 5 hours
- Chasing vendors for missing or updated information: 4 hours
- Data entry and record keeping: 3 hours
- Cross-departmental coordination (finance, procurement, compliance): 4 hours

After automation, that 22 hours drops to 3 hours per week. The remaining 3 hours are for exception handling — reviewing flagged vendors that need human judgment. Everything else runs automatically.

That is 19 hours per week returned to strategic work: negotiating better terms, diversifying the vendor base, building supplier relationships, or simply reducing overtime.

One procurement manager told us: "I did not realize how much of my week was consumed by verification until it was gone. Now I actually have time to do the job I was hired for."

If you want to see how this maps to {{company}}''s team size and vendor volume, I can run a quick productivity analysis — takes about 5 minutes on your end. Interested?

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'nurture',
      'BENCH-NUR-3',
      '["first_name","company","sender_name"]',
      true
    );

    -- Benchmarks #4
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Nurture: Benchmarks 4 — Maturity Model',
      'Where does {{company}} sit on this maturity curve?',
      '<p>{{first_name}}, based on working with 100+ businesses, we have identified 4 levels of vendor verification maturity. Most companies are surprised by where they actually fall.</p><p><strong>Level 1 — Reactive:</strong> Vendors are verified only when problems arise. No standard process, no documentation. Risk: very high.<br/><strong>Level 2 — Basic:</strong> Standard onboarding checklist exists. Manual verification of GST and PAN. Annual reviews (if they happen). Risk: high.<br/><strong>Level 3 — Systematic:</strong> Defined verification process with some automation. Regular re-verification cycles. Audit trail exists but may have gaps. Risk: moderate.<br/><strong>Level 4 — Intelligent:</strong> Fully automated verification against government APIs. Continuous monitoring with real-time alerts. Complete audit trail. Predictive risk scoring. Risk: low.</p><p>Our data shows the distribution: 35% of Indian businesses are at Level 1, 40% at Level 2, 20% at Level 3, and only 5% at Level 4. The jump from Level 2 to Level 3 delivers the biggest risk reduction — and it is more achievable than most teams think.</p><p>We built a free 5-minute Vendor Verification Maturity Assessment — answer 10 questions and get your score with specific recommendations for your level. Want the link?</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, based on working with 100+ businesses, we have identified 4 levels of vendor verification maturity. Most companies are surprised by where they actually fall.

Level 1 — Reactive: Vendors are verified only when problems arise. No standard process, no documentation. Risk: very high.
Level 2 — Basic: Standard onboarding checklist exists. Manual verification of GST and PAN. Annual reviews (if they happen). Risk: high.
Level 3 — Systematic: Defined verification process with some automation. Regular re-verification cycles. Audit trail exists but may have gaps. Risk: moderate.
Level 4 — Intelligent: Fully automated verification against government APIs. Continuous monitoring with real-time alerts. Complete audit trail. Predictive risk scoring. Risk: low.

Our data shows the distribution: 35% of Indian businesses are at Level 1, 40% at Level 2, 20% at Level 3, and only 5% at Level 4. The jump from Level 2 to Level 3 delivers the biggest risk reduction — and it is more achievable than most teams think.

We built a free 5-minute Vendor Verification Maturity Assessment — answer 10 questions and get your score with specific recommendations for your level. Want the link?

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'nurture',
      'BENCH-NUR-4',
      '["first_name","company","sender_name"]',
      true
    );

    -- -------------------------------------------------------------------------
    -- B4. ROI & Cost Savings (4 emails)
    -- -------------------------------------------------------------------------

    -- ROI #1
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Nurture: ROI 1 — The True Cost of Manual',
      'Manual vendor checks cost more than you think',
      '<p>{{first_name}}, when we ask companies what vendor verification costs them, they usually cite the direct costs: a few staff hours per vendor, maybe some portal subscription fees. The real number is 3-5x higher.</p><p><strong>The fully loaded cost of manual vendor verification:</strong><br/>- Staff time (collecting, verifying, entering data): ₹1,800-2,500 per vendor<br/>- Opportunity cost (what else those staff hours could produce): ₹800-1,200 per vendor<br/>- Error remediation (fixing mistakes found later): ₹400-700 per vendor<br/>- Compliance risk (prorated cost of potential penalties): ₹200-500 per vendor<br/>- <strong>Total: ₹3,200-4,900 per vendor</strong></p><p>Now multiply that by your annual vendor onboarding volume. A mid-size company adding 50 vendors per quarter is spending ₹6.4-9.8 lakh per year on verification alone — mostly hidden in staff time and cross-departmental coordination.</p><p>Automated verification via In-Sync brings the per-vendor cost down to ₹25-75 depending on the plan. The math is stark: ₹4,900 per vendor vs. ₹75 per vendor.</p><p>We built a free ROI calculator that uses your actual vendor volume and team size. Takes 2 minutes, gives you a defensible number for budget conversations. Want me to send the link?</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, when we ask companies what vendor verification costs them, they usually cite the direct costs: a few staff hours per vendor, maybe some portal subscription fees. The real number is 3-5x higher.

The fully loaded cost of manual vendor verification:
- Staff time (collecting, verifying, entering data): ₹1,800-2,500 per vendor
- Opportunity cost (what else those staff hours could produce): ₹800-1,200 per vendor
- Error remediation (fixing mistakes found later): ₹400-700 per vendor
- Compliance risk (prorated cost of potential penalties): ₹200-500 per vendor
- Total: ₹3,200-4,900 per vendor

Now multiply that by your annual vendor onboarding volume. A mid-size company adding 50 vendors per quarter is spending ₹6.4-9.8 lakh per year on verification alone — mostly hidden in staff time and cross-departmental coordination.

Automated verification via In-Sync brings the per-vendor cost down to ₹25-75 depending on the plan. The math is stark: ₹4,900 per vendor vs. ₹75 per vendor.

We built a free ROI calculator that uses your actual vendor volume and team size. Takes 2 minutes, gives you a defensible number for budget conversations. Want me to send the link?

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'nurture',
      'ROI-NUR-1',
      '["first_name","company","sender_name"]',
      true
    );

    -- ROI #2
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Nurture: ROI 2 — Payback Period',
      'In-Sync pays for itself in 11 days',
      '<p>{{first_name}}, the question every CFO and procurement head asks: how quickly does this pay for itself?</p><p>Based on actual client data, here is the average payback period by plan:<br/>- <strong>Starter (₹2,999/quarter)</strong>: Pays back in 3-5 vendor verifications — typically within the first week<br/>- <strong>Growth (₹7,499/quarter)</strong>: Pays back in 8-12 verifications — usually within 11 business days<br/>- <strong>Enterprise (₹14,999/quarter)</strong>: Pays back in 15-20 verifications — within 3 weeks for most teams</p><p>After payback, every additional verification is pure savings. A Growth plan client processing 50 vendors per quarter saves an estimated ₹2.1 lakh per quarter after the subscription cost — that is an 28x return on the investment.</p><p>But the ROI calculation most people miss is the risk avoidance. One client caught a vendor with a cancelled GST registration before processing a ₹12 lakh payment. That single catch paid for 6 years of their In-Sync subscription.</p><p>If your CFO needs a business case to approve the spend, we have a one-page ROI template that our most successful clients have used to get internal sign-off. It is designed to answer exactly the questions that finance teams ask. Reply and I will send it over.</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, the question every CFO and procurement head asks: how quickly does this pay for itself?

Based on actual client data, here is the average payback period by plan:
- Starter (₹2,999/quarter): Pays back in 3-5 vendor verifications — typically within the first week
- Growth (₹7,499/quarter): Pays back in 8-12 verifications — usually within 11 business days
- Enterprise (₹14,999/quarter): Pays back in 15-20 verifications — within 3 weeks for most teams

After payback, every additional verification is pure savings. A Growth plan client processing 50 vendors per quarter saves an estimated ₹2.1 lakh per quarter after the subscription cost — that is an 28x return on the investment.

But the ROI calculation most people miss is the risk avoidance. One client caught a vendor with a cancelled GST registration before processing a ₹12 lakh payment. That single catch paid for 6 years of their In-Sync subscription.

If your CFO needs a business case to approve the spend, we have a one-page ROI template that our most successful clients have used to get internal sign-off. It is designed to answer exactly the questions that finance teams ask. Reply and I will send it over.

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'nurture',
      'ROI-NUR-2',
      '["first_name","company","sender_name"]',
      true
    );

    -- ROI #3
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Nurture: ROI 3 — Time Savings',
      '7 days to 5 minutes: the time equation',
      '<p>{{first_name}}, time is the metric that matters most in vendor operations. Every day a vendor waits for verification is a day your teams cannot procure, your supply chain is constrained, and your competitive position weakens.</p><p><strong>Time comparison — manual vs. automated verification:</strong><br/>- GST verification: 45 minutes → 8 seconds<br/>- PAN validation: 30 minutes → 5 seconds<br/>- Credit report pull: 2-3 business days → 12 seconds<br/>- Bank statement analysis: 1-2 business days → 30 seconds<br/>- Complete vendor due diligence: 7-10 business days → under 5 minutes</p><p>But the time savings compound in ways that are not immediately obvious. When verification takes minutes instead of days, your team stops batching vendor onboarding into weekly or monthly cycles. They handle it in real-time, which means:<br/>- New vendors can start delivering within hours of being selected<br/>- Emergency vendor additions during supply disruptions happen same-day<br/>- Annual re-verification of your entire vendor base takes hours, not months</p><p>One supply chain director told us: "The speed is nice, but what changed the game was the ability to re-verify our entire 200-vendor base in a single afternoon. We found 14 issues we had no idea existed."</p><p>If speed is a priority for {{company}}, I would love to show you a live demo — watching a full verification complete in under a minute is more convincing than any email. Reply and I will set it up.</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, time is the metric that matters most in vendor operations. Every day a vendor waits for verification is a day your teams cannot procure, your supply chain is constrained, and your competitive position weakens.

Time comparison — manual vs. automated verification:
- GST verification: 45 minutes to 8 seconds
- PAN validation: 30 minutes to 5 seconds
- Credit report pull: 2-3 business days to 12 seconds
- Bank statement analysis: 1-2 business days to 30 seconds
- Complete vendor due diligence: 7-10 business days to under 5 minutes

But the time savings compound in ways that are not immediately obvious. When verification takes minutes instead of days, your team stops batching vendor onboarding into weekly or monthly cycles. They handle it in real-time, which means:
- New vendors can start delivering within hours of being selected
- Emergency vendor additions during supply disruptions happen same-day
- Annual re-verification of your entire vendor base takes hours, not months

One supply chain director told us: "The speed is nice, but what changed the game was the ability to re-verify our entire 200-vendor base in a single afternoon. We found 14 issues we had no idea existed."

If speed is a priority for {{company}}, I would love to show you a live demo — watching a full verification complete in under a minute is more convincing than any email. Reply and I will set it up.

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'nurture',
      'ROI-NUR-3',
      '["first_name","company","sender_name"]',
      true
    );

    -- ROI #4
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Nurture: ROI 4 — Risk Avoidance Value',
      'The ₹80 lakh vendor problem nobody saw coming',
      '<p>{{first_name}}, let me share a real story (details anonymized) about how one vendor nearly cost a company ₹80 lakh — and how automated verification prevented it.</p><p>A mid-size manufacturing firm had been working with a raw materials vendor for 3 years. Solid relationship, consistent deliveries. During a routine bulk re-verification through In-Sync, the vendor''s credit score showed a sharp decline and their GST return filing had stopped for 2 consecutive months.</p><p>The procurement team investigated and discovered the vendor was in severe financial distress — they were 60 days from insolvency. The manufacturing firm had a ₹80 lakh order pending with this vendor. They paused the order, diversified to a backup supplier, and avoided what would have been a significant write-off and production halt.</p><p><strong>The risk avoidance ROI framework:</strong><br/>- Average vendor-related financial loss per incident: ₹15-50 lakh<br/>- Average compliance penalty per incident: ₹5-25 lakh<br/>- Average supply disruption cost per incident: ₹10-75 lakh<br/>- Probability of at least one incident per year (100+ vendors): 34%<br/>- <strong>Expected annual risk cost without monitoring: ₹10-50 lakh</strong></p><p>Compare that to ₹30,000-60,000 per year for In-Sync. The question is not whether you can afford vendor verification — it is whether you can afford not to have it.</p><p>Want to discuss how this risk framework applies to {{company}}? I am happy to walk through it in 15 minutes.</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, let me share a real story (details anonymized) about how one vendor nearly cost a company ₹80 lakh — and how automated verification prevented it.

A mid-size manufacturing firm had been working with a raw materials vendor for 3 years. Solid relationship, consistent deliveries. During a routine bulk re-verification through In-Sync, the vendor''s credit score showed a sharp decline and their GST return filing had stopped for 2 consecutive months.

The procurement team investigated and discovered the vendor was in severe financial distress — they were 60 days from insolvency. The manufacturing firm had a ₹80 lakh order pending with this vendor. They paused the order, diversified to a backup supplier, and avoided what would have been a significant write-off and production halt.

The risk avoidance ROI framework:
- Average vendor-related financial loss per incident: ₹15-50 lakh
- Average compliance penalty per incident: ₹5-25 lakh
- Average supply disruption cost per incident: ₹10-75 lakh
- Probability of at least one incident per year (100+ vendors): 34%
- Expected annual risk cost without monitoring: ₹10-50 lakh

Compare that to ₹30,000-60,000 per year for In-Sync. The question is not whether you can afford vendor verification — it is whether you can afford not to have it.

Want to discuss how this risk framework applies to {{company}}? I am happy to walk through it in 15 minutes.

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'nurture',
      'ROI-NUR-4',
      '["first_name","company","sender_name"]',
      true
    );

    -- -------------------------------------------------------------------------
    -- B5. Best Practices for Vendor Due Diligence (4 emails)
    -- -------------------------------------------------------------------------

    -- Best Practices #1
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Nurture: Best Practices 1 — Onboarding Checklist',
      'The vendor onboarding checklist used by top firms',
      '<p>{{first_name}}, we have studied the vendor onboarding processes of the most operationally efficient companies in our client base. They all share a common framework — and it is simpler than you might expect.</p><p><strong>The 7-point vendor onboarding checklist:</strong><br/>1. <strong>Identity verification</strong> — PAN validation against government database (not just document collection)<br/>2. <strong>GST compliance check</strong> — Active registration, filing history, return consistency<br/>3. <strong>Credit health assessment</strong> — Credit score, payment history, outstanding liabilities<br/>4. <strong>Bank account verification</strong> — Account exists, matches vendor entity, no adverse flags<br/>5. <strong>Aadhaar authentication</strong> — For proprietorship and partnership firms, verify the principal<br/>6. <strong>Risk scoring</strong> — Combine all checks into a single risk score with clear accept/review/reject thresholds<br/>7. <strong>Compliance documentation</strong> — Auto-generate verification report with timestamps and source attribution</p><p>The companies that nail vendor onboarding do all 7 steps for every vendor, every time — no exceptions based on vendor size, relationship, or urgency. Consistency is what separates good processes from great ones.</p><p>We packaged this into a downloadable Vendor Onboarding SOP Template — complete with process flows, decision criteria, and documentation requirements. Want a copy?</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, we have studied the vendor onboarding processes of the most operationally efficient companies in our client base. They all share a common framework — and it is simpler than you might expect.

The 7-point vendor onboarding checklist:
1. Identity verification — PAN validation against government database (not just document collection)
2. GST compliance check — Active registration, filing history, return consistency
3. Credit health assessment — Credit score, payment history, outstanding liabilities
4. Bank account verification — Account exists, matches vendor entity, no adverse flags
5. Aadhaar authentication — For proprietorship and partnership firms, verify the principal
6. Risk scoring — Combine all checks into a single risk score with clear accept/review/reject thresholds
7. Compliance documentation — Auto-generate verification report with timestamps and source attribution

The companies that nail vendor onboarding do all 7 steps for every vendor, every time — no exceptions based on vendor size, relationship, or urgency. Consistency is what separates good processes from great ones.

We packaged this into a downloadable Vendor Onboarding SOP Template — complete with process flows, decision criteria, and documentation requirements. Want a copy?

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'nurture',
      'BP-NUR-1',
      '["first_name","company","sender_name"]',
      true
    );

    -- Best Practices #2
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Nurture: Best Practices 2 — Red Flag Response',
      'What to do when a vendor verification fails',
      '<p>{{first_name}}, finding a red flag during vendor verification is inevitable. How you respond to it determines whether it becomes a managed risk or an unmanaged crisis.</p><p>Most companies have no defined response protocol for verification failures. The result: inconsistent handling, delayed decisions, and sometimes ignoring the red flag entirely because the business relationship feels too important to disrupt.</p><p><strong>A structured red flag response framework:</strong><br/>- <strong>Amber flags</strong> (minor discrepancies): Request clarification from vendor within 48 hours. Common examples: slight GST address mismatch, credit score dip within acceptable range. Action: conditional approval with monitoring.<br/>- <strong>Red flags</strong> (significant issues): Escalate to compliance team immediately. Examples: cancelled GST, PAN mismatch, serious credit deterioration. Action: hold all pending orders, formal vendor review.<br/>- <strong>Black flags</strong> (critical failures): Stop all transactions immediately. Examples: fraudulent documents, Aadhaar authentication failure, vendor on government blacklist. Action: terminate relationship, report if required.</p><p>The key principle: every flag, every time, gets the same response. No exceptions for "important" vendors. The vendors you trust the most are often the ones where a red flag is most dangerous — because complacency has replaced vigilance.</p><p>We created a Red Flag Response Playbook with decision trees, escalation templates, and communication scripts. Free resource — reply if you would like a copy.</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, finding a red flag during vendor verification is inevitable. How you respond to it determines whether it becomes a managed risk or an unmanaged crisis.

Most companies have no defined response protocol for verification failures. The result: inconsistent handling, delayed decisions, and sometimes ignoring the red flag entirely because the business relationship feels too important to disrupt.

A structured red flag response framework:
- Amber flags (minor discrepancies): Request clarification from vendor within 48 hours. Common examples: slight GST address mismatch, credit score dip within acceptable range. Action: conditional approval with monitoring.
- Red flags (significant issues): Escalate to compliance team immediately. Examples: cancelled GST, PAN mismatch, serious credit deterioration. Action: hold all pending orders, formal vendor review.
- Black flags (critical failures): Stop all transactions immediately. Examples: fraudulent documents, Aadhaar authentication failure, vendor on government blacklist. Action: terminate relationship, report if required.

The key principle: every flag, every time, gets the same response. No exceptions for "important" vendors. The vendors you trust the most are often the ones where a red flag is most dangerous — because complacency has replaced vigilance.

We created a Red Flag Response Playbook with decision trees, escalation templates, and communication scripts. Free resource — reply if you would like a copy.

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'nurture',
      'BP-NUR-2',
      '["first_name","company","sender_name"]',
      true
    );

    -- Best Practices #3
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Nurture: Best Practices 3 — Periodic Reviews',
      'How often should you re-verify your vendors?',
      '<p>{{first_name}}, here is a question that sparks debate in every procurement and compliance team: how often should you re-verify existing vendors?</p><p>The traditional answer — annually — is increasingly inadequate. Government data changes faster than annual review cycles, and the vendors most likely to develop problems are the ones that slip between reviews.</p><p><strong>A risk-based re-verification schedule:</strong><br/>- <strong>Tier 1 (Critical vendors)</strong>: Continuous monitoring with real-time alerts. Full re-verification quarterly.<br/>- <strong>Tier 2 (Important vendors)</strong>: Automated monitoring for major changes. Full re-verification every 6 months.<br/>- <strong>Tier 3 (Standard vendors)</strong>: Annual re-verification with automated GST status checks monthly.<br/>- <strong>Triggered re-verification</strong>: Any vendor with a contract renewal, payment above threshold, or change in scope — regardless of tier.</p><p>The companies with the best vendor track records share one habit: they treat re-verification as a background process, not a periodic project. When monitoring is automated and continuous, there is no "re-verification season" — it just happens.</p><p>Practical tip: start by re-verifying your top 20 vendors by spend. That exercise alone usually uncovers 2-3 issues that have been hiding in plain sight. No software needed — just carve out an afternoon and work through the government portals manually.</p><p>Of course, if you want to re-verify your entire vendor base in an afternoon instead of a month, that is where automation earns its keep. Happy to show you how — just reply.</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, here is a question that sparks debate in every procurement and compliance team: how often should you re-verify existing vendors?

The traditional answer — annually — is increasingly inadequate. Government data changes faster than annual review cycles, and the vendors most likely to develop problems are the ones that slip between reviews.

A risk-based re-verification schedule:
- Tier 1 (Critical vendors): Continuous monitoring with real-time alerts. Full re-verification quarterly.
- Tier 2 (Important vendors): Automated monitoring for major changes. Full re-verification every 6 months.
- Tier 3 (Standard vendors): Annual re-verification with automated GST status checks monthly.
- Triggered re-verification: Any vendor with a contract renewal, payment above threshold, or change in scope — regardless of tier.

The companies with the best vendor track records share one habit: they treat re-verification as a background process, not a periodic project. When monitoring is automated and continuous, there is no "re-verification season" — it just happens.

Practical tip: start by re-verifying your top 20 vendors by spend. That exercise alone usually uncovers 2-3 issues that have been hiding in plain sight. No software needed — just carve out an afternoon and work through the government portals manually.

Of course, if you want to re-verify your entire vendor base in an afternoon instead of a month, that is where automation earns its keep. Happy to show you how — just reply.

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'nurture',
      'BP-NUR-3',
      '["first_name","company","sender_name"]',
      true
    );

    -- Best Practices #4
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Nurture: Best Practices 4 — Cross-Dept Alignment',
      'Finance, procurement, compliance — get them aligned',
      '<p>{{first_name}}, the biggest friction in vendor due diligence is not the verification itself — it is the coordination between departments. Finance wants financial health data. Procurement wants speed. Compliance wants audit trails. And everyone is using different tools, different criteria, and different timelines.</p><p>The result: vendors get stuck in limbo between departments, urgent onboarding requests bypass proper checks, and no one has a single source of truth for vendor status.</p><p><strong>How the best companies solve this:</strong><br/>1. <strong>Single vendor record</strong> — One profile per vendor that all departments access. No duplicate files, no conflicting data.<br/>2. <strong>Unified verification criteria</strong> — Finance, procurement, and compliance agree on a single checklist. No department can override another''s requirements.<br/>3. <strong>Automated routing</strong> — When a verification completes, the right people are notified automatically. No emails chasing approvals.<br/>4. <strong>Shared dashboard</strong> — Everyone sees the same vendor risk status. Real-time, not last-month''s spreadsheet.<br/>5. <strong>Exception handling protocol</strong> — Clear rules for who makes the call when a vendor falls in a grey area.</p><p>The payoff is not just efficiency — it is accountability. When every department sees the same data and follows the same process, finger-pointing disappears and vendor quality improves across the board.</p><p>We have seen this transformation happen at multiple companies. If {{company}} is dealing with cross-departmental friction on vendor management, I would be happy to share what has worked for others. Just reply.</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, the biggest friction in vendor due diligence is not the verification itself — it is the coordination between departments. Finance wants financial health data. Procurement wants speed. Compliance wants audit trails. And everyone is using different tools, different criteria, and different timelines.

The result: vendors get stuck in limbo between departments, urgent onboarding requests bypass proper checks, and no one has a single source of truth for vendor status.

How the best companies solve this:
1. Single vendor record — One profile per vendor that all departments access. No duplicate files, no conflicting data.
2. Unified verification criteria — Finance, procurement, and compliance agree on a single checklist. No department can override another''s requirements.
3. Automated routing — When a verification completes, the right people are notified automatically. No emails chasing approvals.
4. Shared dashboard — Everyone sees the same vendor risk status. Real-time, not last-month''s spreadsheet.
5. Exception handling protocol — Clear rules for who makes the call when a vendor falls in a grey area.

The payoff is not just efficiency — it is accountability. When every department sees the same data and follows the same process, finger-pointing disappears and vendor quality improves across the board.

We have seen this transformation happen at multiple companies. If {{company}} is dealing with cross-departmental friction on vendor management, I would be happy to share what has worked for others. Just reply.

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'nurture',
      'BP-NUR-4',
      '["first_name","company","sender_name"]',
      true
    );

  END LOOP;
END $$;

-- =============================================================================
-- C. RE-ENGAGEMENT SEQUENCES (6 ICPs × 3 steps = 18 emails)
--    Category: re_engagement
-- =============================================================================

DO $$
DECLARE
  _org_id uuid;
BEGIN
  FOR _org_id IN SELECT id FROM public.organizations LOOP

    -- -------------------------------------------------------------------------
    -- C1. CFO Re-engagement Sequence
    -- -------------------------------------------------------------------------

    -- CFO — New features (Day 0)
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Re-engage: CFO New Features Day 0',
      '{{first_name}}, In-Sync has changed since we spoke',
      '<p>{{first_name}}, it has been a while since we last connected, and I wanted to reach out because In-Sync has evolved significantly since our last conversation.</p><p>Here is what is new that I think matters for a CFO at {{company}}:<br/>- <strong>Batch verification</strong> — Verify up to 50 vendors in a single request. Re-verify your entire vendor base in an afternoon.<br/>- <strong>Financial health scoring</strong> — AI-powered risk scores that combine GST compliance, credit data, and bank statement analysis into one number.<br/>- <strong>Automated alerts</strong> — Real-time notifications when a vendor''s GST status, credit score, or bank details change.</p><p>We have also onboarded 40+ new clients since we last spoke — including several CFO-led implementations where the ROI case was the deciding factor.</p><p>Would it be worth 15 minutes to show you what has changed? No pressure — just a quick update call.</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, it has been a while since we last connected, and I wanted to reach out because In-Sync has evolved significantly since our last conversation.

Here is what is new that I think matters for a CFO at {{company}}:
- Batch verification — Verify up to 50 vendors in a single request. Re-verify your entire vendor base in an afternoon.
- Financial health scoring — AI-powered risk scores that combine GST compliance, credit data, and bank statement analysis into one number.
- Automated alerts — Real-time notifications when a vendor''s GST status, credit score, or bank details change.

We have also onboarded 40+ new clients since we last spoke — including several CFO-led implementations where the ROI case was the deciding factor.

Would it be worth 15 minutes to show you what has changed? No pressure — just a quick update call.

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      're_engagement',
      'CFO-RE-1',
      '["first_name","company","sender_name"]',
      true
    );

    -- CFO — Case study (Day 5)
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Re-engage: CFO Case Study Day 5',
      'How a CFO saved ₹18 lakh in vendor costs',
      '<p>{{first_name}}, thought you might find this relevant — a CFO at a mid-size manufacturing company (similar scale to {{company}}) shared their In-Sync results with us last month.</p><p><strong>Their situation before:</strong> 120 active vendors, manual verification taking 8 days per vendor, 2 full-time staff dedicated to vendor due diligence, and a compliance audit that flagged 23 vendors with incomplete records.</p><p><strong>After 6 months on In-Sync:</strong><br/>- Vendor onboarding time: 8 days → 35 minutes<br/>- Staff redeployed from verification to strategic finance work: 1.5 FTEs<br/>- Compliance audit findings: 23 → 0<br/>- Estimated annual savings: ₹18.4 lakh (staff time + risk avoidance + audit remediation)</p><p>The CFO told us: "The ROI was obvious within the first month. What surprised me was how much cleaner our vendor data became — it improved everything from cash flow forecasting to tax filing."</p><p>If this resonates with the challenges at {{company}}, I would love to reconnect. Even a quick 10-minute call to share more details on what worked for them.</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, thought you might find this relevant — a CFO at a mid-size manufacturing company (similar scale to {{company}}) shared their In-Sync results with us last month.

Their situation before: 120 active vendors, manual verification taking 8 days per vendor, 2 full-time staff dedicated to vendor due diligence, and a compliance audit that flagged 23 vendors with incomplete records.

After 6 months on In-Sync:
- Vendor onboarding time: 8 days to 35 minutes
- Staff redeployed from verification to strategic finance work: 1.5 FTEs
- Compliance audit findings: 23 to 0
- Estimated annual savings: ₹18.4 lakh (staff time + risk avoidance + audit remediation)

The CFO told us: "The ROI was obvious within the first month. What surprised me was how much cleaner our vendor data became — it improved everything from cash flow forecasting to tax filing."

If this resonates with the challenges at {{company}}, I would love to reconnect. Even a quick 10-minute call to share more details on what worked for them.

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      're_engagement',
      'CFO-RE-2',
      '["first_name","company","sender_name"]',
      true
    );

    -- CFO — Final check-in (Day 10)
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Re-engage: CFO Final Check Day 10',
      '{{first_name}}, closing your file — one last note',
      '<p>{{first_name}}, I want to be respectful of your time, so this will be my last outreach for now.</p><p>Before I close out {{company}}''s file, I wanted to leave you with one thing: we are offering 3 free vendor verifications — no signup, no credit card, no commitment. If vendor due diligence is still on your radar (even if the timing was not right before), this is a zero-risk way to see what has changed.</p><p>The offer stands whenever you are ready. Just reply to this email — even if it is 6 months from now — and I will set it up immediately.</p><p>Wishing {{company}} a strong quarter ahead.</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, I want to be respectful of your time, so this will be my last outreach for now.

Before I close out {{company}}''s file, I wanted to leave you with one thing: we are offering 3 free vendor verifications — no signup, no credit card, no commitment. If vendor due diligence is still on your radar (even if the timing was not right before), this is a zero-risk way to see what has changed.

The offer stands whenever you are ready. Just reply to this email — even if it is 6 months from now — and I will set it up immediately.

Wishing {{company}} a strong quarter ahead.

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      're_engagement',
      'CFO-RE-3',
      '["first_name","company","sender_name"]',
      true
    );

    -- -------------------------------------------------------------------------
    -- C2. COO Re-engagement Sequence
    -- -------------------------------------------------------------------------

    -- COO — New features (Day 0)
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Re-engage: COO New Features Day 0',
      '{{first_name}}, new ops capabilities in In-Sync',
      '<p>{{first_name}}, it has been a while — I hope things at {{company}} are moving well. I am reaching out because we have shipped several features since our last conversation that are specifically relevant to operations leaders.</p><p><strong>What is new:</strong><br/>- <strong>Workflow automation</strong> — Vendor verification can now trigger downstream actions automatically: PO approvals, vendor portal access, compliance notifications.<br/>- <strong>Bulk operations</strong> — Re-verify your entire vendor base in one click. Batch onboard new vendors from a CSV upload.<br/>- <strong>Department dashboards</strong> — Operations, finance, and compliance each get a tailored view of vendor health.</p><p>The feedback from COOs has been consistent: these features turned In-Sync from a verification tool into an operational command center for vendor management.</p><p>Would 15 minutes be worth it to see the updates? I think the workflow automation piece alone would change how {{company}}''s operations team handles vendor onboarding.</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, it has been a while — I hope things at {{company}} are moving well. I am reaching out because we have shipped several features since our last conversation that are specifically relevant to operations leaders.

What is new:
- Workflow automation — Vendor verification can now trigger downstream actions automatically: PO approvals, vendor portal access, compliance notifications.
- Bulk operations — Re-verify your entire vendor base in one click. Batch onboard new vendors from a CSV upload.
- Department dashboards — Operations, finance, and compliance each get a tailored view of vendor health.

The feedback from COOs has been consistent: these features turned In-Sync from a verification tool into an operational command center for vendor management.

Would 15 minutes be worth it to see the updates? I think the workflow automation piece alone would change how {{company}}''s operations team handles vendor onboarding.

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      're_engagement',
      'COO-RE-1',
      '["first_name","company","sender_name"]',
      true
    );

    -- COO — Case study (Day 5)
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Re-engage: COO Case Study Day 5',
      'How a COO eliminated vendor onboarding delays',
      '<p>{{first_name}}, a COO at a logistics company shared something with us recently that might resonate with your situation at {{company}}.</p><p>Their vendor onboarding process involved 4 departments, 3 different spreadsheets, and an average of 9 business days per vendor. The operations team was the bottleneck — they were responsible for coordinating between procurement, finance, and compliance, and spending 30% of their time just chasing approvals.</p><p><strong>After implementing In-Sync:</strong><br/>- Cross-department coordination time: reduced by 85%<br/>- Vendor onboarding: 9 days → same day<br/>- Operations team capacity recovered: 12 hours per week<br/>- Vendor satisfaction scores (survey): up 34%</p><p>The COO''s take: "My team stopped being traffic cops for vendor paperwork and started actually optimizing our operations. That shift alone was worth 10x the subscription."</p><p>If operational efficiency at {{company}} is still a priority, I would love to share more details. Quick call this week?</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, a COO at a logistics company shared something with us recently that might resonate with your situation at {{company}}.

Their vendor onboarding process involved 4 departments, 3 different spreadsheets, and an average of 9 business days per vendor. The operations team was the bottleneck — they were responsible for coordinating between procurement, finance, and compliance, and spending 30% of their time just chasing approvals.

After implementing In-Sync:
- Cross-department coordination time: reduced by 85%
- Vendor onboarding: 9 days to same day
- Operations team capacity recovered: 12 hours per week
- Vendor satisfaction scores (survey): up 34%

The COO''s take: "My team stopped being traffic cops for vendor paperwork and started actually optimizing our operations. That shift alone was worth 10x the subscription."

If operational efficiency at {{company}} is still a priority, I would love to share more details. Quick call this week?

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      're_engagement',
      'COO-RE-2',
      '["first_name","company","sender_name"]',
      true
    );

    -- COO — Final check-in (Day 10)
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Re-engage: COO Final Check Day 10',
      '{{first_name}}, last note before I step back',
      '<p>{{first_name}}, I do not want to overstay my welcome in your inbox, so this will be my last message for now.</p><p>If vendor operations at {{company}} become a priority again — whether it is a bottleneck, an audit finding, or just frustration with manual processes — we are here. Our 3 free verifications offer is always open: no sign-up, no sales call required.</p><p>Just reply to this email whenever the timing is right, and I will have you set up in 10 minutes.</p><p>Wishing you and the {{company}} team a productive quarter.</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, I do not want to overstay my welcome in your inbox, so this will be my last message for now.

If vendor operations at {{company}} become a priority again — whether it is a bottleneck, an audit finding, or just frustration with manual processes — we are here. Our 3 free verifications offer is always open: no sign-up, no sales call required.

Just reply to this email whenever the timing is right, and I will have you set up in 10 minutes.

Wishing you and the {{company}} team a productive quarter.

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      're_engagement',
      'COO-RE-3',
      '["first_name","company","sender_name"]',
      true
    );

    -- -------------------------------------------------------------------------
    -- C3. CTO Re-engagement Sequence
    -- -------------------------------------------------------------------------

    -- CTO — New features (Day 0)
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Re-engage: CTO New Features Day 0',
      '{{first_name}}, new API capabilities you should see',
      '<p>{{first_name}}, our engineering team has been busy since we last spoke, and I think the updates would interest you.</p><p><strong>Technical updates since our last conversation:</strong><br/>- <strong>REST API v3</strong> — Batch endpoints, webhook callbacks, and async verification support. 99.7% uptime SLA.<br/>- <strong>SDK libraries</strong> — Node.js, Python, and Java SDKs with full TypeScript definitions. Integration time: under 2 hours.<br/>- <strong>Webhook notifications</strong> — Real-time callbacks when vendor status changes. No polling required.<br/>- <strong>Sandbox environment</strong> — Full-featured sandbox with synthetic data for development and testing.</p><p>We also published comprehensive API documentation with interactive examples — your dev team can evaluate the integration complexity before committing to anything.</p><p>If {{company}}''s technical requirements have evolved since we last spoke, I would love to do a 15-minute technical walkthrough. Or I can simply send sandbox credentials and let your team explore on their own.</p><p>Which would you prefer?</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, our engineering team has been busy since we last spoke, and I think the updates would interest you.

Technical updates since our last conversation:
- REST API v3 — Batch endpoints, webhook callbacks, and async verification support. 99.7% uptime SLA.
- SDK libraries — Node.js, Python, and Java SDKs with full TypeScript definitions. Integration time: under 2 hours.
- Webhook notifications — Real-time callbacks when vendor status changes. No polling required.
- Sandbox environment — Full-featured sandbox with synthetic data for development and testing.

We also published comprehensive API documentation with interactive examples — your dev team can evaluate the integration complexity before committing to anything.

If {{company}}''s technical requirements have evolved since we last spoke, I would love to do a 15-minute technical walkthrough. Or I can simply send sandbox credentials and let your team explore on their own.

Which would you prefer?

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      're_engagement',
      'CTO-RE-1',
      '["first_name","company","sender_name"]',
      true
    );

    -- CTO — Case study (Day 5)
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Re-engage: CTO Case Study Day 5',
      'How a CTO replaced 6 months of dev work',
      '<p>{{first_name}}, a CTO at a fintech company recently shared their build-vs-buy experience — thought it might be relevant for {{company}}.</p><p>They initially planned to build vendor verification in-house. After 6 months and 3 engineers, they had integrations with 2 of the 5 government APIs they needed. Rate limiting, schema changes, and authentication edge cases consumed most of the engineering time.</p><p><strong>They switched to In-Sync and:</strong><br/>- Replaced 6 months of custom development with a 4-hour API integration<br/>- Freed 3 engineers to work on core product features<br/>- Got coverage of all 5 government APIs (GST, PAN, Aadhaar, credit, bank) immediately<br/>- Eliminated ongoing API maintenance burden (estimated: 0.5 FTE)</p><p>The CTO''s quote: "We were building plumbing when we should have been building product. In-Sync is the plumbing — it just works."</p><p>If {{company}} is evaluating build-vs-buy for any vendor verification needs, I am happy to share a detailed technical comparison. Or just send over sandbox access so your team can evaluate directly.</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, a CTO at a fintech company recently shared their build-vs-buy experience — thought it might be relevant for {{company}}.

They initially planned to build vendor verification in-house. After 6 months and 3 engineers, they had integrations with 2 of the 5 government APIs they needed. Rate limiting, schema changes, and authentication edge cases consumed most of the engineering time.

They switched to In-Sync and:
- Replaced 6 months of custom development with a 4-hour API integration
- Freed 3 engineers to work on core product features
- Got coverage of all 5 government APIs (GST, PAN, Aadhaar, credit, bank) immediately
- Eliminated ongoing API maintenance burden (estimated: 0.5 FTE)

The CTO''s quote: "We were building plumbing when we should have been building product. In-Sync is the plumbing — it just works."

If {{company}} is evaluating build-vs-buy for any vendor verification needs, I am happy to share a detailed technical comparison. Or just send over sandbox access so your team can evaluate directly.

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      're_engagement',
      'CTO-RE-2',
      '["first_name","company","sender_name"]',
      true
    );

    -- CTO — Final check-in (Day 10)
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Re-engage: CTO Final Check Day 10',
      '{{first_name}}, sandbox access stays open for you',
      '<p>{{first_name}}, this is my last outreach for now — I know CTOs have enough noise in their inbox.</p><p>One thing I will leave open: sandbox access to In-Sync''s API. No expiration, no strings. If {{company}}''s engineering team ever needs to evaluate vendor verification options, they can start testing immediately.</p><p>Just reply to this email — anytime — and I will send the credentials within the hour.</p><p>Here is to shipping great things at {{company}}.</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, this is my last outreach for now — I know CTOs have enough noise in their inbox.

One thing I will leave open: sandbox access to In-Sync''s API. No expiration, no strings. If {{company}}''s engineering team ever needs to evaluate vendor verification options, they can start testing immediately.

Just reply to this email — anytime — and I will send the credentials within the hour.

Here is to shipping great things at {{company}}.

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      're_engagement',
      'CTO-RE-3',
      '["first_name","company","sender_name"]',
      true
    );

    -- -------------------------------------------------------------------------
    -- C4. CCO Re-engagement Sequence
    -- -------------------------------------------------------------------------

    -- CCO — New features (Day 0)
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Re-engage: CCO New Features Day 0',
      '{{first_name}}, compliance features you have not seen',
      '<p>{{first_name}}, the compliance landscape has shifted since we last connected, and so has In-Sync. I wanted to share what is new — specifically for compliance leaders.</p><p><strong>New compliance-focused capabilities:</strong><br/>- <strong>DPDP compliance mapping</strong> — Every vendor verification now maps directly to DPDP Act requirements with auto-generated compliance documentation.<br/>- <strong>Audit-ready reports</strong> — One-click export of your complete vendor verification history in formats that regulators expect.<br/>- <strong>Continuous compliance monitoring</strong> — Real-time alerts when a vendor''s regulatory status changes — GST suspension, PAN issues, credit deterioration.<br/>- <strong>Compliance dashboard</strong> — Bird''s-eye view of your vendor base''s compliance health with drill-down capability.</p><p>With DPDP enforcement ramping up, several compliance heads have told us these features moved In-Sync from "nice to have" to "must have" on their priority list.</p><p>Would 15 minutes be worth it to see what has changed? I can focus the demo specifically on the compliance workflow.</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, the compliance landscape has shifted since we last connected, and so has In-Sync. I wanted to share what is new — specifically for compliance leaders.

New compliance-focused capabilities:
- DPDP compliance mapping — Every vendor verification now maps directly to DPDP Act requirements with auto-generated compliance documentation.
- Audit-ready reports — One-click export of your complete vendor verification history in formats that regulators expect.
- Continuous compliance monitoring — Real-time alerts when a vendor''s regulatory status changes — GST suspension, PAN issues, credit deterioration.
- Compliance dashboard — Bird''s-eye view of your vendor base''s compliance health with drill-down capability.

With DPDP enforcement ramping up, several compliance heads have told us these features moved In-Sync from "nice to have" to "must have" on their priority list.

Would 15 minutes be worth it to see what has changed? I can focus the demo specifically on the compliance workflow.

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      're_engagement',
      'CCO-RE-1',
      '["first_name","company","sender_name"]',
      true
    );

    -- CCO — Case study (Day 5)
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Re-engage: CCO Case Study Day 5',
      'Zero audit findings — how one CCO did it',
      '<p>{{first_name}}, a compliance head at a healthcare company shared their audit results with us last quarter — thought you should see this.</p><p><strong>Before In-Sync:</strong> Their last regulatory audit flagged 31 vendor compliance gaps — missing verification records, outdated GST certificates, no credit check documentation. The remediation took 6 weeks and cost ₹8 lakh in consultant fees.</p><p><strong>After 4 months on In-Sync:</strong><br/>- Regulatory audit findings related to vendor compliance: 0<br/>- Time spent preparing vendor documentation for audit: 2 hours (vs. 3 weeks previously)<br/>- Vendor compliance coverage: 100% (every vendor verified and monitored)<br/>- Auditor feedback: "Best vendor documentation we have seen at a company this size"</p><p>The CCO told us: "The auditors actually asked us what system we were using. That was a first — usually they are asking us what we were thinking."</p><p>If {{company}} has an audit coming up — or just wants to avoid the scramble — I can show you exactly how this client structured their compliance workflow. Quick call?</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, a compliance head at a healthcare company shared their audit results with us last quarter — thought you should see this.

Before In-Sync: Their last regulatory audit flagged 31 vendor compliance gaps — missing verification records, outdated GST certificates, no credit check documentation. The remediation took 6 weeks and cost ₹8 lakh in consultant fees.

After 4 months on In-Sync:
- Regulatory audit findings related to vendor compliance: 0
- Time spent preparing vendor documentation for audit: 2 hours (vs. 3 weeks previously)
- Vendor compliance coverage: 100% (every vendor verified and monitored)
- Auditor feedback: "Best vendor documentation we have seen at a company this size"

The CCO told us: "The auditors actually asked us what system we were using. That was a first — usually they are asking us what we were thinking."

If {{company}} has an audit coming up — or just wants to avoid the scramble — I can show you exactly how this client structured their compliance workflow. Quick call?

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      're_engagement',
      'CCO-RE-2',
      '["first_name","company","sender_name"]',
      true
    );

    -- CCO — Final check-in (Day 10)
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Re-engage: CCO Final Check Day 10',
      '{{first_name}}, one last compliance resource',
      '<p>{{first_name}}, I will keep this brief — this is my last note for now.</p><p>Before I step back, I wanted to share our DPDP Vendor Compliance Readiness Guide. It is the most comprehensive resource we have published — covers everything from vendor contract requirements to audit trail standards to penalty frameworks. Free download, no signup required.</p><p>Whether or not In-Sync is the right fit for {{company}} right now, this guide will help your compliance team prepare for what is coming.</p><p>Reply and I will send the link. And if vendor compliance ever moves up the priority list, you know where to find us.</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, I will keep this brief — this is my last note for now.

Before I step back, I wanted to share our DPDP Vendor Compliance Readiness Guide. It is the most comprehensive resource we have published — covers everything from vendor contract requirements to audit trail standards to penalty frameworks. Free download, no signup required.

Whether or not In-Sync is the right fit for {{company}} right now, this guide will help your compliance team prepare for what is coming.

Reply and I will send the link. And if vendor compliance ever moves up the priority list, you know where to find us.

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      're_engagement',
      'CCO-RE-3',
      '["first_name","company","sender_name"]',
      true
    );

    -- -------------------------------------------------------------------------
    -- C5. Procurement Head Re-engagement Sequence
    -- -------------------------------------------------------------------------

    -- Procurement — New features (Day 0)
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Re-engage: Procurement New Features Day 0',
      '{{first_name}}, vendor onboarding just got faster',
      '<p>{{first_name}}, it has been a while since we last spoke about vendor onboarding at {{company}}. I am reaching out because we have shipped features that directly address the pain points you mentioned.</p><p><strong>New for procurement teams:</strong><br/>- <strong>CSV bulk upload</strong> — Upload a list of vendors and get verification results for all of them within minutes. No more one-at-a-time processing.<br/>- <strong>Vendor self-service portal</strong> — Share a link with new vendors and they submit their details directly. In-Sync verifies automatically.<br/>- <strong>Approval workflows</strong> — Configure automatic approval thresholds. Vendors that pass all checks get approved instantly; only flagged vendors need manual review.<br/>- <strong>Vendor scorecards</strong> — Every vendor gets a comprehensive scorecard combining identity, financial health, and compliance data.</p><p>These features were built based on direct feedback from procurement heads — including several of the frustrations you shared during our conversation.</p><p>Would it be worth a quick 15-minute demo to see the updates? I think the bulk upload and self-service portal would resonate with your team.</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, it has been a while since we last spoke about vendor onboarding at {{company}}. I am reaching out because we have shipped features that directly address the pain points you mentioned.

New for procurement teams:
- CSV bulk upload — Upload a list of vendors and get verification results for all of them within minutes. No more one-at-a-time processing.
- Vendor self-service portal — Share a link with new vendors and they submit their details directly. In-Sync verifies automatically.
- Approval workflows — Configure automatic approval thresholds. Vendors that pass all checks get approved instantly; only flagged vendors need manual review.
- Vendor scorecards — Every vendor gets a comprehensive scorecard combining identity, financial health, and compliance data.

These features were built based on direct feedback from procurement heads — including several of the frustrations you shared during our conversation.

Would it be worth a quick 15-minute demo to see the updates? I think the bulk upload and self-service portal would resonate with your team.

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      're_engagement',
      'PROC-RE-1',
      '["first_name","company","sender_name"]',
      true
    );

    -- Procurement — Case study (Day 5)
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Re-engage: Procurement Case Study Day 5',
      'From 40-vendor backlog to zero in one week',
      '<p>{{first_name}}, a procurement head at a retail chain shared their results with us — it is one of those stories that makes the value immediately clear.</p><p><strong>Their challenge:</strong> 40 vendors stuck in various stages of verification. Some waiting 3 weeks. Procurement team spending 60% of their time on verification paperwork instead of strategic sourcing. Vendors frustrated and threatening to walk.</p><p><strong>Week 1 on In-Sync:</strong><br/>- Cleared the entire 40-vendor backlog in 3 days<br/>- Found 6 vendors with compliance issues that would have been missed manually<br/>- Set up auto-verification for new vendors — now onboarded in under an hour<br/>- Procurement team time on verification: 60% → 8%</p><p>The procurement head said: "My team went from dreading vendor onboarding to barely thinking about it. The backlog evaporated and has not come back in 4 months."</p><p>If {{company}} is still dealing with vendor backlogs or slow onboarding, this is solvable. Happy to show you how — or just set up your 3 free verifications and let your team experience it firsthand.</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, a procurement head at a retail chain shared their results with us — it is one of those stories that makes the value immediately clear.

Their challenge: 40 vendors stuck in various stages of verification. Some waiting 3 weeks. Procurement team spending 60% of their time on verification paperwork instead of strategic sourcing. Vendors frustrated and threatening to walk.

Week 1 on In-Sync:
- Cleared the entire 40-vendor backlog in 3 days
- Found 6 vendors with compliance issues that would have been missed manually
- Set up auto-verification for new vendors — now onboarded in under an hour
- Procurement team time on verification: 60% to 8%

The procurement head said: "My team went from dreading vendor onboarding to barely thinking about it. The backlog evaporated and has not come back in 4 months."

If {{company}} is still dealing with vendor backlogs or slow onboarding, this is solvable. Happy to show you how — or just set up your 3 free verifications and let your team experience it firsthand.

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      're_engagement',
      'PROC-RE-2',
      '["first_name","company","sender_name"]',
      true
    );

    -- Procurement — Final check-in (Day 10)
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Re-engage: Procurement Final Check Day 10',
      '{{first_name}}, parking this for now',
      '<p>{{first_name}}, I know procurement priorities shift constantly, and vendor verification might not be top of the list right now. That is completely fine.</p><p>I am parking {{company}}''s file for now, but wanted to leave the door open: whenever vendor onboarding speed, backlog, or compliance becomes a pain point, we are one reply away. The 3 free verifications offer does not expire.</p><p>One last suggestion: if you are evaluating vendor management improvements for next quarter''s budget, our ROI calculator can generate a one-page business case in 2 minutes. Happy to send it whenever useful.</p><p>Wishing your team a productive quarter ahead.</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, I know procurement priorities shift constantly, and vendor verification might not be top of the list right now. That is completely fine.

I am parking {{company}}''s file for now, but wanted to leave the door open: whenever vendor onboarding speed, backlog, or compliance becomes a pain point, we are one reply away. The 3 free verifications offer does not expire.

One last suggestion: if you are evaluating vendor management improvements for next quarter''s budget, our ROI calculator can generate a one-page business case in 2 minutes. Happy to send it whenever useful.

Wishing your team a productive quarter ahead.

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      're_engagement',
      'PROC-RE-3',
      '["first_name","company","sender_name"]',
      true
    );

    -- -------------------------------------------------------------------------
    -- C6. Supply Chain Head Re-engagement Sequence
    -- -------------------------------------------------------------------------

    -- Supply Chain — New features (Day 0)
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Re-engage: Supply Chain New Features Day 0',
      '{{first_name}}, supply chain risk monitoring is here',
      '<p>{{first_name}}, since our last conversation, we have built the feature that supply chain leaders have been asking for: continuous vendor risk monitoring with real-time alerts.</p><p><strong>What is new for supply chain teams:</strong><br/>- <strong>Vendor health monitoring</strong> — Track GST status, credit score, and financial health changes across your entire supplier base. Get alerted before problems become disruptions.<br/>- <strong>Supply risk scoring</strong> — Each vendor gets a dynamic risk score that updates in real-time. Score drops trigger automatic alerts to your supply chain team.<br/>- <strong>Tier mapping</strong> — Classify vendors by criticality and get different monitoring intensity for each tier. Single-source suppliers get the highest scrutiny.<br/>- <strong>Disruption prediction</strong> — AI-powered early warning system that flags vendors showing patterns consistent with financial distress or compliance failure.</p><p>One supply chain director told us: "This is the visibility I have been asking for since I started this role. I finally know the health of my vendor base in real-time."</p><p>If supply chain risk visibility is still a priority for {{company}}, a 15-minute demo would show you exactly how this works. Interested?</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, since our last conversation, we have built the feature that supply chain leaders have been asking for: continuous vendor risk monitoring with real-time alerts.

What is new for supply chain teams:
- Vendor health monitoring — Track GST status, credit score, and financial health changes across your entire supplier base. Get alerted before problems become disruptions.
- Supply risk scoring — Each vendor gets a dynamic risk score that updates in real-time. Score drops trigger automatic alerts to your supply chain team.
- Tier mapping — Classify vendors by criticality and get different monitoring intensity for each tier. Single-source suppliers get the highest scrutiny.
- Disruption prediction — AI-powered early warning system that flags vendors showing patterns consistent with financial distress or compliance failure.

One supply chain director told us: "This is the visibility I have been asking for since I started this role. I finally know the health of my vendor base in real-time."

If supply chain risk visibility is still a priority for {{company}}, a 15-minute demo would show you exactly how this works. Interested?

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      're_engagement',
      'SC-RE-1',
      '["first_name","company","sender_name"]',
      true
    );

    -- Supply Chain — Case study (Day 5)
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Re-engage: Supply Chain Case Study Day 5',
      'Caught a supplier collapse 3 weeks early',
      '<p>{{first_name}}, here is a real scenario from one of our supply chain clients — an automotive parts company with 85 active suppliers.</p><p>In-Sync''s continuous monitoring flagged a Tier-1 supplier: their credit score dropped 40 points in 2 weeks, and their GST return filing stopped. The supply chain team investigated and discovered the supplier was in a legal dispute that was draining their cash reserves.</p><p><strong>What happened:</strong><br/>- Alert triggered: 3 weeks before the supplier missed their first delivery<br/>- Action taken: Supply chain team activated backup supplier within 48 hours<br/>- Impact avoided: ₹1.2 crore in potential production line downtime<br/>- Total time from alert to mitigation: 4 business days</p><p>Without the early warning, they would have found out when the delivery did not show up — by which point the production impact would have been unavoidable.</p><p>The supply chain director said: "In-Sync does not just verify vendors — it watches them. That watching is what saved us."</p><p>If {{company}} manages critical supplier relationships, this kind of visibility could be a game-changer. Want to see how the monitoring works with your vendor data?</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, here is a real scenario from one of our supply chain clients — an automotive parts company with 85 active suppliers.

In-Sync''s continuous monitoring flagged a Tier-1 supplier: their credit score dropped 40 points in 2 weeks, and their GST return filing stopped. The supply chain team investigated and discovered the supplier was in a legal dispute that was draining their cash reserves.

What happened:
- Alert triggered: 3 weeks before the supplier missed their first delivery
- Action taken: Supply chain team activated backup supplier within 48 hours
- Impact avoided: ₹1.2 crore in potential production line downtime
- Total time from alert to mitigation: 4 business days

Without the early warning, they would have found out when the delivery did not show up — by which point the production impact would have been unavoidable.

The supply chain director said: "In-Sync does not just verify vendors — it watches them. That watching is what saved us."

If {{company}} manages critical supplier relationships, this kind of visibility could be a game-changer. Want to see how the monitoring works with your vendor data?

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      're_engagement',
      'SC-RE-2',
      '["first_name","company","sender_name"]',
      true
    );

    -- Supply Chain — Final check-in (Day 10)
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Re-engage: Supply Chain Final Check Day 10',
      '{{first_name}}, keeping your vendor risk file open',
      '<p>{{first_name}}, this is my last note for now. I understand that supply chain priorities at {{company}} may have shifted since we last spoke, and I respect that.</p><p>One standing offer: if you ever want a free risk snapshot of your top 3 critical suppliers — just send me their GSTIN numbers and I will run a full verification within the hour. No commitment, no follow-up calls unless you want them.</p><p>Supply chain disruptions do not send calendar invites. When vendor risk becomes urgent, we are one reply away.</p><p>All the best to you and the {{company}} team.</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, this is my last note for now. I understand that supply chain priorities at {{company}} may have shifted since we last spoke, and I respect that.

One standing offer: if you ever want a free risk snapshot of your top 3 critical suppliers — just send me their GSTIN numbers and I will run a full verification within the hour. No commitment, no follow-up calls unless you want them.

Supply chain disruptions do not send calendar invites. When vendor risk becomes urgent, we are one reply away.

All the best to you and the {{company}} team.

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      're_engagement',
      'SC-RE-3',
      '["first_name","company","sender_name"]',
      true
    );

  END LOOP;
END $$;

-- =============================================================================
-- D. EVENT/TRIGGER-BASED EMAILS (5 triggers × 4 variants = 20 emails)
--    Category: announcement
-- =============================================================================

DO $$
DECLARE
  _org_id uuid;
BEGIN
  FOR _org_id IN SELECT id FROM public.organizations LOOP

    -- -------------------------------------------------------------------------
    -- D1. Audit Season Approaching (4 variants by role)
    -- -------------------------------------------------------------------------

    -- Audit Season — CFO/Finance variant
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Event: Audit Season — Finance Leader',
      'Audit season is 6 weeks away, {{first_name}}',
      '<p>{{first_name}}, audit season is approaching and vendor compliance documentation is typically the area where finance teams scramble the most.</p><p>Here is what auditors are increasingly looking for in vendor files:<br/>- Real-time GST verification records (not photocopies of certificates)<br/>- Credit health assessments with dated reports<br/>- PAN validation against government databases<br/>- Bank account verification documentation<br/>- A complete audit trail showing when each check was performed and what data source was used</p><p>If {{company}}''s vendor files are not in this shape today, there is still time — but not a lot. Companies that start preparing now can usually get audit-ready in 2-3 weeks. Companies that wait until the last month face a costly scramble.</p><p>In-Sync can generate audit-ready vendor documentation for your entire vendor base in a single afternoon. Every verification is timestamped, sourced, and exportable in PDF or CSV format.</p><p>Want to get {{company}} audit-ready before the rush? We can have you set up and running this week — starting with 3 free verifications.</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, audit season is approaching and vendor compliance documentation is typically the area where finance teams scramble the most.

Here is what auditors are increasingly looking for in vendor files:
- Real-time GST verification records (not photocopies of certificates)
- Credit health assessments with dated reports
- PAN validation against government databases
- Bank account verification documentation
- A complete audit trail showing when each check was performed and what data source was used

If {{company}}''s vendor files are not in this shape today, there is still time — but not a lot. Companies that start preparing now can usually get audit-ready in 2-3 weeks. Companies that wait until the last month face a costly scramble.

In-Sync can generate audit-ready vendor documentation for your entire vendor base in a single afternoon. Every verification is timestamped, sourced, and exportable in PDF or CSV format.

Want to get {{company}} audit-ready before the rush? We can have you set up and running this week — starting with 3 free verifications.

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'announcement',
      'AUDIT-EVT-CFO',
      '["first_name","company","sender_name"]',
      true
    );

    -- Audit Season — Compliance variant
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Event: Audit Season — Compliance Leader',
      'Your vendor audit trail — ready or not?',
      '<p>{{first_name}}, with audit season approaching, here is the question that matters: can {{company}} produce a complete, verifiable vendor compliance audit trail on demand?</p><p>Last year, 67% of audit findings in the companies we surveyed were related to incomplete or outdated vendor documentation. The most common gaps: expired GST registrations that were never re-checked, vendor credit assessments that were never performed, and PAN validations that relied on document collection rather than government database verification.</p><p>Auditors are getting more sophisticated. They no longer accept a folder of photocopied certificates. They want to see systematic verification with timestamps, data sources, and change logs.</p><p>In-Sync generates exactly this: a compliance-grade audit trail for every vendor, every verification, every time. One-click export to PDF or CSV when your auditors come calling.</p><p>If you want to stress-test your current vendor documentation before the auditors do, I can run a free audit readiness check on your top 3 vendors. Reply and I will set it up today.</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, with audit season approaching, here is the question that matters: can {{company}} produce a complete, verifiable vendor compliance audit trail on demand?

Last year, 67% of audit findings in the companies we surveyed were related to incomplete or outdated vendor documentation. The most common gaps: expired GST registrations that were never re-checked, vendor credit assessments that were never performed, and PAN validations that relied on document collection rather than government database verification.

Auditors are getting more sophisticated. They no longer accept a folder of photocopied certificates. They want to see systematic verification with timestamps, data sources, and change logs.

In-Sync generates exactly this: a compliance-grade audit trail for every vendor, every verification, every time. One-click export to PDF or CSV when your auditors come calling.

If you want to stress-test your current vendor documentation before the auditors do, I can run a free audit readiness check on your top 3 vendors. Reply and I will set it up today.

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'announcement',
      'AUDIT-EVT-CCO',
      '["first_name","company","sender_name"]',
      true
    );

    -- Audit Season — Procurement variant
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Event: Audit Season — Procurement Leader',
      'Audit prep: is your vendor list clean?',
      '<p>{{first_name}}, audit season is around the corner and procurement teams usually bear the brunt of vendor documentation requests. If past years are any indicator, your team is about to spend weeks pulling together vendor files that should have been maintained all along.</p><p>The top 3 audit findings that hit procurement teams hardest:<br/>1. Vendors onboarded without complete verification documentation<br/>2. No evidence of periodic re-verification for existing vendors<br/>3. Inconsistent verification standards across different procurement team members</p><p>The fix is not working harder during audit prep — it is having a system that generates complete documentation as a byproduct of your normal onboarding process. That way, when auditors ask for vendor files, you export a report instead of starting a research project.</p><p>In-Sync can re-verify your entire vendor base and generate audit-ready documentation in a single session. No more scrambling, no more late nights before audit week.</p><p>Want to get ahead of it this year? 3 free verifications to start — takes 10 minutes to set up.</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, audit season is around the corner and procurement teams usually bear the brunt of vendor documentation requests. If past years are any indicator, your team is about to spend weeks pulling together vendor files that should have been maintained all along.

The top 3 audit findings that hit procurement teams hardest:
1. Vendors onboarded without complete verification documentation
2. No evidence of periodic re-verification for existing vendors
3. Inconsistent verification standards across different procurement team members

The fix is not working harder during audit prep — it is having a system that generates complete documentation as a byproduct of your normal onboarding process. That way, when auditors ask for vendor files, you export a report instead of starting a research project.

In-Sync can re-verify your entire vendor base and generate audit-ready documentation in a single session. No more scrambling, no more late nights before audit week.

Want to get ahead of it this year? 3 free verifications to start — takes 10 minutes to set up.

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'announcement',
      'AUDIT-EVT-PROC',
      '["first_name","company","sender_name"]',
      true
    );

    -- Audit Season — Operations variant
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Event: Audit Season — Operations Leader',
      'Audit season: protect your vendor operations',
      '<p>{{first_name}}, audit season has a way of disrupting operations. When compliance and finance teams start pulling vendor files, it creates a ripple effect across procurement, supply chain, and operations — exactly the departments that cannot afford the distraction.</p><p>The operations leaders we work with have found a way to eliminate audit-season disruptions entirely: automated vendor verification that generates audit-ready documentation as part of the normal workflow. When auditors request vendor files, it is a 5-minute export — not a 5-week project.</p><p>Here is what one operations leader told us: "Last year, audit prep cost my team 3 weeks of productivity. This year, we exported the vendor compliance report in 10 minutes and got back to work. The auditors had zero findings."</p><p>If you want to shield {{company}}''s operations team from audit-season disruptions, there is still time to get set up. Start with 3 free verifications and see how the documentation works.</p><p>Shall I set that up for you today?</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, audit season has a way of disrupting operations. When compliance and finance teams start pulling vendor files, it creates a ripple effect across procurement, supply chain, and operations — exactly the departments that cannot afford the distraction.

The operations leaders we work with have found a way to eliminate audit-season disruptions entirely: automated vendor verification that generates audit-ready documentation as part of the normal workflow. When auditors request vendor files, it is a 5-minute export — not a 5-week project.

Here is what one operations leader told us: "Last year, audit prep cost my team 3 weeks of productivity. This year, we exported the vendor compliance report in 10 minutes and got back to work. The auditors had zero findings."

If you want to shield {{company}}''s operations team from audit-season disruptions, there is still time to get set up. Start with 3 free verifications and see how the documentation works.

Shall I set that up for you today?

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'announcement',
      'AUDIT-EVT-OPS',
      '["first_name","company","sender_name"]',
      true
    );

    -- -------------------------------------------------------------------------
    -- D2. New Regulatory Change — DPDP Update (4 variants)
    -- -------------------------------------------------------------------------

    -- DPDP Update — CFO variant
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Event: DPDP Update — Finance Leader',
      'New DPDP rules impact vendor payments',
      '<p>{{first_name}}, the latest DPDP enforcement update has direct implications for how {{company}} manages vendor payments and financial data.</p><p>Key changes that affect finance teams:<br/>- Vendor bank account details are now classified as sensitive personal data under DPDP — verification and storage must meet enhanced security standards<br/>- Financial due diligence records must be maintained with verifiable data sources — self-declared vendor information no longer meets the threshold<br/>- Penalties for processing payments to unverified vendors have been clarified — and they are steep</p><p>The practical impact: your finance team needs to ensure every vendor''s identity and financial details are verified against government databases, not just collected from the vendor. And those verification records need to be audit-ready.</p><p>In-Sync was built for exactly this scenario. Every verification runs against GST, PAN, Aadhaar, credit, and bank APIs — with timestamped, compliance-grade records that meet DPDP requirements out of the box.</p><p>Given the enforcement timeline, this is worth a 15-minute conversation. Want me to walk through how In-Sync maps to the new requirements?</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, the latest DPDP enforcement update has direct implications for how {{company}} manages vendor payments and financial data.

Key changes that affect finance teams:
- Vendor bank account details are now classified as sensitive personal data under DPDP — verification and storage must meet enhanced security standards
- Financial due diligence records must be maintained with verifiable data sources — self-declared vendor information no longer meets the threshold
- Penalties for processing payments to unverified vendors have been clarified — and they are steep

The practical impact: your finance team needs to ensure every vendor''s identity and financial details are verified against government databases, not just collected from the vendor. And those verification records need to be audit-ready.

In-Sync was built for exactly this scenario. Every verification runs against GST, PAN, Aadhaar, credit, and bank APIs — with timestamped, compliance-grade records that meet DPDP requirements out of the box.

Given the enforcement timeline, this is worth a 15-minute conversation. Want me to walk through how In-Sync maps to the new requirements?

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'announcement',
      'DPDP-EVT-CFO',
      '["first_name","company","sender_name"]',
      true
    );

    -- DPDP Update — Compliance variant
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Event: DPDP Update — Compliance Leader',
      'DPDP enforcement update: vendor obligations tighten',
      '<p>{{first_name}}, the Data Protection Board just released new enforcement guidelines, and vendor management obligations have gotten significantly more specific.</p><p>What is new for compliance teams:<br/>- <strong>Vendor identity verification is now mandatory</strong> — not recommended, mandatory. Government database verification is the stated standard.<br/>- <strong>Continuous monitoring requirements</strong> — One-time verification at onboarding is explicitly insufficient. Ongoing compliance monitoring is expected.<br/>- <strong>Audit trail specifics</strong> — The guidelines now specify what a compliant audit trail looks like: data source attribution, timestamps, verification methodology, and change history.<br/>- <strong>Escalation timelines</strong> — Non-compliant vendors must be flagged and escalated within defined timeframes.</p><p>Most companies we speak with are not yet equipped to meet these requirements with their current manual processes. The guidelines were clearly written with automated verification in mind.</p><p>We have published a detailed DPDP Compliance Gap Analysis framework. I can also set up a 20-minute call to walk through how In-Sync maps to each new requirement — specifically for {{company}}''s situation.</p><p>Given the timelines, sooner is better. When works for you?</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, the Data Protection Board just released new enforcement guidelines, and vendor management obligations have gotten significantly more specific.

What is new for compliance teams:
- Vendor identity verification is now mandatory — not recommended, mandatory. Government database verification is the stated standard.
- Continuous monitoring requirements — One-time verification at onboarding is explicitly insufficient. Ongoing compliance monitoring is expected.
- Audit trail specifics — The guidelines now specify what a compliant audit trail looks like: data source attribution, timestamps, verification methodology, and change history.
- Escalation timelines — Non-compliant vendors must be flagged and escalated within defined timeframes.

Most companies we speak with are not yet equipped to meet these requirements with their current manual processes. The guidelines were clearly written with automated verification in mind.

We have published a detailed DPDP Compliance Gap Analysis framework. I can also set up a 20-minute call to walk through how In-Sync maps to each new requirement — specifically for {{company}}''s situation.

Given the timelines, sooner is better. When works for you?

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'announcement',
      'DPDP-EVT-CCO',
      '["first_name","company","sender_name"]',
      true
    );

    -- DPDP Update — CTO variant
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Event: DPDP Update — Technology Leader',
      'DPDP update: technical requirements for vendor data',
      '<p>{{first_name}}, the latest DPDP enforcement guidelines include specific technical requirements that your engineering and IT teams should be aware of.</p><p>Key technical implications:<br/>- <strong>API-level verification required</strong> — The guidelines explicitly reference "verification against authoritative data sources" — meaning government APIs, not document collection<br/>- <strong>Data encryption standards</strong> — Vendor personal data (PAN, Aadhaar, bank details) must be encrypted at rest and in transit with specified standards<br/>- <strong>Audit logging requirements</strong> — Every access to vendor personal data must be logged with user, timestamp, and purpose<br/>- <strong>Data retention policies</strong> — Clear timelines for how long verification data can be retained and when it must be purged</p><p>Building these capabilities in-house is feasible but time-consuming — and the enforcement timeline does not leave much room. Most companies are finding it more practical to use a purpose-built platform that handles the technical compliance requirements out of the box.</p><p>In-Sync handles all four requirements natively. If {{company}}''s engineering team wants to evaluate the technical architecture, I can arrange a call with our CTO or provide API documentation and sandbox access.</p><p>What would be most helpful?</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, the latest DPDP enforcement guidelines include specific technical requirements that your engineering and IT teams should be aware of.

Key technical implications:
- API-level verification required — The guidelines explicitly reference "verification against authoritative data sources" — meaning government APIs, not document collection
- Data encryption standards — Vendor personal data (PAN, Aadhaar, bank details) must be encrypted at rest and in transit with specified standards
- Audit logging requirements — Every access to vendor personal data must be logged with user, timestamp, and purpose
- Data retention policies — Clear timelines for how long verification data can be retained and when it must be purged

Building these capabilities in-house is feasible but time-consuming — and the enforcement timeline does not leave much room. Most companies are finding it more practical to use a purpose-built platform that handles the technical compliance requirements out of the box.

In-Sync handles all four requirements natively. If {{company}}''s engineering team wants to evaluate the technical architecture, I can arrange a call with our CTO or provide API documentation and sandbox access.

What would be most helpful?

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'announcement',
      'DPDP-EVT-CTO',
      '["first_name","company","sender_name"]',
      true
    );

    -- DPDP Update — Procurement variant
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Event: DPDP Update — Procurement Leader',
      'DPDP changes how you onboard vendors — here is how',
      '<p>{{first_name}}, the new DPDP enforcement guidelines directly impact vendor onboarding — and procurement teams are on the front line.</p><p>What changes for procurement:<br/>- <strong>Self-declared vendor information is no longer sufficient</strong> — You cannot rely on vendors submitting their own GST certificate or PAN copy. Government database verification is now the standard.<br/>- <strong>Verification must happen before first transaction</strong> — No more "onboard now, verify later." Every vendor must be verified before any purchase order or payment.<br/>- <strong>Documentation requirements are explicit</strong> — Each vendor file must include verified identity, financial health assessment, and compliance status — all from authoritative sources.</p><p>For procurement teams that handle high vendor volumes, meeting these requirements manually is effectively impossible within the enforcement timeline. Automated verification is the only practical path.</p><p>In-Sync can verify a vendor against all required government databases in under 5 minutes — with full documentation generated automatically. Your procurement team''s workflow barely changes; the compliance output transforms completely.</p><p>This is time-sensitive given the enforcement timeline. Want to see a quick demo this week?</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, the new DPDP enforcement guidelines directly impact vendor onboarding — and procurement teams are on the front line.

What changes for procurement:
- Self-declared vendor information is no longer sufficient — You cannot rely on vendors submitting their own GST certificate or PAN copy. Government database verification is now the standard.
- Verification must happen before first transaction — No more "onboard now, verify later." Every vendor must be verified before any purchase order or payment.
- Documentation requirements are explicit — Each vendor file must include verified identity, financial health assessment, and compliance status — all from authoritative sources.

For procurement teams that handle high vendor volumes, meeting these requirements manually is effectively impossible within the enforcement timeline. Automated verification is the only practical path.

In-Sync can verify a vendor against all required government databases in under 5 minutes — with full documentation generated automatically. Your procurement team''s workflow barely changes; the compliance output transforms completely.

This is time-sensitive given the enforcement timeline. Want to see a quick demo this week?

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'announcement',
      'DPDP-EVT-PROC',
      '["first_name","company","sender_name"]',
      true
    );

    -- -------------------------------------------------------------------------
    -- D3. Annual Review / Budget Planning Season (4 variants)
    -- -------------------------------------------------------------------------

    -- Budget Season — CFO variant
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Event: Budget Season — Finance Leader',
      '{{first_name}}, vendor ops budget for next quarter',
      '<p>{{first_name}}, with budget planning underway for the next quarter, I wanted to share some data that might inform {{company}}''s vendor management budget.</p><p><strong>What companies are budgeting for vendor operations:</strong><br/>- Companies with 50-100 vendors: ₹8-15 lakh/year in manual verification costs (staff time + tools + remediation)<br/>- Companies with 100-200 vendors: ₹15-30 lakh/year<br/>- Companies with 200+ vendors: ₹30-60 lakh/year</p><p>The majority of this spend is hidden in staff time across finance, procurement, and compliance departments. It rarely shows up as a line item — which is why it rarely gets optimized.</p><p>In-Sync replaces most of this hidden spend with a transparent ₹12,000-60,000/year subscription — depending on vendor volume and plan. The ROI is typically 5-15x based on actual client data.</p><p>If you are building next quarter''s budget, we have a one-page cost comparison template that lays out manual vs. automated vendor verification costs side by side. CFOs have told us it makes the business case straightforward.</p><p>Want me to send it over? Or better yet, I can customize it with {{company}}''s vendor volume for a more accurate comparison.</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, with budget planning underway for the next quarter, I wanted to share some data that might inform {{company}}''s vendor management budget.

What companies are budgeting for vendor operations:
- Companies with 50-100 vendors: ₹8-15 lakh/year in manual verification costs (staff time + tools + remediation)
- Companies with 100-200 vendors: ₹15-30 lakh/year
- Companies with 200+ vendors: ₹30-60 lakh/year

The majority of this spend is hidden in staff time across finance, procurement, and compliance departments. It rarely shows up as a line item — which is why it rarely gets optimized.

In-Sync replaces most of this hidden spend with a transparent ₹12,000-60,000/year subscription — depending on vendor volume and plan. The ROI is typically 5-15x based on actual client data.

If you are building next quarter''s budget, we have a one-page cost comparison template that lays out manual vs. automated vendor verification costs side by side. CFOs have told us it makes the business case straightforward.

Want me to send it over? Or better yet, I can customize it with {{company}}''s vendor volume for a more accurate comparison.

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'announcement',
      'BUDGET-EVT-CFO',
      '["first_name","company","sender_name"]',
      true
    );

    -- Budget Season — COO variant
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Event: Budget Season — Operations Leader',
      'Next quarter plan: cut vendor onboarding to 1 day',
      '<p>{{first_name}}, if {{company}}''s annual planning includes operational efficiency goals, vendor onboarding is one of the highest-ROI areas to optimize.</p><p>The typical operations team spends 15-25% of their time coordinating vendor verification across departments. That is time that could go toward process improvement, capacity planning, or strategic initiatives.</p><p><strong>What an optimized vendor operation looks like:</strong><br/>- New vendor onboarding: same-day (vs. 7-10 days)<br/>- Cross-department coordination for vendor verification: eliminated (automated routing)<br/>- Operations team time on vendor admin: 2-3 hours/week (vs. 15-22 hours/week)<br/>- Vendor satisfaction with onboarding speed: 90%+ (vs. industry average of 45%)</p><p>These numbers come from actual In-Sync clients with similar vendor volumes to {{company}}. The investment to achieve them: ₹7,499-14,999/quarter depending on the plan.</p><p>If vendor operations are part of next quarter''s efficiency targets, I can put together a projected impact analysis specific to {{company}}. Takes about 15 minutes. Interested?</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, if {{company}}''s annual planning includes operational efficiency goals, vendor onboarding is one of the highest-ROI areas to optimize.

The typical operations team spends 15-25% of their time coordinating vendor verification across departments. That is time that could go toward process improvement, capacity planning, or strategic initiatives.

What an optimized vendor operation looks like:
- New vendor onboarding: same-day (vs. 7-10 days)
- Cross-department coordination for vendor verification: eliminated (automated routing)
- Operations team time on vendor admin: 2-3 hours/week (vs. 15-22 hours/week)
- Vendor satisfaction with onboarding speed: 90%+ (vs. industry average of 45%)

These numbers come from actual In-Sync clients with similar vendor volumes to {{company}}. The investment to achieve them: ₹7,499-14,999/quarter depending on the plan.

If vendor operations are part of next quarter''s efficiency targets, I can put together a projected impact analysis specific to {{company}}. Takes about 15 minutes. Interested?

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'announcement',
      'BUDGET-EVT-COO',
      '["first_name","company","sender_name"]',
      true
    );

    -- Budget Season — Compliance variant
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Event: Budget Season — Compliance Leader',
      'Budget time: the cost of vendor non-compliance',
      '<p>{{first_name}}, as {{company}} plans next quarter''s budget, here is a number worth considering: the average cost of a vendor compliance incident in India is ₹22 lakh — combining penalties, remediation, legal fees, and operational disruption.</p><p>For compliance teams, the budget conversation is often difficult because the ROI is risk avoidance — preventing something that has not happened yet. Here is how to frame it:</p><p><strong>The compliance investment equation:</strong><br/>- In-Sync subscription: ₹12,000-60,000/year<br/>- Average vendor compliance incident cost: ₹22 lakh<br/>- Probability of at least one incident per year (100+ vendors): 34%<br/>- Expected annual risk cost without automated verification: ₹7.5 lakh<br/>- <strong>ROI of automated compliance: 12-60x the investment</strong></p><p>Add DPDP penalties to the equation (up to ₹250 crore) and the risk calculus becomes even more compelling.</p><p>We have a one-page compliance budget justification template that several CCOs have used successfully to secure budget approval. It is designed specifically for the questions that CFOs ask.</p><p>Want me to share it — or better yet, customize it with {{company}}''s vendor volume and risk profile?</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, as {{company}} plans next quarter''s budget, here is a number worth considering: the average cost of a vendor compliance incident in India is ₹22 lakh — combining penalties, remediation, legal fees, and operational disruption.

For compliance teams, the budget conversation is often difficult because the ROI is risk avoidance — preventing something that has not happened yet. Here is how to frame it:

The compliance investment equation:
- In-Sync subscription: ₹12,000-60,000/year
- Average vendor compliance incident cost: ₹22 lakh
- Probability of at least one incident per year (100+ vendors): 34%
- Expected annual risk cost without automated verification: ₹7.5 lakh
- ROI of automated compliance: 12-60x the investment

Add DPDP penalties to the equation (up to ₹250 crore) and the risk calculus becomes even more compelling.

We have a one-page compliance budget justification template that several CCOs have used successfully to secure budget approval. It is designed specifically for the questions that CFOs ask.

Want me to share it — or better yet, customize it with {{company}}''s vendor volume and risk profile?

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'announcement',
      'BUDGET-EVT-CCO',
      '["first_name","company","sender_name"]',
      true
    );

    -- Budget Season — Supply Chain variant
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Event: Budget Season — Supply Chain Leader',
      'Next quarter: zero supply disruptions from vendor risk',
      '<p>{{first_name}}, as {{company}} plans for next quarter, here is a goal worth putting on the board: zero preventable supply disruptions from vendor risk.</p><p>Across our client base, the average cost of a supply disruption caused by an unverified vendor issue (GST suspension, financial distress, compliance failure) is ₹35 lakh — including emergency sourcing, production delays, and expedited shipping.</p><p><strong>What supply chain teams are budgeting for vendor risk management:</strong><br/>- Manual approach: ₹15-40 lakh/year in staff time (and still missing critical issues)<br/>- Automated approach with In-Sync: ₹30,000-60,000/year with real-time monitoring and early warnings</p><p>The math: spend ₹60,000 to potentially avoid a ₹35 lakh disruption. And that is just one incident — most companies with 100+ vendors face multiple risk events per year.</p><p>If supply chain resilience is part of next quarter''s planning at {{company}}, I can model the risk reduction and cost savings based on your vendor volume and supply chain complexity. Takes about 15 minutes.</p><p>Worth a conversation?</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, as {{company}} plans for next quarter, here is a goal worth putting on the board: zero preventable supply disruptions from vendor risk.

Across our client base, the average cost of a supply disruption caused by an unverified vendor issue (GST suspension, financial distress, compliance failure) is ₹35 lakh — including emergency sourcing, production delays, and expedited shipping.

What supply chain teams are budgeting for vendor risk management:
- Manual approach: ₹15-40 lakh/year in staff time (and still missing critical issues)
- Automated approach with In-Sync: ₹30,000-60,000/year with real-time monitoring and early warnings

The math: spend ₹60,000 to potentially avoid a ₹35 lakh disruption. And that is just one incident — most companies with 100+ vendors face multiple risk events per year.

If supply chain resilience is part of next quarter''s planning at {{company}}, I can model the risk reduction and cost savings based on your vendor volume and supply chain complexity. Takes about 15 minutes.

Worth a conversation?

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'announcement',
      'BUDGET-EVT-SC',
      '["first_name","company","sender_name"]',
      true
    );

    -- -------------------------------------------------------------------------
    -- D4. Industry Event Follow-up (4 variants)
    -- -------------------------------------------------------------------------

    -- Industry Event — CFO variant
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Event: Industry Event — Finance Leader',
      '{{first_name}}, following up from the conference',
      '<p>{{first_name}}, great connecting at the event. The conversations around vendor risk and financial compliance reinforced something we see daily at In-Sync: companies know vendor verification is broken, but most have not found a scalable fix yet.</p><p>One session that stood out was the panel on hidden costs in vendor management. The data aligned closely with what we see across our 100+ clients: manual vendor verification costs 3-5x what most companies estimate when you factor in staff time, error remediation, and compliance risk.</p><p>Since you mentioned {{company}} is dealing with similar challenges, I wanted to share a few quick resources:<br/>- Our ROI calculator (2 minutes, specific to your vendor volume)<br/>- A case study from a CFO at a similar-scale company (₹18 lakh annual savings)<br/>- 3 free verifications so your team can test In-Sync with real vendors</p><p>Which of these would be most useful as a next step? Or if you prefer, a quick 15-minute call to continue the conversation from the event.</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, great connecting at the event. The conversations around vendor risk and financial compliance reinforced something we see daily at In-Sync: companies know vendor verification is broken, but most have not found a scalable fix yet.

One session that stood out was the panel on hidden costs in vendor management. The data aligned closely with what we see across our 100+ clients: manual vendor verification costs 3-5x what most companies estimate when you factor in staff time, error remediation, and compliance risk.

Since you mentioned {{company}} is dealing with similar challenges, I wanted to share a few quick resources:
- Our ROI calculator (2 minutes, specific to your vendor volume)
- A case study from a CFO at a similar-scale company (₹18 lakh annual savings)
- 3 free verifications so your team can test In-Sync with real vendors

Which of these would be most useful as a next step? Or if you prefer, a quick 15-minute call to continue the conversation from the event.

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'announcement',
      'EVENT-EVT-CFO',
      '["first_name","company","sender_name"]',
      true
    );

    -- Industry Event — CTO variant
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Event: Industry Event — Technology Leader',
      '{{first_name}}, API-first vendor verification',
      '<p>{{first_name}}, great meeting you at the event. Your comments about the challenges of integrating government APIs resonated — we hear the same frustrations from CTOs regularly.</p><p>The technical sessions highlighted a growing trend: companies moving from document-based verification to API-first verification. The shift makes sense — government APIs are the authoritative source, and direct API access eliminates the human error, delays, and scalability issues of document collection.</p><p>In-Sync abstracts the complexity of 5+ government APIs (GST, PAN, Aadhaar, credit bureaus, bank verification) into a single REST API. Your engineering team integrates once, and we handle the ongoing maintenance of government API connections, schema changes, and rate limiting.</p><p>Since {{company}} is evaluating this space, here is what I can offer:<br/>- Sandbox access with full API documentation (your dev team can evaluate independently)<br/>- A technical architecture call with our lead engineer (15 minutes)<br/>- 3 free production verifications to test with real vendor data</p><p>Which would be most useful?</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, great meeting you at the event. Your comments about the challenges of integrating government APIs resonated — we hear the same frustrations from CTOs regularly.

The technical sessions highlighted a growing trend: companies moving from document-based verification to API-first verification. The shift makes sense — government APIs are the authoritative source, and direct API access eliminates the human error, delays, and scalability issues of document collection.

In-Sync abstracts the complexity of 5+ government APIs (GST, PAN, Aadhaar, credit bureaus, bank verification) into a single REST API. Your engineering team integrates once, and we handle the ongoing maintenance of government API connections, schema changes, and rate limiting.

Since {{company}} is evaluating this space, here is what I can offer:
- Sandbox access with full API documentation (your dev team can evaluate independently)
- A technical architecture call with our lead engineer (15 minutes)
- 3 free production verifications to test with real vendor data

Which would be most useful?

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'announcement',
      'EVENT-EVT-CTO',
      '["first_name","company","sender_name"]',
      true
    );

    -- Industry Event — Compliance variant
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Event: Industry Event — Compliance Leader',
      '{{first_name}}, DPDP was the talk of the event',
      '<p>{{first_name}}, great meeting you at the event. DPDP dominated the compliance conversations — and for good reason. The vendor management implications are significant and the enforcement timeline is real.</p><p>The key takeaway from the compliance sessions: companies that are still relying on manual vendor verification are going to struggle to meet DPDP requirements before enforcement kicks in. The audit trail, continuous monitoring, and government database verification requirements are simply too demanding for spreadsheet-based processes.</p><p>Since our conversation about {{company}}''s compliance challenges, I have been thinking about how In-Sync could specifically help. A few options:<br/>- A free DPDP vendor compliance gap assessment for {{company}} (takes about 20 minutes)<br/>- Our DPDP Compliance Readiness Guide (comprehensive, free download)<br/>- 3 free vendor verifications so your compliance team can evaluate the audit trail quality</p><p>Which would be the most useful starting point? Happy to also continue our conversation over a 15-minute call this week.</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, great meeting you at the event. DPDP dominated the compliance conversations — and for good reason. The vendor management implications are significant and the enforcement timeline is real.

The key takeaway from the compliance sessions: companies that are still relying on manual vendor verification are going to struggle to meet DPDP requirements before enforcement kicks in. The audit trail, continuous monitoring, and government database verification requirements are simply too demanding for spreadsheet-based processes.

Since our conversation about {{company}}''s compliance challenges, I have been thinking about how In-Sync could specifically help. A few options:
- A free DPDP vendor compliance gap assessment for {{company}} (takes about 20 minutes)
- Our DPDP Compliance Readiness Guide (comprehensive, free download)
- 3 free vendor verifications so your compliance team can evaluate the audit trail quality

Which would be the most useful starting point? Happy to also continue our conversation over a 15-minute call this week.

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'announcement',
      'EVENT-EVT-CCO',
      '["first_name","company","sender_name"]',
      true
    );

    -- Industry Event — Procurement/Supply Chain variant
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Event: Industry Event — Procurement/SC Leader',
      '{{first_name}}, great connecting at the event',
      '<p>{{first_name}}, enjoyed our conversation at the event. The sessions on supply chain resilience and procurement efficiency were particularly relevant — the consensus was clear that vendor verification is a bottleneck most companies have accepted rather than solved.</p><p>Your point about {{company}}''s vendor onboarding challenges stuck with me. The 7-10 day verification cycle you described is exactly what we help companies eliminate — bringing it down to under an hour with full GST, PAN, credit, and bank verification included.</p><p>Since the event, I have put together a few resources that connect to our conversation:<br/>- A case study from a procurement head who cleared a 40-vendor backlog in their first week<br/>- Our vendor onboarding efficiency benchmark report (where does {{company}} compare?)<br/>- 3 free verifications so your team can test In-Sync with actual pending vendors</p><p>What would be the most useful next step? I am also happy to set up a quick demo call to pick up where we left off at the event.</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, enjoyed our conversation at the event. The sessions on supply chain resilience and procurement efficiency were particularly relevant — the consensus was clear that vendor verification is a bottleneck most companies have accepted rather than solved.

Your point about {{company}}''s vendor onboarding challenges stuck with me. The 7-10 day verification cycle you described is exactly what we help companies eliminate — bringing it down to under an hour with full GST, PAN, credit, and bank verification included.

Since the event, I have put together a few resources that connect to our conversation:
- A case study from a procurement head who cleared a 40-vendor backlog in their first week
- Our vendor onboarding efficiency benchmark report (where does {{company}} compare?)
- 3 free verifications so your team can test In-Sync with actual pending vendors

What would be the most useful next step? I am also happy to set up a quick demo call to pick up where we left off at the event.

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'announcement',
      'EVENT-EVT-PROC',
      '["first_name","company","sender_name"]',
      true
    );

    -- -------------------------------------------------------------------------
    -- D5. Vendor Failure in the News (4 variants — "Did you see...")
    -- -------------------------------------------------------------------------

    -- Vendor Failure News — CFO variant
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Event: Vendor Failure News — Finance Leader',
      'Did you see what happened to their vendor?',
      '<p>{{first_name}}, did you see the news about the company that lost ₹4.2 crore because a major vendor turned out to have a suspended GST registration and fabricated financial statements? The vendor had been onboarded 18 months ago with a manual verification process that missed both red flags.</p><p>This is not an isolated case. We track vendor-related financial incidents across industries, and the pattern is consistent: companies discover problems only after the damage is done — during an audit, a payment failure, or a supply disruption.</p><p>The financial exposure is real:<br/>- Input tax credit reversals on transactions with non-compliant vendors<br/>- Payment recovery costs when vendors become insolvent<br/>- Regulatory penalties for inadequate due diligence<br/>- Reputational damage from association with fraudulent entities</p><p>Every one of these risks is preventable with proper vendor verification. A 5-minute check against government databases would have caught both the GST suspension and the financial misrepresentation before a single rupee was committed.</p><p>If this news gives you pause about {{company}}''s vendor verification process, it is worth a conversation. We can do a quick risk assessment of your vendor base — free, confidential, and eye-opening.</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, did you see the news about the company that lost ₹4.2 crore because a major vendor turned out to have a suspended GST registration and fabricated financial statements? The vendor had been onboarded 18 months ago with a manual verification process that missed both red flags.

This is not an isolated case. We track vendor-related financial incidents across industries, and the pattern is consistent: companies discover problems only after the damage is done — during an audit, a payment failure, or a supply disruption.

The financial exposure is real:
- Input tax credit reversals on transactions with non-compliant vendors
- Payment recovery costs when vendors become insolvent
- Regulatory penalties for inadequate due diligence
- Reputational damage from association with fraudulent entities

Every one of these risks is preventable with proper vendor verification. A 5-minute check against government databases would have caught both the GST suspension and the financial misrepresentation before a single rupee was committed.

If this news gives you pause about {{company}}''s vendor verification process, it is worth a conversation. We can do a quick risk assessment of your vendor base — free, confidential, and eye-opening.

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'announcement',
      'NEWS-EVT-CFO',
      '["first_name","company","sender_name"]',
      true
    );

    -- Vendor Failure News — Compliance variant
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Event: Vendor Failure News — Compliance Leader',
      'Did you see the vendor compliance failure?',
      '<p>{{first_name}}, the vendor compliance failure that made headlines this week should be a wake-up call for every compliance leader. A company faced ₹15 crore in combined penalties and losses because their vendor due diligence process failed to catch multiple compliance red flags.</p><p>The post-incident analysis revealed the root causes: no government database verification (they relied on vendor-submitted documents), no ongoing monitoring (the vendor''s compliance status had deteriorated over 6 months), and no audit trail to demonstrate reasonable due diligence.</p><p>Under DPDP, the penalties for this kind of failure are even steeper. The Data Protection Board has made it clear: "I did not know" is not a defense when authoritative verification tools exist and were not used.</p><p>Three questions every compliance leader should ask after seeing this news:<br/>1. Are our vendor verifications based on government database checks, or vendor-submitted documents?<br/>2. Would we catch a vendor''s compliance status change within days, or discover it months later?<br/>3. Can we produce an audit trail that demonstrates systematic, reasonable due diligence?</p><p>If any answer is unsatisfactory, the risk is real and quantifiable. I am happy to run a confidential compliance gap assessment for {{company}} — no cost, no obligation. Just a clear picture of where you stand.</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, the vendor compliance failure that made headlines this week should be a wake-up call for every compliance leader. A company faced ₹15 crore in combined penalties and losses because their vendor due diligence process failed to catch multiple compliance red flags.

The post-incident analysis revealed the root causes: no government database verification (they relied on vendor-submitted documents), no ongoing monitoring (the vendor''s compliance status had deteriorated over 6 months), and no audit trail to demonstrate reasonable due diligence.

Under DPDP, the penalties for this kind of failure are even steeper. The Data Protection Board has made it clear: "I did not know" is not a defense when authoritative verification tools exist and were not used.

Three questions every compliance leader should ask after seeing this news:
1. Are our vendor verifications based on government database checks, or vendor-submitted documents?
2. Would we catch a vendor''s compliance status change within days, or discover it months later?
3. Can we produce an audit trail that demonstrates systematic, reasonable due diligence?

If any answer is unsatisfactory, the risk is real and quantifiable. I am happy to run a confidential compliance gap assessment for {{company}} — no cost, no obligation. Just a clear picture of where you stand.

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'announcement',
      'NEWS-EVT-CCO',
      '["first_name","company","sender_name"]',
      true
    );

    -- Vendor Failure News — Procurement variant
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Event: Vendor Failure News — Procurement Leader',
      'Did you see how that vendor slipped through?',
      '<p>{{first_name}}, this week''s news about a procurement team that onboarded a vendor with fabricated credentials is a cautionary tale for every procurement leader.</p><p>The vendor had a valid-looking GST certificate, a professional website, and strong references. But their GST registration had been cancelled 3 months prior, their PAN was registered to a different entity, and their credit report showed multiple defaults. None of this was caught because the procurement team relied on documents the vendor themselves provided.</p><p>The damage: ₹2.8 crore in prepaid orders that were never fulfilled, plus the cost of emergency sourcing from alternative vendors at premium rates.</p><p>This is the fundamental flaw in document-based vendor verification: you are trusting the entity you are supposed to be verifying. It is like asking a job candidate to write their own reference letter.</p><p>Government database verification eliminates this entirely. When you check a vendor''s GST against the government portal, PAN against the NSDL database, and credit history against the bureau — there is no room for fabrication.</p><p>If {{company}}''s procurement team still relies primarily on vendor-submitted documents, this risk is active right now. A 3-vendor pilot with In-Sync would show you exactly what government database verification reveals. Free, fast, and eye-opening.</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, this week''s news about a procurement team that onboarded a vendor with fabricated credentials is a cautionary tale for every procurement leader.

The vendor had a valid-looking GST certificate, a professional website, and strong references. But their GST registration had been cancelled 3 months prior, their PAN was registered to a different entity, and their credit report showed multiple defaults. None of this was caught because the procurement team relied on documents the vendor themselves provided.

The damage: ₹2.8 crore in prepaid orders that were never fulfilled, plus the cost of emergency sourcing from alternative vendors at premium rates.

This is the fundamental flaw in document-based vendor verification: you are trusting the entity you are supposed to be verifying. It is like asking a job candidate to write their own reference letter.

Government database verification eliminates this entirely. When you check a vendor''s GST against the government portal, PAN against the NSDL database, and credit history against the bureau — there is no room for fabrication.

If {{company}}''s procurement team still relies primarily on vendor-submitted documents, this risk is active right now. A 3-vendor pilot with In-Sync would show you exactly what government database verification reveals. Free, fast, and eye-opening.

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'announcement',
      'NEWS-EVT-PROC',
      '["first_name","company","sender_name"]',
      true
    );

    -- Vendor Failure News — Supply Chain variant
    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Event: Vendor Failure News — Supply Chain Leader',
      'Did you see the supply chain disruption story?',
      '<p>{{first_name}}, the supply chain disruption that hit the news this week is a textbook case of preventable vendor failure.</p><p>A manufacturer''s key supplier went under with zero warning — or so they thought. Turns out, the warning signs were visible months earlier: declining credit score, inconsistent GST filing, and a pattern of late payments to their own suppliers. None of these signals were monitored.</p><p>The result: a 6-week production halt, ₹3.5 crore in lost revenue, emergency sourcing costs at 40% premium, and customer contracts at risk.</p><p>This is what keeps supply chain leaders up at night — and it is entirely preventable. Continuous vendor monitoring catches financial deterioration patterns weeks or months before they become supply disruptions. The signals are always there; the question is whether anyone is watching.</p><p>In-Sync monitors GST status, credit scores, and financial health indicators across your entire vendor base in real-time. When a supplier shows early signs of distress, your team gets alerted while there is still time to activate alternatives.</p><p>If this story hits close to home for {{company}}''s supply chain, I can run a free risk snapshot on your top 3 critical suppliers — just send me their GSTIN numbers and you will have results within the hour.</p><p>Best,<br/>{{sender_name}}</p>',
      '{{first_name}}, the supply chain disruption that hit the news this week is a textbook case of preventable vendor failure.

A manufacturer''s key supplier went under with zero warning — or so they thought. Turns out, the warning signs were visible months earlier: declining credit score, inconsistent GST filing, and a pattern of late payments to their own suppliers. None of these signals were monitored.

The result: a 6-week production halt, ₹3.5 crore in lost revenue, emergency sourcing costs at 40% premium, and customer contracts at risk.

This is what keeps supply chain leaders up at night — and it is entirely preventable. Continuous vendor monitoring catches financial deterioration patterns weeks or months before they become supply disruptions. The signals are always there; the question is whether anyone is watching.

In-Sync monitors GST status, credit scores, and financial health indicators across your entire vendor base in real-time. When a supplier shows early signs of distress, your team gets alerted while there is still time to activate alternatives.

If this story hits close to home for {{company}}''s supply chain, I can run a free risk snapshot on your top 3 critical suppliers — just send me their GSTIN numbers and you will have results within the hour.

Best,
{{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'announcement',
      'NEWS-EVT-SC',
      '["first_name","company","sender_name"]',
      true
    );

  END LOOP;
END $$;
