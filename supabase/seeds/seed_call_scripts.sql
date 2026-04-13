-- =============================================================================
-- SEED: mkt_call_scripts — In-Sync AI Voice Call Scripts (Vapi)
-- 24 scripts total: 6 intro, 6 follow-up, 4 demo, 4 closing, 4 reactivation
-- Product: In-Sync — B2B SaaS Vendor Financial Due Diligence Platform
-- =============================================================================

DO $$
DECLARE
  _org_id uuid;
BEGIN
  FOR _org_id IN SELECT id FROM public.organizations LOOP

    -- =========================================================================
    -- A. COLD INTRO CALLS (6 scripts — one per ICP)
    -- =========================================================================

    -- A1. CFO - Cold Intro
    INSERT INTO public.mkt_call_scripts (org_id, name, objective, opening, key_points, objection_handling, closing, voice_id, language, max_duration_seconds, is_active, product_key, call_type)
    VALUES (
      _org_id,
      'CFO - Cold Intro',
      'Introduce In-Sync to CFO and gauge interest in vendor due diligence automation',
      'Hi, is this {{first_name}}? I am calling from In-Sync. We help finance teams verify vendor financial health in under 5 minutes using AI and government APIs. Do you have a quick moment?',
      '["In-Sync replaces 7-10 days of manual vendor verification with a 5-minute AI-powered check", "We pull data from GST, PAN, credit bureaus, and bank statements simultaneously", "Over 100 businesses like Quess Corp and Motherson already use us", "You get 3 free verifications to try it out — no card needed"]'::jsonb,
      '{
        "not interested": "I understand. May I ask — how does your team currently verify vendor financial health before large POs? Most CFOs tell us they spend days chasing documents.",
        "we already have a process": "That is great. Most of our customers did too — what changed was finding that their manual process missed things like GST non-compliance or credit deterioration. In-Sync catches those in real time.",
        "too busy": "Completely understand. Would a 2-minute email summary work better? I can send you a quick case study of how a CFO caught a 50 lakh rupee liability before signing.",
        "send me an email": "Absolutely. What is the best email? I will send a brief overview with a case study. Would Thursday work for a quick follow-up call?",
        "how much does it cost": "We have a free tier with 3 verifications. Paid plans start at 2,999 rupees per quarter for 10 verifications. Most finance teams see ROI within the first verification.",
        "we use CA firms for this": "That makes sense. Many of our clients used to as well. The difference is speed — a CA takes days to weeks, while In-Sync gives you the same data in 5 minutes. Some teams use both and cross-check."
      }'::jsonb,
      'Thank you for your time. I will send you a quick email with our case study. Would you prefer I call back on Thursday or Friday for a 15-minute demo?',
      null,
      'en',
      300,
      true,
      'in-sync',
      'intro'
    );

    -- A2. COO - Cold Intro
    INSERT INTO public.mkt_call_scripts (org_id, name, objective, opening, key_points, objection_handling, closing, voice_id, language, max_duration_seconds, is_active, product_key, call_type)
    VALUES (
      _org_id,
      'COO - Cold Intro',
      'Introduce In-Sync to COO and highlight operational efficiency gains in vendor onboarding',
      'Hi {{first_name}}, this is a call from In-Sync. We help operations teams cut vendor onboarding time from 7-10 days to under 5 minutes. I know your time is valuable — can I take 2 minutes to explain how?',
      '["In-Sync automates vendor financial due diligence end to end — GST, PAN, credit checks, bank statement analysis all happen in one click", "Your teams no longer chase vendors for documents — we pull everything from government APIs directly", "Companies like Quess Corp and Hiranandani reduced vendor onboarding bottlenecks by over 80 percent", "Full audit trail for every verification — no more Excel trackers or email chains"]'::jsonb,
      '{
        "not interested": "Fair enough. Out of curiosity, how long does it currently take your team to onboard a new vendor from first contact to approved? Most COOs we talk to say 1-2 weeks.",
        "we already have a process": "Good to hear. What we have seen is that even well-built processes hit delays when vendors are slow sending documents. In-Sync removes that dependency entirely by pulling data from government sources directly.",
        "too busy": "Totally get it. Can I send you a one-page overview? It shows how one COO saved 40 hours a month on vendor verification. I will keep it short.",
        "send me an email": "Of course. I will send something brief with a real example. What is your email? And would next Tuesday work for a 10-minute follow-up?",
        "how much does it cost": "Plans start at 2,999 rupees per quarter. But honestly, the cost of one bad vendor — delays, compliance issues, rework — usually dwarfs that in a single incident.",
        "our procurement team handles this": "That makes sense. We actually work closely with procurement teams. Would it help if I showed your procurement head a quick demo? Many COOs introduce us to that team."
      }'::jsonb,
      'I will send you a quick overview by email. Would it make sense to loop in your procurement head for a 15-minute demo next week?',
      null,
      'en',
      300,
      true,
      'in-sync',
      'intro'
    );

    -- A3. CTO - Cold Intro
    INSERT INTO public.mkt_call_scripts (org_id, name, objective, opening, key_points, objection_handling, closing, voice_id, language, max_duration_seconds, is_active, product_key, call_type)
    VALUES (
      _org_id,
      'CTO - Cold Intro',
      'Introduce In-Sync to CTO and position as API-first platform that integrates with existing tech stack',
      'Hi {{first_name}}, I am reaching out from In-Sync. We have built an API-first vendor due diligence platform that plugs into existing ERP and procurement systems. Would you have 2 minutes for a quick overview?',
      '["In-Sync offers a REST API with webhooks — you can embed vendor verification into any workflow or approval system", "We aggregate data from 6 government APIs including GST, PAN, MCA, and credit bureaus in a single call", "Our platform processes bank statements using AI-powered OCR and classification — no manual parsing", "SOC 2 compliant with end-to-end encryption. We never store raw government credentials.", "API response times under 30 seconds for a full vendor health report"]'::jsonb,
      '{
        "not interested": "I understand. Quick question though — does your team currently build or maintain any internal tools for vendor verification? Many CTOs tell us that is a hidden maintenance burden.",
        "we already have a process": "Good. Is it API-based or manual? Most teams we talk to have some automation but still rely on people to chase GST returns or bank statements. We eliminate that last mile.",
        "too busy": "Totally fair. Can I send you our API docs? You can see in 5 minutes whether it fits your stack. No call needed.",
        "send me an email": "Sure. I will send our API documentation and a sandbox link. You can test it without talking to anyone. What is your email?",
        "how much does it cost": "Paid plans start at 2,999 rupees per quarter. For API-heavy usage, most teams go with our Business plan at 7,499 rupees which includes 50 verifications and priority support.",
        "security concerns": "Great question. We are SOC 2 compliant, all data is encrypted in transit and at rest, and we never store raw government credentials. We can share our security whitepaper if that helps."
      }'::jsonb,
      'I will send you our API docs and a sandbox link. You can test it yourself. Would next week work for a quick technical walkthrough if you have questions?',
      null,
      'en',
      300,
      true,
      'in-sync',
      'intro'
    );

    -- A4. CCO (Chief Compliance Officer) - Cold Intro
    INSERT INTO public.mkt_call_scripts (org_id, name, objective, opening, key_points, objection_handling, closing, voice_id, language, max_duration_seconds, is_active, product_key, call_type)
    VALUES (
      _org_id,
      'CCO - Cold Intro',
      'Introduce In-Sync to Chief Compliance Officer and emphasize audit trail and regulatory compliance features',
      'Hi {{first_name}}, I am calling from In-Sync. We help compliance teams automate vendor due diligence with real-time government data and a full audit trail. Do you have a couple of minutes?',
      '["In-Sync generates a complete audit trail for every vendor check — timestamped, tamper-proof, and exportable for auditors", "We verify GST compliance status, PAN validity, MCA filings, and credit scores in one automated workflow", "Any vendor that fails a threshold check gets flagged instantly — no more relying on periodic manual reviews", "Over 100 companies use us to stay ahead of compliance requirements, including firms in regulated industries"]'::jsonb,
      '{
        "not interested": "I hear you. Can I ask — when was the last time an auditor asked about your vendor verification process? We find that compliance teams are often blindsided by that question.",
        "we already have a process": "That is good. The gap we usually see is real-time monitoring. Your process might catch issues at onboarding, but what about a vendor whose GST registration lapses 6 months later? In-Sync monitors continuously.",
        "too busy": "Understood. I can send you a 1-page compliance checklist we created — it shows the 8 vendor risks most audit teams flag. No strings attached.",
        "send me an email": "Happy to. I will include a sample audit report so you can see exactly what our output looks like. What email should I use?",
        "how much does it cost": "Plans start at 2,999 rupees per quarter. For compliance teams that need continuous monitoring, our Business plan at 7,499 gives you real-time alerts and unlimited report exports.",
        "we have internal audit team for this": "That is great. In-Sync actually makes internal audit easier — they get a single dashboard showing every vendor check, when it was done, and what was found. Many audit teams love it."
      }'::jsonb,
      'I will email you a sample audit report so you can see the output. Would Wednesday or Thursday work for a 15-minute demo focused on the compliance features?',
      null,
      'en',
      300,
      true,
      'in-sync',
      'intro'
    );

    -- A5. Procurement Head - Cold Intro
    INSERT INTO public.mkt_call_scripts (org_id, name, objective, opening, key_points, objection_handling, closing, voice_id, language, max_duration_seconds, is_active, product_key, call_type)
    VALUES (
      _org_id,
      'Procurement Head - Cold Intro',
      'Introduce In-Sync to Procurement Head and highlight faster vendor approvals and risk reduction',
      'Hi {{first_name}}, this is a call from In-Sync. We help procurement teams verify vendor financial health before issuing POs — takes under 5 minutes instead of days. Got a quick moment?',
      '["In-Sync checks GST status, PAN details, credit score, and bank statement health for any vendor in under 5 minutes", "No more chasing vendors for documents — we pull everything from government databases directly", "Flag risky vendors before you sign — catch GST defaults, credit issues, or dormant companies instantly", "Companies like Motherson and Audi India use In-Sync to de-risk their vendor approvals", "Start free with 3 verifications — see results before you commit"]'::jsonb,
      '{
        "not interested": "I understand. Quick question — how many new vendors does your team onboard per month? Most procurement heads tell us even 5-10 new vendors creates a real documentation bottleneck.",
        "we already have a process": "Good. What we hear from procurement teams is that their process works but is slow — vendors take days to send documents, and by then the PO is delayed. In-Sync removes that wait entirely.",
        "too busy": "Totally get it. Would it help if I sent a 2-minute video showing how it works? You can watch it when convenient.",
        "send me an email": "Sure thing. I will send a quick overview with a real example of how a procurement team caught a risky vendor. What is your best email?",
        "how much does it cost": "We have a free trial with 3 checks. After that, plans start at 2,999 rupees per quarter for 10 verifications. Most procurement teams tell us one bad vendor costs more than a full year of In-Sync.",
        "our finance team handles due diligence": "That is common. But we find procurement is usually the first to spot a vendor issue. Having In-Sync in your workflow means you flag risks before finance even sees the paperwork."
      }'::jsonb,
      'Let me send you a quick case study by email. Would it help to do a 15-minute demo where I show you a live vendor check? How does Thursday look?',
      null,
      'en',
      300,
      true,
      'in-sync',
      'intro'
    );

    -- A6. Supply Chain Head - Cold Intro
    INSERT INTO public.mkt_call_scripts (org_id, name, objective, opening, key_points, objection_handling, closing, voice_id, language, max_duration_seconds, is_active, product_key, call_type)
    VALUES (
      _org_id,
      'Supply Chain Head - Cold Intro',
      'Introduce In-Sync to Supply Chain Head and connect vendor risk to supply chain continuity',
      'Hi {{first_name}}, I am calling from In-Sync. We help supply chain teams avoid disruptions by verifying vendor financial stability before you depend on them. Do you have a couple of minutes?',
      '["A vendor going bankrupt or losing GST registration can halt your supply chain overnight — In-Sync catches these risks in advance", "We verify financial health across GST, PAN, credit bureaus, and bank statements in one automated check", "Over 100 businesses including Quess Corp and Hiranandani use In-Sync to protect their supply chain", "Get real-time alerts if a critical vendor''s financial health deteriorates — no surprises", "Start with 3 free verifications to test it on your most critical vendors"]'::jsonb,
      '{
        "not interested": "I understand. Let me ask — have you ever had a supply disruption because a vendor ran into financial trouble? That is exactly the scenario In-Sync prevents.",
        "we already have a process": "That is good. Most supply chain teams verify vendors at onboarding but not continuously. What happens if your top vendor''s credit score drops 6 months later? In-Sync monitors that for you.",
        "too busy": "Completely understand. Can I send you a one-pager on how supply chain teams use In-Sync? Takes 2 minutes to read.",
        "send me an email": "Of course. I will include a quick example of how a supply chain head avoided a major disruption. What is your email?",
        "how much does it cost": "Plans start at 2,999 rupees per quarter. Think of it this way — if In-Sync prevents even one supply disruption, it pays for itself a hundred times over.",
        "we rely on long-term vendor relationships": "Absolutely, relationships matter. But even long-term vendors can hit financial trouble. In-Sync is like an early warning system — it protects the relationship by helping you spot issues before they become crises."
      }'::jsonb,
      'I will send you a brief case study by email. Would you be open to a 15-minute demo where I show a live vendor risk check? Does next Tuesday or Wednesday work?',
      null,
      'en',
      300,
      true,
      'in-sync',
      'intro'
    );

    -- =========================================================================
    -- B. FOLLOW-UP CALLS (6 scripts — one per ICP)
    -- =========================================================================

    -- B1. CFO - Follow-up
    INSERT INTO public.mkt_call_scripts (org_id, name, objective, opening, key_points, objection_handling, closing, voice_id, language, max_duration_seconds, is_active, product_key, call_type)
    VALUES (
      _org_id,
      'CFO - Follow-up',
      'Follow up with CFO after initial intro call and move toward demo or trial',
      'Hi {{first_name}}, this is In-Sync following up. We spoke recently about how your finance team handles vendor due diligence. I also sent over a case study — did you get a chance to look at it?',
      '["Quick recap — In-Sync automates vendor financial verification in under 5 minutes using government APIs", "Since we spoke, I wanted to share that we just launched continuous monitoring — you get alerts if a vendor''s GST or credit status changes", "One of our CFO clients at a manufacturing firm saved 40 hours per month and caught 3 risky vendors in the first week", "Your 3 free verifications are ready to go — no setup or card needed"]'::jsonb,
      '{
        "we already have a process": "Totally understand. What most CFOs find is that In-Sync complements their existing process by adding the government data layer they were missing. It is not a replacement — it is an upgrade.",
        "too busy right now": "I hear you. How about I set up a 10-minute demo with one of your team members instead? They can evaluate it and brief you. Who would be the right person?",
        "send more info": "Happy to. Is there a specific area you want more detail on — pricing, security, or the technical side? I want to send you exactly what is useful.",
        "not a priority right now": "Makes sense. When does your next vendor audit or onboarding cycle come up? I can follow up closer to that time so it is more relevant.",
        "need to discuss with team": "Of course. Would it help if I did a quick 15-minute demo for you and your team together? That way everyone sees it at once and you can decide faster.",
        "the case study was interesting but": "Glad you looked at it. What questions came up? I am happy to address anything specific to your setup."
      }'::jsonb,
      'How about we schedule a 15-minute demo? I can show you a live vendor check with real data. Does Thursday at 3 PM or Friday at 11 AM work better?',
      null,
      'en',
      300,
      true,
      'in-sync',
      'follow_up'
    );

    -- B2. COO - Follow-up
    INSERT INTO public.mkt_call_scripts (org_id, name, objective, opening, key_points, objection_handling, closing, voice_id, language, max_duration_seconds, is_active, product_key, call_type)
    VALUES (
      _org_id,
      'COO - Follow-up',
      'Follow up with COO after initial intro and move toward demo with operations team',
      'Hi {{first_name}}, this is In-Sync calling back. We chatted about cutting your vendor onboarding time. I sent over some info — did anything stand out?',
      '["Since we spoke, I thought you would find this interesting — one of our clients reduced vendor onboarding from 12 days to under 1 day", "We just added a team dashboard where you can see all vendor checks across departments in one view", "The operations teams using us love that they no longer have to follow up with vendors for documents", "Your free trial is ready — 3 verifications, no setup needed"]'::jsonb,
      '{
        "we already have a process": "Good. The teams that get the most from In-Sync are ones that already have a process but want to speed it up. We usually cut 80 percent of the time without changing your workflow.",
        "too busy right now": "Understood. Would it make more sense to do a quick demo with your operations or procurement lead? They can evaluate and bring it to you with a recommendation.",
        "send more info": "Sure. What would be most useful — a technical overview for your team, or a business case with ROI numbers you can share internally?",
        "not a priority right now": "Got it. Is there a specific quarter when you are reviewing vendor processes? I can reach out then so the timing is right.",
        "need to discuss with team": "Absolutely. What if I set up a 15-minute group demo? I can walk your team through it and answer questions live. That usually speeds up the decision.",
        "what is different from last time": "Great question. Since we spoke, we added continuous vendor monitoring and a team dashboard. These were the two things COOs kept asking for."
      }'::jsonb,
      'Let me set up a quick demo with you and your procurement or operations lead. Would next Tuesday or Wednesday work for 15 minutes?',
      null,
      'en',
      300,
      true,
      'in-sync',
      'follow_up'
    );

    -- B3. CTO - Follow-up
    INSERT INTO public.mkt_call_scripts (org_id, name, objective, opening, key_points, objection_handling, closing, voice_id, language, max_duration_seconds, is_active, product_key, call_type)
    VALUES (
      _org_id,
      'CTO - Follow-up',
      'Follow up with CTO after intro and move toward API sandbox trial or technical demo',
      'Hi {{first_name}}, this is In-Sync following up. I sent over our API docs and sandbox access. Did your team get a chance to look at it?',
      '["Our sandbox is fully functional — you can run test verifications against real government APIs without any commitment", "We recently added webhook support so you can trigger verifications from your existing procurement or ERP workflow", "Average API response time is under 30 seconds for a complete vendor health report with 6 data sources", "Our developer docs include sample code in Python, Node, and cURL — takes about 15 minutes to integrate"]'::jsonb,
      '{
        "we already have a process": "Understood. What we find is that most internal tools cover one or two data sources — like GST or PAN. In-Sync aggregates 6 sources in a single API call. It usually replaces 3-4 internal scripts.",
        "too busy right now": "No problem. The sandbox stays open — your team can test whenever. Should I follow up in 2 weeks to see if they had questions?",
        "send more info": "Sure. Would a technical architecture diagram be helpful? I can also send a Postman collection so your team can test the API without writing code.",
        "security concerns": "Totally valid. We are SOC 2 compliant, encrypt everything in transit and at rest, and do not store raw government credentials. I can send our security whitepaper and we can do a security review call if needed.",
        "need to discuss with team": "Makes sense. Would a 20-minute technical walkthrough with your dev lead help? I can show the API, webhooks, and error handling live.",
        "integration looks complex": "It is actually pretty simple — a single REST endpoint with a vendor PAN or GST number as input. Most teams integrate in under a day. I can walk your dev through it in 15 minutes."
      }'::jsonb,
      'How about a quick 20-minute technical walkthrough? I can show your dev team the API live and answer integration questions. Does Thursday or Friday work?',
      null,
      'en',
      300,
      true,
      'in-sync',
      'follow_up'
    );

    -- B4. CCO - Follow-up
    INSERT INTO public.mkt_call_scripts (org_id, name, objective, opening, key_points, objection_handling, closing, voice_id, language, max_duration_seconds, is_active, product_key, call_type)
    VALUES (
      _org_id,
      'CCO - Follow-up',
      'Follow up with CCO after intro and move toward compliance-focused demo',
      'Hi {{first_name}}, this is In-Sync calling back. I sent you a sample audit report from our platform. Did you get a chance to review it?',
      '["The audit report I sent shows exactly what auditors see — timestamped checks, data sources, risk flags, all in one document", "We recently added automatic compliance scoring — every vendor gets a risk rating from A to F based on financial health indicators", "One of our compliance clients discovered that 12 percent of their approved vendors had lapsed GST registrations — all flagged in the first week", "We can set up custom alert rules — for example, notify your team immediately if any vendor drops below a B rating"]'::jsonb,
      '{
        "we already have a process": "Good to hear. What we find is that In-Sync fills the gap between periodic manual reviews. It monitors continuously so nothing slips through between audit cycles.",
        "too busy right now": "I understand. Compliance never stops though. Would it help if I did a quick demo for your team lead? They can evaluate and brief you.",
        "send more info": "Sure. Would a comparison of what auditors typically ask for versus what In-Sync provides be useful? I can tailor it to your industry.",
        "not a priority right now": "Got it. When is your next audit cycle? I want to reach out at the right time so your team is prepared before auditors arrive.",
        "need to discuss with team": "Of course. A group demo usually works well — I can show the audit trail and compliance scoring to your whole compliance team in 15 minutes.",
        "the report looked good but we need more detail": "Great feedback. I can generate a custom report for one of your actual vendors — with your permission — so you see exactly what the output looks like for your supply chain."
      }'::jsonb,
      'Let me set up a 15-minute compliance-focused demo. I can show the audit trail and risk scoring live. Does Wednesday at 2 PM or Thursday at 11 AM work?',
      null,
      'en',
      300,
      true,
      'in-sync',
      'follow_up'
    );

    -- B5. Procurement Head - Follow-up
    INSERT INTO public.mkt_call_scripts (org_id, name, objective, opening, key_points, objection_handling, closing, voice_id, language, max_duration_seconds, is_active, product_key, call_type)
    VALUES (
      _org_id,
      'Procurement Head - Follow-up',
      'Follow up with Procurement Head after intro and move toward trial or demo',
      'Hi {{first_name}}, this is In-Sync following up from our last conversation about vendor verification. I sent over a case study — did you get a chance to take a look?',
      '["Quick reminder — In-Sync lets you verify any vendor''s financial health in under 5 minutes before issuing a PO", "Since we spoke, I wanted to mention that we now support bulk vendor checks — you can verify 50 vendors at once", "A procurement head at an auto company told us they caught 4 risky vendors in their first batch check — vendors that had passed their manual review", "Your 3 free verifications are ready — I can walk you through the first one in 5 minutes"]'::jsonb,
      '{
        "we already have a process": "That is good. What most procurement teams find is that In-Sync adds a data layer they did not have — real-time government data that complements their existing checks.",
        "too busy right now": "Totally understand. Would a 5-minute walkthrough work? I can show you one live vendor check and you will see the value immediately.",
        "send more info": "Sure. Would pricing details or a comparison with your current process be more useful? I want to send exactly what helps.",
        "not a priority right now": "Got it. When is your next big vendor onboarding wave? I can time our follow-up to coincide with that.",
        "need to discuss with team": "Of course. Would it help if I joined a quick call with your team? I can demo it live and answer everyone''s questions at once.",
        "we have too many tools already": "I hear that a lot. The good news is In-Sync replaces the manual steps — document collection, GST portal checks, credit report requests. It actually reduces your tool count."
      }'::jsonb,
      'How about I walk you through your first live vendor check? It takes 5 minutes and you will see the full report. Does tomorrow morning or Thursday afternoon work?',
      null,
      'en',
      300,
      true,
      'in-sync',
      'follow_up'
    );

    -- B6. Supply Chain Head - Follow-up
    INSERT INTO public.mkt_call_scripts (org_id, name, objective, opening, key_points, objection_handling, closing, voice_id, language, max_duration_seconds, is_active, product_key, call_type)
    VALUES (
      _org_id,
      'Supply Chain Head - Follow-up',
      'Follow up with Supply Chain Head after intro and move toward demo or trial',
      'Hi {{first_name}}, this is In-Sync following up. We talked about protecting your supply chain from vendor financial risk. I sent some info — did anything catch your eye?',
      '["Since we spoke, I wanted to share a recent example — a supply chain team found that 3 of their top 20 vendors had deteriorating credit scores. They re-negotiated terms before it became a problem.", "We now offer continuous monitoring — you get an alert the moment a critical vendor''s financial health changes", "Bulk verification is live — you can upload your entire vendor list and get risk scores for everyone in one go", "Your 3 free checks are waiting — I would suggest starting with your most critical single-source vendors"]'::jsonb,
      '{
        "we already have a process": "That is solid. Where In-Sync adds value is continuous monitoring — your onboarding check is a point in time, but vendor health changes. We watch it for you.",
        "too busy right now": "I get it. Supply chain never sleeps. Can I send a 2-minute video walkthrough? You can watch it when you have a break.",
        "send more info": "Happy to. Would a risk assessment template for your top vendors be useful? I can include sample In-Sync outputs so you see what the data looks like.",
        "not a priority right now": "Understood. When is your next vendor review cycle? I want to connect at the right time.",
        "need to discuss with team": "Of course. Would a group demo work? I can walk your supply chain team through a live vendor check in 15 minutes.",
        "we have long-term contracts with our vendors": "That is exactly when monitoring matters most. A long-term contract means higher exposure. In-Sync is like insurance — it helps you spot trouble early so you can protect the relationship."
      }'::jsonb,
      'How about a quick demo where we run your top 5 vendors through In-Sync live? You will see risk scores in real time. Does next Tuesday or Wednesday work?',
      null,
      'en',
      300,
      true,
      'in-sync',
      'follow_up'
    );

    -- =========================================================================
    -- C. DEMO CALLS (4 scripts — by use case)
    -- =========================================================================

    -- C1. Full Platform Walkthrough
    INSERT INTO public.mkt_call_scripts (org_id, name, objective, opening, key_points, objection_handling, closing, voice_id, language, max_duration_seconds, is_active, product_key, call_type)
    VALUES (
      _org_id,
      'Demo - Full Platform Walkthrough',
      'Walk prospect through the complete In-Sync platform and convert to trial or paid plan',
      'Hi {{first_name}}, thanks for joining the demo. Today I am going to show you exactly how In-Sync verifies a vendor''s financial health in under 5 minutes. I will use a live example so you can see real data.',
      '["Start with a single vendor check — enter a GST number and watch the platform pull data from 6 sources in real time", "Show the unified vendor health report — GST compliance, PAN verification, credit score, bank statement analysis, MCA filings all in one page", "Demonstrate the risk scoring system — how vendors are rated A through F and what triggers each rating", "Walk through the audit trail — every check is timestamped and exportable as PDF for auditors", "Show the team dashboard — how multiple team members can run checks and see each other''s results"]'::jsonb,
      '{
        "this looks complicated": "It looks like a lot because I am showing everything. In daily use, your team just enters a GST or PAN number and clicks one button. The report appears in under 5 minutes.",
        "how accurate is the data": "All data comes directly from government APIs — GST portal, PAN database, MCA registry, and authorized credit bureaus. It is the same data you would get if you checked each source manually, just faster.",
        "what about data security": "Great question. We are SOC 2 compliant, all data is encrypted, and we do not store raw government credentials. The vendor report is stored in your private workspace only.",
        "can we customize the reports": "Yes. You can set your own risk thresholds, add internal notes, and export in PDF or CSV. Enterprise plans include white-labeling.",
        "how long does implementation take": "There is no implementation. You sign up, enter a vendor number, and get a report in minutes. For API integration, most dev teams integrate in under a day.",
        "we need to think about it": "Absolutely. Your 3 free verifications are ready right now — I would suggest running your riskiest vendor through it today. Seeing your own data makes the decision much easier."
      }'::jsonb,
      'You have 3 free verifications ready to go. I suggest running your most critical vendor through it right now while everything is fresh. Shall I help you set that up?',
      null,
      'en',
      600,
      true,
      'in-sync',
      'demo'
    );

    -- C2. GST + Bank Statement Focus (Finance)
    INSERT INTO public.mkt_call_scripts (org_id, name, objective, opening, key_points, objection_handling, closing, voice_id, language, max_duration_seconds, is_active, product_key, call_type)
    VALUES (
      _org_id,
      'Demo - GST + Bank Statement Analysis',
      'Show finance-focused demo emphasizing GST compliance verification and AI-powered bank statement analysis',
      'Hi {{first_name}}, thanks for making time. I know finance teams care most about GST compliance and financial health. So today I am going to focus the demo on those two areas with real data.',
      '["Show live GST verification — enter a vendor GSTIN and see filing history, return status, compliance rating, and any defaults in real time", "Demonstrate bank statement analysis — upload a PDF and watch our AI extract revenue trends, cash flow patterns, and red flags in seconds", "Show how these two data points together reveal the full picture — a vendor may be GST compliant but cash-flow negative, or vice versa", "Walk through how finance teams use In-Sync before approving POs or during quarterly vendor reviews", "Show the export feature — one-click PDF report that attaches to your vendor file or ERP record"]'::jsonb,
      '{
        "we check GST manually on the portal": "Most finance teams do. The challenge is it takes time and you only see current status — not filing history or trends. In-Sync shows you 12 months of GST filing behavior in one click.",
        "bank statements are confidential": "We agree. In-Sync processes the statement in memory and does not retain the raw PDF. You get a structured analysis report, and the original document stays with you.",
        "how accurate is the GST data": "It comes directly from the GSTN API — the same source as the government portal. Filing history, return status, and compliance scores are all pulled in real time.",
        "we use our CA for bank statement review": "That works, but it takes time. In-Sync gives your CA team a pre-analyzed report in seconds, so they can focus on judgment calls instead of data extraction.",
        "can this integrate with Tally or SAP": "Yes. Our API lets you trigger a verification from any ERP or accounting system. We have customers using Tally, SAP, and custom ERPs.",
        "what if the vendor disputes the data": "The data comes from government sources, so it is objective. But we always recommend using it as one input alongside your existing checks."
      }'::jsonb,
      'Your 3 free verifications include full GST and bank statement analysis. Want to try one right now with a real vendor? I can walk you through it.',
      null,
      'en',
      600,
      true,
      'in-sync',
      'demo'
    );

    -- C3. Compliance + Audit Trail Focus
    INSERT INTO public.mkt_call_scripts (org_id, name, objective, opening, key_points, objection_handling, closing, voice_id, language, max_duration_seconds, is_active, product_key, call_type)
    VALUES (
      _org_id,
      'Demo - Compliance + Audit Trail',
      'Show compliance-focused demo emphasizing audit trail, risk scoring, and regulatory readiness',
      'Hi {{first_name}}, thanks for your time. I know compliance teams need more than data — they need proof that due diligence was done. So today I will focus on our audit trail and compliance features.',
      '["Show the compliance dashboard — see every vendor check across your organization with timestamps, results, and who ran each check", "Demonstrate risk scoring — each vendor gets an A to F grade based on GST compliance, credit health, financial stability, and MCA filings", "Walk through the audit trail — every check creates a tamper-proof record that is exportable as a PDF audit packet", "Show automated alerts — set rules like notify me if any vendor drops below B rating or has a GST filing gap", "Demonstrate the periodic review feature — schedule automatic re-checks on your vendor base every quarter"]'::jsonb,
      '{
        "how does this help with audits": "Auditors want to see that you verified vendors before transacting. In-Sync gives them a timestamped PDF showing exactly what was checked, when, and what the results were. No more scrambling before an audit.",
        "we already have compliance software": "In-Sync is not general compliance software — it is specifically for vendor financial due diligence. It fills the vendor risk gap that most compliance platforms do not cover.",
        "can we set custom risk thresholds": "Yes. You define what constitutes a high-risk vendor for your organization. For example, you can flag any vendor with GST filing gaps over 2 months or credit scores below a certain threshold.",
        "what regulations does this cover": "In-Sync helps with vendor KYC, GST compliance verification, and financial due diligence — all areas that come up during statutory audits, ISO audits, and SOX compliance reviews.",
        "how long are records retained": "Records are retained for the life of your account. Enterprise plans include custom retention policies and archival options.",
        "we need our legal team to review": "Absolutely. I can send our data processing agreement and security documentation so your legal team can review in parallel. That way we do not lose momentum."
      }'::jsonb,
      'I can send your legal team our security docs today. Meanwhile, would you like to run a compliance check on one of your vendors right now? Your 3 free verifications are ready.',
      null,
      'en',
      600,
      true,
      'in-sync',
      'demo'
    );

    -- C4. API Integration Focus (Tech)
    INSERT INTO public.mkt_call_scripts (org_id, name, objective, opening, key_points, objection_handling, closing, voice_id, language, max_duration_seconds, is_active, product_key, call_type)
    VALUES (
      _org_id,
      'Demo - API Integration',
      'Show technical demo of In-Sync API for CTO or dev team and drive toward sandbox integration',
      'Hi {{first_name}}, thanks for joining. I know you want to see how In-Sync fits into your tech stack. So I will skip the slides and go straight to the API and live code.',
      '["Walk through the REST API — single endpoint, pass a GSTIN or PAN, get a complete vendor health object back as JSON in under 30 seconds", "Show webhook integration — configure a callback URL and get notified when a verification completes or when a monitored vendor''s status changes", "Demonstrate the sandbox — fully functional test environment with mock data, same API structure as production", "Show error handling and rate limits — how the API handles invalid inputs, timeouts, and concurrent requests gracefully", "Walk through authentication — API key based with optional OAuth 2.0 for enterprise. Show how to rotate keys without downtime."]'::jsonb,
      '{
        "we would need to build a wrapper": "The API is designed to be simple enough that you do not need a wrapper. One endpoint, JSON in, JSON out. But if you want, we have Python and Node SDKs that handle retries and error mapping.",
        "what about rate limits": "Standard plans allow 10 concurrent requests. Enterprise plans have custom rate limits. In practice, most teams never hit the limit since verifications are not high-frequency.",
        "how do you handle downtime": "We have 99.9 percent uptime SLA on paid plans. Government APIs occasionally go down — when that happens, we return a partial result with a flag indicating which sources were unavailable, and auto-retry.",
        "what about GDPR and data residency": "All data is processed and stored in India-region servers. We do not transfer vendor data outside India. We can provide a data processing agreement for your records.",
        "latency concerns": "Average response time is under 30 seconds for a full 6-source check. Individual source checks like GST-only return in under 5 seconds. We support async mode with webhooks for batch processing.",
        "we need to evaluate other options": "Totally fair. Our sandbox is free and unlimited for testing. I suggest your dev team integrates it in a test environment — most teams have it running in under a day."
      }'::jsonb,
      'I have activated sandbox access for your team. Your dev can start testing today — the API docs have sample code in Python, Node, and cURL. Want me to schedule a 30-minute pairing session with your developer?',
      null,
      'en',
      600,
      true,
      'in-sync',
      'demo'
    );

    -- =========================================================================
    -- D. CLOSING CALLS (4 scripts — by plan/segment)
    -- =========================================================================

    -- D1. Small Team - Starter Plan
    INSERT INTO public.mkt_call_scripts (org_id, name, objective, opening, key_points, objection_handling, closing, voice_id, language, max_duration_seconds, is_active, product_key, call_type)
    VALUES (
      _org_id,
      'Closing - Starter Plan (Small Team)',
      'Close prospect on Starter plan at 2,999 rupees per quarter for small teams with up to 10 verifications per month',
      'Hi {{first_name}}, great to connect again. I wanted to follow up on your trial experience and see if we can get you set up on a plan that fits your team.',
      '["You have been using the free verifications and the feedback has been positive — the Starter plan gives you 10 verifications per month at just 2,999 rupees per quarter", "That works out to about 300 rupees per vendor check — less than the cost of a single courier pickup for document collection", "The Starter plan includes GST, PAN, credit score, and bank statement analysis — everything you have been using in the trial", "You can upgrade anytime if your volume grows. No lock-in, cancel anytime."]'::jsonb,
      '{
        "price is too high": "I understand budgets are tight. Let me put it this way — one bad vendor can cost lakhs in delays, rework, or compliance penalties. At 2,999 per quarter, In-Sync pays for itself with the first risky vendor you catch.",
        "need to check with my manager": "Of course. Would it help if I sent a one-page ROI summary your manager can review? It shows the cost comparison between manual verification and In-Sync.",
        "can we get a discount": "The quarterly pricing is already our best rate. What I can do is extend your free trial by a week so you can get more data points to justify the spend internally.",
        "we are not ready yet": "No pressure at all. Can I ask — what would need to happen for you to be ready? I want to make sure I am helpful, not pushy.",
        "we only need a few checks per month": "That is exactly what the Starter plan is for — 10 checks per month. Most small teams do not need more than that. And unused checks do not roll over, so there is no waste to worry about.",
        "let me think about it": "Absolutely. I will follow up next week. In the meantime, your free trial is still active — I would suggest running a few more checks to build confidence in the data."
      }'::jsonb,
      'Shall I set up the Starter plan for you today? It takes 2 minutes and you will have uninterrupted access to all features. I can send the payment link right now.',
      null,
      'en',
      300,
      true,
      'in-sync',
      'closing'
    );

    -- D2. Mid-size - Business Plan
    INSERT INTO public.mkt_call_scripts (org_id, name, objective, opening, key_points, objection_handling, closing, voice_id, language, max_duration_seconds, is_active, product_key, call_type)
    VALUES (
      _org_id,
      'Closing - Business Plan (Mid-size)',
      'Close prospect on Business plan at 7,499 rupees per quarter for mid-size teams with 50 verifications and advanced features',
      'Hi {{first_name}}, good to speak again. Based on your team''s usage and the volume of vendors you manage, I think the Business plan is the right fit. Let me walk you through why.',
      '["The Business plan gives you 50 verifications per month at 7,499 rupees per quarter — that is about 150 rupees per check", "You get everything in Starter plus continuous monitoring, automated alerts, bulk verification, and priority support", "Continuous monitoring means you do not have to re-check vendors manually — we alert you the moment anything changes", "Most mid-size teams see the bulk verification feature as the biggest time saver — upload 50 vendors and get all reports in one batch"]'::jsonb,
      '{
        "price is too high": "I hear you. Let me share some numbers — our Business plan customers save an average of 60 hours per month on vendor verification. At your team''s cost per hour, that is many times the subscription cost.",
        "starter plan is enough for us": "It might be today. But consider this — with continuous monitoring and alerts, you catch vendor issues between onboarding checks. That is where the Business plan really protects you.",
        "need to get budget approval": "Understood. I can send you an ROI document and a formal quote that you can submit with your budget request. Would that help speed things up?",
        "can we get a discount": "For annual billing, I can offer a 15 percent discount. That brings it down to about 6,375 per quarter. Shall I generate a quote for annual?",
        "we need to compare with competitors": "Fair enough. I would suggest running a side-by-side test — use your free verifications here and trial the other platform. Our customers consistently tell us our data coverage and speed are unmatched.",
        "can we start with starter and upgrade later": "Absolutely. You can upgrade anytime from your dashboard. Just know that you will not have continuous monitoring or bulk checks on the Starter plan, which are the features most mid-size teams need."
      }'::jsonb,
      'I can generate a formal quote and send it to you today. If approved, your team can be fully set up by tomorrow. Want me to send the quote now?',
      null,
      'en',
      300,
      true,
      'in-sync',
      'closing'
    );

    -- D3. Enterprise Plan
    INSERT INTO public.mkt_call_scripts (org_id, name, objective, opening, key_points, objection_handling, closing, voice_id, language, max_duration_seconds, is_active, product_key, call_type)
    VALUES (
      _org_id,
      'Closing - Enterprise Plan',
      'Close enterprise prospect on Enterprise plan at 14,999 rupees per quarter with custom features and dedicated support',
      'Hi {{first_name}}, thanks for your time. Your team has been evaluating In-Sync and I want to make sure the Enterprise plan covers everything you need. Let me confirm the key points.',
      '["The Enterprise plan at 14,999 rupees per quarter includes unlimited verifications, custom risk thresholds, API access, and a dedicated account manager", "You get white-label reports, custom retention policies, SSO integration, and priority SLA with 4-hour response time", "Companies like Quess Corp and Motherson are on our Enterprise plan — I can connect you with a reference if that helps", "We can customize the onboarding — dedicated training for your team, custom API integration support, and a quarterly business review"]'::jsonb,
      '{
        "price is too high": "For enterprise-scale usage, the per-check cost is actually the lowest at this tier. Plus, the dedicated support and custom integrations eliminate the hidden costs of managing vendor verification internally.",
        "need procurement approval": "Completely understand. I can prepare a full vendor package — proposal, security questionnaire, data processing agreement, and ROI analysis. What does your procurement team need specifically?",
        "can we get a custom quote": "Absolutely. If your requirements go beyond the standard Enterprise plan, we can create a custom package. Tell me more about your volume and I will work with our team on pricing.",
        "need legal review": "Of course. I will send our MSA, DPA, and security documentation today. Most legal teams complete their review within a week. We are happy to accommodate redlines.",
        "we need a POC first": "Makes sense for enterprise. We can set up a 30-day proof of concept with full Enterprise features for your team. I will define success criteria with you upfront so we have a clear go or no-go.",
        "timeline is long for us": "I understand enterprise decisions take time. Let me propose a timeline — legal review this week, POC next two weeks, decision by end of month. Does that work?"
      }'::jsonb,
      'I will prepare the full vendor package for your procurement team today. Can we schedule a call with your procurement and legal for next week to keep things moving?',
      null,
      'en',
      300,
      true,
      'in-sync',
      'closing'
    );

    -- D4. Upgrade from Free Trial
    INSERT INTO public.mkt_call_scripts (org_id, name, objective, opening, key_points, objection_handling, closing, voice_id, language, max_duration_seconds, is_active, product_key, call_type)
    VALUES (
      _org_id,
      'Closing - Free Trial Upgrade',
      'Convert free trial user to a paid plan based on their usage and needs',
      'Hi {{first_name}}, this is In-Sync. I see you have been using your free verifications. I wanted to check in — how has the experience been so far?',
      '["You have used your free verifications and the results speak for themselves — real government data, full reports, in under 5 minutes", "To keep using In-Sync, plans start at just 2,999 rupees per quarter for 10 checks per month", "Based on your usage, you might want the Business plan at 7,499 which gives you 50 checks and continuous monitoring", "If you upgrade today, there is no gap in service — your account stays active and your previous reports are preserved"]'::jsonb,
      '{
        "free tier was enough for now": "I understand. But think about the vendors you have not checked yet. The free tier gives you a taste, but the real value is checking every vendor before every major PO.",
        "price is too high": "Let me reframe it — your free checks probably revealed at least one risk or surprise. What would that risk have cost you if you had not caught it? Most teams tell us In-Sync pays for itself immediately.",
        "need to think about it": "Of course. Your free checks have shown you the data quality. What specific concern is holding you back? I might be able to address it right now.",
        "can I get more free checks": "I cannot extend the free tier, but I can offer a 7-day full-access trial on the Business plan. That way you see the premium features like continuous monitoring before you decide.",
        "will check back later": "No problem. Just know that your free reports are saved and will carry over when you upgrade. I will follow up next week to see where you land.",
        "which plan should I pick": "If you do fewer than 10 vendor checks per month, Starter at 2,999 is perfect. If you need bulk checks or continuous monitoring, Business at 7,499 is the sweet spot. Enterprise is for teams that need unlimited checks and custom features."
      }'::jsonb,
      'Based on your usage, I would recommend the {{recommended_plan}} plan. Shall I send you the payment link? It takes 2 minutes and you will have immediate access.',
      null,
      'en',
      300,
      true,
      'in-sync',
      'closing'
    );

    -- =========================================================================
    -- E. REACTIVATION CALLS (4 scripts)
    -- =========================================================================

    -- E1. Churned Customer
    INSERT INTO public.mkt_call_scripts (org_id, name, objective, opening, key_points, objection_handling, closing, voice_id, language, max_duration_seconds, is_active, product_key, call_type)
    VALUES (
      _org_id,
      'Reactivation - Churned Customer',
      'Re-engage churned customer, understand why they left, and offer a path back',
      'Hi {{first_name}}, this is In-Sync. You used to be on our platform and I noticed your subscription ended. I am not here to sell — I just wanted to understand what happened and see if there is anything we could have done better.',
      '["We genuinely want to understand your experience — your feedback helps us improve the product", "Since you left, we have added several new features including continuous monitoring, bulk verification, and a team dashboard", "Many customers who paused came back after seeing the new updates — we have improved speed by 40 percent since your last login", "If you are interested, I can reactivate your account with a 30-day free trial of the Business plan so you can see what has changed"]'::jsonb,
      '{
        "we stopped needing it": "I understand. Has your vendor verification process changed? Sometimes teams go back to manual checks and slowly feel the pain again. We are here when that happens.",
        "it was too expensive": "I hear you. Our pricing has not changed, but we have added a lot more value — continuous monitoring, bulk checks, and alerts are now included. Would a month free to re-evaluate help?",
        "we switched to a competitor": "Fair enough. Can I ask which one? Not to badmouth them, but to understand what they offered that we did not. Your feedback genuinely helps us.",
        "the product did not meet our needs": "I am sorry to hear that. Can you share what was missing? We have made significant updates and I want to know if we have addressed your concerns.",
        "too many tools already": "I understand tool fatigue. What we have heard from returning customers is that In-Sync actually replaces several manual steps and tools they were using for vendor checks.",
        "not interested in coming back": "That is completely fine. I appreciate your honesty. If anything changes in the future, we are here. Is there anything else I can help with today?"
      }'::jsonb,
      'Thank you for sharing that feedback. If you are open to it, I can reactivate your account with a free 30-day Business plan trial so you can see the improvements. No commitment. Would that be useful?',
      null,
      'en',
      240,
      true,
      'in-sync',
      'reactivation'
    );

    -- E2. Trial Expired
    INSERT INTO public.mkt_call_scripts (org_id, name, objective, opening, key_points, objection_handling, closing, voice_id, language, max_duration_seconds, is_active, product_key, call_type)
    VALUES (
      _org_id,
      'Reactivation - Trial Expired',
      'Re-engage prospect whose free trial expired without converting and understand blockers',
      'Hi {{first_name}}, this is In-Sync. You signed up for a free trial a while back. I wanted to check in — how was your experience with the verifications you ran?',
      '["You ran a few vendor checks during your trial — I hope the reports were useful and the data was what you expected", "Your trial reports are still saved in your account and will carry over if you upgrade", "Since your trial, we have improved the platform — faster results, better bank statement analysis, and a new team dashboard", "I can extend your trial with 3 more free verifications if you want to test the latest features"]'::jsonb,
      '{
        "I forgot about it": "No worries at all. Your account is still there. Would you like me to extend your trial so you can pick up where you left off? It takes 30 seconds to reactivate.",
        "did not have time to evaluate": "Totally understand. Would it help if I walked you through a live check right now? It takes 5 minutes and you will see the full value without doing any setup.",
        "it was fine but we decided not to proceed": "I appreciate the honesty. Can I ask what the deciding factor was? Your feedback helps us improve.",
        "we went with another solution": "Got it. How has that been working? If it is not a perfect fit, our door is always open. We have also added new features since your trial.",
        "the free trial was not enough to evaluate": "That is fair — 3 checks is a small sample. I can give you 3 more free verifications and a 14-day extension. That should give you enough data to make a confident decision.",
        "I will come back when we need it": "Sounds good. Just remember your existing reports are saved. When the need comes up, you can log in and you are right where you left off."
      }'::jsonb,
      'Would you like me to extend your trial with 3 more free verifications? You can test the latest features and your old reports are still there. Takes 30 seconds to reactivate.',
      null,
      'en',
      240,
      true,
      'in-sync',
      'reactivation'
    );

    -- E3. Went Silent
    INSERT INTO public.mkt_call_scripts (org_id, name, objective, opening, key_points, objection_handling, closing, voice_id, language, max_duration_seconds, is_active, product_key, call_type)
    VALUES (
      _org_id,
      'Reactivation - Went Silent',
      'Re-engage prospect who showed initial interest but stopped responding to follow-ups',
      'Hi {{first_name}}, this is In-Sync. We connected a while back about vendor due diligence and I wanted to do a quick check-in. I know things get busy — is this still on your radar?',
      '["Just a friendly follow-up — no pressure. I wanted to see if vendor verification is still something your team is thinking about", "Since we last spoke, we have added some features that might be relevant — continuous monitoring and bulk vendor checks", "A few companies in your industry recently came on board and are seeing great results. I can share their experience if helpful.", "If the timing was not right before, that is completely fine. I just want to make sure you know we are here when you need us."]'::jsonb,
      '{
        "we got busy with other priorities": "Completely understand. Is there a better time to revisit this? I can set a reminder and reach out when it makes more sense for your team.",
        "we are still evaluating": "No rush. Is there any information or a specific demo that would help speed up your evaluation? I want to be useful, not pushy.",
        "I am not the right person anymore": "Got it. Who on your team is handling vendor management now? I would love to connect with them if you are open to an intro.",
        "we decided not to move forward": "I appreciate you letting me know. Can I ask what drove the decision? Your feedback is really valuable and helps us improve.",
        "send me a reminder next quarter": "Absolutely. I will reach out in {{next_quarter}}. In the meantime, your free trial is still available if anything comes up.",
        "what has changed since we spoke": "Good question. We have added continuous vendor monitoring, bulk verification for checking 50 vendors at once, and a team dashboard. Speed has also improved by 40 percent."
      }'::jsonb,
      'I do not want to take more of your time. Would it be helpful if I sent a quick update email with what is new? And I can follow up next quarter if the timing is better.',
      null,
      'en',
      240,
      true,
      'in-sync',
      'reactivation'
    );

    -- E4. Lost to Competitor
    INSERT INTO public.mkt_call_scripts (org_id, name, objective, opening, key_points, objection_handling, closing, voice_id, language, max_duration_seconds, is_active, product_key, call_type)
    VALUES (
      _org_id,
      'Reactivation - Lost to Competitor',
      'Re-engage prospect who chose a competing solution and understand competitive gaps',
      'Hi {{first_name}}, this is In-Sync. I know you went with another vendor verification solution. I am not here to change your mind — I just wanted to check in and see how it has been working out.',
      '["This is genuinely a learning call for us. Understanding what made you choose them helps us build a better product.", "Since you evaluated us, we have made significant improvements — 40 percent faster checks, continuous monitoring, and bulk verification", "Some teams that chose other solutions have come back to us after experiencing data gaps or slow response times. Happy to share what they told us.", "If you are ever open to a fresh comparison, we can set up a side-by-side test with no commitment"]'::jsonb,
      '{
        "we are happy with our current solution": "That is great to hear. I am glad you found something that works. If anything changes or you want to benchmark, we are always here for a comparison.",
        "the other solution was cheaper": "Price is important. What we hear from teams that come back is that data coverage and accuracy matter more over time. But if it is working for you, that is what counts.",
        "they had a feature you did not": "Interesting — can you share which feature? We are constantly building based on market feedback and I want to make sure we are not missing something important.",
        "we already signed a contract": "Understood. When does your contract come up for renewal? I would love to reconnect before then so you can evaluate your options with fresh data.",
        "no interest in switching": "Completely fair. I appreciate your time. If you ever want a second opinion on a vendor check, our free trial is always available. No strings attached.",
        "the transition was painful and we do not want to switch again": "I totally get that. Switching tools is disruptive. If you ever do consider a change, we offer full migration support and dedicated onboarding to make it painless."
      }'::jsonb,
      'I appreciate your honesty. If your contract comes up for renewal and you want a fresh comparison, I am here. Can I send you a quick update on what we have built since you last looked?',
      null,
      'en',
      240,
      true,
      'in-sync',
      'reactivation'
    );

  END LOOP;
END $$;
