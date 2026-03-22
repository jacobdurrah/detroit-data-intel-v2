#!/usr/bin/env python3
"""
Bulk load Detroit open data CSVs into Supabase via REST API upsert.
Idempotent (upsert with ON CONFLICT), resumable (tracks row offset per table).
"""
import csv, json, os, sys, time, urllib.request, urllib.error
from datetime import datetime

URL = "https://vgtwkgckvryxbgujnqro.supabase.co"
KEY = os.environ.get("SUPABASE_KEY", "")
RAW = "api/_data/raw"
STATE = "api/_data/load_state.json"
BATCH = 1000

# CSV column -> PG column mapping per table
MAPS = {
    "sales": {
        "file": "sales.csv",
        "map": {
            "Sales ID": "sales_id", "Parcel ID": "parcel_id", "Address": "address",
            "Sale Date": "sale_date", "Sale Price": "sale_price", "Grantor": "grantor",
            "Grantee": "grantee", "Terms of Sale": "terms_of_sale",
            "Sale Verification": "sale_verification", "Sale Instrument": "sale_instrument",
            "sale_number": "sale_number", "Property Transfer Percentage": "transfer_pct",
            "Multi Parcel Sale": "multi_parcel", "Property Class Code": "property_class_code",
            "Property Class Description": "property_class_desc",
            "ECF Neighborhood": "ecf_neighborhood", "Neighborhood": "neighborhood",
            "Council District": "council_district", "Zip Code": "zip_code",
            "Longitude": "longitude", "Latitude": "latitude",
        },
        "types": {"sales_id": "int", "sale_price": "num", "sale_number": "int",
                   "transfer_pct": "num", "multi_parcel": "bool", "longitude": "num", "latitude": "num"},
    },
    "permits": {
        "file": "permits.csv",
        "map": {
            "PERMIT_NO": "permit_no", "SITE_ADDRESS": "address",
            "PERMIT_ISSUED": "permit_issued", "PERMIT_EXPIRES": "permit_expires",
            "PERMIT_STATUS": "permit_status", "PERMIT_TYPE": "permit_type",
            "BLD_TYPE_USE": "bld_type_use", "RESIDENTIAL": "residential",
            "DESCRIPTION": "description", "CONTRACTOR_NAME": "contractor_name",
            "CONTRACTOR_TYPE": "contractor_type", "ESTIMATED_COST": "estimated_cost",
            "PARCEL_NO": "parcel_id", "LEGAL_USE": "legal_use",
            "PARCEL_FLOOR_AREA": "floor_area", "Neighborhood": "neighborhood",
            "Council District": "council_district", "Zip Code": "zip_code",
            "Longitude": "longitude", "Latitude": "latitude",
        },
        "types": {"estimated_cost": "num", "floor_area": "num", "longitude": "num", "latitude": "num"},
    },
    "blight": {
        "file": "blight.csv",
        "map": {
            "ticket_id": "ticket_id", "agency_name": "agency_name",
            "inspector_name": "inspector_name", "violator_name": "violator_name",
            "violation_street_number": "street_number", "violation_street_name": "street_name",
            "violation_zip_code": "zip_code", "violation_date": "violation_date",
            "ticket_issued_date": "ticket_issued_date", "hearing_date": "hearing_date",
            "violation_code": "violation_code", "violation_description": "violation_description",
            "disposition": "disposition", "fine_amount": "fine_amount",
            "judgment_amount": "judgment_amount", "balance_due": "balance_due",
            "payment_status": "payment_status", "compliance_status": "compliance_status",
            "Neighborhood": "neighborhood", "Council District": "council_district",
            "Latitude": "latitude", "Longitude": "longitude",
        },
        "types": {"ticket_id": "int", "fine_amount": "num", "judgment_amount": "num",
                   "balance_due": "num", "longitude": "num", "latitude": "num"},
    },
    "assessment": {
        "file": "assessment_2026.csv",
        "map": {
            "PARCELNO": "parcel_id", "PROPADDR": "address", "PROPCLASS": "property_class",
            "TAXSTATUS": "tax_status", "TOTASSDVAL": "total_assessed_value",
            "TOTTAXVAL": "total_taxable_value", "LANDVALUE": "land_value",
            "IMPVALUE": "improvement_value", "NBRHOOD": "neighborhood",
            "RESYRBUILT": "year_built", "RESBLDGCLASS": "bldg_class",
            "TOTFLRAREA": "total_floor_area", "RESFLOORS": "floors",
            "RESBDRMS": "bedrooms", "RESFULLBATH": "full_baths", "RESHALFBATH": "half_baths",
            "RESEXTWALL": "ext_wall", "RESHEATTYPE": "heat_type", "RESHEATING": "heating",
            "SALE_DATE": "last_sale_date", "SALE_PRICE": "last_sale_price",
            "OWNERNAME1": "owner_name", "Longitude": "longitude", "Latitude": "latitude",
            "Council District": "council_district", "Zip Code": "zip_code",
        },
        "types": {"total_assessed_value": "num", "total_taxable_value": "num", "land_value": "num",
                   "improvement_value": "num", "year_built": "int", "total_floor_area": "num",
                   "floors": "num", "bedrooms": "int", "full_baths": "int", "half_baths": "int",
                   "last_sale_price": "num", "longitude": "num", "latitude": "num"},
    },
    "demos": {
        "file": "demos.csv",
        "map": {
            "PERMIT_NO": "permit_no", "SITE_ADDRESS": "address",
            "PERMIT_ISSUED": "permit_issued", "PERMIT_STATUS": "permit_status",
            "BLD_TYPE_USE": "bld_type_use", "PARCEL_NO": "parcel_id",
            "CONTRACTOR_NAME": "contractor_name", "Neighborhood": "neighborhood",
            "Council District": "council_district",
            "Longitude": "longitude", "Latitude": "latitude",
        },
        "types": {"longitude": "num", "latitude": "num"},
    },
    "rentals": {
        "file": "rentals.csv",
        "map": {
            "Certificate Number": "certificate_number", "Certificate Status": "status",
            "Property Address": "address", "Parcel ID": "parcel_id",
            "Rental Type": "rental_type", "Number of Units": "num_units",
            "Owner Name": "owner_name", "Property Manager Name": "manager_name",
            "Neighborhood": "neighborhood", "Council District": "council_district",
            "Zip Code": "zip_code", "Longitude": "longitude", "Latitude": "latitude",
        },
        "types": {"num_units": "int", "longitude": "num", "latitude": "num"},
    },
    "presale": {
        "file": "presale.csv",
        "map": {
            "CaseID": "case_id", "Address": "address", "CaseStatus": "status",
            "Rating": "rating", "ParcelID": "parcel_id", "CaseType": "case_type",
            "Neighborhood": "neighborhood", "Council District": "council_district",
            "Longitude": "longitude", "Latitude": "latitude",
        },
        "types": {"longitude": "num", "latitude": "num"},
    },
    "vacant": {
        "file": "vacant.csv",
        "map": {
            "task_id": "task_id", "Address": "address", "Date Issued": "date_issued",
            "owner_name": "owner_name", "Neighborhood": "neighborhood",
            "Council District": "council_district", "Zip Code": "zip_code",
            "Parcel ID": "parcel_id", "Longitude": "longitude", "Latitude": "latitude",
        },
        "types": {"longitude": "num", "latitude": "num"},
    },
    "dlba_auction": {
        "file": "dlba_auction.csv",
        "map": {
            "ObjectId": "object_id", "Address": "address", "Parcel ID": "parcel_id",
            "Sale Date": "sale_date", "Sale Price": "sale_price", "Buyer": "buyer",
            "Neighborhood": "neighborhood", "Council District": "council_district",
            "Zip Code": "zip_code", "Longitude": "longitude", "Latitude": "latitude",
        },
        "types": {"object_id": "int", "sale_price": "num", "longitude": "num", "latitude": "num"},
    },
    "dlba_owned": {
        "file": "dlba_owned.csv",
        "map": {
            "parcel_id": "parcel_id", "address": "address",
            "council_district": "council_district", "zip_code": "zip_code",
            "neighborhood": "neighborhood", "property_class": "property_class",
            "Longitude": "longitude", "Latitude": "latitude",
        },
        "types": {"longitude": "num", "latitude": "num"},
    },
    "trades": {
        "file": "trades.csv",
        "map": {
            "PERMIT_NO": "permit_no", "SITE_ADDRESS": "address",
            "PERMIT_ISSUED": "permit_issued", "PERMIT_STATUS": "permit_status",
            "PERMIT_TYPE": "permit_type", "DESCRIPTION": "description",
            "CONTRACTOR_NAME": "contractor_name", "ESTIMATED_COST": "estimated_cost",
            "PARCEL_NO": "parcel_id", "Neighborhood": "neighborhood",
            "Council District": "council_district",
            "Longitude": "longitude", "Latitude": "latitude",
        },
        "types": {"estimated_cost": "num", "longitude": "num", "latitude": "num"},
    },
}

