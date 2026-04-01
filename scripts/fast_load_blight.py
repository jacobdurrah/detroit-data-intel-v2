#!/usr/bin/env python3
"""Fast load blight data using INSERT (no conflict resolution needed — table is empty)."""
import csv, json, os, sys, time, urllib.request, urllib.error

URL = "https://vgtwkgckvryxbgujnqro.supabase.co"
KEY = os.environ["SUPABASE_KEY"]
BATCH = 500  # Smaller batches for faster processing
STATE_FILE = "/tmp/blight_load_state.json"

COLS = [
    ("Ticket ID", "ticket_id", "i"),
    ("Agency Name", "agency_name", "s"),
    ("Inspector Name", "inspector_name", "s"),
    ("Property Owner Name", "violator_name", "s"),
    ("Street Number", "street_number", "s"),
    ("Street Name", "street_name", "s"),
    ("Zip Code", "zip_code", "s"),
    ("Ticket Issued Date", "violation_date", "s"),
    ("Hearing Date", "hearing_date", "s"),
    ("Ordinance Law", "violation_code", "s"),
    ("Ordinance Description", "violation_description", "s"),
    ("Disposition", "disposition", "s"),
    ("Fine Amount", "fine_amount", "n"),
    ("Judgement Amount", "judgment_amount", "n"),
    ("Balance Due", "balance_due", "n"),
    ("Payment Status", "payment_status", "s"),
    ("Collection Status", "compliance_status", "s"),
    ("Neighborhood", "neighborhood", "s"),
    ("Council District", "council_district", "s"),
    ("Latitude", "latitude", "n"),
    ("Longitude", "longitude", "n"),
]

def clean(val, t):
    if val is None or val.strip() == '': return None
    v = val.strip()
    if t == "n":
        try: return float(v.replace(',',''))
        except: return None
    if t == "i":
        try: return int(float(v.replace(',','')))
        except: return None
    return v

def insert_batch(rows, retries=3):
    """Plain INSERT — no conflict resolution needed for empty table."""
    body = json.dumps(rows).encode()
    for attempt in range(retries):
        req = urllib.request.Request(
            f"{URL}/rest/v1/blight", data=body, method="POST",
            headers={
                "apikey": KEY, "Authorization": f"Bearer {KEY}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=minimal",
            }
        )
        try:
            resp = urllib.request.urlopen(req, timeout=60)
            return True, resp.status
        except urllib.error.HTTPError as e:
            err = e.read().decode()[:300]
            if attempt < retries - 1 and e.code >= 500:
                time.sleep(2 * (attempt + 1))
                continue
            return False, f"{e.code}: {err}"
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(2)
                continue
            return False, str(e)

def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE) as f: return json.load(f)
    return {"offset": 0, "loaded": 0}

def save_state(s):
    with open(STATE_FILE, 'w') as f: json.dump(s, f)

def main():
    fpath = "/tmp/detroit-data-refresh/blight.csv"
    state = load_state()
    offset = state["offset"]
    total = sum(1 for _ in open(fpath, encoding='utf-8-sig')) - 1
    
    print(f"Loading blight: {total:,} rows, resuming from {offset:,}")
    
    with open(fpath, 'r', encoding='utf-8-sig', errors='replace') as f:
        reader = csv.DictReader(f)
        batch = []
        row_num = 0
        loaded = state["loaded"]
        errors = 0
        start = time.time()
        
        for row in reader:
            row_num += 1
            if row_num <= offset: continue
            
            record = {}
            for csv_col, pg_col, dtype in COLS:
                record[pg_col] = clean(row.get(csv_col, ''), dtype)
            
            if record.get("ticket_id") is None:
                continue
            
            batch.append(record)
            
            if len(batch) >= BATCH:
                ok, status = insert_batch(batch)
                if ok:
                    loaded += len(batch)
                    offset = row_num
                    elapsed = time.time() - start
                    rate = loaded / elapsed if elapsed > 0 else 0
                    eta = (total - offset) / rate if rate > 0 else 0
                    if loaded % 10000 < BATCH:
                        print(f"  {loaded:,}/{total:,} ({100*offset/total:.1f}%) {rate:.0f}/s ETA {eta/60:.0f}m", flush=True)
                    state = {"offset": offset, "loaded": loaded}
                    if loaded % 25000 < BATCH:
                        save_state(state)
                else:
                    errors += 1
                    print(f"  ⚠️ error@{row_num}: {status}", flush=True)
                    if errors > 20:
                        print(f"  ❌ Stopping after {errors} errors")
                        save_state(state)
                        return
                    # Row-by-row for this batch
                    for r in batch:
                        ok2, _ = insert_batch([r])
                        if ok2: loaded += 1
                batch = []
        
        if batch:
            ok, status = insert_batch(batch)
            if ok: loaded += len(batch)
        
        save_state({"offset": row_num, "loaded": loaded, "done": True})
        elapsed = time.time() - start
        rate = loaded / elapsed if elapsed > 0 else 0
        print(f"\n✅ blight: {loaded:,} rows in {elapsed:.0f}s ({rate:.0f}/s)")

if __name__ == "__main__":
    main()
