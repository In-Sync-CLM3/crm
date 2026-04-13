-- ============================================================================
-- Seed: mkt_whatsapp_templates — 72 WhatsApp templates for In-Sync marketing
-- Product: In-Sync — B2B SaaS vendor financial due diligence platform
-- Target ICPs: CFO, COO, CTO, CCO, Procurement Head, Supply Chain Head
-- ============================================================================
-- Template categories:
--   A. Cold Intro (12)          — 6 ICPs x 2 variants
--   B. Follow-up Short (12)     — 6 ICPs x 2 variants
--   C. Demo Reminder (6)        — 6 role variants
--   D. Social Proof Share (6)   — 6 role variants
--   E. Quick Stat Share (6)     — 6 variants
--   F. Meeting Request (6)      — 6 role variants
--   G. Re-engagement (12)       — 6 ICPs x 2 variants
--   H. Thank You Post-Demo (6)  — 6 role variants
--   I. Audit Season Alert (6)   — 6 role variants
-- Total: 72 templates
-- ============================================================================

DO $$
DECLARE
  _org_id uuid;
BEGIN
  FOR _org_id IN SELECT id FROM public.organizations LOOP

    -- ========================================================================
    -- A. COLD INTRO — 6 ICPs x 2 variants = 12 templates
    -- Short, punchy first-touch. Under 160 chars body. Role-specific pain.
    -- ========================================================================

    -- A1. CFO - Cold Intro A
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'CFO - Cold Intro A',
      'cfo_cold_intro_a',
      'en',
      'Hi {{1}}, how do you verify vendor financials before signing large POs? In-Sync does it in under 5 mins. 3 free checks. Want to try?',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- A2. CFO - Cold Intro B
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'CFO - Cold Intro B',
      'cfo_cold_intro_b',
      'en',
      'Hi {{1}}, vendor fraud cost Indian businesses 8400 Cr last year. In-Sync flags risky vendors in minutes using AI + govt APIs. Try 3 free checks?',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- A3. COO - Cold Intro A
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'COO - Cold Intro A',
      'coo_cold_intro_a',
      'en',
      'Hi {{1}}, vendor onboarding taking 7-10 days? In-Sync cuts due diligence to under 5 minutes with AI. 3 free verifications. Interested?',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- A4. COO - Cold Intro B
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'COO - Cold Intro B',
      'coo_cold_intro_b',
      'en',
      'Hi {{1}}, 100+ businesses use In-Sync to run vendor checks in minutes instead of weeks. No manual paperwork. Try 3 free verifications?',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- A5. CTO - Cold Intro A
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'CTO - Cold Intro A',
      'cto_cold_intro_a',
      'en',
      'Hi {{1}}, still running vendor checks through spreadsheets? In-Sync automates due diligence via govt APIs + AI. 3 free checks to try it.',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- A6. CTO - Cold Intro B
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'CTO - Cold Intro B',
      'cto_cold_intro_b',
      'en',
      'Hi {{1}}, In-Sync plugs into your vendor workflow — API-first, real-time MCA/GST/PAN checks. No manual steps. Want 3 free verifications?',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- A7. CCO - Cold Intro A
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'CCO - Cold Intro A',
      'cco_cold_intro_a',
      'en',
      'Hi {{1}}, vendor compliance gaps are a ticking time bomb. In-Sync flags risks in 5 mins using AI + govt data. Try 3 free checks?',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- A8. CCO - Cold Intro B
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'CCO - Cold Intro B',
      'cco_cold_intro_b',
      'en',
      'Hi {{1}}, how confident are you in your vendor compliance checks? In-Sync verifies GST, MCA, PAN status in under 5 mins. 3 free tries.',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- A9. Procurement Head - Cold Intro A
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'Procurement Head - Cold Intro A',
      'procurement_cold_intro_a',
      'en',
      'Hi {{1}}, how many hours does your team spend on vendor due diligence per week? In-Sync does it in 5 mins. Try 3 free verifications.',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- A10. Procurement Head - Cold Intro B
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'Procurement Head - Cold Intro B',
      'procurement_cold_intro_b',
      'en',
      'Hi {{1}}, onboarding vendors without financial checks is risky. In-Sync automates MCA, GST, PAN verification in minutes. 3 free checks.',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- A11. Supply Chain Head - Cold Intro A
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'Supply Chain Head - Cold Intro A',
      'supplychain_cold_intro_a',
      'en',
      'Hi {{1}}, one financially unstable vendor can break your supply chain. In-Sync flags risks in 5 mins using govt APIs. Try 3 free checks.',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- A12. Supply Chain Head - Cold Intro B
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'Supply Chain Head - Cold Intro B',
      'supplychain_cold_intro_b',
      'en',
      'Hi {{1}}, vendor disruptions cost 2x the original PO value on average. In-Sync catches risky vendors before you sign. 3 free checks.',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- ========================================================================
    -- B. FOLLOW-UP SHORT — 6 ICPs x 2 variants = 12 templates
    -- Brief nudge referencing prior outreach. Under 160 chars.
    -- ========================================================================

    -- B1. CFO - Follow-up A
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'CFO - Follow-up A',
      'cfo_followup_a',
      'en',
      'Hi {{1}}, sent you an email about In-Sync for vendor financial checks. Did you get a chance to look? Happy to answer any questions.',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'utility',
      'pending',
      true
    );

    -- B2. CFO - Follow-up B
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'CFO - Follow-up B',
      'cfo_followup_b',
      'en',
      'Hi {{1}}, just following up on In-Sync. Your 3 free vendor verifications are still available. Takes under 5 mins to run your first check.',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'utility',
      'pending',
      true
    );

    -- B3. COO - Follow-up A
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'COO - Follow-up A',
      'coo_followup_a',
      'en',
      'Hi {{1}}, sent you a note about In-Sync — vendor onboarding in minutes instead of days. Shall I set up a quick walkthrough?',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'utility',
      'pending',
      true
    );

    -- B4. COO - Follow-up B
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'COO - Follow-up B',
      'coo_followup_b',
      'en',
      'Hi {{1}}, circling back on In-Sync. 100+ businesses already use it to speed up vendor due diligence. Your 3 free checks are still active.',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'utility',
      'pending',
      true
    );

    -- B5. CTO - Follow-up A
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'CTO - Follow-up A',
      'cto_followup_a',
      'en',
      'Hi {{1}}, sent you details about In-Sync API for automated vendor checks. Would a technical walkthrough be helpful?',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'utility',
      'pending',
      true
    );

    -- B6. CTO - Follow-up B
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'CTO - Follow-up B',
      'cto_followup_b',
      'en',
      'Hi {{1}}, following up on In-Sync. REST API, real-time govt data, easy integration. Your 3 free API verifications are ready to use.',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'utility',
      'pending',
      true
    );

    -- B7. CCO - Follow-up A
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'CCO - Follow-up A',
      'cco_followup_a',
      'en',
      'Hi {{1}}, sent you an email about In-Sync for vendor compliance verification. Shall I walk you through how it works?',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'utility',
      'pending',
      true
    );

    -- B8. CCO - Follow-up B
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'CCO - Follow-up B',
      'cco_followup_b',
      'en',
      'Hi {{1}}, circling back on In-Sync. Automated GST, MCA, PAN compliance checks in minutes. Your 3 free verifications are still available.',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'utility',
      'pending',
      true
    );

    -- B9. Procurement Head - Follow-up A
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'Procurement Head - Follow-up A',
      'procurement_followup_a',
      'en',
      'Hi {{1}}, sent you an email about In-Sync for faster vendor onboarding. Did you get a chance to check it out?',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'utility',
      'pending',
      true
    );

    -- B10. Procurement Head - Follow-up B
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'Procurement Head - Follow-up B',
      'procurement_followup_b',
      'en',
      'Hi {{1}}, just following up. In-Sync automates the vendor verification your team does manually. 3 free checks — try one on a real vendor?',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'utility',
      'pending',
      true
    );

    -- B11. Supply Chain Head - Follow-up A
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'Supply Chain Head - Follow-up A',
      'supplychain_followup_a',
      'en',
      'Hi {{1}}, sent you a note about In-Sync for supply chain vendor risk checks. Would a quick demo help?',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'utility',
      'pending',
      true
    );

    -- B12. Supply Chain Head - Follow-up B
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'Supply Chain Head - Follow-up B',
      'supplychain_followup_b',
      'en',
      'Hi {{1}}, following up on In-Sync. Catch financially risky vendors before they enter your supply chain. Your 3 free checks are still active.',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'utility',
      'pending',
      true
    );

    -- ========================================================================
    -- C. DEMO REMINDER — 6 role variants
    -- "Looking forward to our demo tomorrow at..." Under 200 chars.
    -- ========================================================================

    -- C1. CFO - Demo Reminder
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'CFO - Demo Reminder',
      'cfo_demo_reminder',
      'en',
      'Hi {{1}}, looking forward to our In-Sync demo tomorrow at {{2}}. We will cover how CFOs use it to verify vendor financials in minutes. See you there!',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name", "demo_time"]'::jsonb,
      'utility',
      'pending',
      true
    );

    -- C2. COO - Demo Reminder
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'COO - Demo Reminder',
      'coo_demo_reminder',
      'en',
      'Hi {{1}}, reminder about our In-Sync demo tomorrow at {{2}}. We will show how it cuts vendor onboarding from days to minutes. See you there!',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name", "demo_time"]'::jsonb,
      'utility',
      'pending',
      true
    );

    -- C3. CTO - Demo Reminder
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'CTO - Demo Reminder',
      'cto_demo_reminder',
      'en',
      'Hi {{1}}, looking forward to our In-Sync technical demo tomorrow at {{2}}. We will walk through the API and integration options. See you there!',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name", "demo_time"]'::jsonb,
      'utility',
      'pending',
      true
    );

    -- C4. CCO - Demo Reminder
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'CCO - Demo Reminder',
      'cco_demo_reminder',
      'en',
      'Hi {{1}}, reminder about our In-Sync demo tomorrow at {{2}}. We will cover automated compliance checks for your vendor base. See you there!',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name", "demo_time"]'::jsonb,
      'utility',
      'pending',
      true
    );

    -- C5. Procurement Head - Demo Reminder
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'Procurement Head - Demo Reminder',
      'procurement_demo_reminder',
      'en',
      'Hi {{1}}, looking forward to our In-Sync demo tomorrow at {{2}}. We will show how procurement teams automate vendor due diligence. See you!',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name", "demo_time"]'::jsonb,
      'utility',
      'pending',
      true
    );

    -- C6. Supply Chain Head - Demo Reminder
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'Supply Chain Head - Demo Reminder',
      'supplychain_demo_reminder',
      'en',
      'Hi {{1}}, reminder about our In-Sync demo tomorrow at {{2}}. We will show how to de-risk your vendor supply chain in real time. See you there!',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name", "demo_time"]'::jsonb,
      'utility',
      'pending',
      true
    );

    -- ========================================================================
    -- D. SOCIAL PROOF SHARE — 6 role variants
    -- Share a relevant case study or stat. Under 300 chars.
    -- ========================================================================

    -- D1. CFO - Social Proof
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'CFO - Social Proof',
      'cfo_social_proof',
      'en',
      'Hi {{1}}, thought you''d find this interesting — a mid-size manufacturing CFO caught a vendor with cancelled GST registration before releasing a 45L PO. Found it in 3 minutes on In-Sync. Want to see how?',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- D2. COO - Social Proof
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'COO - Social Proof',
      'coo_social_proof',
      'en',
      'Hi {{1}}, thought you''d find this interesting — a logistics company cut vendor onboarding from 8 days to 20 minutes using In-Sync. Their ops team handles 3x more vendors now. Want to see how?',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- D3. CTO - Social Proof
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'CTO - Social Proof',
      'cto_social_proof',
      'en',
      '{{1}}, thought you''d find this interesting — a SaaS company integrated In-Sync''s API into their vendor portal in 2 days. Automated checks now run on every new vendor. Want to see the docs?',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- D4. CCO - Social Proof
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'CCO - Social Proof',
      'cco_social_proof',
      'en',
      '{{1}}, thought you''d find this interesting — a pharma company used In-Sync to flag 12 non-compliant vendors in their first week. Saved them from a potential audit nightmare. Shall I share details?',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- D5. Procurement Head - Social Proof
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'Procurement Head - Social Proof',
      'procurement_social_proof',
      'en',
      'Hi {{1}}, thought you''d find this interesting — a procurement team of 5 now verifies 200+ vendors per month using In-Sync. Previously they managed 40. Want to see how they did it?',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- D6. Supply Chain Head - Social Proof
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'Supply Chain Head - Social Proof',
      'supplychain_social_proof',
      'en',
      '{{1}}, thought you''d find this interesting — an FMCG company avoided a supply chain disruption by catching a vendor''s MCA strike-off status early on In-Sync. Want to hear more?',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- ========================================================================
    -- E. QUICK STAT SHARE — 6 variants
    -- One compelling stat per message. Under 200 chars.
    -- ========================================================================

    -- E1. Vendor Failure Stat
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'Quick Stat - Vendor Failure',
      'stat_vendor_failure',
      'en',
      'Did you know: 73% of vendor failures show financial red flags months before they default. In-Sync catches these signals in real time. Want to see it in action, {{1}}?',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- E2. Due Diligence Time Stat
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'Quick Stat - Due Diligence Time',
      'stat_due_diligence_time',
      'en',
      'Hi {{1}}, Indian companies spend an average of 7-10 days on vendor due diligence. In-Sync does it in under 5 minutes. Try 3 free checks?',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- E3. GST Fraud Stat
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'Quick Stat - GST Fraud',
      'stat_gst_fraud',
      'en',
      'Did you know: GST authorities cancelled 1.63 lakh registrations for fraud in FY24 alone. Is your vendor list clean? In-Sync checks it instantly, {{1}}.',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- E4. Vendor Risk Cost Stat
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'Quick Stat - Vendor Risk Cost',
      'stat_vendor_risk_cost',
      'en',
      'Did you know: The average cost of a vendor default is 2.5x the original PO value when you factor in delays and re-sourcing. In-Sync prevents this, {{1}}.',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- E5. Manual Checks Stat
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'Quick Stat - Manual Checks',
      'stat_manual_checks',
      'en',
      'Hi {{1}}, 68% of companies still verify vendors manually through CAs and paper documents. In-Sync automates it with govt API data.',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- E6. Company Adoption Stat
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'Quick Stat - Adoption',
      'stat_adoption',
      'en',
      'Did you know: 100+ Indian businesses switched to In-Sync in the last year. Average time to first vendor check: 4 minutes. Want to try it, {{1}}?',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- ========================================================================
    -- F. MEETING REQUEST — 6 role variants
    -- "Can we do a quick 15-min call this week?" Under 200 chars.
    -- ========================================================================

    -- F1. CFO - Meeting Request
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'CFO - Meeting Request',
      'cfo_meeting_request',
      'en',
      'Hi {{1}}, can we do a quick 15-min call this week? I''d like to show you how In-Sync helps CFOs verify vendor financials before large commitments. When works best?',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- F2. COO - Meeting Request
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'COO - Meeting Request',
      'coo_meeting_request',
      'en',
      '{{1}}, can we do a quick 15-min call this week? I''d like to show how In-Sync speeds up vendor onboarding for operations teams. When works for you?',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- F3. CTO - Meeting Request
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'CTO - Meeting Request',
      'cto_meeting_request',
      'en',
      '{{1}}, can we do a quick 15-min technical call this week? I''d like to walk you through In-Sync''s API and integration options. When suits you?',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- F4. CCO - Meeting Request
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'CCO - Meeting Request',
      'cco_meeting_request',
      'en',
      'Hi {{1}}, can we do a quick 15-min call this week? I''d like to show how In-Sync automates vendor compliance verification. When works best for you?',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- F5. Procurement Head - Meeting Request
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'Procurement Head - Meeting Request',
      'procurement_meeting_request',
      'en',
      '{{1}}, can we do a quick 15-min call this week? I''d like to show how procurement teams use In-Sync to cut vendor checks from days to minutes.',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- F6. Supply Chain Head - Meeting Request
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'Supply Chain Head - Meeting Request',
      'supplychain_meeting_request',
      'en',
      'Hi {{1}}, can we do a quick 15-min call this week? I''d like to show how In-Sync helps de-risk vendor decisions across your supply chain.',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- ========================================================================
    -- G. RE-ENGAGEMENT — 6 ICPs x 2 variants = 12 templates
    -- "It's been a while. We've added..." Under 200 chars.
    -- ========================================================================

    -- G1. CFO - Re-engagement A
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'CFO - Re-engagement A',
      'cfo_reengage_a',
      'en',
      'Hi {{1}}, it''s been a while. We''ve added AI-powered financial risk scoring to In-Sync — flags vendor red flags before they become problems. Worth a fresh look?',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- G2. CFO - Re-engagement B
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'CFO - Re-engagement B',
      'cfo_reengage_b',
      'en',
      'Hi {{1}}, it''s been a while. In-Sync now covers MCA, GST, PAN, ITR, and bank account verification — all in one place. Shall I show you what''s new?',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- G3. COO - Re-engagement A
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'COO - Re-engagement A',
      'coo_reengage_a',
      'en',
      'Hi {{1}}, it''s been a while. In-Sync now supports bulk vendor verification — check 100 vendors in one go. Great for ops teams. Want to see it?',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- G4. COO - Re-engagement B
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'COO - Re-engagement B',
      'coo_reengage_b',
      'en',
      'Hi {{1}}, it''s been a while. We''ve added automated vendor monitoring to In-Sync — get alerts when a vendor''s status changes. Shall I demo it?',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- G5. CTO - Re-engagement A
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'CTO - Re-engagement A',
      'cto_reengage_a',
      'en',
      'Hi {{1}}, it''s been a while. In-Sync now offers webhook callbacks and batch API for vendor checks. Perfect for automated workflows. Want the updated docs?',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- G6. CTO - Re-engagement B
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'CTO - Re-engagement B',
      'cto_reengage_b',
      'en',
      'Hi {{1}}, it''s been a while. We''ve revamped the In-Sync API — faster response times, better error handling, new endpoints. Worth a second look?',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- G7. CCO - Re-engagement A
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'CCO - Re-engagement A',
      'cco_reengage_a',
      'en',
      'Hi {{1}}, it''s been a while. In-Sync now generates compliance reports for your entire vendor base — audit-ready, one click. Want to see it?',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- G8. CCO - Re-engagement B
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'CCO - Re-engagement B',
      'cco_reengage_b',
      'en',
      'Hi {{1}}, it''s been a while. We''ve added continuous vendor monitoring to In-Sync — real-time alerts when compliance status changes. Interested?',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- G9. Procurement Head - Re-engagement A
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'Procurement Head - Re-engagement A',
      'procurement_reengage_a',
      'en',
      'Hi {{1}}, it''s been a while. In-Sync now has vendor scorecards — financial health, compliance, risk level in one view. Want to check it out?',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- G10. Procurement Head - Re-engagement B
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'Procurement Head - Re-engagement B',
      'procurement_reengage_b',
      'en',
      'Hi {{1}}, it''s been a while. We''ve launched quarterly plans for In-Sync — unlimited vendor verifications starting at very accessible pricing. Want details?',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- G11. Supply Chain Head - Re-engagement A
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'Supply Chain Head - Re-engagement A',
      'supplychain_reengage_a',
      'en',
      'Hi {{1}}, it''s been a while. In-Sync now monitors your vendor base continuously — alerts you before a supplier becomes a risk. Worth a second look?',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- G12. Supply Chain Head - Re-engagement B
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'Supply Chain Head - Re-engagement B',
      'supplychain_reengage_b',
      'en',
      'Hi {{1}}, it''s been a while. We''ve added supply chain risk mapping to In-Sync — see financial health across your entire vendor network. Interested?',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- ========================================================================
    -- H. THANK YOU POST-DEMO — 6 role variants
    -- "Thanks for your time today..." Under 300 chars.
    -- ========================================================================

    -- H1. CFO - Thank You Post-Demo
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'CFO - Thank You Post-Demo',
      'cfo_thankyou_demo',
      'en',
      'Thanks for your time today, {{1}}. Here''s a summary of what we covered: In-Sync verifies vendor financials via MCA, GST, PAN, and ITR in under 5 minutes. Your 3 free verifications are active — try one on a real vendor and let me know how it goes.',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- H2. COO - Thank You Post-Demo
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'COO - Thank You Post-Demo',
      'coo_thankyou_demo',
      'en',
      'Thanks for your time today, {{1}}. As discussed, In-Sync can cut your vendor onboarding from days to minutes. Your 3 free verifications are active — try one and see the speed difference for yourself.',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'utility',
      'pending',
      true
    );

    -- H3. CTO - Thank You Post-Demo
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'CTO - Thank You Post-Demo',
      'cto_thankyou_demo',
      'en',
      'Thanks for your time today, {{1}}. As discussed, here''s the In-Sync API documentation for your team to review. Your 3 free API verifications are active — test them against your vendor data and let me know.',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'utility',
      'pending',
      true
    );

    -- H4. CCO - Thank You Post-Demo
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'CCO - Thank You Post-Demo',
      'cco_thankyou_demo',
      'en',
      'Thanks for your time today, {{1}}. As discussed, In-Sync can automate your vendor compliance checks across GST, MCA, and PAN. Your 3 free verifications are active — run one on a vendor you''re concerned about.',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'utility',
      'pending',
      true
    );

    -- H5. Procurement Head - Thank You Post-Demo
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'Procurement Head - Thank You Post-Demo',
      'procurement_thankyou_demo',
      'en',
      'Thanks for your time today, {{1}}. As discussed, In-Sync replaces manual vendor due diligence with automated govt API checks. Your 3 free verifications are active — try one on your next vendor evaluation.',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'utility',
      'pending',
      true
    );

    -- H6. Supply Chain Head - Thank You Post-Demo
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'Supply Chain Head - Thank You Post-Demo',
      'supplychain_thankyou_demo',
      'en',
      'Thanks for your time today, {{1}}. As discussed, In-Sync helps you verify vendor financial stability before they enter your supply chain. Your 3 free verifications are active — test it on a critical vendor.',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'utility',
      'pending',
      true
    );

    -- ========================================================================
    -- I. AUDIT SEASON ALERT — 6 role variants
    -- "Audit season is approaching..." Under 300 chars.
    -- ========================================================================

    -- I1. CFO - Audit Season Alert
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'CFO - Audit Season Alert',
      'cfo_audit_season',
      'en',
      '{{1}}, audit season is approaching. Are your vendor records audit-ready? In-Sync generates verified financial health reports for your entire vendor base — GST, MCA, PAN status in one dashboard. Want to run a quick check before auditors arrive?',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- I2. COO - Audit Season Alert
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'COO - Audit Season Alert',
      'coo_audit_season',
      'en',
      '{{1}}, audit season is approaching. Auditors will ask about vendor due diligence processes. In-Sync provides an automated, documented trail of every vendor check. Want to get audit-ready in minutes?',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- I3. CTO - Audit Season Alert
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'CTO - Audit Season Alert',
      'cto_audit_season',
      'en',
      'Hi {{1}}, audit season is approaching. In-Sync''s API can batch-verify your entire vendor list and generate compliance reports automatically. No manual work for your team. Want to set it up before audits begin?',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- I4. CCO - Audit Season Alert
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'CCO - Audit Season Alert',
      'cco_audit_season',
      'en',
      '{{1}}, audit season is approaching. Is every vendor in your database verified and compliant? In-Sync checks GST, MCA, and PAN status across your entire vendor base in minutes. Want an audit-readiness check?',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- I5. Procurement Head - Audit Season Alert
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'Procurement Head - Audit Season Alert',
      'procurement_audit_season',
      'en',
      'Hi {{1}}, audit season is approaching. Auditors will review your vendor selection process. In-Sync creates a documented verification trail for every vendor — automated, timestamped, audit-ready. Shall I show you?',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

    -- I6. Supply Chain Head - Audit Season Alert
    INSERT INTO public.mkt_whatsapp_templates (org_id, name, template_name, language, body, header, footer, buttons, variables, category, approval_status, is_active)
    VALUES (
      _org_id,
      'Supply Chain Head - Audit Season Alert',
      'supplychain_audit_season',
      'en',
      '{{1}}, audit season is approaching. Can you show auditors verified financials for every vendor in your supply chain? In-Sync generates these reports in minutes. Want to get ahead of it?',
      null,
      'In-Sync by ECR Technical Innovations',
      '[]'::jsonb,
      '["first_name"]'::jsonb,
      'marketing',
      'pending',
      true
    );

  END LOOP;
END $$;
