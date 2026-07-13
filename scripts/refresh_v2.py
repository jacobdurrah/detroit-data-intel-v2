#!/usr/bin/env python3
"""
Detroit Data Intel — Data Refresh Pipeline v2

Downloads latest data from data.detroitmi.gov and bulk-loads into Supabase
using psql COPY (fast) with fallback to REST upsert (slow but safe).

Fixes from v1:
- Uses curl -L to follow redirects (fixes Azure blob redirect issue)
- Handles HTTP 202 "export in progress" with retry loop
- Actually loads data into Supabase (TRUNCATE + COPY)
- Validates CSV before loading (checks headers, row count)
- Rebuild search vectors after trades/permits reload

Usage:
    python3 refresh_v2.py check                    # Show current table counts
    python3 refresh_v2.py download [tables...]      # Download CSVs only
    python3 refresh_v2.py refresh [tables...]       # Download + load into Supabase
    python3 refresh_v2.py load [tables...]          # Load already-downloaded CSVs
    python3 refresh_v2.py rebuild-vectors           # Rebuild search vectors only

Environment:
    SUPABASE_KEY - service role key (for REST API counts)
    PSQL_URL     - postgres connection string (for COPY)
"""

import json
import os
import subprocess
import sys
import time
from datetime import datetime

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
DATA_DIR = "/tmp/detroit-data-refresh"
STATE_FILE = os.path.join(PROJECT_DIR, "api", "_data", "freshness-state.json")

PSQL = "/opt/homebrew/opt/libpq/bin/psql"
PSQL_URL = os.environ.get(
    "PSQL_URL",
    ""  # no fallback — set PSQL_URL env var
)

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://vgtwkgckvryxbgujnqro.supabase.co")
SUPABASE_KEY = os.environ["SUPABASE_KEY"]

# Max retries for 202 "export in progress"
MAX_202_RETRIES = 12
RETRY_WAIT_SECS = 30

# Datasets: name → ArcGIS item ID
DATASETS = {
    "sales":        "d26fda1e80b04630a6e56627e6fbceb8",
    "blight":       "9ce72b42872844bdbe272c607224e3b3",
    "permits":      "86d47e86062e4beeb19344eb125b75d2",
    "trades":       "f77e9fd44b7e44089b41d3f8161631fa",
    "assessment":   "8220714b2bcd492fa861564e55cbd725",
    "dlba_owned":   "848bc665295f4ca9b1e25068ffa88ab0",
    "dlba_auction": "88d078e0b6fc404bb685cbd4be4b0fb1",
    "demos":        "56b20af695134bd1b4ab65e1876ae79b",
    "rentals":      "145ebb0e507f4aae95f028559a2f0877",
    "presale":      "11bcabfc01c14ed8ae2c6fd5e8a6077c",
    "vacant":       "85fccf67f3e44c4bb767b9e2b190d576",
}

