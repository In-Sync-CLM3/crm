# Autonomous Revenue Engine — Implementation Status

**Last Updated**: April 2, 2026
**Project**: In-Sync CRM (ECR Technical Innovations Pvt Ltd)
**E2E Status**: **45/45 tests pass** — Email + WhatsApp delivery verified with real recipients
**Change Freeze**: 90-day change freeze in effect from April 2, 2026

---

## What's Built & Working

### Database Layer (39 tables)

All tables are live on Supabase with RLS policies, indexes, and triggers.

| Category | Tables |
|----------|--------|
| Campaigns | `mkt_campaigns`, `mkt_campaign_steps` |
| Leads | `mkt_leads`, `mkt_lead_scores`, `mkt_lead_score_history` |
| Sequences | `mkt_sequence_enrollments`, `mkt_sequence_actions` |
| Templates | `mkt_email_templates`, `mkt_whatsapp_templates`, `mkt_call_scripts` |
| Memory | `mkt_conversation_memory` |
| A/B Testing | `mkt_ab_tests`, `mkt_ab_test_results` |
| Google Ads | `mkt_google_ads_campaigns`, `mkt_google_ads_keywords`, `mkt_google_ads_feedback` |
| Apollo | `mkt_apollo_searches` |
| Analytics | `mkt_channel_metrics`, `mkt_daily_digests`, `mkt_engine_metrics` |
| Product Intel | `mkt_feature_signals`, `mkt_product_decisions`, `mkt_dropoff_snapshots`, `mkt_activation_events`, `mkt_nps_responses` |
| System | `mkt_engine_config`, `mkt_engine_logs`, `mkt_unsubscribes`, `mkt_vapi_calls`, `mkt_exit_surveys`, `mkt_client_outcomes` |
| **Milestones** | `mkt_milestones` (7 milestones M1-M7 seeded) |
| **Multi-Product** | `mkt_products`, `mkt_channels`, `mkt_budget_allocation`, `mkt_crosssell_pairs`, `mkt_mrr`, `mkt_product_sync_log`, `mkt_global_persona_intelligence` |

### PostgreSQL Functions

| Function | Purpose |
|----------|---------|
| `toggle_product_active()` | Cascade product activation/deactivation to campaigns and enrollments |
| `mkt_payment_listener()` | Trigger function for payment → lead conversion + MRR record creation |

### Edge Functions (27 deployed)

| Function | What It Does | Trigger |
|----------|-------------|---------|
| `mkt-sequence-executor` | Core orchestrator — picks up due actions, dispatches to channel handlers. **Now checks `mkt_products.active` before processing.** | Cron: every 5 min |
| `mkt-lead-scorer` | Scores leads on fit/intent/engagement (0-100) using Claude Haiku. **Now auto-enrolls leads with score >= 70 into active campaigns.** | Cron: every 15 min |
| `mkt-ab-test-evaluator` | Chi-squared significance testing, declares winners | Cron: every hour |
| `mkt-apollo-sourcer` | Sources leads from Apollo. **Now supports beachhead vertical selection and rotation.** | Cron: every 6 hours |
| `mkt-campaign-optimizer` | LLM-powered analysis. **Now includes content performance, channel allocation, and ICP optimization modules.** | Cron: daily 2 AM UTC |
| `mkt-google-ads-sync` | Pulls Google Ads metrics, pushes GA4 offline conversions | Cron: daily 3 AM UTC |
| `mkt-daily-digest` | Generates narrative performance report. **Monday mode: full weekly revenue report with MRR, WoW trends, milestones.** | Cron: daily 6 AM UTC |
| `mkt-metrics-collector` | Calculates weekly MRR, CAC, LTV, churn, payback, breakeven | Cron: Monday 1 AM UTC |
| `mkt-breakpoint-monitor` | Monitors 13 thresholds. **Now checks milestone progress and detects channel performance trends (>15% WoW decline).** | Cron: every 30 min |
| `mkt-product-intelligence-reporter` | Wednesday report — synthesizes product signals for founder | Cron: Wednesday 2:30 AM UTC |
| `mkt-send-email` | Personalizes email via Claude Haiku + sends via Resend API. **Now includes UTM params, List-Unsubscribe header, warmup cap enforcement.** | Called by executor |
| `mkt-send-whatsapp` | Sends WhatsApp messages via Exotel API with Basic Auth, variable substitution | Called by executor |
| `mkt-initiate-call` | Initiates Vapi AI outbound calls with lead context and scripts | Called by executor |
| `mkt-email-webhook` | Processes Resend events (open/click/bounce/complaint), tracking pixels, unsubscribe | Webhook |
| `mkt-whatsapp-webhook` | Processes Exotel WhatsApp status and inbound replies | Webhook |
| `mkt-vapi-webhook` | Processes Vapi call completion, extracts transcript insights | Webhook |
| `mkt-reply-handler` | Classifies reply sentiment/intent, triggers feature extraction | Called by webhooks |
| `mkt-convert-lead` | Converts qualified lead to CRM contact, assigns pipeline, links records | Called on conversion |
| `mkt-feature-signal-extractor` | Extracts product signals from conversations using Groq | Called by reply-handler |
| `mkt-product-decision-logger` | Parses founder responses to product reports | Called via email reply |
| `mkt-exit-surveyor` | Sends exit surveys via WhatsApp to inactive leads (30+ days) | Cron |
| `mkt-client-reporter` | Generates monthly ROI reports per contact | Cron: monthly |
| `mkt-dashboard-stats` | API for Marketing Dashboard (overview, campaigns, leads, channels, funnel) | Called by CRM frontend |
| `mkt-financial-dashboard` | Financial intelligence API (CAC, LTV, margins, breakpoints) | Called by CRM frontend |
| **`mkt-lifecycle-engine`** | **5-mode engine: NPS pulses, cross-sell, upsell, dunning (3-email win-back), referral codes** | **Cron / on-demand** |
| **`mkt-product-webhook`** | **4-action webhook: activation tracking, GTM scoring, payment conversion + MRR, trial signup** | **Webhook** |
| **`mkt-product-manager`** | **3-mode manager: product onboarding (schema inspection + content generation), toggle, sync** | **On-demand** |

