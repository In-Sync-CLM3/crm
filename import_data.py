#!/usr/bin/env python3
"""
Comprehensive CSV Data Import for Supabase Migration.
Imports all CSV data from old Lovable export into new Supabase project.
"""

import csv
import json
import subprocess
import os
import re
import sys
import time
from pathlib import Path

# ============================================================
# CONFIGURATION
# ============================================================
CSV_DIR = r"C:\Users\admin\Downloads\crm-data"
SUPABASE_REF = "knuewnenaswscgaldjej"
MGMT_TOKEN = "sbp_097229f54511582b264f4377d0ef44f077dfff8f"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtudWV3bmVuYXN3c2NnYWxkamVqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY2NDkwNywiZXhwIjoyMDg4MjQwOTA3fQ.QftfznfeN8CdQ-7aGLIx9u9AhGTPGEtPHdaenXzkgE8"
SUPABASE_URL = f"https://{SUPABASE_REF}.supabase.co"
MGMT_API = f"https://api.supabase.com/v1/projects/{SUPABASE_REF}/database/query"
OLD_REF = "aizgpxaqvtvvqarzjmze"

# Batch sizes — smaller for tables with large text columns
BATCH_SIZES = {
    "email_conversations": 200,     # ~155B/row avg, small rows
    "email_bulk_campaigns": 2,      # ~8KB/row, huge HTML bodies
    "email_templates": 5,           # large HTML templates
    "redefine_repository_audit": 30, # ~1KB/row
    "redefine_data_repository": 50,  # ~400B/row
    "outbound_webhook_logs": 15,    # ~2KB/row
    "contact_activities": 50,       # ~337B/row
}
DEFAULT_BATCH = 100

# FK-aware import order (parents before children)
PRIORITY = [
    "organizations",
    "subscription_pricing",
    "organization_subscriptions",
    "designations",
    "teams",
    "profiles",
    "pipeline_stages",
    "user_roles",
    "reporting_hierarchy",
    "contacts",
    "contact_emails",
    "contact_phones",
    "contact_custom_fields",
    "contact_lead_scores",
    "contact_activities",
    "activity_participants",
    "clients",
    "client_invoices",
    "client_documents",
    "client_alternate_contacts",
    "call_dispositions",
    "call_sub_dispositions",
    "call_logs",
    "agent_call_sessions",
    "email_templates",
    "email_bulk_campaigns",
    "email_campaign_recipients",
    "email_conversations",
    "tasks",
    "support_tickets",
    "support_ticket_comments",
    "support_ticket_history",
    "chat_conversations",
    "chat_participants",
    "chat_messages",
    "notifications",
    "api_keys",
    "api_key_usage_logs",
    "custom_fields",
    "forms",
    "outbound_webhooks",
    "outbound_webhook_logs",
    "connector_logs",
    "external_entities",
    "calendar_shares",
    "org_invites",
    "org_feature_access",
    "campaign_insights",
    "revenue_goals",
    "carry_forward_snapshot",
    "monthly_actuals_snapshot",
    "redefine_data_repository",
    "redefine_repository_audit",
]

# ============================================================
# SQL EXECUTION VIA MANAGEMENT API
# ============================================================

import tempfile

def run_sql(query, timeout=60):
    """Execute SQL via Supabase Management API (curl).
    Uses a temp file for the payload to avoid Windows command-line length limits.
    """
    payload = json.dumps({"query": query})
    # Write payload to temp file to avoid Windows cmd line length limit
    tmp = tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False, encoding='utf-8')
    try:
        tmp.write(payload)
        tmp.close()
        cmd = [
            "curl", "-s", "-X", "POST", MGMT_API,
            "-H", f"Authorization: Bearer {MGMT_TOKEN}",
            "-H", "Content-Type: application/json",
            "-d", f"@{tmp.name}",
            "--max-time", str(timeout)
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout + 30)
        body = result.stdout.strip()
        if not body:
            return {"ok": True, "data": []}
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            if "error" in body.lower() or "ERROR" in body:
                return {"ok": False, "error": body[:500]}
            return {"ok": True, "data": body}
        # Management API returns a dict with error on failure, array on success
        if isinstance(data, dict) and ("error" in data or "message" in data or "msg" in data):
            err = data.get("error") or data.get("message") or data.get("msg") or str(data)
            return {"ok": False, "error": str(err)[:500]}
        return {"ok": True, "data": data}
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "Timeout"}
    except Exception as e:
        return {"ok": False, "error": str(e)}
    finally:
        try:
            os.unlink(tmp.name)
        except:
            pass