# Column mappings: table → (csv_header → pg_column, ...)
# Only map columns that exist in both CSV and DB schema
# Missing CSV columns are skipped, extra CSV columns are ignored
COLUMN_MAPS = {
    "sales": {
        "Sales ID": "sales_id",
        "Parcel ID": "parcel_id",
        "Address": "address",
        "Sale Date": "sale_date",
        "Sale Price": "sale_price",
        "Grantor": "grantor",
        "Grantee": "grantee",
        "Terms of Sale": "terms_of_sale",
        "Sale Verification": "sale_verification",
        "Sale Instrument": "sale_instrument",
        "sale_number": "sale_number",
        "Property Transfer Percentage": "transfer_pct",
        "Multi Parcel Sale": "multi_parcel",
        "Property Class Code": "property_class_code",
        "Property Class Description": "property_class_desc",
        "ECF Neighborhood": "ecf_neighborhood",
        "Neighborhood": "neighborhood",
        "Council District": "council_district",
        "Zip Code": "zip_code",
        "Longitude": "longitude",
        "Latitude": "latitude",
    },
    "blight": {
        "Ticket ID": "ticket_id",
        "Agency Name": "agency_name",
        "Inspector Name": "inspector_name",
        "Property Owner Name": "violator_name",
        "Street Number": "street_number",
        "Street Name": "street_name",
        "Zip Code": "zip_code",
        "Ticket Issued Date": "violation_date",
        "Hearing Date": "hearing_date",
        "Ordinance Law": "violation_code",
        "Ordinance Description": "violation_description",
        "Disposition": "disposition",
        "Fine Amount": "fine_amount",
        "Judgement Amount": "judgment_amount",
        "Balance Due": "balance_due",
        "Payment Status": "payment_status",
        "Collection Status": "compliance_status",
        "Neighborhood": "neighborhood",
        "Council District": "council_district",
        "Latitude": "latitude",
        "Longitude": "longitude",
    },
    "permits": {
        "Record ID": "permit_no",
        "Address": "address",
        "Issued Date": "permit_issued",
        "Submitted Date": "permit_expires",
        "Permit Type": "permit_type",
        "Current Building Use Type": "bld_type_use",
        "Use Group": "residential",
        "Description of Work": "description",
        "Contractor Estimated Cost": "estimated_cost",
        "Parcel ID": "parcel_id",
        "Proposed Building Use Type": "legal_use",
        "Number of Stories": "floor_area",
        "Neighborhood": "neighborhood",
        "Council District": "council_district",
        "ZIP Code": "zip_code",
        "Longitude": "longitude",
        "Latitude": "latitude",
    },
    "trades": {
        "record_id": "permit_no",
        "address": "address",
        "issued_date": "permit_issued",
        "permit_type": "permit_type",
        "work_description": "description",
        "contact_business_name": "contractor_name",
        "parcel_id": "parcel_id",
        "neighborhood": "neighborhood",
        "council_district": "council_district",
        "longitude": "longitude",
        "latitude": "latitude",
    },
    "assessment": {
        "Parcel Number": "parcel_id",
        "Address": "address",
        "Property Class Description": "property_class",
        "Tax Status": "tax_status",
        "Tentative Assessed Value": "total_assessed_value",
        "Tentative Taxable Value": "total_taxable_value",
        "Land Value": "land_value",
        "Estimated True Cash Value": "improvement_value",
        "Neighborhood": "neighborhood",
        "Residential Year Built": "year_built",
        "Property Class": "bldg_class",
        "Total Square Footage": "total_floor_area",
        "Residential Building Count": "floors",
        "Sale Date": "last_sale_date",
        "Sale Price": "last_sale_price",
        "Taxpayer 1": "owner_name",
        "Council District": "council_district",
        "ZIP Code": "zip_code",
    },
    "demos": {
        "Record ID": "permit_no",
        "Address": "address",
        "Date Issued": "permit_issued",
        "Description": "permit_status",
        "Owner Name": "bld_type_use",
        "Parcel ID": "parcel_id",
        "Contractor Name": "contractor_name",
        "Neighborhood": "neighborhood",
        "Council District": "council_district",
        "Longitude": "longitude",
        "Latitude": "latitude",
    },
    "rentals": {
        "record_id": "certificate_number",
        "registration_type": "status",
        "address": "address",
        "parcel_id": "parcel_id",
        "neighborhood": "neighborhood",
        "council_district": "council_district",
        "zip_code": "zip_code",
        "longitude": "longitude",
        "latitude": "latitude",
    },
    "presale": {
        "inspection_id": "case_id",
        "address": "address",
        "inspection_result": "status",
        "parcel_id": "parcel_id",
        "inspection_type": "case_type",
        "neighborhood": "neighborhood",
        "council_district": "council_district",
        "longitude": "longitude",
        "latitude": "latitude",
    },
    "vacant": {
        "task_id": "task_id",
        "Address": "address",
        "Date Issued": "date_issued",
        "owner_name": "owner_name",
        "Neighborhood": "neighborhood",
        "Council District": "council_district",
        "Zip Code": "zip_code",
        "Parcel ID": "parcel_id",
        "Longitude": "longitude",
        "Latitude": "latitude",
    },
    "dlba_auction": {
        "ObjectId": "object_id",
        "Address": "address",
        "Parcel ID": "parcel_id",
        "Sale Date": "sale_date",
        "Sale Price": "sale_price",
        "Buyer": "buyer",
        "Neighborhood": "neighborhood",
        "Council District": "council_district",
        "Zip Code": "zip_code",
        "Longitude": "longitude",
        "Latitude": "latitude",
    },
    "dlba_owned": {
        "Parcel Number": "parcel_id",
        "Address": "address",
        "Council District": "council_district",
        "Neighborhood": "neighborhood",
        "DLBA Inventory Status": "property_class",
        "Longitude": "longitude",
        "Latitude": "latitude",
    },
}