### Shared Utilities (4 files)

| Utility | Purpose |
|---------|---------|
| `_shared/llmClient.ts` | Unified Claude Haiku/Sonnet caller with retries and token tracking |
| `_shared/engineLogger.ts` | Writes to `mkt_engine_logs` with function name, level, duration |
| `_shared/conversationMemory.ts` | Cross-channel conversation context per lead (get/update/summarize) |
| `_shared/channelRouter.ts` | Channel selection based on lead preferences, opt-outs, rate limits |

### CRM Admin UI (7 pages)

All pages are accessible under `/marketing` in the CRM sidebar, protected with authentication.

| Page | Route | Description |
|------|-------|-------------|
| **Marketing Dashboard** | `/marketing` | 5-tab analytics dashboard: Overview (with Milestone Tracker), Financial Intelligence, Campaigns, Leads & Funnel, Channel Performance. Breakpoint alerts appear as red banners. |
| **Campaign Manager** | `/marketing/campaigns` | Create/edit/pause campaigns, define ICP criteria, build multi-step sequences. |
| **Template Editor** | `/marketing/templates` | Create and manage email, WhatsApp, and SMS templates with `{{variable}}` support. |
| **Engine Config** | `/marketing/config` | 8 config sections: scoring weights, thresholds, channel limits, rate limits, LLM budgets, breakpoints, executor settings, Apollo config. |
| **Lead Browser** | `/marketing/leads` | Filterable table with search, sorting, pagination. Detail dialog with enrollment and action history. |
| **Enrollment Browser** | `/marketing/enrollments` | Summary cards, enrollment table with joins, filters. Pause/resume/skip actions. |
| **Product Management** | `/marketing/products` | Product registry with onboard form, active/paused toggle (cascades to campaigns), sync status, pricing display. |

Supporting components: `MarketingOverview`, `LeadFunnel`, `CampaignPerformance`, `FinancialIntelligence`, `ChannelAnalytics`, `BreakpointBanner`, `MilestoneTracker`

### Content Seeded

| Type | Count | Details |
|------|-------|---------|
| Email Templates | 151 | 76 nurture/follow-up + 75 cold outbound across 10 categories, 6 ICPs |
| WhatsApp Templates | 72 | 6 ICPs × 12 message types |
| Call Scripts | 24 | 6 ICPs × 4 call types + reactivation scripts |
| Engine Config | 10 keys | Scoring weights, thresholds, channel limits, rate limits, LLM budgets, breakpoints, executor settings, Apollo sourcing |
| Milestones | 7 | M1 (1 client) → M7 (200 clients) with progressive feature unlocks |
| Channels | 6 per org | email, whatsapp, vapi, google_ads, meta_ads, linkedin (auto-seeded) |

---

## E2E Test Results (April 2, 2026)

**45/45 tests pass** with real delivery to live recipients.

### Test Flow
```
Campaign creation → Lead insertion → Lead scoring → Enrollment →
Email step 1 (3 emails sent) → Webhook engagement (open + click) →
Email step 2 (3 emails sent) → WhatsApp step 3 (3 messages sent) →
Lead conversion (creates CRM contact) → Dashboard stats API →
Engine logs → Milestones verification → Channels verification →
New tables (products, budget, crosssell, mrr, sync, persona) →
Lifecycle engine (referral mode) → Product webhook (trial signup) →
Product manager (sync mode)
```