# ============================================================
# SQL VALUE ESCAPING
# ============================================================

def sql_val(value, col_name='', table_name=''):
    """Convert a CSV value to a safe SQL literal.
    Uses actual DB column types to decide NULL vs '' for empty values.
    """
    if value is None:
        return 'NULL'
    s = str(value)
    if s.strip().upper() == 'NULL':
        return 'NULL'
    if s.strip() == '':
        # Use actual column type info to decide
        if table_name and col_name and not is_text_column(table_name, col_name):
            return 'NULL'
        # For text/varchar columns, use empty string to avoid NOT NULL violations
        return "''"
    # Normal non-empty value
    if OLD_REF in s:
        s = s.replace(OLD_REF, SUPABASE_REF)
    # Escape single quotes by doubling them
    s = s.replace("'", "''")
    return f"'{s}'"

# ============================================================
# SCHEMA INTROSPECTION (one-time bulk fetch)
# ============================================================

_all_columns = None
_col_types = {}  # (table, column) -> data_type

# Data types where empty string '' is NOT valid — use NULL instead
NULL_FOR_EMPTY_TYPES = {
    'uuid', 'integer', 'bigint', 'smallint', 'numeric', 'real',
    'double precision', 'boolean', 'date', 'timestamp with time zone',
    'timestamp without time zone', 'interval', 'jsonb', 'json',
    'ARRAY', 'bytea', 'inet', 'cidr',
}

def load_all_columns():
    """Fetch all public table columns with types in one API call."""
    global _all_columns, _col_types
    r = run_sql("""
        SELECT table_name, column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND (is_generated = 'NEVER' OR is_generated IS NULL)
        AND generation_expression IS NULL
        ORDER BY table_name, ordinal_position;
    """)
    _all_columns = {}
    _col_types = {}
    if r.get("ok") and isinstance(r.get("data"), list):
        for row in r["data"]:
            tn = row["table_name"]
            cn = row["column_name"]
            dt = row.get("data_type", "text")
            if tn not in _all_columns:
                _all_columns[tn] = []
            _all_columns[tn].append(cn)
            _col_types[(tn, cn)] = dt
    return _all_columns

def get_db_columns(table_name):
    """Get column names for a table from cached schema."""
    if _all_columns is None:
        load_all_columns()
    return _all_columns.get(table_name, [])

def is_text_column(table_name, col_name):
    """Check if a column is a text type (where '' is valid)."""
    dt = _col_types.get((table_name, col_name), 'text')
    return dt not in NULL_FOR_EMPTY_TYPES and not dt.startswith('USER-DEFINED')

# ============================================================
# AUTH USERS IMPORT
# ============================================================

def import_auth_users(csv_path):
    """Import auth users via Supabase Admin API, then restore timestamps via SQL."""
    print(f"\n{'='*55}")
    print("  PHASE 1: AUTH USERS")
    print(f"{'='*55}")

    csv.field_size_limit(10 * 1024 * 1024)
    with open(csv_path, 'r', encoding='utf-8-sig') as f:
        users = list(csv.DictReader(f))

    if not users:
        print("  No auth users to import")
        return 0

    print(f"  Found {len(users)} users\n")
    created = 0

    for user in users:
        email = user.get("email", "?")
        payload = {
            "id": user["id"],
            "email": email,
            "email_confirm": True,
            "password": "TempMigration2026!Px",
            "user_metadata": {
                "first_name": user.get("first_name", "") or "",
                "last_name": user.get("last_name", "") or "",
                "full_name": user.get("full_name", "") or "",
            }
        }
        if user.get("phone"):
            payload["phone"] = user["phone"]
            payload["phone_confirm"] = True

        cmd = [
            "curl", "-s", "-X", "POST",
            f"{SUPABASE_URL}/auth/v1/admin/users",
            "-H", f"Authorization: Bearer {SERVICE_ROLE_KEY}",
            "-H", f"apikey: {SERVICE_ROLE_KEY}",
            "-H", "Content-Type: application/json",
            "-d", json.dumps(payload),
            "--max-time", "15"
        ]

        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
            body = result.stdout.strip()
            resp = json.loads(body) if body else {}
        except Exception as e:
            resp = {"error": str(e)}

        if resp.get("id"):
            print(f"    + {email}")
            created += 1
        elif any(kw in str(resp).lower() for kw in ["already", "unique", "duplicate", "exists"]):
            print(f"    ~ {email} (already exists)")
            created += 1
        else:
            print(f"    ! {email}: {str(resp)[:120]}")

    # Restore original timestamps via SQL (batch all updates in one call)
    print("\n  Restoring original timestamps...", end=" ", flush=True)
    sql_parts = []
    for user in users:
        uid = user["id"]
        parts = []
        for col in ["created_at", "updated_at", "email_confirmed_at", "last_sign_in_at"]:
            val = user.get(col, "")
            if val:
                parts.append(f"{col} = '{val}'")
        if parts:
            sql_parts.append(f"UPDATE auth.users SET {', '.join(parts)} WHERE id = '{uid}';")
    if sql_parts:
        run_sql("\n".join(sql_parts), timeout=30)
    print("done")

    print(f"\n  Auth users: {created}/{len(users)} imported")
    return created