# Primary keys per table (for ON CONFLICT)
PRIMARY_KEYS = {
    "sales": "sales_id",
    "blight": "ticket_id",
    "permits": "permit_no",
    "trades": "permit_no",
    "assessment": "parcel_id",
    "demos": "permit_no",
    "rentals": "certificate_number",
    "presale": "case_id",
    "vacant": "task_id",
    "dlba_auction": "object_id",
    "dlba_owned": "parcel_id",
}


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------

def download_csv(name, dataset_id, data_dir=DATA_DIR):
    """Download a CSV from data.detroitmi.gov using curl -L (follows redirects).
    Handles HTTP 202 'export in progress' with retry loop.
    """
    os.makedirs(data_dir, exist_ok=True)
    csv_path = os.path.join(data_dir, f"{name}.csv")
    url = f"https://data.detroitmi.gov/api/download/v1/items/{dataset_id}/csv?layers=0"

    for attempt in range(MAX_202_RETRIES):
        print(f"  [{name}] Attempt {attempt + 1}...", end=" ", flush=True)

        # Use curl -L to follow redirects properly
        result = subprocess.run(
            ["curl", "-sL", "--max-time", "600", "-o", csv_path, "-w", "%{http_code}", url],
            capture_output=True, text=True, timeout=660,
        )
        http_code = result.stdout.strip()

        if not os.path.exists(csv_path):
            print(f"❌ No file written (curl exit {result.returncode})")
            continue

        file_size = os.path.getsize(csv_path)

        # Check for 202 response body
        if file_size < 500:
            with open(csv_path, "r") as f:
                content = f.read()
            if "being generated" in content or "check back" in content.lower():
                print(f"⏳ Export in progress, waiting {RETRY_WAIT_SECS}s...")
                time.sleep(RETRY_WAIT_SECS)
                continue
            if "Found. Redirecting" in content:
                print(f"❌ Got redirect text instead of CSV ({file_size} bytes)")
                # This shouldn't happen with curl -L but handle it
                time.sleep(10)
                continue

        # Validate it's actual CSV (check for BOM + header)
        with open(csv_path, "rb") as f:
            header = f.read(500)
        if b"," not in header:
            print(f"❌ Downloaded file doesn't look like CSV ({file_size} bytes)")
            continue

        # Count rows
        row_count = sum(1 for _ in open(csv_path, encoding="utf-8-sig", errors="replace")) - 1

        print(f"✅ {file_size:,} bytes, {row_count:,} rows")
        return {"status": "ok", "path": csv_path, "size": file_size, "rows": row_count}

    print(f"  [{name}] ❌ Failed after {MAX_202_RETRIES} attempts")
    return {"status": "failed", "path": None, "rows": 0}


# ---------------------------------------------------------------------------
# Transform CSV for COPY
# ---------------------------------------------------------------------------

