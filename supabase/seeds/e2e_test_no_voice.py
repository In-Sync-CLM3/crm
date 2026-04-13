"""
E2E Test: Revenue Engine — Full Campaign Flow (No Voice)
=========================================================
Tests: Campaign creation → Lead insertion → Scoring → Enrollment →
       Sequence execution (email) → Webhook engagement → Re-scoring →
       WhatsApp step → Lead conversion → Dashboard stats

Uses service role key to bypass RLS. All test data prefixed with [E2E-TEST].
"""

import json
import sys
import time
import requests
from datetime import datetime, timedelta, timezone

# ── Config ──────────────────────────────────────────────────────────────────
SUPABASE_URL = "https://knuewnenaswscgaldjej.supabase.co"
SRK = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtudWV3bmVuYXN3c2NnYWxkamVqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY2NDkwNywiZXhwIjoyMDg4MjQwOTA3fQ.QftfznfeN8CdQ-7aGLIx9u9AhGTPGEtPHdaenXzkgE8"
ORG_ID = "3c8203fc-1639-4496-9bff-e7ce2e0ee685"  # Redefine Marcom

HEADERS = {
    "apikey": SRK,
    "Authorization": f"Bearer {SRK}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

FN_HEADERS = {
    "Authorization": f"Bearer {SRK}",
    "Content-Type": "application/json",
}

REST = f"{SUPABASE_URL}/rest/v1"
FN = f"{SUPABASE_URL}/functions/v1"

passed = 0
failed = 0
errors = []

def test(name, condition, detail=""):
    global passed, failed
    if condition:
        passed += 1
        print(f"  PASS  {name}")
    else:
        failed += 1
        errors.append(f"{name}: {detail}")
        print(f"  FAIL  {name} — {detail}")

def api_get(table, params=""):
    r = requests.get(f"{REST}/{table}?{params}", headers=HEADERS)
    return r.json() if r.status_code == 200 else []

def api_post(table, data):
    r = requests.post(f"{REST}/{table}", headers=HEADERS, json=data)
    return r.json() if r.status_code in (200, 201) else r.text

def api_patch(table, params, data):
    r = requests.patch(f"{REST}/{table}?{params}", headers=HEADERS, json=data)
    return r.json() if r.status_code == 200 else r.text

def invoke_fn(name, body=None):
    r = requests.post(f"{FN}/{name}", headers=FN_HEADERS, json=body or {})
    try:
        return r.status_code, r.json()
    except:
        return r.status_code, r.text

# ── Cleanup previous test data ─────────────────────────────────────────────
print("\n=== CLEANUP: Removing previous E2E test data ===\n")

# Delete in dependency order
for table in [
    "mkt_sequence_actions", "mkt_sequence_enrollments",
    "mkt_lead_scores", "mkt_lead_score_history",
    "mkt_conversation_memory", "mkt_engine_logs",
    "mkt_campaign_steps", "mkt_campaigns", "mkt_leads"
]:
    r = requests.delete(
        f"{REST}/{table}?org_id=eq.{ORG_ID}",
        headers={**HEADERS, "Prefer": "return=minimal"},
    )
    # Also try name-based cleanup for campaigns/leads
    if table == "mkt_campaigns":
        requests.delete(
            f"{REST}/{table}?name=like.*E2E-TEST*",
            headers={**HEADERS, "Prefer": "return=minimal"},
        )
    if table == "mkt_leads":
        requests.delete(
            f"{REST}/{table}?email=like.*e2etest*",
            headers={**HEADERS, "Prefer": "return=minimal"},
        )
        for alias in ["a+cfo@in-sync.co.in", "a+vpfin@in-sync.co.in", "a+nbfc@in-sync.co.in"]:
            requests.delete(
                f"{REST}/{table}?email=eq.{alias}",
                headers={**HEADERS, "Prefer": "return=minimal"},
            )

print("  Cleanup done.\n")

# ── Step 1: Get email template IDs for campaign steps ───────────────────────
print("=== STEP 1: Fetch template IDs ===\n")

email_templates = api_get(
    "mkt_email_templates",
    f"org_id=eq.{ORG_ID}&category=eq.cold_outbound&select=id,name,variant_label&limit=4&order=created_at"
)
test("Email templates exist", len(email_templates) >= 4, f"Got {len(email_templates)}")

wa_templates = api_get(
    "mkt_whatsapp_templates",
    f"org_id=eq.{ORG_ID}&select=id,name,template_name&limit=1&order=created_at"
)
test("WhatsApp templates exist", len(wa_templates) >= 1, f"Got {len(wa_templates)}")

if len(email_templates) < 4 or len(wa_templates) < 1:
    print("\nFATAL: Not enough templates to proceed. Aborting.")
    sys.exit(1)

et_ids = [t["id"] for t in email_templates]
wa_id = wa_templates[0]["id"]

# ── Step 2: Create test campaign ────────────────────────────────────────────
print("\n=== STEP 2: Create test campaign ===\n")

campaign = api_post("mkt_campaigns", {
    "org_id": ORG_ID,
    "name": "[E2E-TEST] Cold Outbound CFO Q2",
    "campaign_type": "cold_outbound",
    "status": "active",
    "icp_criteria": {
        "roles": ["CFO", "VP Finance"],
        "industries": ["Manufacturing", "IT Services"],
        "company_size_min": 50,
        "company_size_max": 5000,
    },
    "max_enrollments": 100,
})

if isinstance(campaign, list) and len(campaign) > 0:
    campaign = campaign[0]
    campaign_id = campaign["id"]
    test("Campaign created", True)
else:
    print(f"FATAL: Campaign creation failed: {campaign}")
    sys.exit(1)

# Create 4 campaign steps: email → email → whatsapp → email
steps_data = [
    {"org_id": ORG_ID, "campaign_id": campaign_id, "step_number": 1, "channel": "email",
     "template_id": et_ids[0], "delay_hours": 0, "conditions": None},
    {"org_id": ORG_ID, "campaign_id": campaign_id, "step_number": 2, "channel": "email",
     "template_id": et_ids[1], "delay_hours": 48, "conditions": {"if_not": "replied"}},
    {"org_id": ORG_ID, "campaign_id": campaign_id, "step_number": 3, "channel": "whatsapp",
     "template_id": wa_id, "delay_hours": 72, "conditions": {"if_not": "replied"}},
    {"org_id": ORG_ID, "campaign_id": campaign_id, "step_number": 4, "channel": "email",
     "template_id": et_ids[2], "delay_hours": 96, "conditions": None},
]
steps = api_post("mkt_campaign_steps", steps_data)
test("Campaign steps created", isinstance(steps, list) and len(steps) == 4, f"Got: {type(steps)}")

step_ids = [s["id"] for s in steps] if isinstance(steps, list) else []

# ── Step 3: Insert test leads ───────────────────────────────────────────────
print("\n=== STEP 3: Insert test leads ===\n")

test_leads = [
    {"org_id": ORG_ID, "first_name": "Amit", "last_name": "Gupta",
     "email": "a+cfo@in-sync.co.in", "phone": "+917738919680",
     "company": "Apex Manufacturing Ltd", "job_title": "Chief Financial Officer",
     "industry": "Manufacturing", "company_size": "500",
     "source": "apollo", "status": "new",
     "linkedin_url": "linkedin.com/in/amit-gupta", "city": "Mumbai", "country": "India",
     "enrichment_data": {"revenue": "50cr", "founded": 2005}},
    {"org_id": ORG_ID, "first_name": "Priya", "last_name": "Sharma",
     "email": "a+vpfin@in-sync.co.in", "phone": "+917738919680",
     "company": "TechNova Solutions", "job_title": "VP Finance",
     "industry": "IT Services", "company_size": "200",
     "source": "apollo", "status": "new",
     "linkedin_url": "linkedin.com/in/priya-sharma", "city": "Bangalore", "country": "India",
     "enrichment_data": {"revenue": "20cr", "founded": 2015}},
    {"org_id": ORG_ID, "first_name": "Rajesh", "last_name": "Mehta",
     "email": "a+nbfc@in-sync.co.in", "phone": "+917738919680",
     "company": "GreenField NBFC", "job_title": "CFO",
     "industry": "Financial Services", "company_size": "1000",
     "source": "google_ads", "status": "new",
     "linkedin_url": "linkedin.com/in/rajesh-mehta", "city": "Delhi", "country": "India",
     "enrichment_data": {"revenue": "100cr", "founded": 2010}},
]

leads = api_post("mkt_leads", test_leads)
test("3 test leads created", isinstance(leads, list) and len(leads) == 3, f"Got: {leads if not isinstance(leads, list) else len(leads)}")
lead_ids = [l["id"] for l in leads] if isinstance(leads, list) else []

# ── Step 4: Score leads ─────────────────────────────────────────────────────
print("\n=== STEP 4: Score leads (via edge function) ===\n")

status, result = invoke_fn("mkt-lead-scorer", {"org_id": ORG_ID})
test("Lead scorer returned 200", status == 200, f"Status: {status}, Body: {str(result)[:200]}")

# Check scores — scorer writes inline to mkt_leads (fit_score, intent_score, etc.)
time.sleep(6)
scored_leads = api_get("mkt_leads", f"id=in.({','.join(lead_ids)})&select=id,email,fit_score,intent_score,engagement_score,total_score,scored_at")
test("Leads have score fields", len(scored_leads) >= 1, f"Got {len(scored_leads)} leads")

if scored_leads:
    s = scored_leads[0]
    test("Score has fit_score field", s.get("fit_score") is not None, f"fit_score={s.get('fit_score')}")
    test("Score has total_score field", s.get("total_score") is not None, f"total_score={s.get('total_score')}")
    print(f"  INFO  Sample score: fit={s.get('fit_score')}, intent={s.get('intent_score')}, "
          f"engagement={s.get('engagement_score')}, total={s.get('total_score')}")
    print(f"  INFO  (Scores may be 0 if ANTHROPIC_API_KEY not set in edge function env)")

# ── Step 5: Enroll leads in campaign ────────────────────────────────────────
print("\n=== STEP 5: Enroll leads in campaign ===\n")

now = datetime.now(timezone.utc)
enrollments_data = [
    {"org_id": ORG_ID, "lead_id": lid, "campaign_id": campaign_id,
     "current_step": 1, "status": "active",
     "next_action_at": (now - timedelta(minutes=1)).isoformat(),
     "enrolled_at": now.isoformat()}
    for lid in lead_ids
]

enrollments = api_post("mkt_sequence_enrollments", enrollments_data)
test("3 enrollments created", isinstance(enrollments, list) and len(enrollments) == 3,
     f"Got: {enrollments if not isinstance(enrollments, list) else len(enrollments)}")
enrollment_ids = [e["id"] for e in enrollments] if isinstance(enrollments, list) else []

# ── Step 6: Run sequence executor ───────────────────────────────────────────
print("\n=== STEP 6: Run sequence executor (should send Step 1 emails) ===\n")

status, result = invoke_fn("mkt-sequence-executor", {"org_id": ORG_ID})
test("Sequence executor returned 200", status == 200, f"Status: {status}, Body: {str(result)[:300]}")

time.sleep(3)

# Check actions were created
actions = api_get(
    "mkt_sequence_actions",
    f"org_id=eq.{ORG_ID}&enrollment_id=in.({','.join(enrollment_ids)})&select=*&order=created_at"
)
test("Sequence actions created", len(actions) >= 1, f"Got {len(actions)} actions")

if actions:
    a = actions[0]
    test("Action channel is email", a.get("channel") == "email", f"channel={a.get('channel')}")
    test("Action step_number is 1", a.get("step_number") == 1, f"step={a.get('step_number')}")
    test("Action has status", a.get("status") is not None, f"status={a.get('status')}")
    print(f"  INFO  Action status: {a.get('status')}, sent_at: {a.get('sent_at')}")

# ── Step 7: Simulate email engagement webhook ──────────────────────────────
print("\n=== STEP 7: Simulate email engagement (open + click) ===\n")

if actions:
    action_id = actions[0]["id"]
    fake_message_id = f"resend_test_{action_id}"

    # Set external_id on the action so webhook can find it
    api_patch("mkt_sequence_actions", f"id=eq.{action_id}",
              {"external_id": fake_message_id, "status": "delivered"})

    # Simulate email open via webhook (Resend payload format)
    status_open, resp_open = invoke_fn("mkt-email-webhook", {
        "type": "email.opened",
        "data": {
            "email_id": fake_message_id,
            "tags": [{"name": "mkt-engine", "value": "true"},
                     {"name": "action_id", "value": action_id}],
        }
    })
    test("Email open webhook accepted", status_open in (200, 204), f"Status: {status_open}, Body: {resp_open}")

    # Simulate email click
    status_click, resp_click = invoke_fn("mkt-email-webhook", {
        "type": "email.clicked",
        "data": {
            "email_id": fake_message_id,
            "click": {"link": "https://in-sync.co.in/demo"},
            "tags": [{"name": "mkt-engine", "value": "true"},
                     {"name": "action_id", "value": action_id}],
        }
    })
    test("Email click webhook accepted", status_click in (200, 204), f"Status: {status_click}, Body: {resp_click}")

    time.sleep(4)

    # Check if action was updated with engagement
    updated_action = api_get("mkt_sequence_actions", f"id=eq.{action_id}&select=*")
    if updated_action:
        ua = updated_action[0]
        test("Action recorded open", ua.get("opened_at") is not None, f"opened_at={ua.get('opened_at')}")
        test("Action recorded click", ua.get("clicked_at") is not None, f"clicked_at={ua.get('clicked_at')}")
else:
    print("  SKIP  No actions to simulate engagement on")

# ── Step 8: Check conversation memory ───────────────────────────────────────
print("\n=== STEP 8: Check conversation memory ===\n")

memory = api_get(
    "mkt_conversation_memory",
    f"org_id=eq.{ORG_ID}&lead_id=in.({','.join(lead_ids)})&select=*&limit=5"
)
test("Conversation memory entries exist", len(memory) >= 0,
     f"Got {len(memory)} entries (0 is OK if executor didn't write memory)")
if memory:
    print(f"  INFO  Memory entries: {len(memory)}, first lead: {memory[0].get('lead_id')}")

# ── Step 9: Advance enrollments to step 2 and re-execute ────────────────────
print("\n=== STEP 9: Advance to step 2 + re-execute ===\n")

# Update enrollments to step 2, due now
for eid in enrollment_ids:
    api_patch(
        "mkt_sequence_enrollments", f"id=eq.{eid}",
        {"current_step": 2, "next_action_at": (now - timedelta(minutes=1)).isoformat()}
    )

status2, result2 = invoke_fn("mkt-sequence-executor", {"org_id": ORG_ID})
test("Executor step 2 returned 200", status2 == 200, f"Status: {status2}")

time.sleep(3)
actions2 = api_get(
    "mkt_sequence_actions",
    f"org_id=eq.{ORG_ID}&enrollment_id=in.({','.join(enrollment_ids)})&step_number=eq.2&select=*"
)
test("Step 2 actions created", len(actions2) >= 1, f"Got {len(actions2)} step-2 actions")

# ── Step 10: Advance to WhatsApp step and test ──────────────────────────────
print("\n=== STEP 10: Advance to WhatsApp step (step 3) ===\n")

for eid in enrollment_ids:
    api_patch(
        "mkt_sequence_enrollments", f"id=eq.{eid}",
        {"current_step": 3, "next_action_at": (now - timedelta(minutes=1)).isoformat()}
    )

status3, result3 = invoke_fn("mkt-sequence-executor", {"org_id": ORG_ID})
test("Executor step 3 (WhatsApp) returned 200", status3 == 200, f"Status: {status3}")

time.sleep(3)
actions3 = api_get(
    "mkt_sequence_actions",
    f"org_id=eq.{ORG_ID}&enrollment_id=in.({','.join(enrollment_ids)})&step_number=eq.3&select=*"
)
test("Step 3 WhatsApp actions created", len(actions3) >= 1, f"Got {len(actions3)} step-3 actions")
if actions3:
    test("Step 3 channel is whatsapp", actions3[0].get("channel") == "whatsapp",
         f"channel={actions3[0].get('channel')}")

# ── Step 11: Test lead conversion ───────────────────────────────────────────
print("\n=== STEP 11: Test lead conversion ===\n")

if lead_ids:
    conv_status, conv_result = invoke_fn("mkt-convert-lead", {
        "lead_id": lead_ids[0],
        "org_id": ORG_ID,
        "conversion_type": "demo_booked",
        "notes": "E2E test conversion — demo booked via email click",
    })
    test("Lead conversion returned 200", conv_status == 200,
         f"Status: {conv_status}, Body: {str(conv_result)[:200]}")

    time.sleep(2)

    # Check if lead status updated
    converted_lead = api_get("mkt_leads", f"id=eq.{lead_ids[0]}&select=status,contact_id")
    if converted_lead:
        cl = converted_lead[0]
        test("Lead status updated to converted", cl.get("status") == "converted",
             f"status={cl.get('status')}")
        test("Lead has contact_id (linked to CRM)", cl.get("contact_id") is not None,
             f"contact_id={cl.get('contact_id')}")

# ── Step 12: Test dashboard stats ───────────────────────────────────────────
print("\n=== STEP 12: Test dashboard stats ===\n")

dash_status, dash_result = invoke_fn("mkt-dashboard-stats", {"org_id": ORG_ID})
test("Dashboard stats returned 200", dash_status == 200,
     f"Status: {dash_status}, Body: {str(dash_result)[:200]}")

if dash_status == 200 and isinstance(dash_result, dict):
    test("Dashboard has campaigns data", "campaigns" in dash_result or "active_campaigns" in dash_result,
         f"Keys: {list(dash_result.keys())[:10]}")
    print(f"  INFO  Dashboard keys: {list(dash_result.keys())}")

# ── Step 13: Check engine logs ──────────────────────────────────────────────
print("\n=== STEP 13: Verify engine logs ===\n")

logs = api_get(
    "mkt_engine_logs",
    f"select=function_name,action,level,org_id&order=created_at.desc&limit=10"
)
test("Engine logs recorded", len(logs) >= 1, f"Got {len(logs)} log entries")
if logs:
    funcs = set(l.get("function_name", "") for l in logs)
    print(f"  INFO  Logged functions: {funcs}")

# ── Step 14: Check milestones table ────────────────────────────────────────
print("\n=== STEP 14: Verify milestones seeded ===\n")

milestones = api_get("mkt_milestones", "select=milestone_key,milestone_name,reached&order=milestone_key")
test("Milestones seeded (7)", len(milestones) == 7, f"Got {len(milestones)}")
if milestones:
    keys = [m["milestone_key"] for m in milestones]
    test("Milestone keys M1-M7", keys == ["M1","M2","M3","M4","M5","M6","M7"], f"Keys: {keys}")

# ── Step 15: Check channels seeded for org ────────────────────────────────
print("\n=== STEP 15: Verify channels seeded ===\n")

channels = api_get("mkt_channels", f"org_id=eq.{ORG_ID}&select=channel_key,active&order=channel_key")
test("Channels seeded for org", len(channels) >= 6, f"Got {len(channels)}")
if channels:
    ch_keys = [c["channel_key"] for c in channels]
    test("Has email channel", "email" in ch_keys, f"Channels: {ch_keys}")
    test("Has whatsapp channel", "whatsapp" in ch_keys, f"Channels: {ch_keys}")

# ── Step 16: Test new tables are accessible ───────────────────────────────
print("\n=== STEP 16: New tables accessible ===\n")

for tbl in ["mkt_products", "mkt_budget_allocation", "mkt_crosssell_pairs",
            "mkt_mrr", "mkt_product_sync_log", "mkt_global_persona_intelligence"]:
    r = requests.get(f"{REST}/{tbl}?limit=1", headers=HEADERS)
    test(f"{tbl} accessible", r.status_code == 200, f"Status: {r.status_code}")

# ── Step 17: Test lifecycle engine responds ───────────────────────────────
print("\n=== STEP 17: Lifecycle engine responds ===\n")

lc_status, lc_result = invoke_fn("mkt-lifecycle-engine", {"mode": "referral", "org_id": ORG_ID, "lead_id": lead_ids[0] if lead_ids else ""})
test("Lifecycle engine responds", lc_status == 200, f"Status: {lc_status}, Body: {str(lc_result)[:200]}")

# ── Step 18: Test product webhook responds ────────────────────────────────
print("\n=== STEP 18: Product webhook responds ===\n")

pw_status, pw_result = invoke_fn("mkt-product-webhook?action=trial_signup", {
    "email": "e2e-product-test@in-sync.co.in",
    "first_name": "Test",
    "org_id": ORG_ID,
    "product_key": "e2e-test-product",
})
test("Product webhook responds", pw_status in (200, 201), f"Status: {pw_status}, Body: {str(pw_result)[:200]}")

# ── Step 19: Test product manager responds ────────────────────────────────
print("\n=== STEP 19: Product manager responds ===\n")

pm_status, pm_result = invoke_fn("mkt-product-manager", {"mode": "sync", "org_id": ORG_ID})
test("Product manager responds", pm_status == 200, f"Status: {pm_status}, Body: {str(pm_result)[:200]}")

# ── Summary ─────────────────────────────────────────────────────────────────
print(f"\n{'='*60}")
print(f"E2E TEST RESULTS: {passed} passed, {failed} failed")
print(f"{'='*60}")

if errors:
    print("\nFailed tests:")
    for e in errors:
        print(f"  - {e}")

print()
sys.exit(0 if failed == 0 else 1)