# ============================================================
# PUBLIC TABLE IMPORT
# ============================================================

def import_table(table_name, csv_path):
    """Import a CSV file into a public schema table using batched INSERTs."""
    batch_size = BATCH_SIZES.get(table_name, DEFAULT_BATCH)

    csv.field_size_limit(10 * 1024 * 1024)
    with open(csv_path, 'r', encoding='utf-8-sig', errors='replace') as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            return 0
        csv_cols = list(reader.fieldnames)
        rows = list(reader)

    if not rows:
        return 0

    # Match CSV columns to actual DB columns
    db_cols = get_db_columns(table_name)
    if not db_cols:
        print(f"(table not found in DB, skipping)")
        return 0

    cols = [c for c in csv_cols if c in db_cols]
    if not cols:
        print(f"(no matching columns, skipping)")
        return 0

    col_list = ", ".join(f'"{c}"' for c in cols)
    imported = 0
    batch_errors = 0

    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        values_parts = []
        for row in batch:
            vals = [sql_val(row.get(c), c, table_name) for c in cols]
            values_parts.append(f"({', '.join(vals)})")

        # Use session_replication_role=replica to bypass FK checks and triggers
        sql = (
            "SET session_replication_role = 'replica';\n"
            f'INSERT INTO public."{table_name}" ({col_list}) VALUES\n'
            + ",\n".join(values_parts)
            + "\nON CONFLICT DO NOTHING;\n"
            "SET session_replication_role = 'origin';"
        )

        r = run_sql(sql, timeout=180)
        if r.get("ok"):
            imported += len(batch)
        else:
            batch_errors += 1
            if batch_errors <= 2:
                err = str(r.get("error", ""))[:200]
                print(f"\n    ! Batch {i // batch_size + 1} error: {err}")
                print(f"      Retrying rows individually...", end="", flush=True)

            # Fallback: insert rows one by one
            for row in batch:
                vals = [sql_val(row.get(c), c, table_name) for c in cols]
                single_sql = (
                    "SET session_replication_role = 'replica';\n"
                    f'INSERT INTO public."{table_name}" ({col_list}) VALUES ({", ".join(vals)}) ON CONFLICT DO NOTHING;\n'
                    "SET session_replication_role = 'origin';"
                )
                sr = run_sql(single_sql, timeout=60)
                if sr.get("ok"):
                    imported += 1

            if batch_errors <= 2:
                print(" done")

    return imported

# ============================================================
# MAIN
# ============================================================