def transform_csv(name, source_path, data_dir=DATA_DIR):
    """Read source CSV, remap columns to match DB schema, write transformed CSV.
    Returns path to transformed CSV and column list.
    """
    import csv as csv_mod

    col_map = COLUMN_MAPS.get(name, {})
    if not col_map:
        print(f"  [{name}] ⚠️ No column mapping — skipping transform")
        return None, []

    output_path = os.path.join(data_dir, f"{name}_transformed.csv")

    with open(source_path, "r", encoding="utf-8-sig", errors="replace") as infile:
        reader = csv_mod.DictReader(infile)
        csv_headers = reader.fieldnames or []

        # Find which CSV columns we can map
        mapped = []
        for csv_col, pg_col in col_map.items():
            if csv_col in csv_headers:
                mapped.append((csv_col, pg_col))

        if name == "blight" and "Ticket Issued Date" in csv_headers:
            pg_columns = [pg_col for _, pg_col in mapped]
            if "ticket_issued_date" not in pg_columns:
                mapped.append(("Ticket Issued Date", "ticket_issued_date"))

        if not mapped:
            print(f"  [{name}] ❌ No CSV columns matched mapping. CSV headers: {csv_headers[:10]}")
            return None, []

        pg_columns = [pg_col for _, pg_col in mapped]

        with open(output_path, "w", newline="", encoding="utf-8") as outfile:
            writer = csv_mod.writer(outfile)
            # Write header
            writer.writerow(pg_columns)

            rows_written = 0
            for row in reader:
                out_row = []
                for csv_col, pg_col in mapped:
                    val = row.get(csv_col, "").strip()
                    # Clean empty strings to empty (COPY will treat as NULL with FORCE_NULL)
                    out_row.append(val if val else "")
                writer.writerow(out_row)
                rows_written += 1

    print(f"  [{name}] Transformed {rows_written:,} rows → {len(pg_columns)} columns")
    return output_path, pg_columns


# ---------------------------------------------------------------------------
# Load via psql COPY
# ---------------------------------------------------------------------------

def load_table_psql(name, csv_path, pg_columns):
    """Load a transformed CSV into Supabase via psql COPY.
    Strategy: Create temp table → COPY into temp → INSERT ... ON CONFLICT.
    """
    pk = PRIMARY_KEYS.get(name)
    if not pk:
        print(f"  [{name}] ⚠️ No primary key defined — skipping")
        return False

    cols_str = ", ".join(pg_columns)
    force_null = ", ".join(pg_columns)

    # TRUNCATE + COPY — full table replace
    # This is the fastest approach for monthly refreshes where we get complete datasets
    # Wrap the destructive replace in a transaction so a failed COPY keeps old data.
    # Uses SET statement_timeout to avoid Supabase's default 2-min limit.
    sql = f"""
SET statement_timeout = '600000';
BEGIN;
TRUNCATE {name};
\\copy {name} ({cols_str}) FROM '{csv_path}' WITH (FORMAT csv, HEADER true, NULL '', FORCE_NULL ({force_null}))
COMMIT;
"""

    print(f"  [{name}] Loading via TRUNCATE + COPY...", flush=True)
    start = time.time()

    result = subprocess.run(
        [PSQL, PSQL_URL, "-v", "ON_ERROR_STOP=1"],
        input=sql, capture_output=True, text=True, timeout=1800,
    )

    elapsed = time.time() - start

    if result.returncode != 0:
        stderr = result.stderr[:500]
        # If COPY fails (statement timeout, column mismatch), try REST API fallback
        if "statement timeout" in stderr.lower() or "lock timeout" in stderr.lower():
            print(f"  [{name}] ⚠️ COPY timed out ({elapsed:.0f}s), falling back to REST API batch insert...")
            return _load_table_rest(name, csv_path, pg_columns)
        print(f"  [{name}] ❌ Load failed ({elapsed:.0f}s): {stderr}")
        return False

    print(f"  [{name}] ✅ Loaded ({elapsed:.0f}s)")
    return True


