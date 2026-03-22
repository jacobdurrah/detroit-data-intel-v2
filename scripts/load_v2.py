#!/usr/bin/env python3
"""Bulk load Detroit CSVs → Supabase. Idempotent upsert, resumable."""
import csv, json, os, sys, time, urllib.request, urllib.error

URL = "https://vgtwkgckvryxbgujnqro.supabase.co"
KEY = os.environ.get("SUPABASE_KEY", "")
RAW = "api/_data/raw"
STATE = "api/_data/load_state.json"
BATCH = 1000

def clean(val, t):
    if val is None or val.strip() == '': return None
    v = val.strip()
    if t == "n":
        try: return float(v.replace(',',''))
        except: return None
    if t == "i":
        try: return int(float(v.replace(',','')))
        except: return None
    if t == "b": return v.lower() in ('true','1','yes','t')
    return v

# Table configs: (csv_file, pk_fields, [(csv_col, pg_col, type)])
# type: s=str, n=num, i=int, b=bool
TABLES = {
    "sales": ("sales.csv", ["sales_id"], [
        ("Sales ID","sales_id","i"), ("Parcel ID","parcel_id","s"), ("Address","address","s"),
        ("Sale Date","sale_date","s"), ("Sale Price","sale_price","n"), ("Grantor","grantor","s"),
        ("Grantee","grantee","s"), ("Terms of Sale","terms_of_sale","s"),
        ("Sale Verification","sale_verification","s"), ("Sale Instrument","sale_instrument","s"),
        ("sale_number","sale_number","i"), ("Property Transfer Percentage","transfer_pct","n"),
        ("Multi Parcel Sale","multi_parcel","b"), ("Property Class Code","property_class_code","s"),
        ("Property Class Description","property_class_desc","s"),
        ("ECF Neighborhood","ecf_neighborhood","s"), ("Neighborhood","neighborhood","s"),
        ("Council District","council_district","s"), ("Zip Code","zip_code","s"),
        ("Longitude","longitude","n"), ("Latitude","latitude","n"),
    ]),
    "permits": ("permits.csv", ["permit_no"], [
        ("Record ID","permit_no","s"), ("Address","address","s"),
        ("Issued Date","permit_issued","s"), ("Submitted Date","permit_expires","s"),
        ("Permit Type","permit_status","s"), ("Permit Type","permit_type","s"),
        ("Current Building Use Type","bld_type_use","s"), ("Use Group","residential","s"),
        ("Description of Work","description","s"), ("Contractor Estimated Cost","estimated_cost","n"),
        ("Parcel ID","parcel_id","s"), ("Proposed Building Use Type","legal_use","s"),
        ("Number of Stories","floor_area","n"), ("Neighborhood","neighborhood","s"),
        ("Council District","council_district","s"), ("ZIP Code","zip_code","s"),
        ("Longitude","longitude","n"), ("Latitude","latitude","n"),
    ]),
    "blight": ("blight.csv", ["ticket_id"], [
        ("Ticket ID","ticket_id","i"), ("Agency Name","agency_name","s"),
        ("Inspector Name","inspector_name","s"), ("Property Owner Name","violator_name","s"),
        ("Street Number","street_number","s"), ("Street Name","street_name","s"),
        ("Zip Code","zip_code","s"), ("Ticket Issued Date","violation_date","s"),
        ("Ticket Issued Date","ticket_issued_date","s"), ("Hearing Date","hearing_date","s"),
        ("Ordinance Law","violation_code","s"), ("Ordinance Description","violation_description","s"),
        ("Disposition","disposition","s"), ("Fine Amount","fine_amount","n"),
        ("Judgement Amount","judgment_amount","n"), ("Balance Due","balance_due","n"),
        ("Payment Status","payment_status","s"), ("Collection Status","compliance_status","s"),
        ("Neighborhood","neighborhood","s"), ("Council District","council_district","s"),
        ("Latitude","latitude","n"), ("Longitude","longitude","n"),
    ]),
    "assessment": ("assessment_2026.csv", ["parcel_id"], [
        ("Parcel Number","parcel_id","s"), ("Address","address","s"),
        ("Property Class Description","property_class","s"), ("Tax Status","tax_status","s"),
        ("Tentative Assessed Value","total_assessed_value","n"),
        ("Tentative Taxable Value","total_taxable_value","n"), ("Land Value","land_value","n"),
        ("Estimated True Cash Value","improvement_value","n"), ("Neighborhood","neighborhood","s"),
        ("Residential Year Built","year_built","i"), ("Property Class","bldg_class","s"),
        ("Total Square Footage","total_floor_area","n"),
        ("Residential Building Count","floors","n"),
        ("Sale Date","last_sale_date","s"), ("Sale Price","last_sale_price","n"),
        ("Taxpayer 1","owner_name","s"),
        ("Council District","council_district","s"), ("ZIP Code","zip_code","s"),
    ]),
    "demos": ("demos.csv", ["permit_no"], [
        ("Record ID","permit_no","s"), ("Address","address","s"),
        ("Date Issued","permit_issued","s"), ("Description","permit_status","s"),
        ("Owner Name","bld_type_use","s"), ("Parcel ID","parcel_id","s"),
        ("Contractor Name","contractor_name","s"), ("Neighborhood","neighborhood","s"),
        ("Council District","council_district","s"),
        ("Longitude","longitude","n"), ("Latitude","latitude","n"),
    ]),
    "rentals": ("rentals.csv", ["certificate_number"], [
        ("record_id","certificate_number","s"), ("registration_type","status","s"),
        ("address","address","s"), ("parcel_id","parcel_id","s"),
        ("registration_type","rental_type","s"),
        ("owner_name" if False else "address","owner_name","s"),  # placeholder
        ("neighborhood","neighborhood","s"), ("council_district","council_district","s"),
        ("zip_code","zip_code","s"), ("longitude","longitude","n"), ("latitude","latitude","n"),
    ]),
    "presale": ("presale.csv", ["case_id"], [
        ("inspection_id","case_id","s"), ("address","address","s"),
        ("inspection_result","status","s"), ("inspection_result","rating","s"),
        ("parcel_id","parcel_id","s"), ("inspection_type","case_type","s"),
        ("neighborhood","neighborhood","s"), ("council_district","council_district","s"),
        ("longitude","longitude","n"), ("latitude","latitude","n"),
    ]),
    "vacant": ("vacant.csv", ["task_id"], [
        ("task_id","task_id","s"), ("Address","address","s"), ("Date Issued","date_issued","s"),
        ("owner_name","owner_name","s"), ("Neighborhood","neighborhood","s"),
        ("Council District","council_district","s"), ("Zip Code","zip_code","s"),
        ("Parcel ID","parcel_id","s"), ("Longitude","longitude","n"), ("Latitude","latitude","n"),
    ]),
    "dlba_auction": ("dlba_auction.csv", ["object_id"], [
        ("ObjectId","object_id","i"), ("Address","address","s"), ("Parcel ID","parcel_id","s"),
        ("Sale Date","sale_date","s"), ("Sale Price","sale_price","n"), ("Buyer","buyer","s"),
        ("Neighborhood","neighborhood","s"), ("Council District","council_district","s"),
        ("Zip Code","zip_code","s"), ("Longitude","longitude","n"), ("Latitude","latitude","n"),
    ]),
    "dlba_owned": ("dlba_owned.csv", ["parcel_id"], [
        ("Parcel Number","parcel_id","s"), ("Address","address","s"),
        ("Council District","council_district","s"),
        ("Neighborhood","neighborhood","s"), ("DLBA Inventory Status","property_class","s"),
        ("Longitude","longitude","n"), ("Latitude","latitude","n"),
    ]),
    "trades": ("trades.csv", ["permit_no"], [
        ("record_id","permit_no","s"), ("address","address","s"),
        ("issued_date","permit_issued","s"), ("permit_type","permit_status","s"),
        ("permit_type","permit_type","s"), ("work_description","description","s"),
        ("contact_business_name","contractor_name","s"),
        ("parcel_id","parcel_id","s"), ("neighborhood","neighborhood","s"),
        ("council_district","council_district","s"),
        ("longitude","longitude","n"), ("latitude","latitude","n"),
    ]),
}