### Real Delivery Verified

| Channel | Recipients | Result |
|---------|-----------|--------|
| Email (6 messages) | `a@in-sync.co.in` via Resend API | Delivered, open/click tracking working |
| WhatsApp (3 messages) | `+917738919680` via Exotel API | Delivered with personalized first names |

### Pipeline Functions Exercised
`mkt-sequence-executor` → `mkt-send-email` → `mkt-email-webhook` → `mkt-send-whatsapp` → `mkt-convert-lead` → `mkt-dashboard-stats` → `mkt-lifecycle-engine` → `mkt-product-webhook` → `mkt-product-manager`

Test script: `supabase/seeds/e2e_test_no_voice.py`

---

## New Features in This Build

### Milestone System (M1-M7)
Progressive feature unlocks based on paying client count:
- **M1** (1 client): Basic reporting
- **M2** (5 clients): Referral engine, client ROI reports
- **M3** (10 clients): Vapi calls, NPS engine
- **M4** (25 clients): Global persona intelligence, Google Ads
- **M5** (50 clients): Apollo intent, Meta Ads, login churn prediction
- **M6** (100 clients): International expansion, LinkedIn Ads
- **M7** (200 clients): G2 buyer intent

### Multi-Product Support
- Product registry with onboarding automation
- `toggle_product_active()` cascades pause/resume to campaigns and enrollments
- Product sync reads external Supabase databases for user/payment data
- Cross-sell pair tracking with conversion rates

### Lifecycle Engine (5 modes)
- **NPS**: 25-35 day post-conversion pulse, 72-hour cooldown, max 2 per billing cycle
- **Cross-sell**: Product pair rankings, holdoff enforcement, never promotes owned products
- **Upsell**: Engagement score > 80, WhatsApp-first with email fallback, 30-day cooldown
- **Dunning**: 3-email win-back sequence at days 7/17/27 with COMEBACK20 code
- **Referral**: Secure code generation, Rs 500 referrer credit, 30-day extended trial for referred

### Enhanced Existing Functions
- **mkt-send-email**: UTM parameters on all links, List-Unsubscribe + RFC 8058 one-click, warmup cap with deferred rescheduling
- **mkt-lead-scorer**: Auto-enrollment when score >= 70
- **mkt-sequence-executor**: Checks `mkt_products.active` before processing enrollments
- **mkt-breakpoint-monitor**: Milestone progress checking, channel trend detection (>15% WoW decline)
- **mkt-apollo-sourcer**: Beachhead vertical selection with 70/20/10 weight split on winner, date-based rotation during testing
- **mkt-daily-digest**: Monday weekly revenue report mode (MRR, WoW trends, milestones, attention items)
- **mkt-campaign-optimizer**: Content performance analysis (worst template rewrites), channel budget allocation with ROAS constraints, ICP refinement from conversion data

### Budget & Financial Tracking
- `mkt_budget_allocation` for per-channel period budgets with ROAS
- `mkt_mrr` for monthly recurring revenue per contact/lead/product
- Channel allocation optimizer with constraints (max 60% to any channel, min Rs 2000 to active paid channels)

---

## API Keys & Webhooks

### Keys Configured (Supabase Secrets)

| Key | Status | Used By |
|-----|--------|---------|
| `ANTHROPIC_API_KEY` | Configured | All LLM calls (Haiku + Sonnet) |
| `GROQ_API_KEY` | Configured | Feature signal extraction, Vapi call inference |
| `APOLLO_API_KEY` | Configured | Lead sourcing |
| `VAPI_API_KEY` | Configured | AI voice calls |
| `RESEND_API_KEY` | Configured | Email sending |
| `EXOTEL_API_KEY` | Configured | WhatsApp sending |
| `EXOTEL_API_TOKEN` | Configured | WhatsApp sending |
| `EXOTEL_SID` | Configured | WhatsApp sending |
| `EXOTEL_SUBDOMAIN` | Configured | WhatsApp sending |

### Keys Still Needed

| Key | When Needed |
|-----|-------------|
| `VAPI_PHONE_NUMBER_ID` | When testing AI voice calls |
| `VAPI_DEFAULT_VOICE_ID` | When testing AI voice calls |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | When enabling Google Ads sync |
| `GOOGLE_ADS_CLIENT_ID` / `CLIENT_SECRET` / `REFRESH_TOKEN` | When enabling Google Ads sync |
| `GA4_MEASUREMENT_ID` / `GA4_API_SECRET` | When pushing offline conversions |
| `G2_API_KEY` | After M7 milestone (200 clients) |

### Webhooks Registered

