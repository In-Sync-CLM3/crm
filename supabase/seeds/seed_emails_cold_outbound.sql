-- =============================================================================
-- SEED: mkt_email_templates - Cold Outbound Sequences
-- Product: In-Sync (B2B SaaS vendor financial due diligence platform)
-- Total: 75 email templates
-- =============================================================================
-- Categories:
--   E. Cold Intro First Touch (6 ICPs x 2 A/B = 12)
--   F. Cold Pain Amplifier (6 ICPs x 2 A/B = 12)
--   G. Cold Social Proof (6 ICPs x 2 A/B = 12)
--   H. Cold Value/ROI Offer (6 ICPs x 2 A/B = 12)
--   I. Cold Breakup / Last Touch (6 ICPs x 2 A/B = 12)
--   J. Cold Industry Vertical (5 industries x 3 = 15)
-- =============================================================================

DO $$
DECLARE
  _org_id uuid;
BEGIN
  FOR _org_id IN SELECT id FROM public.organizations LOOP

    -- =========================================================================
    -- E. COLD INTRO FIRST TOUCH - 6 ICPs x 2 A/B variants = 12 templates
    -- First email a prospect receives. Short, curiosity-driven, soft question.
    -- =========================================================================

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Intro: CFO First Touch A',
      '{{first_name}}, how confident are you in your vendor financials?',
      '<p>Hi {{first_name}},</p><p>Quick question — when was the last time {{company}} caught a financially unstable vendor <em>before</em> they became a problem?</p><p>Most CFOs I speak with admit their vendor due diligence is still largely manual. GST returns checked on one portal, PAN validated on another, credit history pulled separately — if it''s pulled at all. The whole process takes 7-10 days per vendor, and gaps slip through.</p><p>The uncomfortable truth: every unchecked vendor sitting in your payables is a potential write-off waiting to happen. One shell company, one cancelled GSTIN, one fabricated bank statement — and it''s your balance sheet that takes the hit.</p><p>We built In-Sync to collapse that entire process into under 5 minutes. GST, PAN, credit bureau, bank statements, Aadhaar — all verified automatically, all in one place.</p><p>Curious — does {{company}} have a reliable way to catch vendor red flags before payments go out?</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    Quick question — when was the last time {{company}} caught a financially unstable vendor before they became a problem?

    Most CFOs I speak with admit their vendor due diligence is still largely manual. GST returns checked on one portal, PAN validated on another, credit history pulled separately — if it''s pulled at all. The whole process takes 7-10 days per vendor, and gaps slip through.

    The uncomfortable truth: every unchecked vendor sitting in your payables is a potential write-off waiting to happen. One shell company, one cancelled GSTIN, one fabricated bank statement — and it''s your balance sheet that takes the hit.

    We built In-Sync to collapse that entire process into under 5 minutes. GST, PAN, credit bureau, bank statements, Aadhaar — all verified automatically, all in one place.

    Curious — does {{company}} have a reliable way to catch vendor red flags before payments go out?

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'CFO-CO-1A',
      '["first_name","company","sender_name"]',
      true
    );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Intro: CFO First Touch B',
      '₹47 lakh — the average cost of one bad vendor, {{first_name}}',
      '<p>Hi {{first_name}},</p><p>A recent industry study found that Indian enterprises lose an average of ₹47 lakh per bad vendor relationship — between disputed invoices, contractual penalties, and recovery costs. Most of these situations were preventable with proper upfront due diligence.</p><p>The challenge? Manual verification across GST, PAN, credit bureaus, and bank statements takes 7-10 days per vendor. So teams cut corners. They skip credit checks. They approve vendors based on a PAN card photocopy and a handshake.</p><p>At In-Sync, we automated the entire vendor financial verification workflow. What used to take your team a week now takes under 5 minutes — with more thorough checks than most enterprises run manually.</p><p>{{first_name}}, how much visibility does {{company}} currently have into vendor financial health at the point of onboarding?</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    A recent industry study found that Indian enterprises lose an average of ₹47 lakh per bad vendor relationship — between disputed invoices, contractual penalties, and recovery costs. Most of these situations were preventable with proper upfront due diligence.

    The challenge? Manual verification across GST, PAN, credit bureaus, and bank statements takes 7-10 days per vendor. So teams cut corners. They skip credit checks. They approve vendors based on a PAN card photocopy and a handshake.

    At In-Sync, we automated the entire vendor financial verification workflow. What used to take your team a week now takes under 5 minutes — with more thorough checks than most enterprises run manually.

    {{first_name}}, how much visibility does {{company}} currently have into vendor financial health at the point of onboarding?

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'CFO-CO-1B',
      '["first_name","company","sender_name"]',
      true
    );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Intro: COO First Touch A',
      '{{first_name}}, is vendor onboarding your silent bottleneck?',
      '<p>Hi {{first_name}},</p><p>Here''s a pattern I see at growing companies: procurement waits on finance for vendor verification, finance waits on compliance for document checks, compliance waits on the vendor for missing paperwork. Meanwhile, the business waits on everyone.</p><p>At most organisations, onboarding a single vendor takes 7-10 days of back-and-forth across departments. Multiply that by dozens of new vendors per quarter, and you''ve got a serious drag on operational velocity that rarely shows up in any dashboard.</p><p>In-Sync automates the entire vendor financial verification process — GST, PAN, credit checks, bank statement analysis, Aadhaar — in under 5 minutes. One platform, no interdepartmental ping-pong, no manual data entry.</p><p>{{first_name}}, how many departments at {{company}} currently touch a vendor onboarding before it''s approved?</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    Here''s a pattern I see at growing companies: procurement waits on finance for vendor verification, finance waits on compliance for document checks, compliance waits on the vendor for missing paperwork. Meanwhile, the business waits on everyone.

    At most organisations, onboarding a single vendor takes 7-10 days of back-and-forth across departments. Multiply that by dozens of new vendors per quarter, and you''ve got a serious drag on operational velocity that rarely shows up in any dashboard.

    In-Sync automates the entire vendor financial verification process — GST, PAN, credit checks, bank statement analysis, Aadhaar — in under 5 minutes. One platform, no interdepartmental ping-pong, no manual data entry.

    {{first_name}}, how many departments at {{company}} currently touch a vendor onboarding before it''s approved?

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'COO-CO-1A',
      '["first_name","company","sender_name"]',
      true
    );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Intro: COO First Touch B',
      '7-10 days per vendor — {{company}}''s onboarding math doesn''t add up',
      '<p>Hi {{first_name}},</p><p>I ran a rough calculation recently: if a mid-size company onboards 50 vendors per quarter, and each takes 7-10 days of verification effort across teams, that''s 350-500 person-days per year spent just checking if vendors are legitimate.</p><p>That''s not a compliance problem. That''s an operations problem. And it compounds — delayed onboarding means delayed purchase orders, delayed deliveries, and project timelines that slip before they even start.</p><p>In-Sync replaces that entire manual workflow with automated verification. GST filing status, PAN validation, credit bureau checks, bank statement analysis — all completed in under 5 minutes per vendor. No spreadsheets, no portal-hopping, no chasing documents.</p><p>{{first_name}}, has {{company}} quantified how much operational time goes into vendor verification each quarter?</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    I ran a rough calculation recently: if a mid-size company onboards 50 vendors per quarter, and each takes 7-10 days of verification effort across teams, that''s 350-500 person-days per year spent just checking if vendors are legitimate.

    That''s not a compliance problem. That''s an operations problem. And it compounds — delayed onboarding means delayed purchase orders, delayed deliveries, and project timelines that slip before they even start.

    In-Sync replaces that entire manual workflow with automated verification. GST filing status, PAN validation, credit bureau checks, bank statement analysis — all completed in under 5 minutes per vendor. No spreadsheets, no portal-hopping, no chasing documents.

    {{first_name}}, has {{company}} quantified how much operational time goes into vendor verification each quarter?

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'COO-CO-1B',
      '["first_name","company","sender_name"]',
      true
    );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Intro: CTO First Touch A',
      '{{first_name}}, are you building vendor verification in-house?',
      '<p>Hi {{first_name}},</p><p>Quick question — does {{company}} have engineers maintaining internal scripts for GST verification, PAN validation, or credit bureau pulls?</p><p>I ask because most tech teams I talk to have some version of this story: someone built a quick integration with the GST portal two years ago, then the API changed, then they added PAN checks as a separate script, and now there''s a fragile patchwork that nobody wants to own but everyone depends on.</p><p>Government API endpoints in India change frequently. Rate limits shift. Response formats evolve. Maintaining reliable connections to GSTN, NSDL, credit bureaus, and bank statement parsers is a full-time job — and it''s probably not the best use of your engineering team.</p><p>In-Sync handles all of this as a managed platform. One API, all verifications, under 5 minutes per vendor. We deal with the government API instability so your team doesn''t have to.</p><p>{{first_name}}, is vendor verification infrastructure something {{company}}''s engineering team currently maintains?</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    Quick question — does {{company}} have engineers maintaining internal scripts for GST verification, PAN validation, or credit bureau pulls?

    I ask because most tech teams I talk to have some version of this story: someone built a quick integration with the GST portal two years ago, then the API changed, then they added PAN checks as a separate script, and now there''s a fragile patchwork that nobody wants to own but everyone depends on.

    Government API endpoints in India change frequently. Rate limits shift. Response formats evolve. Maintaining reliable connections to GSTN, NSDL, credit bureaus, and bank statement parsers is a full-time job — and it''s probably not the best use of your engineering team.

    In-Sync handles all of this as a managed platform. One API, all verifications, under 5 minutes per vendor. We deal with the government API instability so your team doesn''t have to.

    {{first_name}}, is vendor verification infrastructure something {{company}}''s engineering team currently maintains?

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'CTO-CO-1A',
      '["first_name","company","sender_name"]',
      true
    );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Intro: CTO First Touch B',
      'Build vs. buy: vendor verification at {{company}}',
      '<p>Hi {{first_name}},</p><p>Maintaining integrations with GSTN, NSDL, CERSAI, credit bureaus, and bank statement parsers requires connecting to 6+ government and financial APIs — each with its own authentication, rate limits, downtime patterns, and format changes.</p><p>Most engineering teams I speak with estimate 2-3 full-time engineers just to keep these integrations stable. That''s before you account for edge cases: cancelled GSTINs, PAN-Aadhaar linking failures, inconsistent bank statement formats across 40+ banks.</p><p>In-Sync is a managed vendor verification platform with a single API endpoint. We handle the upstream complexity — government portal changes, rate limit management, data normalisation — so your team can focus on core product work.</p><p>Verification results in under 5 minutes. Starts at ₹2,999/quarter. Three free verifications to evaluate.</p><p>{{first_name}}, would it be worth a quick look at our API docs to see if it fits {{company}}''s stack?</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    Maintaining integrations with GSTN, NSDL, CERSAI, credit bureaus, and bank statement parsers requires connecting to 6+ government and financial APIs — each with its own authentication, rate limits, downtime patterns, and format changes.

    Most engineering teams I speak with estimate 2-3 full-time engineers just to keep these integrations stable. That''s before you account for edge cases: cancelled GSTINs, PAN-Aadhaar linking failures, inconsistent bank statement formats across 40+ banks.

    In-Sync is a managed vendor verification platform with a single API endpoint. We handle the upstream complexity — government portal changes, rate limit management, data normalisation — so your team can focus on core product work.

    Verification results in under 5 minutes. Starts at ₹2,999/quarter. Three free verifications to evaluate.

    {{first_name}}, would it be worth a quick look at our API docs to see if it fits {{company}}''s stack?

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'CTO-CO-1B',
      '["first_name","company","sender_name"]',
      true
    );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Intro: CCO First Touch A',
      '{{first_name}}, would {{company}}''s vendor checks survive an audit?',
      '<p>Hi {{first_name}},</p><p>If a regulator asked {{company}} tomorrow to demonstrate your vendor due diligence process — the specific checks run, when they were run, and what was verified — could you produce that documentation within 24 hours?</p><p>Most compliance leaders I speak with know the answer is "not confidently." Vendor verification is often scattered across spreadsheets, email threads, and manual portal screenshots. There''s no centralised audit trail, no standardised check protocol, and no way to prove that every vendor was verified to the same standard.</p><p>In-Sync automates vendor financial due diligence — GST filing verification, PAN validation, credit bureau checks, bank statement analysis, Aadhaar verification — with a complete, timestamped audit trail for every check. RBI and SEBI compliance requirements covered in under 5 minutes per vendor.</p><p>{{first_name}}, how does {{company}} currently document vendor verification for audit purposes?</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    If a regulator asked {{company}} tomorrow to demonstrate your vendor due diligence process — the specific checks run, when they were run, and what was verified — could you produce that documentation within 24 hours?

    Most compliance leaders I speak with know the answer is "not confidently." Vendor verification is often scattered across spreadsheets, email threads, and manual portal screenshots. There''s no centralised audit trail, no standardised check protocol, and no way to prove that every vendor was verified to the same standard.

    In-Sync automates vendor financial due diligence — GST filing verification, PAN validation, credit bureau checks, bank statement analysis, Aadhaar verification — with a complete, timestamped audit trail for every check. RBI and SEBI compliance requirements covered in under 5 minutes per vendor.

    {{first_name}}, how does {{company}} currently document vendor verification for audit purposes?

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'CCO-CO-1A',
      '["first_name","company","sender_name"]',
      true
    );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Intro: CCO First Touch B',
      'RBI vendor compliance is tightening — is {{company}} ready?',
      '<p>Hi {{first_name}},</p><p>Regulatory scrutiny on vendor due diligence has sharpened considerably over the past 18 months. RBI''s updated KYC norms, SEBI''s vendor disclosure requirements, and GST Council''s crackdown on fake invoicing all point in one direction: organisations need verifiable, documented proof of vendor financial checks.</p><p>The gap I see at most companies? They''re doing <em>some</em> checks, but inconsistently. One vendor gets a full GST verification, another gets a cursory PAN check, a third gets approved on reputation alone. That inconsistency is exactly what auditors flag.</p><p>In-Sync standardises the entire process. Every vendor goes through the same automated checks — GST, PAN, credit bureau, bank statements, Aadhaar — with a complete audit trail. No gaps, no inconsistencies, no manual oversight required.</p><p>{{first_name}}, is standardising vendor due diligence something on {{company}}''s compliance roadmap this year?</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    Regulatory scrutiny on vendor due diligence has sharpened considerably over the past 18 months. RBI''s updated KYC norms, SEBI''s vendor disclosure requirements, and GST Council''s crackdown on fake invoicing all point in one direction: organisations need verifiable, documented proof of vendor financial checks.

    The gap I see at most companies? They''re doing some checks, but inconsistently. One vendor gets a full GST verification, another gets a cursory PAN check, a third gets approved on reputation alone. That inconsistency is exactly what auditors flag.

    In-Sync standardises the entire process. Every vendor goes through the same automated checks — GST, PAN, credit bureau, bank statements, Aadhaar — with a complete audit trail. No gaps, no inconsistencies, no manual oversight required.

    {{first_name}}, is standardising vendor due diligence something on {{company}}''s compliance roadmap this year?

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'CCO-CO-1B',
      '["first_name","company","sender_name"]',
      true
    );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Intro: Procurement Head First Touch A',
      '{{first_name}}, how many vendors are stuck in your approval queue?',
      '<p>Hi {{first_name}},</p><p>Here''s what I keep hearing from procurement leaders: you''ve found the right vendor, negotiated the terms, and the business needs them onboarded yesterday — but the vendor qualification process takes 7-10 days because finance and compliance need to run their checks.</p><p>Meanwhile, the purchase order sits. The project waits. And sometimes, you lose the vendor to a competitor who moved faster.</p><p>In-Sync automates vendor financial verification — GST filing status, PAN validation, credit bureau checks, bank statement analysis — in under 5 minutes. Your team gets verified, qualified vendors without the back-and-forth with finance or the manual portal-hopping.</p><p>Faster qualification means faster POs, more supplier options, and fewer "sorry, we went with someone else" conversations.</p><p>{{first_name}}, how long does it typically take {{company}} to move a vendor from identified to approved?</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    Here''s what I keep hearing from procurement leaders: you''ve found the right vendor, negotiated the terms, and the business needs them onboarded yesterday — but the vendor qualification process takes 7-10 days because finance and compliance need to run their checks.

    Meanwhile, the purchase order sits. The project waits. And sometimes, you lose the vendor to a competitor who moved faster.

    In-Sync automates vendor financial verification — GST filing status, PAN validation, credit bureau checks, bank statement analysis — in under 5 minutes. Your team gets verified, qualified vendors without the back-and-forth with finance or the manual portal-hopping.

    Faster qualification means faster POs, more supplier options, and fewer "sorry, we went with someone else" conversations.

    {{first_name}}, how long does it typically take {{company}} to move a vendor from identified to approved?

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'PROC-CO-1A',
      '["first_name","company","sender_name"]',
      true
    );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Intro: Procurement Head First Touch B',
      'Slow vendor checks are costing {{company}} its best suppliers',
      '<p>Hi {{first_name}},</p><p>Every procurement team I talk to has the same problem: the best vendors have options. When your approval process takes 7-10 days while a competitor''s takes 2, you''re not just slow — you''re uncompetitive in the vendor market.</p><p>The bottleneck is almost always verification. GST checks on one government portal, PAN on another, credit history requested separately, bank statements reviewed manually. Each step adds days, and each handoff between departments adds more.</p><p>In-Sync collapses the entire vendor financial verification process into a single automated workflow. GST, PAN, credit bureau, bank statements, Aadhaar — all checked and reported in under 5 minutes. You get a verified vendor profile, ready for approval.</p><p>Starts at ₹2,999/quarter. Three free verifications to try it.</p><p>{{first_name}}, is supplier diversification at {{company}} ever blocked by how long vendor checks take?</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    Every procurement team I talk to has the same problem: the best vendors have options. When your approval process takes 7-10 days while a competitor''s takes 2, you''re not just slow — you''re uncompetitive in the vendor market.

    The bottleneck is almost always verification. GST checks on one government portal, PAN on another, credit history requested separately, bank statements reviewed manually. Each step adds days, and each handoff between departments adds more.

    In-Sync collapses the entire vendor financial verification process into a single automated workflow. GST, PAN, credit bureau, bank statements, Aadhaar — all checked and reported in under 5 minutes. You get a verified vendor profile, ready for approval.

    Starts at ₹2,999/quarter. Three free verifications to try it.

    {{first_name}}, is supplier diversification at {{company}} ever blocked by how long vendor checks take?

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'PROC-CO-1B',
      '["first_name","company","sender_name"]',
      true
    );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Intro: Supply Chain Head First Touch A',
      '{{first_name}}, do you know which vendors in your supply chain are financially unstable?',
      '<p>Hi {{first_name}},</p><p>Supply chain disruptions make headlines when a major vendor goes bankrupt or gets flagged for fraud. But the warning signs are usually there months earlier — in their GST filing gaps, declining credit scores, or irregular bank statements. The problem is that most companies don''t check.</p><p>Manual vendor verification takes 7-10 days per vendor, so it''s typically done once at onboarding and never revisited. Meanwhile, a vendor''s financial health can deteriorate significantly between annual reviews.</p><p>In-Sync automates vendor financial due diligence — GST verification, PAN validation, credit bureau checks, bank statement analysis — in under 5 minutes. Run it at onboarding, run it at renewal, run it whenever you need confidence in a supplier''s stability.</p><p>{{first_name}}, does {{company}} have visibility into the current financial health of its critical suppliers?</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    Supply chain disruptions make headlines when a major vendor goes bankrupt or gets flagged for fraud. But the warning signs are usually there months earlier — in their GST filing gaps, declining credit scores, or irregular bank statements. The problem is that most companies don''t check.

    Manual vendor verification takes 7-10 days per vendor, so it''s typically done once at onboarding and never revisited. Meanwhile, a vendor''s financial health can deteriorate significantly between annual reviews.

    In-Sync automates vendor financial due diligence — GST verification, PAN validation, credit bureau checks, bank statement analysis — in under 5 minutes. Run it at onboarding, run it at renewal, run it whenever you need confidence in a supplier''s stability.

    {{first_name}}, does {{company}} have visibility into the current financial health of its critical suppliers?

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'SCH-CO-1A',
      '["first_name","company","sender_name"]',
      true
    );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Intro: Supply Chain Head First Touch B',
      'Your weakest supplier is a risk you haven''t measured, {{first_name}}',
      '<p>Hi {{first_name}},</p><p>Here''s a scenario that plays out more often than anyone likes to admit: a critical supplier misses a delivery. Investigation reveals they''ve been financially distressed for months — cancelled GST registration, unpaid credit obligations, irregular cash flow. Nobody at the buying company checked because the last verification was done two years ago at onboarding.</p><p>The cost isn''t just one missed delivery. It''s the emergency sourcing, the production delay, the downstream customer impact, and the scramble to qualify a replacement vendor under pressure.</p><p>In-Sync gives supply chain teams ongoing visibility into vendor financial health. Automated GST, PAN, credit bureau, and bank statement checks — completed in under 5 minutes per vendor, with a reliability score you can actually act on.</p><p>{{first_name}}, how does {{company}} currently assess the financial reliability of its supply chain partners?</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    Here''s a scenario that plays out more often than anyone likes to admit: a critical supplier misses a delivery. Investigation reveals they''ve been financially distressed for months — cancelled GST registration, unpaid credit obligations, irregular cash flow. Nobody at the buying company checked because the last verification was done two years ago at onboarding.

    The cost isn''t just one missed delivery. It''s the emergency sourcing, the production delay, the downstream customer impact, and the scramble to qualify a replacement vendor under pressure.

    In-Sync gives supply chain teams ongoing visibility into vendor financial health. Automated GST, PAN, credit bureau, and bank statement checks — completed in under 5 minutes per vendor, with a reliability score you can actually act on.

    {{first_name}}, how does {{company}} currently assess the financial reliability of its supply chain partners?

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'SCH-CO-1B',
      '["first_name","company","sender_name"]',
      true
    );

    -- =========================================================================
    -- F. COLD PAIN AMPLIFIER - 6 ICPs x 2 A/B variants = 12 templates
    -- Second email. Dig deeper into specific pain. Numbers and consequences.
    -- =========================================================================

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Pain Amplifier: CFO Pain A',
      'Re: The hidden cost of skipping vendor due diligence',
      '<p>Hi {{first_name}},</p><p>Following up on my earlier note. Wanted to share something that might sharpen the picture.</p><p>When a vendor turns out to be fraudulent or financially insolvent, the direct cost is obvious — the unpaid invoices, the legal fees, the write-off. But the indirect costs are what really hurt: restated financials, delayed audits, increased scrutiny from auditors on <em>all</em> vendor relationships, and the management time spent on damage control.</p><p>One CFO I spoke with estimated a single bad vendor cost them ₹38 lakh in direct losses and another ₹15 lakh in audit remediation. Their manual due diligence process had checked GST status but missed that the vendor''s credit bureau report showed three defaults in the previous 12 months.</p><p>The FY-end reconciliation becomes particularly painful when vendor master data hasn''t been verified against current GST registrations. Cancelled GSTINs mean disallowed input tax credits — a direct P&L hit.</p><p>{{first_name}}, has {{company}} ever had a vendor-related write-off that a more thorough upfront check would have prevented?</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    Following up on my earlier note. Wanted to share something that might sharpen the picture.

    When a vendor turns out to be fraudulent or financially insolvent, the direct cost is obvious — the unpaid invoices, the legal fees, the write-off. But the indirect costs are what really hurt: restated financials, delayed audits, increased scrutiny from auditors on all vendor relationships, and the management time spent on damage control.

    One CFO I spoke with estimated a single bad vendor cost them ₹38 lakh in direct losses and another ₹15 lakh in audit remediation. Their manual due diligence process had checked GST status but missed that the vendor''s credit bureau report showed three defaults in the previous 12 months.

    The FY-end reconciliation becomes particularly painful when vendor master data hasn''t been verified against current GST registrations. Cancelled GSTINs mean disallowed input tax credits — a direct P&L hit.

    {{first_name}}, has {{company}} ever had a vendor-related write-off that a more thorough upfront check would have prevented?

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'CFO-CO-2A',
      '["first_name","company","sender_name"]',
      true
    );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Pain Amplifier: CFO Pain B',
      'Re: ₹12 lakh in disallowed ITC — from one unverified vendor',
      '<p>Hi {{first_name}},</p><p>Circling back with a specific example that keeps coming up in conversations with finance leaders.</p><p>A mid-size manufacturing company continued paying a vendor whose GST registration had been cancelled 4 months earlier. Nobody caught it because their verification was done manually at onboarding and never refreshed. Result: ₹12 lakh in input tax credits disallowed during the next GST audit, plus penalties.</p><p>This isn''t a rare edge case. GSTN data shows that thousands of GSTINs are cancelled or suspended every month. If your vendor master isn''t being continuously checked against current registration status, you''re accumulating ITC risk with every invoice you book.</p><p>Then there''s the audit trail question. When your statutory auditor asks "how do you verify vendor financial standing?" — a spreadsheet with PAN numbers and GST screenshots from 18 months ago isn''t the answer that keeps them comfortable.</p><p>{{first_name}}, when was the last time {{company}} re-verified the GST status of its active vendor base?</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    Circling back with a specific example that keeps coming up in conversations with finance leaders.

    A mid-size manufacturing company continued paying a vendor whose GST registration had been cancelled 4 months earlier. Nobody caught it because their verification was done manually at onboarding and never refreshed. Result: ₹12 lakh in input tax credits disallowed during the next GST audit, plus penalties.

    This isn''t a rare edge case. GSTN data shows that thousands of GSTINs are cancelled or suspended every month. If your vendor master isn''t being continuously checked against current registration status, you''re accumulating ITC risk with every invoice you book.

    Then there''s the audit trail question. When your statutory auditor asks "how do you verify vendor financial standing?" — a spreadsheet with PAN numbers and GST screenshots from 18 months ago isn''t the answer that keeps them comfortable.

    {{first_name}}, when was the last time {{company}} re-verified the GST status of its active vendor base?

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'CFO-CO-2B',
      '["first_name","company","sender_name"]',
      true
    );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Pain Amplifier: COO Pain A',
      'Re: 240 hours per quarter — the real cost of manual vendor checks',
      '<p>Hi {{first_name}},</p><p>Following up with some numbers I think you''ll find relevant.</p><p>We mapped the typical vendor onboarding workflow at a company doing 40 new vendors per quarter. Here''s what it looked like: 2 hours to collect documents, 1.5 hours to verify GST on the portal, 45 minutes for PAN verification, 1 hour to request and review a credit report, 30 minutes for data entry across systems. Per vendor.</p><p>That''s roughly 6 hours per vendor, or 240 hours per quarter — spread across procurement, finance, and compliance teams. Nobody owns it end-to-end, so nobody sees the total cost.</p><p>The downstream impact is worse. Every day a vendor sits in "pending verification" is a day the business can''t issue a PO, receive goods, or start a project. I''ve seen vendor delays cascade into 2-3 week project postponements that nobody traces back to the onboarding bottleneck.</p><p>The team morale element is real too. Nobody joined your finance or procurement team to spend their days copy-pasting GSTIN numbers into a government portal.</p><p>{{first_name}}, does {{company}} track the total hours spent on vendor verification across all departments?</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    Following up with some numbers I think you''ll find relevant.

    We mapped the typical vendor onboarding workflow at a company doing 40 new vendors per quarter. Here''s what it looked like: 2 hours to collect documents, 1.5 hours to verify GST on the portal, 45 minutes for PAN verification, 1 hour to request and review a credit report, 30 minutes for data entry across systems. Per vendor.

    That''s roughly 6 hours per vendor, or 240 hours per quarter — spread across procurement, finance, and compliance teams. Nobody owns it end-to-end, so nobody sees the total cost.

    The downstream impact is worse. Every day a vendor sits in "pending verification" is a day the business can''t issue a PO, receive goods, or start a project. I''ve seen vendor delays cascade into 2-3 week project postponements that nobody traces back to the onboarding bottleneck.

    The team morale element is real too. Nobody joined your finance or procurement team to spend their days copy-pasting GSTIN numbers into a government portal.

    {{first_name}}, does {{company}} track the total hours spent on vendor verification across all departments?

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'COO-CO-2A',
      '["first_name","company","sender_name"]',
      true
    );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Pain Amplifier: COO Pain B',
      'Re: When vendor onboarding delays kill project timelines',
      '<p>Hi {{first_name}},</p><p>Wanted to follow up with a pattern I see repeatedly at operationally mature companies.</p><p>A business unit identifies a vendor for a critical project. Procurement starts the onboarding process. Then the delays begin: finance needs 3 days for GST verification (the portal was down on day one), compliance needs another 2 days for the credit check (they''re backlogged), and the vendor takes 4 days to submit the correct bank statement format.</p><p>Total elapsed time: 9 days. The project timeline? Already slipped by a week before any work started.</p><p>Now multiply that across every vendor your organisation onboards. If {{company}} is onboarding 30-50 vendors per quarter, that''s potentially 300+ days of cumulative delay rippling through your operations.</p><p>The hardest part to measure is the opportunities you don''t pursue. The vendor partnerships you don''t explore because the onboarding friction isn''t worth it. The supplier diversification that never happens because "it''s too much hassle to add another vendor."</p><p>{{first_name}}, have project timelines at {{company}} ever slipped specifically because a vendor was stuck in the approval queue?</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    Wanted to follow up with a pattern I see repeatedly at operationally mature companies.

    A business unit identifies a vendor for a critical project. Procurement starts the onboarding process. Then the delays begin: finance needs 3 days for GST verification (the portal was down on day one), compliance needs another 2 days for the credit check (they''re backlogged), and the vendor takes 4 days to submit the correct bank statement format.

    Total elapsed time: 9 days. The project timeline? Already slipped by a week before any work started.

    Now multiply that across every vendor your organisation onboards. If {{company}} is onboarding 30-50 vendors per quarter, that''s potentially 300+ days of cumulative delay rippling through your operations.

    The hardest part to measure is the opportunities you don''t pursue. The vendor partnerships you don''t explore because the onboarding friction isn''t worth it. The supplier diversification that never happens because "it''s too much hassle to add another vendor."

    {{first_name}}, have project timelines at {{company}} ever slipped specifically because a vendor was stuck in the approval queue?

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'COO-CO-2B',
      '["first_name","company","sender_name"]',
      true
    );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Pain Amplifier: CTO Pain A',
      'Re: Your engineers are maintaining government API integrations — is that the best use of their time?',
      '<p>Hi {{first_name}},</p><p>Following up on my earlier note about build vs. buy for vendor verification.</p><p>I spoke with a CTO last month whose team had spent 1,400 engineering hours over 18 months maintaining their internal vendor verification system. That''s roughly ₹35 lakh in engineering salary — for a system that still couldn''t reliably parse bank statements from more than 15 banks and broke every time GSTN changed their API response format.</p><p>The government API maintenance burden is the part that catches most teams off guard. GSTN alone has had 23 documented API changes in the past year. Each one requires your engineers to identify the change, update the integration, test across edge cases, and deploy. That''s before you count NSDL, CERSAI, and the credit bureaus.</p><p>Then there''s the data consistency problem. When you''re pulling from multiple sources with different update frequencies, reconciling conflicting information becomes an ongoing engineering challenge. Is the PAN status from yesterday still valid? Has the GST return been filed since you last checked?</p><p>{{first_name}}, how many engineering hours does {{company}} currently spend on maintaining verification infrastructure?</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    Following up on my earlier note about build vs. buy for vendor verification.

    I spoke with a CTO last month whose team had spent 1,400 engineering hours over 18 months maintaining their internal vendor verification system. That''s roughly ₹35 lakh in engineering salary — for a system that still couldn''t reliably parse bank statements from more than 15 banks and broke every time GSTN changed their API response format.

    The government API maintenance burden is the part that catches most teams off guard. GSTN alone has had 23 documented API changes in the past year. Each one requires your engineers to identify the change, update the integration, test across edge cases, and deploy. That''s before you count NSDL, CERSAI, and the credit bureaus.

    Then there''s the data consistency problem. When you''re pulling from multiple sources with different update frequencies, reconciling conflicting information becomes an ongoing engineering challenge. Is the PAN status from yesterday still valid? Has the GST return been filed since you last checked?

    {{first_name}}, how many engineering hours does {{company}} currently spend on maintaining verification infrastructure?

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'CTO-CO-2A',
      '["first_name","company","sender_name"]',
      true
    );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Pain Amplifier: CTO Pain B',
      'Re: When your GST verification script breaks at month-end',
      '<p>Hi {{first_name}},</p><p>Circling back with a scenario I hear about consistently from engineering leaders.</p><p>It''s the last week of the month. Finance needs 15 vendors verified urgently for quarter-close. Your internal GST verification script hits GSTN''s rate limit and starts returning errors. The PAN validation module hasn''t been updated since the NSDL format change two weeks ago. And the credit bureau integration is returning stale data because nobody renewed the API credentials.</p><p>Your on-call engineer gets pulled off their sprint to firefight a verification pipeline that wasn''t even in their team''s scope. Two days of unplanned work. The sprint deliverable slips. The vendor verifications get done partially, with manual workarounds filling the gaps.</p><p>This is the real cost of in-house verification infrastructure: not the build cost, but the ongoing maintenance cost that shows up as context-switching, technical debt, and sprint disruption. At In-Sync''s ₹2,999/quarter starting price, the engineering time saved in a single incident would cover the platform for a year.</p><p>{{first_name}}, has {{company}}''s team ever had a verification pipeline failure at a critical moment?</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    Circling back with a scenario I hear about consistently from engineering leaders.

    It''s the last week of the month. Finance needs 15 vendors verified urgently for quarter-close. Your internal GST verification script hits GSTN''s rate limit and starts returning errors. The PAN validation module hasn''t been updated since the NSDL format change two weeks ago. And the credit bureau integration is returning stale data because nobody renewed the API credentials.

    Your on-call engineer gets pulled off their sprint to firefight a verification pipeline that wasn''t even in their team''s scope. Two days of unplanned work. The sprint deliverable slips. The vendor verifications get done partially, with manual workarounds filling the gaps.

    This is the real cost of in-house verification infrastructure: not the build cost, but the ongoing maintenance cost that shows up as context-switching, technical debt, and sprint disruption. At In-Sync''s ₹2,999/quarter starting price, the engineering time saved in a single incident would cover the platform for a year.

    {{first_name}}, has {{company}}''s team ever had a verification pipeline failure at a critical moment?

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'CTO-CO-2B',
      '["first_name","company","sender_name"]',
      true
    );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Pain Amplifier: CCO Pain A',
      'Re: Personal liability for compliance gaps — the part nobody talks about',
      '<p>Hi {{first_name}},</p><p>Following up on my earlier note about audit readiness.</p><p>Here''s the part of vendor compliance that keeps CCOs up at night: personal liability. Under the Companies Act and various regulatory frameworks, compliance officers can be held personally accountable for systemic due diligence failures. "We checked some vendors manually" isn''t a defence when a regulator finds a pattern of inadequate verification.</p><p>The penalties are getting steeper. GST audit penalties for claiming ITC from non-compliant vendors can run 10-15% of the disputed amount plus interest. SEBI penalties for inadequate vendor due diligence in regulated industries have crossed ₹1 crore in recent enforcement actions. RBI has imposed restrictions on entities for vendor KYC failures.</p><p>The challenge isn''t whether your team knows what to check — it''s whether they can prove they checked consistently, every time, with documented evidence. That''s where manual processes fall apart. Email approvals get lost. Spreadsheet entries get overwritten. Portal screenshots have no tamper-proof timestamp.</p><p>{{first_name}}, does {{company}} currently have tamper-proof documentation for every vendor verification it has ever performed?</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    Following up on my earlier note about audit readiness.

    Here''s the part of vendor compliance that keeps CCOs up at night: personal liability. Under the Companies Act and various regulatory frameworks, compliance officers can be held personally accountable for systemic due diligence failures. "We checked some vendors manually" isn''t a defence when a regulator finds a pattern of inadequate verification.

    The penalties are getting steeper. GST audit penalties for claiming ITC from non-compliant vendors can run 10-15% of the disputed amount plus interest. SEBI penalties for inadequate vendor due diligence in regulated industries have crossed ₹1 crore in recent enforcement actions. RBI has imposed restrictions on entities for vendor KYC failures.

    The challenge isn''t whether your team knows what to check — it''s whether they can prove they checked consistently, every time, with documented evidence. That''s where manual processes fall apart. Email approvals get lost. Spreadsheet entries get overwritten. Portal screenshots have no tamper-proof timestamp.

    {{first_name}}, does {{company}} currently have tamper-proof documentation for every vendor verification it has ever performed?

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'CCO-CO-2A',
      '["first_name","company","sender_name"]',
      true
    );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Pain Amplifier: CCO Pain B',
      'Re: What happens when your next audit finds vendor verification gaps',
      '<p>Hi {{first_name}},</p><p>Circling back with a scenario that played out at a company similar to {{company}} recently.</p><p>During a regulatory audit, the examiner pulled 50 vendor records at random and asked for verification documentation. Of those 50: 12 had no GST verification on file, 8 had PAN checks that were over 2 years old, 3 were dealing with vendors whose GST registrations had since been cancelled, and zero had any credit bureau checks documented.</p><p>The audit finding triggered a mandatory remediation programme — re-verify the entire vendor base of 400+ vendors within 90 days, implement a documented verification policy, and submit quarterly compliance reports for the next year. The cost in staff time alone exceeded ₹25 lakh.</p><p>The irony? Automating the verification upfront would have cost less than ₹50,000 per year. The remediation cost 50x what prevention would have.</p><p>{{first_name}}, if a regulator pulled 50 random vendor files from {{company}} today, what would they find?</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    Circling back with a scenario that played out at a company similar to {{company}} recently.

    During a regulatory audit, the examiner pulled 50 vendor records at random and asked for verification documentation. Of those 50: 12 had no GST verification on file, 8 had PAN checks that were over 2 years old, 3 were dealing with vendors whose GST registrations had since been cancelled, and zero had any credit bureau checks documented.

    The audit finding triggered a mandatory remediation programme — re-verify the entire vendor base of 400+ vendors within 90 days, implement a documented verification policy, and submit quarterly compliance reports for the next year. The cost in staff time alone exceeded ₹25 lakh.

    The irony? Automating the verification upfront would have cost less than ₹50,000 per year. The remediation cost 50x what prevention would have.

    {{first_name}}, if a regulator pulled 50 random vendor files from {{company}} today, what would they find?

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'CCO-CO-2B',
      '["first_name","company","sender_name"]',
      true
    );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Pain Amplifier: Procurement Head Pain A',
      'Re: 7-10 days per vendor — the math behind your procurement delays',
      '<p>Hi {{first_name}},</p><p>Following up with some numbers I think are worth examining.</p><p>We mapped the average vendor qualification timeline across 30+ mid-market companies. The breakdown: Day 1-2, vendor submits documents (often incomplete, requires follow-up). Day 3-4, finance verifies GST and PAN manually. Day 5-6, compliance runs credit checks (if they run them at all). Day 7-8, data entry and internal approvals. Day 9-10, vendor finally activated in the system.</p><p>During those 7-10 days, the procurement cycle is frozen. The PO can''t be issued. The goods can''t be ordered. And if the business need was urgent, someone is quietly bypassing the process — creating risk that surfaces months later.</p><p>Here''s what compounds the problem: when verification takes this long, procurement teams naturally limit their vendor pool. Why go through a 10-day process to add a second supplier when you can just re-order from the existing one? That''s how vendor concentration risk builds — not through strategy, but through friction.</p><p>{{first_name}}, how many potential vendors has {{company}} passed on because the qualification process was too slow?</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    Following up with some numbers I think are worth examining.

    We mapped the average vendor qualification timeline across 30+ mid-market companies. The breakdown: Day 1-2, vendor submits documents (often incomplete, requires follow-up). Day 3-4, finance verifies GST and PAN manually. Day 5-6, compliance runs credit checks (if they run them at all). Day 7-8, data entry and internal approvals. Day 9-10, vendor finally activated in the system.

    During those 7-10 days, the procurement cycle is frozen. The PO can''t be issued. The goods can''t be ordered. And if the business need was urgent, someone is quietly bypassing the process — creating risk that surfaces months later.

    Here''s what compounds the problem: when verification takes this long, procurement teams naturally limit their vendor pool. Why go through a 10-day process to add a second supplier when you can just re-order from the existing one? That''s how vendor concentration risk builds — not through strategy, but through friction.

    {{first_name}}, how many potential vendors has {{company}} passed on because the qualification process was too slow?

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'PROC-CO-2A',
      '["first_name","company","sender_name"]',
      true
    );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Pain Amplifier: Procurement Head Pain B',
      'Re: The deals {{company}} lost because vendor approval took too long',
      '<p>Hi {{first_name}},</p><p>Wanted to share a pattern I keep hearing from procurement leaders that I think is relevant to {{company}}.</p><p>A procurement head at a manufacturing firm told me they lost a ₹2.3 crore contract because their preferred vendor couldn''t be onboarded in time. The vendor had offered the best price, best quality samples, and best delivery terms — but the 12-day internal verification process meant the project deadline would be missed. They went with an existing but more expensive vendor instead. ₹18 lakh in unnecessary additional cost.</p><p>This happens more than most companies realise. The procurement team knows who the best vendor is, but the verification bottleneck forces them into suboptimal choices. Over time, this creates a pattern: fewer vendors evaluated, higher prices accepted, less negotiation leverage, and growing dependency on a shrinking supplier base.</p><p>The compounding effect is significant. If slow verification costs even 3-5% on procurement spend through reduced competition, that''s a number worth calculating at {{company}}''s scale.</p><p>{{first_name}}, has {{company}}''s procurement team ever had to choose a more expensive vendor purely because of onboarding speed?</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    Wanted to share a pattern I keep hearing from procurement leaders that I think is relevant to {{company}}.

    A procurement head at a manufacturing firm told me they lost a ₹2.3 crore contract because their preferred vendor couldn''t be onboarded in time. The vendor had offered the best price, best quality samples, and best delivery terms — but the 12-day internal verification process meant the project deadline would be missed. They went with an existing but more expensive vendor instead. ₹18 lakh in unnecessary additional cost.

    This happens more than most companies realise. The procurement team knows who the best vendor is, but the verification bottleneck forces them into suboptimal choices. Over time, this creates a pattern: fewer vendors evaluated, higher prices accepted, less negotiation leverage, and growing dependency on a shrinking supplier base.

    The compounding effect is significant. If slow verification costs even 3-5% on procurement spend through reduced competition, that''s a number worth calculating at {{company}}''s scale.

    {{first_name}}, has {{company}}''s procurement team ever had to choose a more expensive vendor purely because of onboarding speed?

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'PROC-CO-2B',
      '["first_name","company","sender_name"]',
      true
    );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Pain Amplifier: Supply Chain Head Pain A',
      'Re: The ₹1.7 crore disruption that started with one unverified vendor',
      '<p>Hi {{first_name}},</p><p>Following up with a case study that might resonate with {{company}}''s supply chain reality.</p><p>A consumer goods company sourced packaging materials from a vendor they''d used for 3 years. Never re-verified after initial onboarding. When the vendor suddenly stopped deliveries, investigation revealed: GST registration cancelled 6 months prior, two loan defaults in the previous quarter, and bank account under investigation for suspicious transactions. The warning signs were all there — in data nobody was checking.</p><p>The disruption cost: ₹45 lakh in emergency sourcing at premium prices, ₹80 lakh in production delays, ₹50 lakh in late delivery penalties to their own customers. Total: ₹1.75 crore from a single vendor failure that was entirely predictable.</p><p>The uncomfortable question for supply chain leaders: if your most critical vendor''s GST registration was cancelled tomorrow, how quickly would you know? If their credit score dropped 200 points, would anyone at {{company}} see it before the next delivery failure?</p><p>{{first_name}}, does {{company}} have a system for ongoing financial monitoring of its critical suppliers?</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    Following up with a case study that might resonate with {{company}}''s supply chain reality.

    A consumer goods company sourced packaging materials from a vendor they''d used for 3 years. Never re-verified after initial onboarding. When the vendor suddenly stopped deliveries, investigation revealed: GST registration cancelled 6 months prior, two loan defaults in the previous quarter, and bank account under investigation for suspicious transactions. The warning signs were all there — in data nobody was checking.

    The disruption cost: ₹45 lakh in emergency sourcing at premium prices, ₹80 lakh in production delays, ₹50 lakh in late delivery penalties to their own customers. Total: ₹1.75 crore from a single vendor failure that was entirely predictable.

    The uncomfortable question for supply chain leaders: if your most critical vendor''s GST registration was cancelled tomorrow, how quickly would you know? If their credit score dropped 200 points, would anyone at {{company}} see it before the next delivery failure?

    {{first_name}}, does {{company}} have a system for ongoing financial monitoring of its critical suppliers?

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'SCH-CO-2A',
      '["first_name","company","sender_name"]',
      true
    );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Pain Amplifier: Supply Chain Head Pain B',
      'Re: 3 quality incidents at {{company}} — were the vendors properly checked?',
      '<p>Hi {{first_name}},</p><p>Circling back with something I''ve been thinking about since my last note.</p><p>When supply chain teams investigate quality incidents or delivery failures, they almost always trace back to the vendor. But here''s what rarely gets examined: was the vendor financially stable enough to deliver consistently in the first place?</p><p>A vendor under financial stress cuts corners. They use cheaper raw materials. They reduce quality checks. They overcommit on delivery timelines to secure cash flow, then miss deadlines. They let equipment maintenance lapse. The quality incident at your end is a symptom — the vendor''s financial instability is the root cause.</p><p>Most companies check vendor quality certifications and delivery track records, but almost none check vendor financial health as a leading indicator. Yet a vendor with declining GST filings, mounting credit defaults, and irregular bank statement patterns is statistically far more likely to deliver quality problems in the next 6 months.</p><p>Inventory stockouts from delayed vendor onboarding compound this further. When you can''t add backup suppliers quickly because verification takes 7-10 days, you''re running your supply chain with no safety net.</p><p>{{first_name}}, has {{company}} ever traced a quality or delivery failure back to a vendor''s underlying financial issues?</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    Circling back with something I''ve been thinking about since my last note.

    When supply chain teams investigate quality incidents or delivery failures, they almost always trace back to the vendor. But here''s what rarely gets examined: was the vendor financially stable enough to deliver consistently in the first place?

    A vendor under financial stress cuts corners. They use cheaper raw materials. They reduce quality checks. They overcommit on delivery timelines to secure cash flow, then miss deadlines. They let equipment maintenance lapse. The quality incident at your end is a symptom — the vendor''s financial instability is the root cause.

    Most companies check vendor quality certifications and delivery track records, but almost none check vendor financial health as a leading indicator. Yet a vendor with declining GST filings, mounting credit defaults, and irregular bank statement patterns is statistically far more likely to deliver quality problems in the next 6 months.

    Inventory stockouts from delayed vendor onboarding compound this further. When you can''t add backup suppliers quickly because verification takes 7-10 days, you''re running your supply chain with no safety net.

    {{first_name}}, has {{company}} ever traced a quality or delivery failure back to a vendor''s underlying financial issues?

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'SCH-CO-2B',
      '["first_name","company","sender_name"]',
      true
    );

    -- =========================================================================
    -- G. COLD SOCIAL PROOF - 6 ICPs x 2 A/B variants = 12 templates
    -- Third email. Customer results and case studies. Peer-driven.
    -- =========================================================================

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Social Proof: CFO Case Study A',
      '{{first_name}}, how a manufacturing CFO cut verification costs 40%',
      '<p>Hi {{first_name}},</p><p>Quick story I thought you''d find relevant.</p><p>A mid-size manufacturing CFO was spending roughly ₹1,500 per vendor verification — GST checks, PAN validation, bank confirmations, credit bureau pulls. Each one took 7-10 days and involved three different team members chasing government portals.</p><p>After switching to automated verification, their cost per check dropped to under ₹25. That''s a 40% reduction in total vendor verification spend in Q1 alone — and they''re processing 3x the volume.</p><p>The part that surprised them most: they caught two vendors with revoked GST registrations that had slipped through manual checks the previous quarter.</p><p>Would it be worth a 15-minute call to see if {{company}} could see similar numbers? Happy to walk through how the math works for your vendor volume.</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    Quick story I thought you''d find relevant.

    A mid-size manufacturing CFO was spending roughly ₹1,500 per vendor verification — GST checks, PAN validation, bank confirmations, credit bureau pulls. Each one took 7-10 days and involved three different team members chasing government portals.

    After switching to automated verification, their cost per check dropped to under ₹25. That''s a 40% reduction in total vendor verification spend in Q1 alone — and they''re processing 3x the volume.

    The part that surprised them most: they caught two vendors with revoked GST registrations that had slipped through manual checks the previous quarter.

    Would it be worth a 15-minute call to see if {{company}} could see similar numbers? Happy to walk through how the math works for your vendor volume.

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'CFO-CO-3A',
      '["first_name","company","sender_name"]',
      true
    );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Social Proof: CFO Case Study B',
      '100+ finance teams made this switch, {{first_name}}',
      '<p>Hi {{first_name}},</p><p>Thought you''d want to know — over 100 finance teams have moved from manual vendor verification to automated due diligence in the last year.</p><p>The pattern is consistent: what used to take 7-10 days of chasing GST portals, calling banks, and cross-referencing PAN records now takes under 5 minutes. One API call, six verification checks, complete audit trail.</p><p>A few numbers from teams similar to {{company}}:</p><p>— 92% reduction in verification turnaround time<br/>— Zero vendor documentation gaps in external audits<br/>— Finance teams redeployed 15+ hours/week to higher-value work</p><p>The shift isn''t really about technology — it''s about whether your team spends time verifying vendors or managing vendor relationships. Two very different jobs.</p><p>Worth a quick conversation to see where {{company}} falls on that spectrum?</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    Thought you''d want to know — over 100 finance teams have moved from manual vendor verification to automated due diligence in the last year.

    The pattern is consistent: what used to take 7-10 days of chasing GST portals, calling banks, and cross-referencing PAN records now takes under 5 minutes. One API call, six verification checks, complete audit trail.

    A few numbers from teams similar to {{company}}:

    — 92% reduction in verification turnaround time
    — Zero vendor documentation gaps in external audits
    — Finance teams redeployed 15+ hours/week to higher-value work

    The shift isn''t really about technology — it''s about whether your team spends time verifying vendors or managing vendor relationships. Two very different jobs.

    Worth a quick conversation to see where {{company}} falls on that spectrum?

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'CFO-CO-3B',
      '["first_name","company","sender_name"]',
      true
    );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Social Proof: COO Case Study A',
      '{{first_name}}, a pharma COO freed 22 hours/week doing this',
      '<p>Hi {{first_name}},</p><p>A COO at a mid-size pharma company shared something interesting with us recently.</p><p>Her operations team was spending 22 hours every week on vendor verification — logging into government portals, waiting for GST confirmations, manually cross-checking PAN details, following up with banks. It was the single biggest drain on operational bandwidth.</p><p>After automating the entire verification workflow, those 22 hours went back to the team. Vendor onboarding that blocked purchase orders for 10 days now closes same-day.</p><p>The downstream effect she didn''t expect: procurement stopped blaming ops for delays. Cross-functional friction dropped noticeably.</p><p>If {{company}} is dealing with similar operational bottlenecks around vendor verification, I''d love to share how she structured the rollout. Took less than a week to go live.</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    A COO at a mid-size pharma company shared something interesting with us recently.

    Her operations team was spending 22 hours every week on vendor verification — logging into government portals, waiting for GST confirmations, manually cross-checking PAN details, following up with banks. It was the single biggest drain on operational bandwidth.

    After automating the entire verification workflow, those 22 hours went back to the team. Vendor onboarding that blocked purchase orders for 10 days now closes same-day.

    The downstream effect she didn''t expect: procurement stopped blaming ops for delays. Cross-functional friction dropped noticeably.

    If {{company}} is dealing with similar operational bottlenecks around vendor verification, I''d love to share how she structured the rollout. Took less than a week to go live.

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'COO-CO-3A',
      '["first_name","company","sender_name"]',
      true
    );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Social Proof: COO Case Study B',
      'From 45 pending vendors to zero — how one ops team did it',
      '<p>Hi {{first_name}},</p><p>Two months ago, a consumer goods company had 45 vendors stuck in their onboarding queue. Every one of them was waiting on manual verification — GST checks, PAN validation, credit bureau pulls. The backlog was holding up ₹2.3 crore in purchase orders.</p><p>Their COO gave the team two weeks to fix it. They automated the entire vendor due diligence process and cleared the backlog in 11 days. Today their queue sits at zero, and new vendors are verified in under 5 minutes.</p><p>The operations manager told us the biggest win wasn''t speed — it was predictability. No more "where is this vendor stuck?" conversations in Monday standups.</p><p>Is vendor onboarding creating a similar bottleneck at {{company}}? I can show you exactly how they structured the workflow — takes about 15 minutes.</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    Two months ago, a consumer goods company had 45 vendors stuck in their onboarding queue. Every one of them was waiting on manual verification — GST checks, PAN validation, credit bureau pulls. The backlog was holding up ₹2.3 crore in purchase orders.

    Their COO gave the team two weeks to fix it. They automated the entire vendor due diligence process and cleared the backlog in 11 days. Today their queue sits at zero, and new vendors are verified in under 5 minutes.

    The operations manager told us the biggest win wasn''t speed — it was predictability. No more "where is this vendor stuck?" conversations in Monday standups.

    Is vendor onboarding creating a similar bottleneck at {{company}}? I can show you exactly how they structured the workflow — takes about 15 minutes.

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'COO-CO-3B',
      '["first_name","company","sender_name"]',
      true
    );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Social Proof: CTO Case Study A',
      '{{first_name}}, why one CTO cancelled 3 engineering sprints',
      '<p>Hi {{first_name}},</p><p>A CTO at a Series B fintech was about to allocate three engineering sprints to building in-house vendor verification — GST API integration, PAN validation, credit bureau connectivity, Aadhaar checks. His team had scoped it at 6-8 weeks.</p><p>Then he found a single API that handled all six verification types with one integration. His team was live in two days. Those three sprints went to product features that actually moved the roadmap forward.</p><p>The part that sealed it for him: maintaining connections to government portals (GSTN, NSDL, CERSAI) is a full-time job. API endpoints change, rate limits shift, authentication flows update. He didn''t want his engineers maintaining plumbing.</p><p>If {{company}} is considering building verification in-house, it might be worth a 15-minute call to compare build vs. buy numbers before committing engineering time.</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    A CTO at a Series B fintech was about to allocate three engineering sprints to building in-house vendor verification — GST API integration, PAN validation, credit bureau connectivity, Aadhaar checks. His team had scoped it at 6-8 weeks.

    Then he found a single API that handled all six verification types with one integration. His team was live in two days. Those three sprints went to product features that actually moved the roadmap forward.

    The part that sealed it for him: maintaining connections to government portals (GSTN, NSDL, CERSAI) is a full-time job. API endpoints change, rate limits shift, authentication flows update. He didn''t want his engineers maintaining plumbing.

    If {{company}} is considering building verification in-house, it might be worth a 15-minute call to compare build vs. buy numbers before committing engineering time.

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'CTO-CO-3A',
      '["first_name","company","sender_name"]',
      true
    );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Social Proof: CTO Case Study B',
      'One API replaced 6 government portal logins for this tech team',
      '<p>Hi {{first_name}},</p><p>A quick data point from a tech team that might resonate with {{company}}.</p><p>An enterprise SaaS CTO had his engineers logging into six separate government portals for vendor verification — GSTN for GST, NSDL for PAN, CERSAI for credit checks, plus bank verification and Aadhaar validation. Each had different authentication, different rate limits, different uptime patterns.</p><p>They replaced all six with a single API endpoint. One integration, one authentication flow, one response format. Verification that took their ops team 3-4 days now returns in seconds.</p><p>But what he keeps mentioning is the maintenance burden that disappeared. No more scrambling when GSTN changes their API. No more building retry logic for portal downtime. His team ships product features now, not government portal wrappers.</p><p>If {{company}}''s engineering team is spending cycles on verification infrastructure, happy to share the technical architecture. Takes 15 minutes.</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    A quick data point from a tech team that might resonate with {{company}}.

    An enterprise SaaS CTO had his engineers logging into six separate government portals for vendor verification — GSTN for GST, NSDL for PAN, CERSAI for credit checks, plus bank verification and Aadhaar validation. Each had different authentication, different rate limits, different uptime patterns.

    They replaced all six with a single API endpoint. One integration, one authentication flow, one response format. Verification that took their ops team 3-4 days now returns in seconds.

    But what he keeps mentioning is the maintenance burden that disappeared. No more scrambling when GSTN changes their API. No more building retry logic for portal downtime. His team ships product features now, not government portal wrappers.

    If {{company}}''s engineering team is spending cycles on verification infrastructure, happy to share the technical architecture. Takes 15 minutes.

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'CTO-CO-3B',
      '["first_name","company","sender_name"]',
      true
    );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Social Proof: CCO Case Study A',
      '{{first_name}}, zero vendor documentation gaps in RBI audit',
      '<p>Hi {{first_name}},</p><p>A compliance officer at a mid-size NBFC shared this with us after their last RBI inspection.</p><p>Previously, audit prep meant two weeks of scrambling — pulling vendor verification records from email threads, shared drives, and spreadsheets. The team was never fully confident they had complete documentation for every vendor.</p><p>After automating vendor due diligence, every verification — GST, PAN, credit bureau, bank confirmation, Aadhaar — generates a timestamped, immutable audit trail. When the RBI inspector asked for vendor documentation, the compliance team pulled the complete record in minutes.</p><p>Result: zero documentation gaps. First time in three audit cycles.</p><p>The compliance officer said the real value wasn''t passing the audit — it was not dreading it. Her team spent audit week on actual compliance work instead of document hunting.</p><p>Is audit preparedness a pain point at {{company}}? Happy to show you how the audit trail works — 15-minute walkthrough.</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    A compliance officer at a mid-size NBFC shared this with us after their last RBI inspection.

    Previously, audit prep meant two weeks of scrambling — pulling vendor verification records from email threads, shared drives, and spreadsheets. The team was never fully confident they had complete documentation for every vendor.

    After automating vendor due diligence, every verification — GST, PAN, credit bureau, bank confirmation, Aadhaar — generates a timestamped, immutable audit trail. When the RBI inspector asked for vendor documentation, the compliance team pulled the complete record in minutes.

    Result: zero documentation gaps. First time in three audit cycles.

    The compliance officer said the real value wasn''t passing the audit — it was not dreading it. Her team spent audit week on actual compliance work instead of document hunting.

    Is audit preparedness a pain point at {{company}}? Happy to show you how the audit trail works — 15-minute walkthrough.

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'CCO-CO-3A',
      '["first_name","company","sender_name"]',
      true
    );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Social Proof: CCO Case Study B',
      'How one compliance team satisfied 100% of SEBI inspection requirements',
      '<p>Hi {{first_name}},</p><p>Hi {{first_name}},</p><p>During a recent SEBI inspection, a listed company''s compliance team was asked to produce vendor due diligence records for 200+ vendors onboarded over the previous 18 months.</p><p>Because every vendor verification had been automated — GST validation, PAN checks, credit bureau pulls, bank confirmations — the team generated the complete audit trail in under 30 minutes. Every record was timestamped, every check was documented, every result was immutable.</p><p>The SEBI inspector noted it was the most organized vendor documentation they''d reviewed. 100% of inspection requirements satisfied without a single follow-up query.</p><p>Compare that to the industry norm: weeks of preparation, missing records, supplementary submissions, and the constant anxiety of what might fall through the cracks.</p><p>If regulatory inspections keep your team up at night at {{company}}, let me show you what automated compliance documentation looks like. Quick 15-minute demo.</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    During a recent SEBI inspection, a listed company''s compliance team was asked to produce vendor due diligence records for 200+ vendors onboarded over the previous 18 months.

    Because every vendor verification had been automated — GST validation, PAN checks, credit bureau pulls, bank confirmations — the team generated the complete audit trail in under 30 minutes. Every record was timestamped, every check was documented, every result was immutable.

    The SEBI inspector noted it was the most organized vendor documentation they''d reviewed. 100% of inspection requirements satisfied without a single follow-up query.

    Compare that to the industry norm: weeks of preparation, missing records, supplementary submissions, and the constant anxiety of what might fall through the cracks.

    If regulatory inspections keep your team up at night at {{company}}, let me show you what automated compliance documentation looks like. Quick 15-minute demo.

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'CCO-CO-3B',
      '["first_name","company","sender_name"]',
      true
    );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Social Proof: Procurement Case Study A',
      '{{first_name}}, same-day vendor qualification is real now',
      '<p>Hi {{first_name}},</p><p>A procurement head at an auto components company told us something that stuck with me.</p><p>Her team was losing deals because vendor qualification took 10 days. By the time GST was verified, PAN validated, credit checked, and bank details confirmed, the vendor had either moved on or the internal requestor had found a workaround. Procurement was seen as the bottleneck.</p><p>After automating vendor due diligence, qualification happens same-day. GST, PAN, credit bureau, bank verification, Aadhaar — all checked in under 5 minutes. Her team now qualifies vendors faster than the business can request them.</p><p>The shift in perception was immediate. Procurement went from "the team that slows things down" to "the team that makes things happen fast."</p><p>If vendor qualification speed is affecting how {{company}}''s procurement team is perceived, I''d love to share how she made the switch. 15-minute call?</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    A procurement head at an auto components company told us something that stuck with me.

    Her team was losing deals because vendor qualification took 10 days. By the time GST was verified, PAN validated, credit checked, and bank details confirmed, the vendor had either moved on or the internal requestor had found a workaround. Procurement was seen as the bottleneck.

    After automating vendor due diligence, qualification happens same-day. GST, PAN, credit bureau, bank verification, Aadhaar — all checked in under 5 minutes. Her team now qualifies vendors faster than the business can request them.

    The shift in perception was immediate. Procurement went from "the team that slows things down" to "the team that makes things happen fast."

    If vendor qualification speed is affecting how {{company}}''s procurement team is perceived, I''d love to share how she made the switch. 15-minute call?

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'PROC-CO-3A',
      '["first_name","company","sender_name"]',
      true
    );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Social Proof: Procurement Case Study B',
      'How removing a verification bottleneck grew a supplier base 30%',
      '<p>Hi {{first_name}},</p><p>A procurement team at a retail chain had a problem they didn''t realize was self-inflicted.</p><p>They wanted to diversify their supplier base, but every new vendor meant 10 days of manual verification — GST checks on the portal, PAN validation calls, credit bureau requests, bank confirmations. Their team could only process 8-10 new vendors per month. Diversification stalled.</p><p>Once they automated vendor due diligence, they removed the bottleneck entirely. New vendor verification takes 5 minutes. In the first quarter, they expanded their qualified supplier base by 30% — and discovered better pricing from vendors they would have never gotten to manually.</p><p>The procurement head estimated the expanded supplier competition alone saved them 4% on raw material costs that quarter.</p><p>Is verification capacity limiting how fast {{company}} can grow its vendor network? Happy to walk through the numbers — takes 15 minutes.</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    A procurement team at a retail chain had a problem they didn''t realize was self-inflicted.

    They wanted to diversify their supplier base, but every new vendor meant 10 days of manual verification — GST checks on the portal, PAN validation calls, credit bureau requests, bank confirmations. Their team could only process 8-10 new vendors per month. Diversification stalled.

    Once they automated vendor due diligence, they removed the bottleneck entirely. New vendor verification takes 5 minutes. In the first quarter, they expanded their qualified supplier base by 30% — and discovered better pricing from vendors they would have never gotten to manually.

    The procurement head estimated the expanded supplier competition alone saved them 4% on raw material costs that quarter.

    Is verification capacity limiting how fast {{company}} can grow its vendor network? Happy to walk through the numbers — takes 15 minutes.

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'PROC-CO-3B',
      '["first_name","company","sender_name"]',
      true
    );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Social Proof: Supply Chain Case Study A',
      '{{first_name}}, 3 fewer disruptions per quarter from one change',
      '<p>Hi {{first_name}},</p><p>A supply chain head at a chemicals manufacturer was dealing with a recurring nightmare: vendors who looked legitimate on paper but turned out to have expired GST registrations, mismatched PAN details, or poor credit standing. The result was 3-4 supply disruptions per quarter — each one cascading into production delays and expedited shipping costs.</p><p>After implementing automated vendor verification at the onboarding stage, every vendor''s GST status, PAN, credit history, and bank details are validated before they enter the supply chain. Unverified vendors simply don''t make it through.</p><p>Result: disruptions from unverified vendors dropped to zero. Three quarters running.</p><p>He told us the ROI wasn''t even close — a single disruption cost more than a full year of automated verification.</p><p>Is {{company}} experiencing supply disruptions that trace back to vendor quality? Worth a 15-minute conversation to compare notes.</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    A supply chain head at a chemicals manufacturer was dealing with a recurring nightmare: vendors who looked legitimate on paper but turned out to have expired GST registrations, mismatched PAN details, or poor credit standing. The result was 3-4 supply disruptions per quarter — each one cascading into production delays and expedited shipping costs.

    After implementing automated vendor verification at the onboarding stage, every vendor''s GST status, PAN, credit history, and bank details are validated before they enter the supply chain. Unverified vendors simply don''t make it through.

    Result: disruptions from unverified vendors dropped to zero. Three quarters running.

    He told us the ROI wasn''t even close — a single disruption cost more than a full year of automated verification.

    Is {{company}} experiencing supply disruptions that trace back to vendor quality? Worth a 15-minute conversation to compare notes.

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'SC-CO-3A',
      '["first_name","company","sender_name"]',
      true
    );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Social Proof: Supply Chain Case Study B',
      'Supplier reliability scores up 28% — here''s what changed',
      '<p>Hi {{first_name}},</p><p>A supply chain head at a FMCG company started measuring something new last year: supplier reliability scores based on verified financial and compliance data.</p><p>Previously, supplier assessment was based on delivery history and pricing — lagging indicators. By adding continuous verification monitoring — real-time GST status, credit score changes, PAN compliance — they built a leading indicator of supplier reliability.</p><p>Within two quarters, their average supplier reliability score improved 28%. Not because suppliers got better, but because the team could identify and address risks before they became disruptions.</p><p>Two specific catches: a key supplier whose GST registration was about to lapse (flagged 30 days early) and another whose credit rating dropped sharply (triggered a review before the next PO).</p><p>If {{company}} is looking to move from reactive to predictive supply chain risk management, I can show you how the monitoring works. 15-minute walkthrough.</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    A supply chain head at a FMCG company started measuring something new last year: supplier reliability scores based on verified financial and compliance data.

    Previously, supplier assessment was based on delivery history and pricing — lagging indicators. By adding continuous verification monitoring — real-time GST status, credit score changes, PAN compliance — they built a leading indicator of supplier reliability.

    Within two quarters, their average supplier reliability score improved 28%. Not because suppliers got better, but because the team could identify and address risks before they became disruptions.

    Two specific catches: a key supplier whose GST registration was about to lapse (flagged 30 days early) and another whose credit rating dropped sharply (triggered a review before the next PO).

    If {{company}} is looking to move from reactive to predictive supply chain risk management, I can show you how the monitoring works. 15-minute walkthrough.

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'SC-CO-3B',
      '["first_name","company","sender_name"]',
      true
    );

    -- =========================================================================
    -- H. COLD VALUE/ROI OFFER - 6 ICPs x 2 A/B variants = 12 templates
    -- Fourth email. The pitch. ROI framing + free trial offer.
    -- =========================================================================

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Value/ROI: CFO ROI Focus A',
      '{{first_name}}, ₹25 vs ₹1,500 per vendor verification',
      '<p>Hi {{first_name}},</p><p>Quick math for {{company}}.</p><p>The average manual vendor verification — GST portal checks, PAN validation calls, credit bureau requests, bank confirmations — costs approximately ₹1,500 when you factor in staff time, portal subscriptions, and back-and-forth follow-ups. And it takes 7-10 days.</p><p>With In-Sync, the same verification — all six checks, complete audit trail — costs under ₹25 and takes under 5 minutes.</p><p>If {{company}} verifies even 50 vendors per quarter, that''s a shift from ₹75,000 to ₹1,250. Plans start at ₹2,999/quarter for the Starter tier, ₹7,499/quarter for Growth.</p><p>But here''s what CFOs tell us matters more than cost savings: one fraudulent vendor slipping through manual checks can cost lakhs in write-offs, legal fees, and regulatory penalties. The automated system catches what manual checks miss — expired GST registrations, revoked PAN, declining credit scores.</p><p>Want to test it? Start with 3 free verifications — no commitment, no credit card. See the results on your own vendors.</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    Quick math for {{company}}.

    The average manual vendor verification — GST portal checks, PAN validation calls, credit bureau requests, bank confirmations — costs approximately ₹1,500 when you factor in staff time, portal subscriptions, and back-and-forth follow-ups. And it takes 7-10 days.

    With In-Sync, the same verification — all six checks, complete audit trail — costs under ₹25 and takes under 5 minutes.

    If {{company}} verifies even 50 vendors per quarter, that''s a shift from ₹75,000 to ₹1,250. Plans start at ₹2,999/quarter for the Starter tier, ₹7,499/quarter for Growth.

    But here''s what CFOs tell us matters more than cost savings: one fraudulent vendor slipping through manual checks can cost lakhs in write-offs, legal fees, and regulatory penalties. The automated system catches what manual checks miss — expired GST registrations, revoked PAN, declining credit scores.

    Want to test it? Start with 3 free verifications — no commitment, no credit card. See the results on your own vendors.

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'CFO-CO-4A',
      '["first_name","company","sender_name"]',
      true
    );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Value/ROI: CFO Risk Focus B',
      '{{first_name}}, what does one fraudulent vendor cost {{company}}?',
      '<p>Hi {{first_name}},</p><p>Here''s a question most CFOs don''t think about until it''s too late: what does one fraudulent vendor actually cost?</p><p>For mid-size companies, the answer is typically ₹5-15 lakhs — between write-offs, legal expenses, regulatory fines, and the operational disruption of unwinding a vendor relationship. And that''s before reputational damage.</p><p>Manual vendor verification misses things. GST registrations expire between checks. PAN details pass a visual scan but fail proper validation. Credit scores deteriorate without anyone noticing. The gaps are invisible until they''re expensive.</p><p>In-Sync runs six verification checks in under 5 minutes — GST, PAN, credit bureau, bank verification, Aadhaar, and continuous monitoring for changes. Every check is documented with a timestamped audit trail.</p><p>Plans start at ₹2,999/quarter. That''s less than the cost of one accounts team member spending one day on manual checks.</p><p>Try it with 3 free verifications on your existing vendors. If the automated check catches something your manual process missed, you''ll have your answer.</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    Here''s a question most CFOs don''t think about until it''s too late: what does one fraudulent vendor actually cost?

    For mid-size companies, the answer is typically ₹5-15 lakhs — between write-offs, legal expenses, regulatory fines, and the operational disruption of unwinding a vendor relationship. And that''s before reputational damage.

    Manual vendor verification misses things. GST registrations expire between checks. PAN details pass a visual scan but fail proper validation. Credit scores deteriorate without anyone noticing. The gaps are invisible until they''re expensive.

    In-Sync runs six verification checks in under 5 minutes — GST, PAN, credit bureau, bank verification, Aadhaar, and continuous monitoring for changes. Every check is documented with a timestamped audit trail.

    Plans start at ₹2,999/quarter. That''s less than the cost of one accounts team member spending one day on manual checks.

    Try it with 3 free verifications on your existing vendors. If the automated check catches something your manual process missed, you''ll have your answer.

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'CFO-CO-4B',
      '["first_name","company","sender_name"]',
      true
    );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Value/ROI: COO ROI Focus A',
      '{{first_name}}, how much is vendor onboarding costing {{company}} in time?',
      '<p>Hi {{first_name}},</p><p>Here''s a straightforward calculation for {{company}}.</p><p>If your team spends an average of 4 hours per vendor on verification — GST portal, PAN validation, credit checks, bank confirmations, follow-ups — and you onboard 30 vendors per quarter, that''s 120 hours. At a blended operations cost of ₹800/hour, you''re spending ₹96,000/quarter on a process that adds zero strategic value.</p><p>With In-Sync, the same 30 vendors get verified in under 150 minutes total. Your team gets 117 hours back per quarter. That''s nearly 3 full weeks of operational capacity redeployed to work that actually moves the business forward.</p><p>The platform starts at ₹2,999/quarter for Starter, ₹7,499/quarter for Growth with higher volumes. Either way, the math is overwhelmingly in your favor.</p><p>Want to see it work on your actual vendors? Start with 3 free verifications — no setup, no commitment. You''ll see results in under 5 minutes.</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    Here''s a straightforward calculation for {{company}}.

    If your team spends an average of 4 hours per vendor on verification — GST portal, PAN validation, credit checks, bank confirmations, follow-ups — and you onboard 30 vendors per quarter, that''s 120 hours. At a blended operations cost of ₹800/hour, you''re spending ₹96,000/quarter on a process that adds zero strategic value.

    With In-Sync, the same 30 vendors get verified in under 150 minutes total. Your team gets 117 hours back per quarter. That''s nearly 3 full weeks of operational capacity redeployed to work that actually moves the business forward.

    The platform starts at ₹2,999/quarter for Starter, ₹7,499/quarter for Growth with higher volumes. Either way, the math is overwhelmingly in your favor.

    Want to see it work on your actual vendors? Start with 3 free verifications — no setup, no commitment. You''ll see results in under 5 minutes.

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'COO-CO-4A',
      '["first_name","company","sender_name"]',
      true
    );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Value/ROI: COO Risk Focus B',
      '{{first_name}}, delayed vendor onboarding is costing {{company}} revenue',
      '<p>Hi {{first_name}},</p><p>Every day a vendor sits in your verification queue is a day a purchase order doesn''t go out. For operations teams, that delay has a direct revenue impact.</p><p>Consider this: if vendor onboarding takes 10 days and you have 5 vendors in the queue at any given time, that''s 50 vendor-days of delayed procurement per cycle. Each delayed PO pushes delivery timelines, creates production scheduling gaps, and sometimes forces expensive expedited alternatives.</p><p>One operations leader told us a single delayed vendor onboarding cost their company ₹8 lakhs in expedited shipping when the approved alternative couldn''t deliver on time.</p><p>In-Sync automates the entire vendor verification process — GST, PAN, credit bureau, bank verification, Aadhaar — in under 5 minutes. Vendors that used to wait 10 days get cleared same-day. Starting at ₹2,999/quarter.</p><p>Try 3 free verifications on vendors currently in your queue. See how fast "pending" becomes "approved."</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    Every day a vendor sits in your verification queue is a day a purchase order doesn''t go out. For operations teams, that delay has a direct revenue impact.

    Consider this: if vendor onboarding takes 10 days and you have 5 vendors in the queue at any given time, that''s 50 vendor-days of delayed procurement per cycle. Each delayed PO pushes delivery timelines, creates production scheduling gaps, and sometimes forces expensive expedited alternatives.

    One operations leader told us a single delayed vendor onboarding cost their company ₹8 lakhs in expedited shipping when the approved alternative couldn''t deliver on time.

    In-Sync automates the entire vendor verification process — GST, PAN, credit bureau, bank verification, Aadhaar — in under 5 minutes. Vendors that used to wait 10 days get cleared same-day. Starting at ₹2,999/quarter.

    Try 3 free verifications on vendors currently in your queue. See how fast "pending" becomes "approved."

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'COO-CO-4B',
      '["first_name","company","sender_name"]',
      true
    );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Value/ROI: CTO ROI Focus A',
      '{{first_name}}, build vs buy math on vendor verification',
      '<p>Hi {{first_name}},</p><p>If {{company}}''s engineering team is considering building vendor verification in-house, here''s the build vs. buy math we''ve seen play out at other companies.</p><p>Build: 3 engineering sprints (6-8 weeks) for initial integration with GSTN, NSDL, CERSAI, bank APIs, and Aadhaar. Then ongoing maintenance — government portal API changes happen 4-6 times per year, each requiring 2-3 days of engineering time. Year one cost: roughly 4-5 months of senior engineer time.</p><p>Buy: Single API integration, live in 1-2 days. All six verification types through one endpoint. Government portal changes handled on our side. Plans start at ₹2,999/quarter.</p><p>The engineers who would have built verification infrastructure spend those 3 sprints on features that differentiate your product instead.</p><p>Start with 3 free API calls to test the integration. Full documentation, sandbox environment, and response format — everything your team needs to evaluate in an afternoon.</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    If {{company}}''s engineering team is considering building vendor verification in-house, here''s the build vs. buy math we''ve seen play out at other companies.

    Build: 3 engineering sprints (6-8 weeks) for initial integration with GSTN, NSDL, CERSAI, bank APIs, and Aadhaar. Then ongoing maintenance — government portal API changes happen 4-6 times per year, each requiring 2-3 days of engineering time. Year one cost: roughly 4-5 months of senior engineer time.

    Buy: Single API integration, live in 1-2 days. All six verification types through one endpoint. Government portal changes handled on our side. Plans start at ₹2,999/quarter.

    The engineers who would have built verification infrastructure spend those 3 sprints on features that differentiate your product instead.

    Start with 3 free API calls to test the integration. Full documentation, sandbox environment, and response format — everything your team needs to evaluate in an afternoon.

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'CTO-CO-4A',
      '["first_name","company","sender_name"]',
      true
    );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Value/ROI: CTO Risk Focus B',
      '{{first_name}}, who maintains your government portal integrations?',
      '<p>Hi {{first_name}},</p><p>A question for {{company}}''s tech team: who''s on the hook when GSTN changes their API?</p><p>Government portals are notoriously unstable integration targets. GSTN alone has changed their API structure, authentication flow, or rate limits multiple times in the past year. NSDL, CERSAI, and bank verification APIs each have their own update cycles. If you''re maintaining direct integrations, that''s 4-6 unplanned maintenance events per year.</p><p>Each one pulls an engineer off product work for 2-3 days. Over a year, that''s 2-3 weeks of reactive maintenance on infrastructure that isn''t your core product.</p><p>The bigger risk: if a portal change breaks your integration silently, vendors could pass verification checks that should have failed. That''s a compliance gap that doesn''t surface until an audit.</p><p>In-Sync handles all government portal connectivity. When APIs change, we update. Your integration stays stable. One endpoint, all six verification types, always current. Starting at ₹2,999/quarter.</p><p>Try 3 free verifications to test the reliability. No integration required for the trial.</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    A question for {{company}}''s tech team: who''s on the hook when GSTN changes their API?

    Government portals are notoriously unstable integration targets. GSTN alone has changed their API structure, authentication flow, or rate limits multiple times in the past year. NSDL, CERSAI, and bank verification APIs each have their own update cycles. If you''re maintaining direct integrations, that''s 4-6 unplanned maintenance events per year.

    Each one pulls an engineer off product work for 2-3 days. Over a year, that''s 2-3 weeks of reactive maintenance on infrastructure that isn''t your core product.

    The bigger risk: if a portal change breaks your integration silently, vendors could pass verification checks that should have failed. That''s a compliance gap that doesn''t surface until an audit.

    In-Sync handles all government portal connectivity. When APIs change, we update. Your integration stays stable. One endpoint, all six verification types, always current. Starting at ₹2,999/quarter.

    Try 3 free verifications to test the reliability. No integration required for the trial.

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'CTO-CO-4B',
      '["first_name","company","sender_name"]',
      true
    );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Value/ROI: CCO ROI Focus A',
      '{{first_name}}, automate audit prep for a fraction of the manual cost',
      '<p>Hi {{first_name}},</p><p>Here''s a cost comparison that compliance teams at companies like {{company}} find eye-opening.</p><p>Manual audit preparation for vendor due diligence typically takes 2-3 weeks of a compliance analyst''s time per audit cycle — gathering records, cross-referencing verification dates, filling documentation gaps, creating summary reports. At a blended cost of ₹1,000/hour, that''s ₹80,000-₹120,000 per audit prep cycle in staff time alone.</p><p>With automated vendor verification, there''s no audit prep. Every verification generates a timestamped, immutable record. When an auditor or regulator asks for documentation, you pull the report in minutes. The audit trail builds itself.</p><p>In-Sync plans start at ₹2,999/quarter. That''s one audit prep cycle paying for over a year of automated compliance documentation.</p><p>And the bonus: continuous monitoring flags compliance changes between audits — expired GST registrations, PAN issues, credit deterioration — so you''re never caught off guard.</p><p>Start with 3 free verifications to see the audit trail format. No commitment required.</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    Here''s a cost comparison that compliance teams at companies like {{company}} find eye-opening.

    Manual audit preparation for vendor due diligence typically takes 2-3 weeks of a compliance analyst''s time per audit cycle — gathering records, cross-referencing verification dates, filling documentation gaps, creating summary reports. At a blended cost of ₹1,000/hour, that''s ₹80,000-₹120,000 per audit prep cycle in staff time alone.

    With automated vendor verification, there''s no audit prep. Every verification generates a timestamped, immutable record. When an auditor or regulator asks for documentation, you pull the report in minutes. The audit trail builds itself.

    In-Sync plans start at ₹2,999/quarter. That''s one audit prep cycle paying for over a year of automated compliance documentation.

    And the bonus: continuous monitoring flags compliance changes between audits — expired GST registrations, PAN issues, credit deterioration — so you''re never caught off guard.

    Start with 3 free verifications to see the audit trail format. No commitment required.

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'CCO-CO-4A',
      '["first_name","company","sender_name"]',
      true
    );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Value/ROI: CCO Risk Focus B',
      '{{first_name}}, the cost of a compliance gap at {{company}}',
      '<p>Hi {{first_name}},</p><p>RBI penalties for vendor due diligence failures range from ₹5 lakhs to ₹2 crore depending on severity and repeat occurrence. SEBI enforcement actions can be even steeper, plus the reputational impact on listed companies.</p><p>The uncomfortable truth: most compliance gaps in vendor verification aren''t intentional. They''re the result of manual processes that can''t keep up. A GST registration expires after the initial check. A vendor''s credit score drops between annual reviews. PAN details change and nobody re-validates.</p><p>These aren''t negligence — they''re the natural failure mode of manual verification at scale.</p><p>In-Sync automates all six verification checks with continuous monitoring. When a vendor''s GST status changes or credit score drops, you''re alerted immediately — not at the next audit. Every change is logged with a timestamped audit trail.</p><p>Plans start at ₹2,999/quarter. Compare that to the cost of one regulatory penalty or one audit finding.</p><p>Try 3 free verifications on your current vendors. If the system flags something your manual process missed, you''ll know exactly what''s at stake.</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    RBI penalties for vendor due diligence failures range from ₹5 lakhs to ₹2 crore depending on severity and repeat occurrence. SEBI enforcement actions can be even steeper, plus the reputational impact on listed companies.

    The uncomfortable truth: most compliance gaps in vendor verification aren''t intentional. They''re the result of manual processes that can''t keep up. A GST registration expires after the initial check. A vendor''s credit score drops between annual reviews. PAN details change and nobody re-validates.

    These aren''t negligence — they''re the natural failure mode of manual verification at scale.

    In-Sync automates all six verification checks with continuous monitoring. When a vendor''s GST status changes or credit score drops, you''re alerted immediately — not at the next audit. Every change is logged with a timestamped audit trail.

    Plans start at ₹2,999/quarter. Compare that to the cost of one regulatory penalty or one audit finding.

    Try 3 free verifications on your current vendors. If the system flags something your manual process missed, you''ll know exactly what''s at stake.

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'CCO-CO-4B',
      '["first_name","company","sender_name"]',
      true
    );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Value/ROI: Procurement ROI Focus A',
      '{{first_name}}, faster vendor qualification = faster procurement cycles',
      '<p>Hi {{first_name}},</p><p>Here''s a direct line from vendor verification speed to procurement performance at {{company}}.</p><p>If vendor qualification takes 10 days and you''re onboarding 20 vendors per quarter, that''s 200 vendor-days of delay built into your procurement cycle. Every one of those days is a day your team can''t issue a PO, can''t lock in pricing, can''t meet an internal requestor''s timeline.</p><p>With In-Sync, vendor verification — GST, PAN, credit bureau, bank confirmation, Aadhaar — takes under 5 minutes. Same-day qualification becomes the norm, not the exception.</p><p>The ROI math is simple: ₹2,999/quarter for the Starter plan. If faster qualification lets you lock in better pricing on even one vendor per quarter, the platform pays for itself many times over.</p><p>But the real value is perception. When procurement qualifies vendors in hours instead of weeks, every internal stakeholder notices. Your team stops being the bottleneck and starts being the accelerator.</p><p>Start with 3 free verifications. Pick the vendors that have been waiting longest in your queue.</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    Here''s a direct line from vendor verification speed to procurement performance at {{company}}.

    If vendor qualification takes 10 days and you''re onboarding 20 vendors per quarter, that''s 200 vendor-days of delay built into your procurement cycle. Every one of those days is a day your team can''t issue a PO, can''t lock in pricing, can''t meet an internal requestor''s timeline.

    With In-Sync, vendor verification — GST, PAN, credit bureau, bank confirmation, Aadhaar — takes under 5 minutes. Same-day qualification becomes the norm, not the exception.

    The ROI math is simple: ₹2,999/quarter for the Starter plan. If faster qualification lets you lock in better pricing on even one vendor per quarter, the platform pays for itself many times over.

    But the real value is perception. When procurement qualifies vendors in hours instead of weeks, every internal stakeholder notices. Your team stops being the bottleneck and starts being the accelerator.

    Start with 3 free verifications. Pick the vendors that have been waiting longest in your queue.

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'PROC-CO-4A',
      '["first_name","company","sender_name"]',
      true
    );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Value/ROI: Procurement Risk Focus B',
      '{{first_name}}, is procurement the bottleneck at {{company}}?',
      '<p>Hi {{first_name}},</p><p>Nobody in procurement wants to hear this, but it''s usually true: when vendor onboarding takes 10 days, procurement is the bottleneck — even though the delay is in verification, not decision-making.</p><p>Internal stakeholders don''t see the difference. They see a vendor they selected sitting in "pending" for over a week. They start looking for workarounds. Sometimes they bypass procurement entirely, creating compliance and cost risks that land back on your desk.</p><p>The fix isn''t working harder or adding headcount. It''s removing the verification bottleneck entirely.</p><p>In-Sync runs GST, PAN, credit bureau, bank verification, and Aadhaar checks in under 5 minutes. Your team makes the decision; the platform handles the verification. Same-day turnaround on vendor qualification.</p><p>Plans start at ₹2,999/quarter — less than the cost of one procurement workaround going wrong.</p><p>Try 3 free verifications. If your team can qualify a vendor before lunch that would normally take until next week, you''ll see the difference immediately.</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    Nobody in procurement wants to hear this, but it''s usually true: when vendor onboarding takes 10 days, procurement is the bottleneck — even though the delay is in verification, not decision-making.

    Internal stakeholders don''t see the difference. They see a vendor they selected sitting in "pending" for over a week. They start looking for workarounds. Sometimes they bypass procurement entirely, creating compliance and cost risks that land back on your desk.

    The fix isn''t working harder or adding headcount. It''s removing the verification bottleneck entirely.

    In-Sync runs GST, PAN, credit bureau, bank verification, and Aadhaar checks in under 5 minutes. Your team makes the decision; the platform handles the verification. Same-day turnaround on vendor qualification.

    Plans start at ₹2,999/quarter — less than the cost of one procurement workaround going wrong.

    Try 3 free verifications. If your team can qualify a vendor before lunch that would normally take until next week, you''ll see the difference immediately.

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'PROC-CO-4B',
      '["first_name","company","sender_name"]',
      true
    );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Value/ROI: Supply Chain ROI Focus A',
      '{{first_name}}, fewer disruptions = smoother production at {{company}}',
      '<p>Hi {{first_name}},</p><p>Here''s a number worth thinking about: the average cost of a single supply chain disruption caused by an unverified vendor ranges from ₹3-12 lakhs — including expedited sourcing, production rescheduling, overtime, and customer penalties.</p><p>If {{company}} experiences even 2-3 such disruptions per year, that''s ₹6-36 lakhs in avoidable costs.</p><p>In-Sync verifies every vendor''s GST status, PAN, credit standing, bank details, and identity before they enter your supply chain. Verification takes under 5 minutes. Vendors with expired registrations, poor credit, or mismatched identities get flagged before they can cause a disruption.</p><p>Plus, continuous monitoring catches changes after onboarding — a supplier whose GST lapses or credit score drops triggers an alert, not a surprise.</p><p>Plans start at ₹2,999/quarter. One prevented disruption pays for years of the platform.</p><p>Start with 3 free verifications on your current supplier base. If the system flags a risk you didn''t know about, that alone is worth the 5 minutes.</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    Here''s a number worth thinking about: the average cost of a single supply chain disruption caused by an unverified vendor ranges from ₹3-12 lakhs — including expedited sourcing, production rescheduling, overtime, and customer penalties.

    If {{company}} experiences even 2-3 such disruptions per year, that''s ₹6-36 lakhs in avoidable costs.

    In-Sync verifies every vendor''s GST status, PAN, credit standing, bank details, and identity before they enter your supply chain. Verification takes under 5 minutes. Vendors with expired registrations, poor credit, or mismatched identities get flagged before they can cause a disruption.

    Plus, continuous monitoring catches changes after onboarding — a supplier whose GST lapses or credit score drops triggers an alert, not a surprise.

    Plans start at ₹2,999/quarter. One prevented disruption pays for years of the platform.

    Start with 3 free verifications on your current supplier base. If the system flags a risk you didn''t know about, that alone is worth the 5 minutes.

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'SC-CO-4A',
      '["first_name","company","sender_name"]',
      true
    );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
    VALUES (
      _org_id,
      'Cold Value/ROI: Supply Chain Risk Focus B',
      '{{first_name}}, one bad vendor can halt a production line',
      '<p>Hi {{first_name}},</p><p>It only takes one.</p><p>One vendor with a revoked GST registration who can''t issue valid tax invoices. One supplier whose credit score collapsed and who can''t fulfill a critical order. One partner whose PAN doesn''t match their bank account, delaying payment and delivery.</p><p>Any one of these can halt a production line at {{company}}. And by the time you discover the problem, you''re already in crisis mode — scrambling for alternatives, paying premiums for expedited replacements, explaining delays to your customers.</p><p>The root cause is almost always the same: the vendor passed an initial check months ago, and nobody verified them again.</p><p>In-Sync doesn''t just verify vendors at onboarding — it monitors them continuously. GST status changes, credit deterioration, PAN irregularities — you get alerted before they become supply chain emergencies.</p><p>Plans start at ₹2,999/quarter. That''s less than the cost of one hour of unplanned production downtime.</p><p>Try 3 free verifications on your most critical suppliers. If something''s changed since their last manual check, you''ll want to know now rather than during a disruption.</p><p>Best,<br/>{{sender_name}}</p>',
      'Hi {{first_name}},

    It only takes one.

    One vendor with a revoked GST registration who can''t issue valid tax invoices. One supplier whose credit score collapsed and who can''t fulfill a critical order. One partner whose PAN doesn''t match their bank account, delaying payment and delivery.

    Any one of these can halt a production line at {{company}}. And by the time you discover the problem, you''re already in crisis mode — scrambling for alternatives, paying premiums for expedited replacements, explaining delays to your customers.

    The root cause is almost always the same: the vendor passed an initial check months ago, and nobody verified them again.

    In-Sync doesn''t just verify vendors at onboarding — it monitors them continuously. GST status changes, credit deterioration, PAN irregularities — you get alerted before they become supply chain emergencies.

    Plans start at ₹2,999/quarter. That''s less than the cost of one hour of unplanned production downtime.

    Try 3 free verifications on your most critical suppliers. If something''s changed since their last manual check, you''ll want to know now rather than during a disruption.

    Best,
    {{sender_name}}',
      'In-Sync Team',
      'hello@in-sync.co.in',
      'cold_outbound',
      'SC-CO-4B',
      '["first_name","company","sender_name"]',
      true
    );

    -- =========================================================================
    -- I. COLD BREAKUP / LAST TOUCH - 6 ICPs x 2 A/B variants = 12 templates
    -- Final cold email. Short, respectful, leaves door open.
    -- =========================================================================

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
        VALUES (
          _org_id,
          'Cold Breakup: CFO Last Touch A',
          'Closing the loop, {{first_name}}',
          '<p>{{first_name}}, I''ve reached out a few times about how In-Sync helps finance leaders at companies like {{company}} automate vendor due diligence — GST verification, PAN validation, credit checks — in under 5 minutes instead of 7-10 days.</p><p>I haven''t heard back, so I''m going to close your file on my end.</p><p>No hard feelings at all. If vendor risk management or audit readiness ever moves up the priority list, I''m here. You''ll have my info.</p><p>Wishing you and the {{company}} finance team a smooth quarter ahead.</p><p>Best,<br/>{{sender_name}}</p>',
          '{{first_name}}, I''ve reached out a few times about how In-Sync helps finance leaders at companies like {{company}} automate vendor due diligence — GST verification, PAN validation, credit checks — in under 5 minutes instead of 7-10 days.

    I haven''t heard back, so I''m going to close your file on my end.

    No hard feelings at all. If vendor risk management or audit readiness ever moves up the priority list, I''m here. You''ll have my info.

    Wishing you and the {{company}} finance team a smooth quarter ahead.

    Best,
    {{sender_name}}',
          'In-Sync Team',
          'hello@in-sync.co.in',
          'cold_outbound',
          'CFO-CO-5A',
          '["first_name","company","sender_name"]',
          true
        );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
        VALUES (
          _org_id,
          'Cold Breakup: CFO Last Touch B',
          'One last thing before I go, {{first_name}}',
          '<p>{{first_name}}, I know vendor risk isn''t keeping you up at night — until audit season hits and someone asks why a supplier''s GST registration was cancelled six months ago.</p><p>That''s the exact scenario In-Sync prevents. Automated checks, real-time flags, audit-ready reports. Starting at ₹2,999/quarter.</p><p>I''ve reached out a few times, so this will be my last note. But if the timing is ever right, I''m here — and we offer 3 free verifications so there''s zero risk in testing it.</p><p>Best,<br/>{{sender_name}}</p>',
          '{{first_name}}, I know vendor risk isn''t keeping you up at night — until audit season hits and someone asks why a supplier''s GST registration was cancelled six months ago.

    That''s the exact scenario In-Sync prevents. Automated checks, real-time flags, audit-ready reports. Starting at ₹2,999/quarter.

    I''ve reached out a few times, so this will be my last note. But if the timing is ever right, I''m here — and we offer 3 free verifications so there''s zero risk in testing it.

    Best,
    {{sender_name}}',
          'In-Sync Team',
          'hello@in-sync.co.in',
          'cold_outbound',
          'CFO-CO-5B',
          '["first_name","company","sender_name"]',
          true
        );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
        VALUES (
          _org_id,
          'Cold Breakup: COO Last Touch A',
          'Closing the loop on vendor onboarding, {{first_name}}',
          '<p>{{first_name}}, I''ve reached out a few times about streamlining vendor onboarding at {{company}}. I understand if the timing isn''t right — operations leaders have a hundred things competing for attention.</p><p>I''m going to close out this thread on my end. If manual vendor verification ever becomes a bottleneck worth solving, In-Sync can take it from 7-10 days down to under 5 minutes.</p><p>If the timing is ever right, I''m here.</p><p>Best,<br/>{{sender_name}}</p>',
          '{{first_name}}, I''ve reached out a few times about streamlining vendor onboarding at {{company}}. I understand if the timing isn''t right — operations leaders have a hundred things competing for attention.

    I''m going to close out this thread on my end. If manual vendor verification ever becomes a bottleneck worth solving, In-Sync can take it from 7-10 days down to under 5 minutes.

    If the timing is ever right, I''m here.

    Best,
    {{sender_name}}',
          'In-Sync Team',
          'hello@in-sync.co.in',
          'cold_outbound',
          'COO-CO-5A',
          '["first_name","company","sender_name"]',
          true
        );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
        VALUES (
          _org_id,
          'Cold Breakup: COO Last Touch B',
          'Before I go — one thought for {{company}}',
          '<p>{{first_name}}, if manual vendor onboarding is working for {{company}}, I''ll step back. Some companies have teams big enough to absorb 7-10 days per vendor verification. That''s fine.</p><p>But if it ever starts slowing down operations — delayed projects because a vendor''s paperwork is stuck, procurement teams chasing GST certificates instead of negotiating — In-Sync fixes that in under 5 minutes per vendor.</p><p>This is my last note. 3 free verifications are there whenever you want to test it. No commitment needed.</p><p>Best,<br/>{{sender_name}}</p>',
          '{{first_name}}, if manual vendor onboarding is working for {{company}}, I''ll step back. Some companies have teams big enough to absorb 7-10 days per vendor verification. That''s fine.

    But if it ever starts slowing down operations — delayed projects because a vendor''s paperwork is stuck, procurement teams chasing GST certificates instead of negotiating — In-Sync fixes that in under 5 minutes per vendor.

    This is my last note. 3 free verifications are there whenever you want to test it. No commitment needed.

    Best,
    {{sender_name}}',
          'In-Sync Team',
          'hello@in-sync.co.in',
          'cold_outbound',
          'COO-CO-5B',
          '["first_name","company","sender_name"]',
          true
        );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
        VALUES (
          _org_id,
          'Cold Breakup: CTO Last Touch A',
          'Closing this thread, {{first_name}}',
          '<p>{{first_name}}, I''ve reached out a few times about vendor verification automation for {{company}}. I respect your time, so I''m closing this loop.</p><p>If your engineering team ever needs to offload government API integrations — GST, PAN, Aadhaar, credit bureau — instead of building and maintaining them in-house, In-Sync handles all of it through a single platform.</p><p>If the timing is ever right, I''m here. Wishing your team a productive quarter.</p><p>Best,<br/>{{sender_name}}</p>',
          '{{first_name}}, I''ve reached out a few times about vendor verification automation for {{company}}. I respect your time, so I''m closing this loop.

    If your engineering team ever needs to offload government API integrations — GST, PAN, Aadhaar, credit bureau — instead of building and maintaining them in-house, In-Sync handles all of it through a single platform.

    If the timing is ever right, I''m here. Wishing your team a productive quarter.

    Best,
    {{sender_name}}',
          'In-Sync Team',
          'hello@in-sync.co.in',
          'cold_outbound',
          'CTO-CO-5A',
          '["first_name","company","sender_name"]',
          true
        );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
        VALUES (
          _org_id,
          'Cold Breakup: CTO Last Touch B',
          'One final note, {{first_name}}',
          '<p>{{first_name}}, if your team has the bandwidth to maintain government API integrations in-house — GST portal, PAN validation, credit bureaus, Aadhaar — more power to you. Those APIs change constantly and keeping up is a full-time job.</p><p>But if that ever becomes a drag on engineering resources at {{company}}, In-Sync handles the entire verification stack. Your team ships product, we handle compliance infrastructure.</p><p>Last note from me. 3 free verifications are ready if you ever want to see it in action.</p><p>Best,<br/>{{sender_name}}</p>',
          '{{first_name}}, if your team has the bandwidth to maintain government API integrations in-house — GST portal, PAN validation, credit bureaus, Aadhaar — more power to you. Those APIs change constantly and keeping up is a full-time job.

    But if that ever becomes a drag on engineering resources at {{company}}, In-Sync handles the entire verification stack. Your team ships product, we handle compliance infrastructure.

    Last note from me. 3 free verifications are ready if you ever want to see it in action.

    Best,
    {{sender_name}}',
          'In-Sync Team',
          'hello@in-sync.co.in',
          'cold_outbound',
          'CTO-CO-5B',
          '["first_name","company","sender_name"]',
          true
        );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
        VALUES (
          _org_id,
          'Cold Breakup: CCO Last Touch A',
          'Closing your file, {{first_name}}',
          '<p>{{first_name}}, I''ve reached out a few times about vendor compliance automation for {{company}}. I don''t want to be a nuisance, so I''m closing this thread.</p><p>If vendor due diligence documentation or audit-readiness ever becomes a pressing concern — especially around regulatory review cycles — In-Sync can help. Automated GST, PAN, credit, and Aadhaar checks with full compliance trails.</p><p>If the timing is ever right, I''m here.</p><p>Best,<br/>{{sender_name}}</p>',
          '{{first_name}}, I''ve reached out a few times about vendor compliance automation for {{company}}. I don''t want to be a nuisance, so I''m closing this thread.

    If vendor due diligence documentation or audit-readiness ever becomes a pressing concern — especially around regulatory review cycles — In-Sync can help. Automated GST, PAN, credit, and Aadhaar checks with full compliance trails.

    If the timing is ever right, I''m here.

    Best,
    {{sender_name}}',
          'In-Sync Team',
          'hello@in-sync.co.in',
          'cold_outbound',
          'CCO-CO-5A',
          '["first_name","company","sender_name"]',
          true
        );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
        VALUES (
          _org_id,
          'Cold Breakup: CCO Last Touch B',
          'Before I step back — a thought on compliance risk',
          '<p>{{first_name}}, compliance gaps tend to surface at the worst possible time — during an audit, a regulatory inquiry, or when a vendor dispute escalates.</p><p>I''ve reached out a few times about how In-Sync gives compliance teams at companies like {{company}} automated vendor verification with complete documentation trails. GST status checks, PAN validation, credit reports — all in one place, all audit-ready.</p><p>This is my last note. If it ever makes sense to explore, 3 free verifications are waiting. No strings.</p><p>Best,<br/>{{sender_name}}</p>',
          '{{first_name}}, compliance gaps tend to surface at the worst possible time — during an audit, a regulatory inquiry, or when a vendor dispute escalates.

    I''ve reached out a few times about how In-Sync gives compliance teams at companies like {{company}} automated vendor verification with complete documentation trails. GST status checks, PAN validation, credit reports — all in one place, all audit-ready.

    This is my last note. If it ever makes sense to explore, 3 free verifications are waiting. No strings.

    Best,
    {{sender_name}}',
          'In-Sync Team',
          'hello@in-sync.co.in',
          'cold_outbound',
          'CCO-CO-5B',
          '["first_name","company","sender_name"]',
          true
        );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
        VALUES (
          _org_id,
          'Cold Breakup: Procurement Last Touch A',
          'Closing this out, {{first_name}}',
          '<p>{{first_name}}, I''ve reached out a few times about faster vendor qualification for {{company}}''s procurement team. I understand priorities shift, so I''m going to close this thread.</p><p>If the day comes when 7-10 day vendor verification cycles start costing you deals or delaying projects, In-Sync can get that down to under 5 minutes. Automated GST, PAN, credit, and bank verification.</p><p>If the timing is ever right, I''m here.</p><p>Best,<br/>{{sender_name}}</p>',
          '{{first_name}}, I''ve reached out a few times about faster vendor qualification for {{company}}''s procurement team. I understand priorities shift, so I''m going to close this thread.

    If the day comes when 7-10 day vendor verification cycles start costing you deals or delaying projects, In-Sync can get that down to under 5 minutes. Automated GST, PAN, credit, and bank verification.

    If the timing is ever right, I''m here.

    Best,
    {{sender_name}}',
          'In-Sync Team',
          'hello@in-sync.co.in',
          'cold_outbound',
          'PROC-CO-5A',
          '["first_name","company","sender_name"]',
          true
        );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
        VALUES (
          _org_id,
          'Cold Breakup: Procurement Last Touch B',
          'One last note on vendor qualification',
          '<p>{{first_name}}, I realize faster vendor qualification may not be a priority right now for {{company}}. That''s completely fair — procurement teams juggle a lot.</p><p>But when the vendor backlog stacks up — and it always does, usually right before a big project kick-off — you might want a way to verify GST, PAN, credit scores, and bank details in under 5 minutes instead of chasing documents for a week.</p><p>Last email from me. 3 free verifications are ready whenever you want to test it. No commitment.</p><p>Best,<br/>{{sender_name}}</p>',
          '{{first_name}}, I realize faster vendor qualification may not be a priority right now for {{company}}. That''s completely fair — procurement teams juggle a lot.

    But when the vendor backlog stacks up — and it always does, usually right before a big project kick-off — you might want a way to verify GST, PAN, credit scores, and bank details in under 5 minutes instead of chasing documents for a week.

    Last email from me. 3 free verifications are ready whenever you want to test it. No commitment.

    Best,
    {{sender_name}}',
          'In-Sync Team',
          'hello@in-sync.co.in',
          'cold_outbound',
          'PROC-CO-5B',
          '["first_name","company","sender_name"]',
          true
        );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
        VALUES (
          _org_id,
          'Cold Breakup: Supply Chain Last Touch A',
          'Closing this loop, {{first_name}}',
          '<p>{{first_name}}, I''ve reached out a few times about supply chain vendor verification for {{company}}. I respect your bandwidth, so I''m stepping back.</p><p>If supply chain verification ever becomes a bottleneck — delayed onboarding, unverified suppliers slipping through, audit gaps — In-Sync automates the entire process. GST, PAN, credit checks, bank verification. Under 5 minutes per vendor.</p><p>If the timing is ever right, I''m here.</p><p>Best,<br/>{{sender_name}}</p>',
          '{{first_name}}, I''ve reached out a few times about supply chain vendor verification for {{company}}. I respect your bandwidth, so I''m stepping back.

    If supply chain verification ever becomes a bottleneck — delayed onboarding, unverified suppliers slipping through, audit gaps — In-Sync automates the entire process. GST, PAN, credit checks, bank verification. Under 5 minutes per vendor.

    If the timing is ever right, I''m here.

    Best,
    {{sender_name}}',
          'In-Sync Team',
          'hello@in-sync.co.in',
          'cold_outbound',
          'SC-CO-5A',
          '["first_name","company","sender_name"]',
          true
        );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
        VALUES (
          _org_id,
          'Cold Breakup: Supply Chain Last Touch B',
          'Before I step back — one thought on supply chain risk',
          '<p>{{first_name}}, supply chain verification might not be on fire today at {{company}} — but when it is, you''ll want this in place. A single unverified supplier can trigger delivery failures, compliance flags, or worse.</p><p>In-Sync automates vendor due diligence across your entire supply chain — GST verification, PAN validation, credit bureau checks, bank statement analysis. Under 5 minutes, fully documented.</p><p>This is my last note. 3 free verifications are ready if you ever want to see it work. No strings attached.</p><p>Best,<br/>{{sender_name}}</p>',
          '{{first_name}}, supply chain verification might not be on fire today at {{company}} — but when it is, you''ll want this in place. A single unverified supplier can trigger delivery failures, compliance flags, or worse.

    In-Sync automates vendor due diligence across your entire supply chain — GST verification, PAN validation, credit bureau checks, bank statement analysis. Under 5 minutes, fully documented.

    This is my last note. 3 free verifications are ready if you ever want to see it work. No strings attached.

    Best,
    {{sender_name}}',
          'In-Sync Team',
          'hello@in-sync.co.in',
          'cold_outbound',
          'SC-CO-5B',
          '["first_name","company","sender_name"]',
          true
        );

    -- =========================================================================
    -- J. COLD INDUSTRY VERTICAL - 5 industries x 3 = 15 templates
    -- Industry-specific angles: Manufacturing, NBFC, IT, Retail, Pharma
    -- =========================================================================

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
        VALUES (
          _org_id,
          'Cold Industry: Manufacturing — Supply Chain Fraud',
          'The GST fraud risk hiding in your supplier base',
          '<p>{{first_name}}, here''s a scenario that keeps happening in Indian manufacturing: a raw material supplier passes initial checks, gets onboarded, delivers for 6 months — then turns out their GST registration was cancelled 3 months ago. Now you''re sitting on invalid input tax credits and a production line tied to a non-compliant vendor.</p><p>One bad supplier can halt a production line. And in manufacturing, downtime isn''t just expensive — it cascades through every delivery commitment downstream.</p><p>In-Sync automates GST verification, PAN validation, and credit checks for every vendor in your supply chain. Real-time status monitoring means you catch problems before they reach the factory floor. Under 5 minutes per vendor, starting at ₹2,999/quarter.</p><p>Can I show you how this works for manufacturing supply chains? 3 free verifications to start — test it with your most critical suppliers.</p><p>Best,<br/>{{sender_name}}</p>',
          '{{first_name}}, here''s a scenario that keeps happening in Indian manufacturing: a raw material supplier passes initial checks, gets onboarded, delivers for 6 months — then turns out their GST registration was cancelled 3 months ago. Now you''re sitting on invalid input tax credits and a production line tied to a non-compliant vendor.

    One bad supplier can halt a production line. And in manufacturing, downtime isn''t just expensive — it cascades through every delivery commitment downstream.

    In-Sync automates GST verification, PAN validation, and credit checks for every vendor in your supply chain. Real-time status monitoring means you catch problems before they reach the factory floor. Under 5 minutes per vendor, starting at ₹2,999/quarter.

    Can I show you how this works for manufacturing supply chains? 3 free verifications to start — test it with your most critical suppliers.

    Best,
    {{sender_name}}',
          'In-Sync Team',
          'hello@in-sync.co.in',
          'cold_outbound',
          'MFG-CO-V1',
          '["first_name","company","sender_name"]',
          true
        );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
        VALUES (
          _org_id,
          'Cold Industry: Manufacturing — Multi-Site Verification',
          'Vendor verification across 5+ factory locations',
          '<p>{{first_name}}, here''s the problem with multi-site manufacturing operations: each factory location typically runs its own procurement. Different teams, different vendors, different verification standards. At the corporate level, nobody has a unified view of whether every vendor across every site is actually verified.</p><p>We work with manufacturers running 5+ locations who had exactly this problem. Each site was doing vendor checks differently — some thorough, some barely checking GST status. One compliance audit exposed gaps that took weeks to remediate.</p><p>In-Sync gives you a single platform for vendor due diligence across every location. Standardized GST, PAN, credit, and bank verification. One dashboard. Every site, every vendor, every check documented.</p><p>Worth a 15-minute look? We offer 3 free verifications so you can test it with vendors from different sites.</p><p>Best,<br/>{{sender_name}}</p>',
          '{{first_name}}, here''s the problem with multi-site manufacturing operations: each factory location typically runs its own procurement. Different teams, different vendors, different verification standards. At the corporate level, nobody has a unified view of whether every vendor across every site is actually verified.

    We work with manufacturers running 5+ locations who had exactly this problem. Each site was doing vendor checks differently — some thorough, some barely checking GST status. One compliance audit exposed gaps that took weeks to remediate.

    In-Sync gives you a single platform for vendor due diligence across every location. Standardized GST, PAN, credit, and bank verification. One dashboard. Every site, every vendor, every check documented.

    Worth a 15-minute look? We offer 3 free verifications so you can test it with vendors from different sites.

    Best,
    {{sender_name}}',
          'In-Sync Team',
          'hello@in-sync.co.in',
          'cold_outbound',
          'MFG-CO-V2',
          '["first_name","company","sender_name"]',
          true
        );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
        VALUES (
          _org_id,
          'Cold Industry: Manufacturing — PLI Compliance',
          'Make in India compliance starts with verified vendors',
          '<p>{{first_name}}, if {{company}} is part of any PLI scheme or Make in India initiative, you already know the documentation requirements for your domestic vendor chain are significant. Government auditors want proof that your suppliers are legitimate, GST-compliant, financially stable Indian entities.</p><p>Most manufacturers we talk to are assembling this proof manually — downloading GST certificates, verifying PAN details, pulling credit reports one vendor at a time. It works until you have 50+ domestic suppliers and an audit deadline.</p><p>In-Sync automates the entire vendor verification chain. GST status, PAN validation, credit bureau checks, bank statement analysis — all in one report, per vendor, in under 5 minutes. The kind of documentation that makes PLI compliance reviews straightforward instead of stressful.</p><p>Want to see how it works for PLI-linked vendor chains? 3 free verifications to start.</p><p>Best,<br/>{{sender_name}}</p>',
          '{{first_name}}, if {{company}} is part of any PLI scheme or Make in India initiative, you already know the documentation requirements for your domestic vendor chain are significant. Government auditors want proof that your suppliers are legitimate, GST-compliant, financially stable Indian entities.

    Most manufacturers we talk to are assembling this proof manually — downloading GST certificates, verifying PAN details, pulling credit reports one vendor at a time. It works until you have 50+ domestic suppliers and an audit deadline.

    In-Sync automates the entire vendor verification chain. GST status, PAN validation, credit bureau checks, bank statement analysis — all in one report, per vendor, in under 5 minutes. The kind of documentation that makes PLI compliance reviews straightforward instead of stressful.

    Want to see how it works for PLI-linked vendor chains? 3 free verifications to start.

    Best,
    {{sender_name}}',
          'In-Sync Team',
          'hello@in-sync.co.in',
          'cold_outbound',
          'MFG-CO-V3',
          '["first_name","company","sender_name"]',
          true
        );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
        VALUES (
          _org_id,
          'Cold Industry: NBFC — RBI Vendor Risk',
          'RBI vendor risk guidelines aren''t optional anymore',
          '<p>{{first_name}}, RBI''s vendor risk management guidelines are getting stricter every cycle. NBFCs are expected to verify vendor financials, GST compliance, and operational legitimacy before engagement — and maintain documentation proving they did.</p><p>The penalties for non-compliance aren''t just fines. They''re reputational damage, audit observations that follow you into the next inspection, and in severe cases, restrictions on operations.</p><p>In-Sync automates the vendor due diligence that RBI expects. GST verification, PAN validation, credit bureau checks, bank statement analysis — all in one platform, all generating audit-ready reports. Under 5 minutes per vendor instead of the days your compliance team currently spends.</p><p>Can I show you how other NBFCs are using this to stay ahead of RBI requirements? 3 free verifications to test with your current vendor base.</p><p>Best,<br/>{{sender_name}}</p>',
          '{{first_name}}, RBI''s vendor risk management guidelines are getting stricter every cycle. NBFCs are expected to verify vendor financials, GST compliance, and operational legitimacy before engagement — and maintain documentation proving they did.

    The penalties for non-compliance aren''t just fines. They''re reputational damage, audit observations that follow you into the next inspection, and in severe cases, restrictions on operations.

    In-Sync automates the vendor due diligence that RBI expects. GST verification, PAN validation, credit bureau checks, bank statement analysis — all in one platform, all generating audit-ready reports. Under 5 minutes per vendor instead of the days your compliance team currently spends.

    Can I show you how other NBFCs are using this to stay ahead of RBI requirements? 3 free verifications to test with your current vendor base.

    Best,
    {{sender_name}}',
          'In-Sync Team',
          'hello@in-sync.co.in',
          'cold_outbound',
          'NBFC-CO-V1',
          '["first_name","company","sender_name"]',
          true
        );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
        VALUES (
          _org_id,
          'Cold Industry: NBFC — DSA and Agent Verification',
          'Are your DSAs and collection agents verified?',
          '<p>{{first_name}}, NBFCs work with a web of third parties — DSAs, collection agencies, field agents, technology vendors. Each one represents a risk vector that RBI expects you to have diligenced.</p><p>The challenge is volume. A mid-size NBFC might onboard 20-30 new agents or vendors per month. Manual verification — checking GST registration, validating PAN, pulling credit reports — takes 7-10 days per entity. That''s a full-time job for someone on your team.</p><p>In-Sync automates all of it. Bulk verification of DSAs, agents, and vendors. GST, PAN, credit bureau, bank statement analysis. Each verification generates a compliance-ready report. Under 5 minutes per entity, starting at ₹2,999/quarter.</p><p>Worth 15 minutes to see how it works for loan disbursement vendor chains?</p><p>Best,<br/>{{sender_name}}</p>',
          '{{first_name}}, NBFCs work with a web of third parties — DSAs, collection agencies, field agents, technology vendors. Each one represents a risk vector that RBI expects you to have diligenced.

    The challenge is volume. A mid-size NBFC might onboard 20-30 new agents or vendors per month. Manual verification — checking GST registration, validating PAN, pulling credit reports — takes 7-10 days per entity. That''s a full-time job for someone on your team.

    In-Sync automates all of it. Bulk verification of DSAs, agents, and vendors. GST, PAN, credit bureau, bank statement analysis. Each verification generates a compliance-ready report. Under 5 minutes per entity, starting at ₹2,999/quarter.

    Worth 15 minutes to see how it works for loan disbursement vendor chains?

    Best,
    {{sender_name}}',
          'In-Sync Team',
          'hello@in-sync.co.in',
          'cold_outbound',
          'NBFC-CO-V2',
          '["first_name","company","sender_name"]',
          true
        );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
        VALUES (
          _org_id,
          'Cold Industry: NBFC — Audit Season Prep',
          'RBI inspection season: is your vendor documentation ready?',
          '<p>{{first_name}}, every NBFC that''s been through an RBI inspection knows the drill — auditors ask for complete vendor documentation trails, and your team scrambles to assemble files that should have been organized months ago.</p><p>The vendors you onboarded last year? Auditors want to see the due diligence. The DSAs you added mid-quarter? They want compliance records. The technology vendor whose contract renewed automatically? They want proof of re-verification.</p><p>In-Sync generates audit-ready vendor reports automatically. Every GST check, PAN validation, credit bureau pull, and bank statement analysis is documented, timestamped, and stored. When auditors ask, you pull a report — not a filing cabinet.</p><p>Let me show you the audit report format. 3 free verifications so you can see the output quality firsthand.</p><p>Best,<br/>{{sender_name}}</p>',
          '{{first_name}}, every NBFC that''s been through an RBI inspection knows the drill — auditors ask for complete vendor documentation trails, and your team scrambles to assemble files that should have been organized months ago.

    The vendors you onboarded last year? Auditors want to see the due diligence. The DSAs you added mid-quarter? They want compliance records. The technology vendor whose contract renewed automatically? They want proof of re-verification.

    In-Sync generates audit-ready vendor reports automatically. Every GST check, PAN validation, credit bureau pull, and bank statement analysis is documented, timestamped, and stored. When auditors ask, you pull a report — not a filing cabinet.

    Let me show you the audit report format. 3 free verifications so you can see the output quality firsthand.

    Best,
    {{sender_name}}',
          'In-Sync Team',
          'hello@in-sync.co.in',
          'cold_outbound',
          'NBFC-CO-V3',
          '["first_name","company","sender_name"]',
          true
        );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
        VALUES (
          _org_id,
          'Cold Industry: IT Services — Subcontractor Risk',
          'One compliance gap in your vendor chain can tank an enterprise deal',
          '<p>{{first_name}}, IT services companies live and die by enterprise contracts. And enterprise clients are increasingly asking: who are your subcontractors? Are they verified? Can you prove due diligence?</p><p>If {{company}} relies on bench vendors, subcontractors, or staffing partners — and most IT services firms do — each one is a compliance exposure. One unverified subcontractor with a cancelled GST registration or a flagged credit history can become a deal-breaker during client audits.</p><p>In-Sync automates vendor and subcontractor verification. GST, PAN, credit bureau, bank statement analysis — all in under 5 minutes. The documentation your enterprise clients expect, generated automatically.</p><p>3 free verifications to test it with your current subcontractor base. Worth a look?</p><p>Best,<br/>{{sender_name}}</p>',
          '{{first_name}}, IT services companies live and die by enterprise contracts. And enterprise clients are increasingly asking: who are your subcontractors? Are they verified? Can you prove due diligence?

    If {{company}} relies on bench vendors, subcontractors, or staffing partners — and most IT services firms do — each one is a compliance exposure. One unverified subcontractor with a cancelled GST registration or a flagged credit history can become a deal-breaker during client audits.

    In-Sync automates vendor and subcontractor verification. GST, PAN, credit bureau, bank statement analysis — all in under 5 minutes. The documentation your enterprise clients expect, generated automatically.

    3 free verifications to test it with your current subcontractor base. Worth a look?

    Best,
    {{sender_name}}',
          'In-Sync Team',
          'hello@in-sync.co.in',
          'cold_outbound',
          'ITS-CO-V1',
          '["first_name","company","sender_name"]',
          true
        );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
        VALUES (
          _org_id,
          'Cold Industry: IT Services — SOC 2 and ISO Vendor Requirements',
          'Your SOC 2 auditor will ask about vendor verification',
          '<p>{{first_name}}, if {{company}} holds SOC 2 or ISO 27001 certification — or is working toward it — you know that vendor management is a critical control area. Auditors want to see documented due diligence for every vendor in your chain.</p><p>Most IT companies we talk to handle this with spreadsheets and manual checks. It works until the auditor asks for verification dates, source documentation, and continuous monitoring evidence. Then it becomes a scramble.</p><p>In-Sync provides the documentation layer your certification requires. Automated GST verification, PAN validation, credit checks, and bank statement analysis — each generating timestamped, audit-ready reports. The evidence trail auditors look for, built automatically.</p><p>Want to see how the reports map to SOC 2 vendor management controls? 3 free verifications to start.</p><p>Best,<br/>{{sender_name}}</p>',
          '{{first_name}}, if {{company}} holds SOC 2 or ISO 27001 certification — or is working toward it — you know that vendor management is a critical control area. Auditors want to see documented due diligence for every vendor in your chain.

    Most IT companies we talk to handle this with spreadsheets and manual checks. It works until the auditor asks for verification dates, source documentation, and continuous monitoring evidence. Then it becomes a scramble.

    In-Sync provides the documentation layer your certification requires. Automated GST verification, PAN validation, credit checks, and bank statement analysis — each generating timestamped, audit-ready reports. The evidence trail auditors look for, built automatically.

    Want to see how the reports map to SOC 2 vendor management controls? 3 free verifications to start.

    Best,
    {{sender_name}}',
          'In-Sync Team',
          'hello@in-sync.co.in',
          'cold_outbound',
          'ITS-CO-V2',
          '["first_name","company","sender_name"]',
          true
        );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
        VALUES (
          _org_id,
          'Cold Industry: IT Services — Fast-Scaling Vendor Base',
          'Adding 20+ vendors a month? Manual verification won''t scale',
          '<p>{{first_name}}, fast-growing IT services firms hit a vendor verification wall around the 50-vendor mark. Before that, someone on the team can manually check GST registrations, validate PANs, and pull credit reports. After that, it becomes the thing that nobody has time for but everybody knows needs doing.</p><p>If {{company}} is scaling rapidly — adding new subcontractors, staffing vendors, technology partners — the manual process breaks. Vendors get onboarded with incomplete checks. Due diligence becomes a checkbox exercise instead of actual risk management.</p><p>In-Sync handles the verification volume that comes with rapid growth. 20 vendors a month? 50? Doesn''t matter — each one takes under 5 minutes. Automated GST, PAN, credit, and bank verification. Starting at ₹2,999/quarter.</p><p>3 free verifications to see if it fits {{company}}''s growth pace.</p><p>Best,<br/>{{sender_name}}</p>',
          '{{first_name}}, fast-growing IT services firms hit a vendor verification wall around the 50-vendor mark. Before that, someone on the team can manually check GST registrations, validate PANs, and pull credit reports. After that, it becomes the thing that nobody has time for but everybody knows needs doing.

    If {{company}} is scaling rapidly — adding new subcontractors, staffing vendors, technology partners — the manual process breaks. Vendors get onboarded with incomplete checks. Due diligence becomes a checkbox exercise instead of actual risk management.

    In-Sync handles the verification volume that comes with rapid growth. 20 vendors a month? 50? Doesn''t matter — each one takes under 5 minutes. Automated GST, PAN, credit, and bank verification. Starting at ₹2,999/quarter.

    3 free verifications to see if it fits {{company}}''s growth pace.

    Best,
    {{sender_name}}',
          'In-Sync Team',
          'hello@in-sync.co.in',
          'cold_outbound',
          'ITS-CO-V3',
          '["first_name","company","sender_name"]',
          true
        );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
        VALUES (
          _org_id,
          'Cold Industry: Retail — Distributor Verification at Scale',
          '100+ distributors across states — is every one verified?',
          '<p>{{first_name}}, retail and FMCG companies with national distribution networks face a verification problem that most other industries don''t: sheer volume. 100+ distributors across states, each needing GST verification, PAN validation, and financial health checks.</p><p>At that scale, manual verification breaks. Someone on the team is perpetually chasing GST certificates, checking PAN details against company records, waiting for credit reports. A distributor in Maharashtra gets verified thoroughly. One in the Northeast gets a cursory check because the team is overwhelmed.</p><p>In-Sync standardizes this. Every distributor, every state, same verification depth. GST, PAN, credit bureau, bank statements — under 5 minutes each. One dashboard for your entire distribution network.</p><p>Want to run 3 free verifications on your current distributor base and see the difference?</p><p>Best,<br/>{{sender_name}}</p>',
          '{{first_name}}, retail and FMCG companies with national distribution networks face a verification problem that most other industries don''t: sheer volume. 100+ distributors across states, each needing GST verification, PAN validation, and financial health checks.

    At that scale, manual verification breaks. Someone on the team is perpetually chasing GST certificates, checking PAN details against company records, waiting for credit reports. A distributor in Maharashtra gets verified thoroughly. One in the Northeast gets a cursory check because the team is overwhelmed.

    In-Sync standardizes this. Every distributor, every state, same verification depth. GST, PAN, credit bureau, bank statements — under 5 minutes each. One dashboard for your entire distribution network.

    Want to run 3 free verifications on your current distributor base and see the difference?

    Best,
    {{sender_name}}',
          'In-Sync Team',
          'hello@in-sync.co.in',
          'cold_outbound',
          'RTL-CO-V1',
          '["first_name","company","sender_name"]',
          true
        );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
        VALUES (
          _org_id,
          'Cold Industry: Retail — Private Label Vendor Due Diligence',
          'Who''s actually making your store-brand products?',
          '<p>{{first_name}}, private label products carry your brand — but the manufacturers behind them carry the risk. If a private label vendor has financial instability, GST compliance issues, or a deteriorating credit profile, it shows up in your product quality and supply reliability long before it shows up in the news.</p><p>Most retail companies verify private label manufacturers once during onboarding and then never again. That''s a gap. Financial health changes. GST registrations lapse. Credit scores deteriorate. You need continuous visibility, not a one-time check.</p><p>In-Sync provides ongoing vendor verification for your private label manufacturers. GST status monitoring, PAN validation, credit bureau checks, bank statement analysis — all automated, all documented. Starting at ₹2,999/quarter.</p><p>3 free verifications to start. Test it with your most critical private label vendors.</p><p>Best,<br/>{{sender_name}}</p>',
          '{{first_name}}, private label products carry your brand — but the manufacturers behind them carry the risk. If a private label vendor has financial instability, GST compliance issues, or a deteriorating credit profile, it shows up in your product quality and supply reliability long before it shows up in the news.

    Most retail companies verify private label manufacturers once during onboarding and then never again. That''s a gap. Financial health changes. GST registrations lapse. Credit scores deteriorate. You need continuous visibility, not a one-time check.

    In-Sync provides ongoing vendor verification for your private label manufacturers. GST status monitoring, PAN validation, credit bureau checks, bank statement analysis — all automated, all documented. Starting at ₹2,999/quarter.

    3 free verifications to start. Test it with your most critical private label vendors.

    Best,
    {{sender_name}}',
          'In-Sync Team',
          'hello@in-sync.co.in',
          'cold_outbound',
          'RTL-CO-V2',
          '["first_name","company","sender_name"]',
          true
        );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
        VALUES (
          _org_id,
          'Cold Industry: Retail — Seasonal Vendor Onboarding',
          'Diwali rush means 3x vendor volume — is your verification ready?',
          '<p>{{first_name}}, every retail and FMCG company knows the pattern: festive season hits, vendor volume triples, and suddenly the team that handles onboarding is drowning. You can''t wait 10 days per vendor during the Diwali rush. You also can''t skip due diligence — that''s how unverified vendors slip into your supply chain.</p><p>The companies that handle seasonal spikes well are the ones that automate verification before the rush starts. In-Sync lets you onboard vendors in under 5 minutes — GST verification, PAN validation, credit checks, bank analysis. Whether it''s 10 vendors or 100 in a week, the platform scales with your seasonal demand.</p><p>Festive planning starts months early. So does vendor verification infrastructure. Want to set up In-Sync before the next rush? 3 free verifications to start.</p><p>Best,<br/>{{sender_name}}</p>',
          '{{first_name}}, every retail and FMCG company knows the pattern: festive season hits, vendor volume triples, and suddenly the team that handles onboarding is drowning. You can''t wait 10 days per vendor during the Diwali rush. You also can''t skip due diligence — that''s how unverified vendors slip into your supply chain.

    The companies that handle seasonal spikes well are the ones that automate verification before the rush starts. In-Sync lets you onboard vendors in under 5 minutes — GST verification, PAN validation, credit checks, bank analysis. Whether it''s 10 vendors or 100 in a week, the platform scales with your seasonal demand.

    Festive planning starts months early. So does vendor verification infrastructure. Want to set up In-Sync before the next rush? 3 free verifications to start.

    Best,
    {{sender_name}}',
          'In-Sync Team',
          'hello@in-sync.co.in',
          'cold_outbound',
          'RTL-CO-V3',
          '["first_name","company","sender_name"]',
          true
        );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
        VALUES (
          _org_id,
          'Cold Industry: Pharma — API Supplier Verification',
          'Your API suppliers need more than a one-time check',
          '<p>{{first_name}}, active pharmaceutical ingredient suppliers sit at the foundation of your entire product chain. A financially unstable or non-compliant API supplier doesn''t just create a procurement problem — it creates a regulatory one. FDA observations, CDSCO scrutiny, and potential production halts.</p><p>The due diligence requirements for API suppliers are rigorous: financial stability, GST compliance, PAN verification, credit history. Most pharma companies do this manually at onboarding and then assume nothing changes. But it does — GST registrations lapse, credit profiles deteriorate, financial health shifts.</p><p>In-Sync automates the ongoing verification your API supplier base requires. GST monitoring, PAN validation, credit bureau checks, bank statement analysis — continuous, documented, and audit-ready. Under 5 minutes per supplier.</p><p>3 free verifications to test with your critical API vendors. Interested?</p><p>Best,<br/>{{sender_name}}</p>',
          '{{first_name}}, active pharmaceutical ingredient suppliers sit at the foundation of your entire product chain. A financially unstable or non-compliant API supplier doesn''t just create a procurement problem — it creates a regulatory one. FDA observations, CDSCO scrutiny, and potential production halts.

    The due diligence requirements for API suppliers are rigorous: financial stability, GST compliance, PAN verification, credit history. Most pharma companies do this manually at onboarding and then assume nothing changes. But it does — GST registrations lapse, credit profiles deteriorate, financial health shifts.

    In-Sync automates the ongoing verification your API supplier base requires. GST monitoring, PAN validation, credit bureau checks, bank statement analysis — continuous, documented, and audit-ready. Under 5 minutes per supplier.

    3 free verifications to test with your critical API vendors. Interested?

    Best,
    {{sender_name}}',
          'In-Sync Team',
          'hello@in-sync.co.in',
          'cold_outbound',
          'PHR-CO-V1',
          '["first_name","company","sender_name"]',
          true
        );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
        VALUES (
          _org_id,
          'Cold Industry: Pharma — Hospital Vendor Panels',
          'Medical device vendors need continuous monitoring, not one-time checks',
          '<p>{{first_name}}, hospitals and healthcare networks manage vendor panels with dozens of medical device suppliers, consumable vendors, and service providers. Each one goes through a qualification process during onboarding — but then sits on the approved vendor list for years without re-verification.</p><p>That''s a problem. A medical device vendor whose GST registration was suspended six months ago is still on your approved list. A consumable supplier whose credit score dropped 200 points is still getting purchase orders. The risk accumulates silently.</p><p>In-Sync provides continuous vendor monitoring for healthcare vendor panels. Automated GST checks, PAN validation, credit bureau monitoring, and financial health analysis. When a vendor''s compliance status changes, you know immediately — not during the next annual review.</p><p>Worth seeing how this works for healthcare vendor management? 3 free verifications to start.</p><p>Best,<br/>{{sender_name}}</p>',
          '{{first_name}}, hospitals and healthcare networks manage vendor panels with dozens of medical device suppliers, consumable vendors, and service providers. Each one goes through a qualification process during onboarding — but then sits on the approved vendor list for years without re-verification.

    That''s a problem. A medical device vendor whose GST registration was suspended six months ago is still on your approved list. A consumable supplier whose credit score dropped 200 points is still getting purchase orders. The risk accumulates silently.

    In-Sync provides continuous vendor monitoring for healthcare vendor panels. Automated GST checks, PAN validation, credit bureau monitoring, and financial health analysis. When a vendor''s compliance status changes, you know immediately — not during the next annual review.

    Worth seeing how this works for healthcare vendor management? 3 free verifications to start.

    Best,
    {{sender_name}}',
          'In-Sync Team',
          'hello@in-sync.co.in',
          'cold_outbound',
          'PHR-CO-V2',
          '["first_name","company","sender_name"]',
          true
        );

    INSERT INTO public.mkt_email_templates (org_id, name, subject, body_html, body_text, from_name, reply_to, category, variant_label, variables, is_active)
        VALUES (
          _org_id,
          'Cold Industry: Pharma — Drug Controller Compliance',
          'Manufacturing license renewals need a verified vendor trail',
          '<p>{{first_name}}, Drug Controller compliance for manufacturing licenses requires documented vendor verification trails. Every raw material supplier, packaging vendor, and logistics partner needs to be verified — and that verification needs to be current, not something that was done two years ago during initial onboarding.</p><p>When CDSCO or state drug controllers review your manufacturing license documentation, they''re looking for evidence that your vendor due diligence is systematic, not ad-hoc. They want to see GST compliance records, financial stability indicators, and verification timestamps.</p><p>In-Sync automates the compliance paper trail that drug regulators require. Every vendor verification — GST, PAN, credit, bank analysis — is documented, timestamped, and stored in audit-ready format. Your compliance team pulls a report instead of assembling a file.</p><p>Want to see the report format? 3 free verifications so you can evaluate the documentation quality.</p><p>Best,<br/>{{sender_name}}</p>',
          '{{first_name}}, Drug Controller compliance for manufacturing licenses requires documented vendor verification trails. Every raw material supplier, packaging vendor, and logistics partner needs to be verified — and that verification needs to be current, not something that was done two years ago during initial onboarding.

    When CDSCO or state drug controllers review your manufacturing license documentation, they''re looking for evidence that your vendor due diligence is systematic, not ad-hoc. They want to see GST compliance records, financial stability indicators, and verification timestamps.

    In-Sync automates the compliance paper trail that drug regulators require. Every vendor verification — GST, PAN, credit, bank analysis — is documented, timestamped, and stored in audit-ready format. Your compliance team pulls a report instead of assembling a file.

    Want to see the report format? 3 free verifications so you can evaluate the documentation quality.

    Best,
    {{sender_name}}',
          'In-Sync Team',
          'hello@in-sync.co.in',
          'cold_outbound',
          'PHR-CO-V3',
          '["first_name","company","sender_name"]',
          true
        );


  END LOOP;
END $$;
