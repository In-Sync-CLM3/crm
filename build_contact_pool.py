#!/usr/bin/env python3
"""
Build 6 x 3,000 = 18,000 vendor-verification-targeted contacts
from master-export in a single CSV pass -> Supabase CRM.

Persona criteria (Vendor Verification buyer):
  - Valid Indian 10-digit mobile (starts with 6/7/8/9)
  - Corporate email in `official` field (no personal domains)
  - Job level: C Level / Head / VP / GM / Director / Sr. Manager
  - Manager-level only if Finance / Operations / Admin dept
  - Designation must not be a technical/creative/HR role
  - Deduped by phone + email across all 18,000
"""

import csv
import json
import re
import uuid
import time
import subprocess
import tempfile
import os

# ── Config ──────────────────────────────────────────────────────────────────
CSV_PATH     = r"C:\Users\admin\Downloads\master-export-2026-04-07.csv"
OUTPUT_JSON  = r"C:\Users\admin\contacts_data.json"
SUPABASE_URL = "https://knuewnenaswscgaldjej.supabase.co"
SERVICE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtudWV3bmVuYXN3c2NnYWxkamVqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY2NDkwNywiZXhwIjoyMDg4MjQwOTA3fQ.QftfznfeN8CdQ-7aGLIx9u9AhGTPGEtPHdaenXzkgE8"
SUPABASE_REF = "knuewnenaswscgaldjej"
MGMT_TOKEN   = "sbp_e2b05165d43f4d3bc61d3afba852a623be30272c"
MGMT_API     = f"https://api.supabase.com/v1/projects/{SUPABASE_REF}/database/query"
ORG_ID       = "65e22e43-f23d-4c0a-9d84-2eba65ad0e12"
TOTAL        = 18_000   # 6 iterations x 3,000
BATCH_SIZE   = 200

PERSONAL_DOMAINS = {
    'gmail.com','yahoo.com','yahoo.in','yahoo.co.in','hotmail.com','hotmail.in',
    'outlook.com','outlook.in','rediffmail.com','ymail.com','icloud.com',
    'live.com','live.in','protonmail.com','aol.com','msn.com','me.com',
    'googlemail.com','mail.com','zoho.com','tutanota.com',
}

# ── Persona filter ───────────────────────────────────────────────────────────

GOOD_LEVELS = {
    'c level', 'head level', 'head', 'vp/avp', 'gm level', 'gm / agm / dgm',
    'agm/dgm/gm', 'director level', 'director', 'sr. manager level',
    'sr. manager', 'leaders', 'principal',
}
# Manager/Executive only allowed if in a decision dept
CONDITIONAL_LEVELS = {'manager level', 'manager', 'executive'}
BAD_LEVELS         = {'below manager', 'engineer', 'team leader'}

DECISION_DEPTS = {
    'management', 'finance', 'finance/accounts', 'operations',
    'operations and services', 'admin',
}
EXCLUDE_DEPTS = {
    'it engineering', 'it testing', 'creative', 'human resource', 'hr', 'data',
}

BAD_DESG = [
    'developer', 'programmer', 'software engineer', 'test engineer', 'tester',
    'qa ', ' qa', 'graphic design', 'ui ', 'ux ', 'web design', 'web developer',
    'data scientist', 'data analyst', 'intern', 'trainee', 'teacher', 'professor',
    'doctor', 'nurse', 'pharmacist', 'architect', 'technical lead', 'tech lead',
    'business analyst', 'hr ', ' hr', 'recruiter', 'talent acquisition',
    'content writer', 'seo ', 'digital marketing', 'social media',
    'embedded', 'firmware', 'hardware engineer', 'civil engineer',
    'mechanical engineer', 'electrical engineer', 'chemical engineer',
]

def is_vv_persona(row):
    level = (row.get('job_level_updated') or '').strip().lower()
    dept  = (row.get('deppt') or '').strip().lower()
    desg  = (row.get('designation') or '').strip().lower()

    if level in BAD_LEVELS:
        return False
    if level in CONDITIONAL_LEVELS:
        if dept not in DECISION_DEPTS:
            return False
    elif level not in GOOD_LEVELS:
        return False  # unknown/blank level — skip

    if dept in EXCLUDE_DEPTS:
        return False

    for kw in BAD_DESG:
        if kw in desg:
            return False

    return True

# ── Validation helpers ───────────────────────────────────────────────────────

def valid_mobile(s):
    digits = ''.join(c for c in (s or '') if c.isdigit())
    if len(digits) >= 10:
        last10 = digits[-10:]
        if last10[0] in '6789':
            return last10
    return None

def valid_corp_email(s):
    s = (s or '').strip()
    if not s or ' ' in s or ',' in s:
        return None
    if not re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', s):
        return None
    domain = s.lower().split('@')[-1]
    return None if domain in PERSONAL_DOMAINS else s.lower()

def split_name(full_name):
    parts = (full_name or '').strip().split(None, 1)
    first = parts[0].title() if parts else ''
    last  = parts[1].title() if len(parts) > 1 else ''
    return first, last

# ── Supabase insert ──────────────────────────────────────────────────────────

def esc(v):
    """Escape a Python value to a SQL literal."""
    if v is None:
        return 'NULL'
    s = str(v).replace("'", "''")
    return f"'{s}'"