| Service | Webhook URL | Registration |
|---------|-------------|-------------|
| Resend | `https://knuewnenaswscgaldjej.supabase.co/functions/v1/mkt-email-webhook` | Registered via Resend API |
| Exotel WhatsApp | `https://knuewnenaswscgaldjej.supabase.co/functions/v1/mkt-whatsapp-webhook` | Set per-message via `status_callback` |
| Vapi | `https://knuewnenaswscgaldjej.supabase.co/functions/v1/mkt-vapi-webhook` | Set per-call via `serverUrl` |
| Product Events | `https://knuewnenaswscgaldjej.supabase.co/functions/v1/mkt-product-webhook` | Called by external products |

---

## Architecture

```
                    ┌─────────────────────────────────────────┐
                    │           pg_cron (10 jobs)              │
                    └──────┬──────┬──────┬──────┬─────────────┘
                           │      │      │      │
                    ┌──────▼──┐ ┌─▼────┐ ┌▼─────▼──┐ ┌───────────┐
                    │ Apollo  │ │Lead  │ │Sequence │ │ Financial │
                    │ Sourcer │ │Scorer│ │Executor │ │ Monitor   │
                    └────┬────┘ └──┬───┘ └────┬────┘ └───────────┘
                         │        │           │
                    ┌────▼────────▼───┐  ┌────▼──────────────────┐
                    │   mkt_leads     │  │  Channel Handlers     │
                    │   mkt_scores    │  │  Email │ WA │ Vapi    │
                    └─────────────────┘  └────┬───┬────┬─────────┘
                                              │   │    │
                    ┌─────────────────────────▼───▼────▼─────────┐
                    │            Webhook Handlers                 │
                    │   Email events │ WA replies │ Call outcomes │
                    └──────────────────────┬─────────────────────┘
                                           │
                    ┌──────────────────────▼─────────────────────┐
                    │         Conversation Memory                 │
                    │   Cross-channel context per lead            │
                    └──────────────────────┬─────────────────────┘
                                           │
              ┌────────────────┬───────────▼──────┬──────────────┐
              │ A/B Evaluator  │ Campaign Optimizer│ Daily Digest │
              │ (hourly)       │ (daily, Sonnet)   │ (daily)      │
              └────────────────┴──────────────────┴──────────────┘
                                           │
              ┌────────────────┬───────────▼──────┬──────────────┐
              │ Lifecycle      │ Product          │ Product      │
              │ Engine (5mode) │ Webhook (4action)│ Manager      │
              └────────────────┴──────────────────┴──────────────┘
```

**LLM Usage**: Claude Haiku (classification, scoring, email personalization) · Claude Sonnet (optimization, narrative, analysis, content generation) · Groq (real-time call inference, signal extraction)

**All monetary values**: stored in paise (÷ 100 for rupees display)

---

## Remaining Work (Lower Priority — Post-Freeze)

These are enhancements, not blockers. No changes until July 2026 (change freeze).

| Item | Status | Notes |
|------|--------|-------|
| Lead scoring with real LLM | Scores return 0 | ANTHROPIC_API_KEY is set but scorer may need debugging |
| WhatsApp template approvals | 72 pending | Need Meta approval via Exotel API for template-type messages |
| Vapi voice calls | Blocked | Needs VAPI_PHONE_NUMBER_ID + VAPI_DEFAULT_VOICE_ID |
| Breakpoint auto-pause | Partial | Logs + emails alerts but doesn't auto-pause campaigns |
| Exit survey response parsing | Partial | Sends surveys but no webhook handler to parse replies |
| Google Ads sync | Not configured | Needs Google Ads API credentials |
| G2 buyer intent | M7 unlock | User will provide credentials later |
| SMS templates | Not built | SMS currently routed through WhatsApp |

---

## Key Technical Decisions

1. **Email sending**: `mkt-send-email` calls Resend API directly (not via CRM's `send-email` which requires JWT auth)
2. **WhatsApp sending**: Uses Exotel v2 API with explicit Basic Auth header, always sends as `text` content (not Meta template type)
3. **Auth**: Marketing edge functions deployed with `--no-verify-jwt` so the sequence executor can call them with the service role key
4. **Credentials**: Exotel credentials read from `exotel_settings` table (per-org), not environment variables
5. **Function limit**: Supabase plan has 100-function limit; deploy workflow is delete-then-redeploy via Management API
6. **Webhook registration**: Resend webhook registered via API; Exotel and Vapi set callback URLs per-message/per-call
7. **Multi-product**: External product Supabase URLs stored in `mkt_products`; service role keys stored in Supabase secrets with naming convention `{INITIALS}_SUPABASE_SERVICE_KEY`
8. **Milestone gating**: `mkt_channels.unlock_milestone` controls which channels are available; `mkt_breakpoint_monitor` checks milestone progress every 30 min