def _load_table_rest(name, csv_path, pg_columns):
    """Fallback: load via REST API batch INSERT for large tables that hit COPY timeouts."""
    import csv as csv_mod

    BATCH_SIZE = 500
    start = time.time()
    loaded = 0
    errors = 0

    with open(csv_path, "r", encoding="utf-8-sig", errors="replace") as f:
        reader = csv_mod.DictReader(f)
        batch = []

        for row in reader:
            record = {col: (row.get(col, "").strip() or None) for col in pg_columns}
            batch.append(record)

            if len(batch) >= BATCH_SIZE:
                body = json.dumps(batch).encode()
                req = subprocess.run(
                    ["curl", "-s", "--max-time", "60",
                     "-X", "POST", f"{SUPABASE_URL}/rest/v1/{name}",
                     "-H", f"apikey: {SUPABASE_KEY}",
                     "-H", f"Authorization: Bearer {SUPABASE_KEY}",
                     "-H", "Content-Type: application/json",
                     "-H", "Prefer: resolution=merge-duplicates,return=minimal",
                     "-d", "@-"],
                    input=body, capture_output=True, timeout=90,
                )
                if req.returncode == 0 and b"error" not in req.stdout.lower():
                    loaded += len(batch)
                else:
                    errors += 1
                    if errors > 20:
                        print(f"  [{name}] ❌ Too many REST errors, stopping")
                        return False

                if loaded % 10000 < BATCH_SIZE:
                    elapsed = time.time() - start
                    rate = loaded / elapsed if elapsed > 0 else 0
                    print(f"  [{name}] REST: {loaded:,} rows ({rate:.0f}/s)", flush=True)

                batch = []

        if batch:
            body = json.dumps(batch).encode()
            subprocess.run(
                ["curl", "-s", "--max-time", "60",
                 "-X", "POST", f"{SUPABASE_URL}/rest/v1/{name}",
                 "-H", f"apikey: {SUPABASE_KEY}",
                 "-H", f"Authorization: Bearer {SUPABASE_KEY}",
                 "-H", "Content-Type: application/json",
                 "-H", "Prefer: resolution=merge-duplicates,return=minimal",
                 "-d", "@-"],
                input=body, capture_output=True, timeout=90,
            )
            loaded += len(batch)

    elapsed = time.time() - start
    rate = loaded / elapsed if elapsed > 0 else 0
    print(f"  [{name}] ✅ REST loaded {loaded:,} rows in {elapsed:.0f}s ({rate:.0f}/s)")
    return True


# ---------------------------------------------------------------------------
# Rebuild search vectors
# ---------------------------------------------------------------------------

def rebuild_vectors():
    """Rebuild tsvector search indexes on trades and permits."""
    print("Rebuilding search vectors...")
    sqls = [
        """UPDATE trades SET search_vector =
           setweight(to_tsvector('english', coalesce(contractor_name, '')), 'A') ||
           setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
           setweight(to_tsvector('english', coalesce(permit_type, '')), 'C');""",
        """UPDATE permits SET search_vector =
           setweight(to_tsvector('english', coalesce(contractor_name, '')), 'A') ||
           setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
           setweight(to_tsvector('english', coalesce(permit_type, '')), 'C');""",
    ]
    for sql in sqls:
        table = "trades" if "trades" in sql else "permits"
        print(f"  [{table}] Rebuilding search_vector...", end=" ", flush=True)
        start = time.time()
        result = subprocess.run(
            [PSQL, PSQL_URL, "-c", sql],
            capture_output=True, text=True, timeout=600,
        )
        elapsed = time.time() - start
        if result.returncode == 0:
            print(f"✅ ({elapsed:.0f}s)")
        else:
            print(f"⚠️ ({result.stderr[:200]})")


# ---------------------------------------------------------------------------
# Count rows via REST
# ---------------------------------------------------------------------------

