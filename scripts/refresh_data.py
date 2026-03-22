#!/usr/bin/env python3
"""
Detroit Data Intel — Data Freshness Pipeline
Downloads latest data from data.detroitmi.gov and loads into Supabase.
Run monthly via cron or on-demand.
"""
import json, os, sys, csv, io, time, urllib.request, subprocess, tempfile
from datetime import datetime

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://vgtwkgckvryxbgujnqro.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", os.environ.get("SUPABASE_SERVICE_KEY", os.environ["SUPABASE_KEY"]))

DATASETS = {
    "sales": {
        "id": "d26fda1e80b04630a6e56627e6fbceb8",
        "table": "sales",
        "key": "sales_id",
    },
    "blight": {
        "id": "9ce72b42872844bdbe272c607224e3b3",
        "table": "blight",
        "key": "ticket_id",
    },
    "permits": {
        "id": "86d47e86062e4beeb19344eb125b75d2",
        "table": "permits",
        "key": "permit_no",
    },
    "trades": {
        "id": "f77e9fd44b7e44089b41d3f8161631fa",
        "table": "trades",
        "key": "permit_no",
    },
    "assessment": {
        "id": "8220714b2bcd492fa861564e55cbd725",
        "table": "assessment",
        "key": "parcel_id",
    },
    "dlba_owned": {
        "id": "848bc665295f4ca9b1e25068ffa88ab0",
        "table": "dlba_owned",
        "key": "parcel_id",
    },
    "dlba_auction": {
        "id": "88d078e0b6fc404bb685cbd4be4b0fb1",
        "table": "dlba_auction",
        "key": "object_id",
    },
    "demos": {
        "id": "56b20af695134bd1b4ab65e1876ae79b",
        "table": "demos",
        "key": "permit_no",
    },
    "rentals": {
        "id": "145ebb0e507f4aae95f028559a2f0877",
        "table": "rentals",
        "key": "certificate_number",
    },
    "presale": {
        "id": "11bcabfc01c14ed8ae2c6fd5e8a6077c",
        "table": "presale",
        "key": "case_id",
    },
    "vacant": {
        "id": "85fccf67f3e44c4bb767b9e2b190d576",
        "table": "vacant",
        "key": "task_id",
    },
}

def download_csv(dataset_id, name):
    """Download CSV from data.detroitmi.gov."""
    url = f"https://data.detroitmi.gov/api/download/v1/items/{dataset_id}/csv?layers=0"
    print(f"  Downloading {name}...", end="", flush=True)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "DetroitDataIntel/1.0"})
        resp = urllib.request.urlopen(req, timeout=300)
        data = resp.read()
        print(f" {len(data):,} bytes")
        return data
    except Exception as e:
        print(f" ERROR: {e}")
        return None

def count_rows(table):
    """Get current row count from Supabase REST API."""
    try:
        url = f"{SUPABASE_URL}/rest/v1/{table}?select=count"
        req = urllib.request.Request(url, headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Prefer": "count=exact",
            "Range": "0-0",
        })
        resp = urllib.request.urlopen(req, timeout=15)
        # Count is in the Content-Range header: "0-0/12345"
        cr = resp.headers.get("Content-Range", "")
        if "/" in cr:
            return int(cr.split("/")[1])
        return 0
    except Exception as e:
        print(f"    count_rows({table}): {e}")
        return -1

def refresh_table(name, config, data_dir="/tmp/detroit-data-refresh"):
    """Download and reload a table."""
    os.makedirs(data_dir, exist_ok=True)
    csv_path = os.path.join(data_dir, f"{name}.csv")
    
    before_count = count_rows(config["table"])
    
    csv_data = download_csv(config["id"], name)
    if not csv_data:
        return {"table": name, "status": "download_failed", "before": before_count}
    
    with open(csv_path, "wb") as f:
        f.write(csv_data)
    
    # Count CSV rows
    csv_lines = csv_data.decode("utf-8", errors="replace").count("\n") - 1
    
    # For now, just report — full reload requires table-specific column mapping
    # which is already done in the initial load scripts
    return {
        "table": name,
        "status": "downloaded",
        "before_db": before_count,
        "csv_rows": csv_lines,
        "delta": csv_lines - before_count if before_count >= 0 else "unknown",
        "csv_path": csv_path,
    }

def check_freshness():
    """Check all tables for row counts and staleness."""
    results = []
    for name, config in DATASETS.items():
        count = count_rows(config["table"])
        results.append({"table": name, "rows": count})
    return results

def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "check"
    
    if mode == "check":
        print("=== Detroit Data Intel — Freshness Check ===")
        print(f"Timestamp: {datetime.now().isoformat()}")
        print()
        results = check_freshness()
        total = 0
        for r in results:
            print(f"  {r['table']:20s}: {r['rows']:>10,} rows")
            if r['rows'] > 0:
                total += r['rows']
        print(f"\n  {'TOTAL':20s}: {total:>10,} rows")
        
        # Write state file
        state = {
            "last_check": datetime.now().isoformat(),
            "tables": {r["table"]: r["rows"] for r in results},
            "total_rows": total,
        }
        state_path = os.path.join(os.path.dirname(__file__), "..", "api", "_data", "freshness-state.json")
        os.makedirs(os.path.dirname(state_path), exist_ok=True)
        with open(state_path, "w") as f:
            json.dump(state, f, indent=2)
        print(f"\nState written to {state_path}")
        
    elif mode == "download":
        tables = sys.argv[2:] if len(sys.argv) > 2 else DATASETS.keys()
        print(f"=== Downloading {len(list(tables))} datasets ===")
        for name in tables:
            if name not in DATASETS:
                print(f"  Unknown table: {name}")
                continue
            result = refresh_table(name, DATASETS[name])
            print(f"  {result['table']}: {result['status']} | DB: {result.get('before_db', '?')} | CSV: {result.get('csv_rows', '?')} | Delta: {result.get('delta', '?')}")
    
    else:
        print(f"Usage: {sys.argv[0]} [check|download] [table1 table2 ...]")

if __name__ == "__main__":
    main()