def main():
    start_time = time.time()

    print("=" * 55)
    print("  SUPABASE CSV DATA IMPORT")
    print(f"  Source:  {CSV_DIR}")
    print(f"  Target:  {SUPABASE_REF}")
    print(f"  Old ref: {OLD_REF} (URLs will be replaced)")
    print("=" * 55)

    # 1. Test connection
    print("\nTesting Management API connection...", end=" ", flush=True)
    r = run_sql("SELECT current_database() as db;")
    if not r.get("ok"):
        print(f"\nERROR: Cannot connect!\n{r}")
        sys.exit(1)
    print("OK")

    # 2. Pre-load all table schemas (one API call)
    print("Loading database schema...", end=" ", flush=True)
    cols = load_all_columns()
    print(f"{len(cols)} tables found")

    # 3. Discover CSV files (non-empty only)
    csv_files = {}
    for f in sorted(Path(CSV_DIR).glob("*.csv")):
        m = re.match(r"(.+?)_\d{4}-\d{2}-\d{2}\.csv$", f.name)
        if m and f.stat().st_size > 0:
            csv_files[m.group(1)] = str(f)

    print(f"Found {len(csv_files)} non-empty CSV files\n")

    # ── PHASE 1: AUTH USERS ──
    auth_count = 0
    if "auth_users" in csv_files:
        auth_count = import_auth_users(csv_files.pop("auth_users"))

    # ── PHASE 2: PUBLIC TABLES ──
    print(f"\n{'='*55}")
    print("  PHASE 2: PUBLIC TABLES")
    print(f"{'='*55}\n")

    # Build ordered list: priority tables first, then remaining alphabetically
    ordered = []
    for t in PRIORITY:
        if t in csv_files:
            ordered.append(t)
    for t in sorted(csv_files.keys()):
        if t not in ordered:
            ordered.append(t)

    results = {}
    for idx, table in enumerate(ordered, 1):
        path = csv_files[table]
        size = os.path.getsize(path)
        if size >= 1_000_000:
            size_str = f"{size / 1_000_000:.1f}MB"
        elif size >= 1_000:
            size_str = f"{size / 1_000:.0f}KB"
        else:
            size_str = f"{size}B"

        print(f"  [{idx:2d}/{len(ordered)}] {table:<40s} ({size_str:>7s}) ...", end=" ", flush=True)
        t0 = time.time()
        count = import_table(table, path)
        elapsed = time.time() - t0
        results[table] = count
        print(f"{count:>5d} rows  ({elapsed:.1f}s)")

    # ── PHASE 3: POST-IMPORT ──
    print(f"\n{'='*55}")
    print("  PHASE 3: POST-IMPORT CLEANUP")
    print(f"{'='*55}\n")

    # Reset auto-increment sequences
    print("  Resetting sequences...", end=" ", flush=True)
    r = run_sql("""
        DO $$
        DECLARE
            r RECORD;
            max_val BIGINT;
        BEGIN
            FOR r IN (
                SELECT c.table_name, c.column_name,
                       pg_get_serial_sequence(quote_ident(c.table_name), c.column_name) as seq_name
                FROM information_schema.columns c
                JOIN information_schema.tables t
                  ON t.table_name = c.table_name AND t.table_schema = c.table_schema
                WHERE c.table_schema = 'public'
                AND t.table_type = 'BASE TABLE'
                AND c.column_default LIKE 'nextval%'
            ) LOOP
                IF r.seq_name IS NOT NULL THEN
                    EXECUTE format('SELECT COALESCE(MAX(%I), 0) FROM public.%I', r.column_name, r.table_name) INTO max_val;
                    IF max_val > 0 THEN
                        PERFORM setval(r.seq_name, max_val);
                    END IF;
                END IF;
            END LOOP;
        END $$;
    """, timeout=30)
    print("done" if r.get("ok") else f"warning: {str(r.get('error',''))[:100]}")

    # Verify row counts
    print("  Verifying imported data...", end=" ", flush=True)
    verify_tables = ["organizations", "profiles", "contacts", "clients", "email_conversations", "call_logs"]
    counts = {}
    for vt in verify_tables:
        vr = run_sql(f'SELECT count(*) as cnt FROM public."{vt}";')
        if vr.get("ok") and isinstance(vr.get("data"), list) and vr["data"]:
            counts[vt] = vr["data"][0].get("cnt", "?")
    print("done")
    if counts:
        print("  DB row counts:")
        for t, c in counts.items():
            print(f"    {t}: {c}")

    # ── SUMMARY ──
    elapsed_total = time.time() - start_time
    print(f"\n{'='*55}")
    print("  IMPORT COMPLETE")
    print(f"{'='*55}")

    total_rows = 0
    successful_tables = 0
    for t, c in sorted(results.items(), key=lambda x: -x[1]):
        if c > 0:
            print(f"    {t:<40s} {c:>6,d} rows")
            total_rows += c
            successful_tables += 1

    skipped = [t for t, c in results.items() if c == 0]

    print(f"\n  Auth users imported: {auth_count}")
    print(f"  Public tables: {total_rows:,} rows across {successful_tables} tables")
    if skipped:
        print(f"  Skipped ({len(skipped)}): {', '.join(skipped)}")
    print(f"  Elapsed: {elapsed_total:.0f}s ({elapsed_total/60:.1f} min)")
    print(f"\n  NOTE: All auth users have temporary password: TempMigration2026!Px")
    print(f"        Users should reset via 'Forgot Password' on first login.")

if __name__ == "__main__":
    main()
