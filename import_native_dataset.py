#!/usr/bin/env python3
"""
Import master-export-2026-04-11.csv into mkt_native_contacts table.
Uses Management API (curl + temp file) pattern from import_data.py.
"""

import csv
import json
import subprocess
import os
import sys
import time
import tempfile

# ============================================================
# CONFIGURATION
# ============================================================
CSV_PATH = r"C:\Users\admin\Downloads\master-export-2026-04-11.csv"
TABLE_NAME = "mkt_native_contacts"
SUPABASE_REF = "knuewnenaswscgaldjej"
MGMT_TOKEN = "sbp_e2b05165d43f4d3bc61d3afba852a623be30272c"
MGMT_API = f"https://api.supabase.com/v1/projects/{SUPABASE_REF}/database/query"
BATCH_SIZE = 5000

# CSV column → DB column mapping
COL_MAP = {
    "name":                    "full_name",
    "mobile_numb":             "phone",
    "mobile2":                 "phone2",
    "official":                "email_official",
    "personal_email_id":       "email_personal",
    "generic_email_id":        "email_generic",
    "linkedin":                "linkedin_url",
    "designation":             "designation",
    "deppt":                   "department",
    "job_level_updated":       "job_level",
    "company_name":            "company_name",
    "industry_type":           "industry_type",
    "sub_industry":            "sub_industry",
    "website":                 "website",
    "emp_size":                "emp_size",
    "turnover":                "turnover",
    "erp_name":                "erp_name",
    "erp_vendor":              "erp_vendor",
    "address":                 "address",
    "location":                "location",
    "city":                    "city",
    "state":                   "state",
    "zone":                    "zone",
    "tier":                    "tier",
    "pincode":                 "pincode",
    "country":                 "country",
    "source":                  "source",
    "source_1":                "source_1",
    "company_linkedin_url":    "company_linkedin_url",
    "latest_disposition":      "latest_disposition",
    "latest_subdisposition":   "latest_subdisposition",
    "extra":                   "extra",
    "extra_1":                 "extra_1",
    "extra_2":                 "extra_2",
    "updated_at":              "raw_updated_at",
    "salutation":              "salutation",
}

# ============================================================
# SQL EXECUTION VIA MANAGEMENT API (reused from import_data.py)
# ============================================================

def run_sql(query, timeout=120):
    """Execute SQL via Supabase Management API (curl + temp file)."""
    payload = json.dumps({"query": query})
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

def sql_val(value):
    """Convert a CSV value to a safe SQL literal (all columns are text)."""
    if value is None:
        return 'NULL'
    s = str(value)
    if s.strip().upper() == 'NULL':
        return 'NULL'
    if s.strip() == '':
        return 'NULL'
    # Escape single quotes by doubling them
    s = s.replace("'", "''")
    return f"'{s}'"

# ============================================================
# MAIN IMPORT
# ============================================================

def main():
    start_time = time.time()

    print("=" * 60)
    print(f"  IMPORT: {TABLE_NAME}")
    print(f"  Source: {CSV_PATH}")
    print(f"  Target: {SUPABASE_REF}")
    print(f"  Batch size: {BATCH_SIZE:,}")
    print("=" * 60)

    # Test connection
    print("\nTesting Management API connection...", end=" ", flush=True)
    r = run_sql("SELECT current_database() as db;")
    if not r.get("ok"):
        print(f"\nERROR: Cannot connect!\n{r}")
        sys.exit(1)
    print("OK")

    # Read CSV
    print(f"Reading CSV...", end=" ", flush=True)
    csv.field_size_limit(10 * 1024 * 1024)
    rows = []
    with open(CSV_PATH, 'r', encoding='utf-8-sig', errors='replace') as f:
        reader = csv.DictReader(f)
        csv_headers = list(reader.fieldnames or [])
        for row in reader:
            rows.append(row)
    print(f"{len(rows):,} rows loaded")

    if not rows:
        print("No rows to import.")
        sys.exit(0)

    # Determine which CSV columns are present and mapped
    mapped_cols = [(csv_col, db_col) for csv_col, db_col in COL_MAP.items() if csv_col in csv_headers]
    csv_cols_used = [c[0] for c in mapped_cols]
    db_cols_used  = [c[1] for c in mapped_cols]

    print(f"Mapped columns: {len(mapped_cols)} of {len(COL_MAP)} defined")
    print(f"CSV columns not mapped: {[c for c in csv_headers if c not in csv_cols_used]}\n")

    col_list = ", ".join(f'"{c}"' for c in db_cols_used)
    total_rows = len(rows)
    total_inserted = 0
    total_batches = (total_rows + BATCH_SIZE - 1) // BATCH_SIZE

    for batch_num, i in enumerate(range(0, total_rows, BATCH_SIZE), 1):
        batch = rows[i:i + BATCH_SIZE]
        values_parts = []
        for row in batch:
            vals = [sql_val(row.get(csv_col)) for csv_col in csv_cols_used]
            values_parts.append(f"({', '.join(vals)})")

        sql = (
            f'INSERT INTO public."{TABLE_NAME}" ({col_list}) VALUES\n'
            + ",\n".join(values_parts)
            + "\nON CONFLICT DO NOTHING;"
        )

        batch_start = time.time()
        r = run_sql(sql, timeout=180)
        batch_elapsed = time.time() - batch_start
        elapsed_total = time.time() - start_time
        pct = (i + len(batch)) / total_rows * 100

        if r.get("ok"):
            total_inserted += len(batch)
            print(
                f"  Batch {batch_num:>4d}/{total_batches}  "
                f"rows {i+1:>7,}–{i+len(batch):>7,}  "
                f"({pct:5.1f}%)  "
                f"batch={batch_elapsed:.1f}s  "
                f"elapsed={elapsed_total:.0f}s  "
                f"inserted={total_inserted:,}"
            )
        else:
            err = str(r.get("error", ""))[:200]
            print(
                f"  Batch {batch_num:>4d}/{total_batches}  "
                f"rows {i+1:>7,}–{i+len(batch):>7,}  "
                f"ERROR: {err}"
            )
            # Retry individually on error
            print(f"    Retrying {len(batch)} rows individually...", end="", flush=True)
            recovered = 0
            for row in batch:
                vals = [sql_val(row.get(csv_col)) for csv_col in csv_cols_used]
                single_sql = (
                    f'INSERT INTO public."{TABLE_NAME}" ({col_list}) VALUES ({", ".join(vals)}) '
                    f'ON CONFLICT DO NOTHING;'
                )
                sr = run_sql(single_sql, timeout=30)
                if sr.get("ok"):
                    recovered += 1
            total_inserted += recovered
            print(f" recovered {recovered}/{len(batch)}")

    elapsed_total = time.time() - start_time

    # Final verification
    print("\nVerifying row count in DB...", end=" ", flush=True)
    vr = run_sql(f'SELECT count(*) as cnt FROM public."{TABLE_NAME}";')
    db_count = "?"
    if vr.get("ok") and isinstance(vr.get("data"), list) and vr["data"]:
        db_count = vr["data"][0].get("cnt", "?")
    print(f"{db_count} rows")

    print("\n" + "=" * 60)
    print(f"  IMPORT COMPLETE")
    print(f"  Total rows processed : {total_rows:,}")
    print(f"  Total rows inserted  : {total_inserted:,}")
    print(f"  DB row count         : {db_count}")
    print(f"  Total time           : {elapsed_total:.0f}s ({elapsed_total/60:.1f} min)")
    print("=" * 60)

if __name__ == "__main__":
    main()