def upsert(table, rows, retries=2):
    body = json.dumps(rows).encode()
    for attempt in range(retries + 1):
        req = urllib.request.Request(
            f"{URL}/rest/v1/{table}", data=body, method="POST",
            headers={
                "apikey": KEY, "Authorization": f"Bearer {KEY}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=minimal",
            }
        )
        try:
            resp = urllib.request.urlopen(req, timeout=120)
            return True, resp.status
        except urllib.error.HTTPError as e:
            err = e.read().decode()[:300]
            if attempt < retries and e.code >= 500:
                time.sleep(2)
                continue
            return False, f"{e.code}: {err}"
        except Exception as e:
            if attempt < retries:
                time.sleep(2)
                continue
            return False, str(e)

def load_state():
    if os.path.exists(STATE):
        with open(STATE) as f: return json.load(f)
    return {}

def save_state(s):
    with open(STATE, 'w') as f: json.dump(s, f, indent=2)

def load_table(name, state):
    cfg = TABLES[name]
    fname, pk_fields, cols = cfg
    fpath = os.path.join(RAW, fname)
    if not os.path.exists(fpath):
        print(f"  ❌ {name}: missing {fname}")
        return
    
    offset = state.get(name, {}).get("offset", 0)
    total = sum(1 for _ in open(fpath, encoding='utf-8-sig')) - 1
    if offset >= total and state.get(name, {}).get("done"):
        print(f"  ⏭️  {name}: done ({total:,})")
        return
    
    print(f"  ⬆️  {name}: {total:,} rows, from {offset:,}")
    
    # Build unique col mappings (last wins for dupes)
    seen_pg = set()
    col_map = []
    for csv_col, pg_col, dtype in reversed(cols):
        if pg_col not in seen_pg:
            seen_pg.add(pg_col)
            col_map.append((csv_col, pg_col, dtype))
    col_map.reverse()
    
    with open(fpath, 'r', encoding='utf-8-sig', errors='replace') as f:
        reader = csv.DictReader(f)
        batch = []
        row_num = 0
        loaded = 0
        errors = 0
        start = time.time()
        
        for row in reader:
            row_num += 1
            if row_num <= offset: continue
            
            record = {}
            for csv_col, pg_col, dtype in col_map:
                record[pg_col] = clean(row.get(csv_col, ''), dtype)
            
            # Skip if PK is None
            if any(record.get(k) is None for k in pk_fields):
                continue
            
            batch.append(record)
            
            if len(batch) >= BATCH:
                ok, status = upsert(name, batch)
                if ok:
                    loaded += len(batch)
                    offset = row_num
                    elapsed = time.time() - start
                    rate = loaded / elapsed if elapsed > 0 else 0
                    eta = (total - offset) / rate if rate > 0 else 0
                    if loaded % 5000 < BATCH:
                        print(f"    {loaded:,}/{total:,} ({100*offset/total:.1f}%) {rate:.0f}/s ETA {eta/60:.0f}m", flush=True)
                    state[name] = {"offset": offset, "loaded": loaded}
                    if loaded % 10000 == 0:
                        save_state(state)
                else:
                    errors += 1
                    print(f"    ⚠️  error@{row_num}: {status}", flush=True)
                    if errors > 10:
                        print(f"    ❌ Stopping {name}")
                        save_state(state)
                        return
                    # Try row-by-row for this batch
                    for r in batch:
                        ok2, _ = upsert(name, [r])
                        if ok2: loaded += 1
                batch = []
        
        if batch:
            ok, status = upsert(name, batch)
            if ok: loaded += len(batch)
            else: print(f"    ⚠️  final: {status}")
        
        state[name] = {"offset": row_num, "loaded": loaded, "done": True}
        save_state(state)
        elapsed = time.time() - start
        rate = loaded / elapsed if elapsed > 0 else 0
        print(f"  ✅ {name}: {loaded:,} rows in {elapsed:.0f}s ({rate:.0f}/s)")

if __name__ == "__main__":
    state = load_state()
    tables = sys.argv[1:] if len(sys.argv) > 1 else list(TABLES.keys())
    print(f"Loading {len(tables)} tables...")
    for name in tables:
        if name in TABLES:
            load_table(name, state)
    save_state(state)
    print("\n✅ Done!")