def run_sql(query):
    payload = json.dumps({'query': query})
    tmp = tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False, encoding='utf-8')
    tmp.write(payload)
    tmp.close()
    cmd = ['curl', '-s', '-X', 'POST', MGMT_API,
           '-H', f'Authorization: Bearer {MGMT_TOKEN}',
           '-H', 'Content-Type: application/json',
           '-d', f'@{tmp.name}', '--max-time', '60']
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
        os.unlink(tmp.name)
        body = result.stdout.strip()
        if not body:
            return True, None
        try:
            data = json.loads(body)
        except Exception:
            return True, None
        if isinstance(data, dict) and ('error' in data or 'message' in data or 'msg' in data):
            err = data.get('error') or data.get('message') or data.get('msg') or str(data)
            return False, str(err)[:300]
        return True, None
    except Exception as e:
        try: os.unlink(tmp.name)
        except: pass
        return False, str(e)

def supabase_insert(records):
    cols = ['id','org_id','first_name','last_name','phone','email','company',
            'job_title','city','state','country','industry_type','source',
            'target_product','status','created_at']
    col_list = ', '.join(f'"{c}"' for c in cols)
    rows_sql = []
    for r in records:
        vals = ', '.join(esc(r.get(c)) for c in cols)
        rows_sql.append(f'({vals})')
    sql = (
        "SET session_replication_role = 'replica';\n"
        f'INSERT INTO public.contacts ({col_list}) VALUES\n'
        + ',\n'.join(rows_sql)
        + "\nON CONFLICT DO NOTHING;\n"
        "SET session_replication_role = 'origin';"
    )
    return run_sql(sql)

# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  CONTACT POOL BUILDER — 6 iterations x 3,000")
    print("  Persona: Vendor Verification buyers (VV-filtered)")
    print("=" * 60)

    csv.field_size_limit(10 * 1024 * 1024)

    all_contacts = []
    seen_phones  = set()
    seen_emails  = set()
    scanned      = 0
    rejected_criteria   = 0
    rejected_persona    = 0
    rejected_dedup      = 0
    milestone_size      = 3_000

    t_start = time.time()

    with open(CSV_PATH, encoding='utf-8-sig', errors='replace') as f:
        reader = csv.DictReader(f)
        for row in reader:
            scanned += 1

            # Progress every 50k rows
            if scanned % 50_000 == 0:
                elapsed = time.time() - t_start
                print(f"  Scanned {scanned:>7,}  |  Found {len(all_contacts):>6,}  |  "
                      f"Rejected: criteria={rejected_criteria:,} persona={rejected_persona:,} "
                      f"dedup={rejected_dedup:,}  |  {elapsed:.0f}s")

            phone = valid_mobile(row.get('mobile_numb', ''))
            email = valid_corp_email(row.get('official', ''))
            if not phone or not email:
                rejected_criteria += 1
                continue

            if not is_vv_persona(row):
                rejected_persona += 1
                continue

            if phone in seen_phones or email in seen_emails:
                rejected_dedup += 1
                continue

            first, last = split_name(row.get('name', ''))
            if not first:
                rejected_criteria += 1
                continue

            seen_phones.add(phone)
            seen_emails.add(email)

            all_contacts.append({
                'id':             str(uuid.uuid4()),
                'org_id':         ORG_ID,
                'first_name':     first,
                'last_name':      last or None,
                'phone':          f'+91{phone}',
                'email':          email,
                'company':        (row.get('company_name') or '').strip() or None,
                'job_title':      (row.get('designation') or '').strip() or None,
                'city':           (row.get('city') or '').strip() or None,
                'state':          (row.get('state') or '').strip() or None,
                'country':        'India',
                'industry_type':  (row.get('industry_type') or '').strip() or None,
                'source':         'master-export',
                'target_product': 'vendor_verification',
                'status':         'new',
                'created_at':     '2026-04-07T00:00:00+00:00',
            })

            # Print iteration milestone
            if len(all_contacts) % milestone_size == 0:
                it = len(all_contacts) // milestone_size
                elapsed = time.time() - t_start
                print(f"\n  >> Iteration {it} complete — {len(all_contacts):,} contacts collected ({elapsed:.0f}s)\n")

            if len(all_contacts) >= TOTAL:
                break

    elapsed = time.time() - t_start
    print(f"\nCSV scan done in {elapsed:.0f}s")
    print(f"  Scanned:          {scanned:>8,}")
    print(f"  Rejected criteria:{rejected_criteria:>8,}")
    print(f"  Rejected persona: {rejected_persona:>8,}")
    print(f"  Rejected dedup:   {rejected_dedup:>8,}")
    print(f"  Collected:        {len(all_contacts):>8,}")

    # Save JSON
    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(all_contacts, f, indent=2, ensure_ascii=False)
    print(f"\nSaved to {OUTPUT_JSON}")

    # Import to Supabase in batches
    print(f"\nImporting {len(all_contacts):,} contacts into Supabase ({BATCH_SIZE}/batch)...")
    imported = errors = 0
    t_import = time.time()

    for i in range(0, len(all_contacts), BATCH_SIZE):
        batch = all_contacts[i:i + BATCH_SIZE]
        ok, err = supabase_insert(batch)
        if ok:
            imported += len(batch)
        else:
            errors += len(batch)
            print(f"  ! Batch {i//BATCH_SIZE+1} error: {err}")

        done = i + len(batch)
        if done % 1000 == 0 or done == len(all_contacts):
            t_el = time.time() - t_import
            print(f"  {done:>6,}/{len(all_contacts):,}  ({t_el:.0f}s)  errors={errors}")

    print(f"\n{'='*60}")
    print(f"  DONE — {imported:,} contacts imported  |  {errors} errors")
    print(f"  Total time: {time.time()-t_start:.0f}s")
    print(f"{'='*60}")

if __name__ == '__main__':
    main()