def count_rows_rest(table):
    """Get row count from Supabase REST API."""
    try:
        result = subprocess.run(
            ["curl", "-s", "--max-time", "10", "-o", "/dev/null", "-D", "-",
             "-H", f"apikey: {SUPABASE_KEY}",
             "-H", f"Authorization: Bearer {SUPABASE_KEY}",
             "-H", "Prefer: count=exact",
             "-H", "Range: 0-0",
             f"{SUPABASE_URL}/rest/v1/{table}?select=*"],
            capture_output=True, text=True, timeout=15,
        )
        for line in result.stdout.split("\n"):
            if "content-range" in line.lower():
                parts = line.strip().split("/")
                if len(parts) == 2:
                    return int(parts[1])
        return -1
    except Exception:
        return -1


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

def cmd_check():
    """Show current table row counts."""
    print(f"=== DDI Freshness Check — {datetime.now().strftime('%Y-%m-%d %H:%M')} ===\n")
    total = 0
    results = {}
    for name in DATASETS:
        count = count_rows_rest(name)
        results[name] = count
        status = f"{count:>10,}" if count >= 0 else "    ERROR"
        print(f"  {name:20s}: {status} rows")
        if count > 0:
            total += count
    print(f"\n  {'TOTAL':20s}: {total:>10,} rows")

    # Save state
    state = {
        "last_check": datetime.now().isoformat(),
        "tables": results,
        "total_rows": total,
    }
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)
    print(f"\nState → {STATE_FILE}")


def cmd_download(tables=None):
    """Download CSVs from data.detroitmi.gov."""
    targets = tables or list(DATASETS.keys())
    print(f"=== Downloading {len(targets)} datasets ===\n")
    results = {}
    for name in targets:
        if name not in DATASETS:
            print(f"  Unknown table: {name}")
            continue
        result = download_csv(name, DATASETS[name])
        results[name] = result
    return results


def cmd_load(tables=None):
    """Load already-downloaded CSVs into Supabase."""
    targets = tables or list(DATASETS.keys())
    print(f"\n=== Loading {len(targets)} tables ===\n")

    for name in targets:
        csv_path = os.path.join(DATA_DIR, f"{name}.csv")
        if not os.path.exists(csv_path):
            print(f"  [{name}] ⚠️ No CSV found at {csv_path}")
            continue

        # Get before count
        before = count_rows_rest(name)

        # Transform
        transformed, columns = transform_csv(name, csv_path)
        if not transformed:
            continue

        # Load
        ok = load_table_psql(name, transformed, columns)

        # Get after count
        if ok:
            after = count_rows_rest(name)
            delta = after - before if before >= 0 and after >= 0 else "?"
            print(f"  [{name}] Before: {before:,} → After: {after:,} (Δ {delta})")

    # Rebuild vectors if trades or permits were loaded
    needs_vectors = any(t in (tables or DATASETS.keys()) for t in ("trades", "permits"))
    if needs_vectors:
        rebuild_vectors()


def cmd_refresh(tables=None):
    """Full pipeline: download + load."""
    results = cmd_download(tables)
    # Only load tables that downloaded successfully
    successful = [name for name, r in results.items() if r.get("status") == "ok"]
    if successful:
        cmd_load(successful)
    else:
        print("\n❌ No tables downloaded successfully.")

    # Summary
    print(f"\n=== Refresh Summary ===")
    for name, r in results.items():
        print(f"  {name:20s}: {r.get('status', '?'):10s} | {r.get('rows', 0):>10,} CSV rows")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    cmd = sys.argv[1]
    tables = sys.argv[2:] if len(sys.argv) > 2 else None

    if cmd == "check":
        cmd_check()
    elif cmd == "download":
        cmd_download(tables)
    elif cmd == "load":
        cmd_load(tables)
    elif cmd == "refresh":
        cmd_refresh(tables)
    elif cmd == "rebuild-vectors":
        rebuild_vectors()
    else:
        print(f"Unknown command: {cmd}")
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