def clean(val, dtype):
    if val is None or val.strip() == '':
        return None
    v = val.strip()
    if dtype == "num":
        try: return float(v.replace(',', ''))
        except: return None
    if dtype == "int":
        try: return int(float(v.replace(',', '')))
        except: return None
    if dtype == "bool":
        return v.lower() in ('true', '1', 'yes', 't')
    return v

def upsert(table, rows):
    body = json.dumps(rows).encode()
    req = urllib.request.Request(
        f"{URL}/rest/v1/{table}",
        data=body,
        method="POST",
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
        return False, f"{e.code}: {err}"

def load_state():
    if os.path.exists(STATE):
        with open(STATE) as f: return json.load(f)
    return {}

def save_state(s):
    with open(STATE, 'w') as f: json.dump(s, f, indent=2)

def load_table(name, cfg, state):
    fpath = os.path.join(RAW, cfg["file"])
    if not os.path.exists(fpath):
        print(f"  ❌ {name}: file missing ({cfg['file']})")
        return
    
    col_map = cfg["map"]
    types = cfg.get("types", {})
    offset = state.get(name, {}).get("offset", 0)
    
    total = sum(1 for _ in open(fpath)) - 1
    if offset >= total:
        print(f"  ⏭️  {name}: already loaded ({total:,} rows)")
        return
    
    print(f"  ⬆️  {name}: {total:,} rows, resuming from {offset:,}")
    
    with open(fpath, 'r', encoding='utf-8', errors='replace') as f:
        reader = csv.DictReader(f)
        batch = []
        row_num = 0
        loaded = 0
        errors = 0
        start = time.time()
        
        for row in reader:
            row_num += 1
            if row_num <= offset:
                continue
            
            record = {}
            for csv_col, pg_col in col_map.items():
                val = row.get(csv_col, '')
                dtype = types.get(pg_col, "text")
                record[pg_col] = clean(val, dtype)
            
            # Skip rows where primary key is None
            if any(record.get(k) is None for k in (["sales_id"] if name == "sales" else 
                                                      ["ticket_id"] if name == "blight" else
                                                      ["parcel_id"] if name in ("assessment", "dlba_owned") else
                                                      ["object_id"] if name == "dlba_auction" else
                                                      [list(col_map.values())[0]])):
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
                    print(f"    {loaded:,}/{total:,} ({100*offset/total:.1f}%) {rate:.0f}/s ETA {eta/60:.0f}m", flush=True)
                    state[name] = {"offset": offset, "loaded": loaded}
                    if loaded % 10000 == 0:
                        save_state(state)
                else:
                    errors += 1
                    print(f"    ⚠️  batch error at row {row_num}: {status}")
                    if errors > 5:
                        print(f"    ❌ Too many errors, stopping {name}")
                        save_state(state)
                        return
                    # Try smaller batch
                    for i in range(0, len(batch), 100):
                        ok2, _ = upsert(name, batch[i:i+100])
                        if ok2:
                            loaded += min(100, len(batch) - i)
                batch = []
        
        # Final batch
        if batch:
            ok, status = upsert(name, batch)
            if ok:
                loaded += len(batch)
                offset = row_num
            else:
                print(f"    ⚠️  final batch error: {status}")
        
        state[name] = {"offset": offset, "loaded": loaded, "done": True}
        save_state(state)
        elapsed = time.time() - start
        print(f"  ✅ {name}: {loaded:,} rows in {elapsed:.0f}s ({loaded/elapsed:.0f}/s)")

if __name__ == "__main__":
    state = load_state()
    
    # Allow specifying specific tables as args
    tables = sys.argv[1:] if len(sys.argv) > 1 else list(MAPS.keys())
    
    print(f"Loading {len(tables)} tables into Supabase...")
    for name in tables:
        if name in MAPS:
            load_table(name, MAPS[name], state)
    
    save_state(state)
    print("\n✅ All done!")
