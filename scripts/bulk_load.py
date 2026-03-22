#!/usr/bin/env python3
"""
Bulk load Detroit open data CSVs into Supabase via REST API.
Idempotent: uses upsert with natural keys. Resumable: tracks progress.
"""
import csv, json, os, sys, time, urllib.request, urllib.error, hashlib
from datetime import datetime

URL = "https://vgtwkgckvryxbgujnqro.supabase.co"
KEY = os.environ.get("SUPABASE_KEY", "")
RAW_DIR = "api/_data/raw"
STATE_FILE = "api/_data/load_state.json"
BATCH_SIZE = 500  # rows per upsert

# Table definitions: csv_file -> (table_name, column_map, unique_key)
# column_map: csv_header -> pg_column (None = skip)
TABLES = {
    "sales": {
        "file": "sales.csv",
        "unique": ["sales_id"],
        "columns": {
            "Sales ID": ("sales_id", "bigint"),
            "Parcel ID": ("parcel_id", "text"),
            "Address": ("address", "text"),
            "Sale Date": ("sale_date", "date"),
            "Sale Price": ("sale_price", "numeric"),
            "Grantor": ("grantor", "text"),
            "Grantee": ("grantee", "text"),
            "Terms of Sale": ("terms_of_sale", "text"),
            "Sale Verification": ("sale_verification", "text"),
            "Sale Instrument": ("sale_instrument", "text"),
            "sale_number": ("sale_number", "integer"),
            "Property Transfer Percentage": ("transfer_pct", "numeric"),
            "Multi Parcel Sale": ("multi_parcel", "boolean"),
            "Property Class Code": ("property_class_code", "text"),
            "Property Class Description": ("property_class_desc", "text"),
            "ECF Neighborhood": ("ecf_neighborhood", "text"),
            "Neighborhood": ("neighborhood", "text"),
            "Council District": ("council_district", "text"),
            "Zip Code": ("zip_code", "text"),
            "Longitude": ("longitude", "numeric"),
            "Latitude": ("latitude", "numeric"),
        },
    },
    "permits": {
        "file": "permits.csv",
        "unique": ["permit_no"],
        "columns": {
            "PERMIT_NO": ("permit_no", "text"),
            "SITE_ADDRESS": ("address", "text"),
            "PERMIT_ISSUED": ("permit_issued", "date"),
            "PERMIT_EXPIRES": ("permit_expires", "date"),
            "PERMIT_STATUS": ("permit_status", "text"),
            "PERMIT_TYPE": ("permit_type", "text"),
            "BLD_TYPE_USE": ("bld_type_use", "text"),
            "RESIDENTIAL": ("residential", "text"),
            "DESCRIPTION": ("description", "text"),
            "CONTRACTOR_NAME": ("contractor_name", "text"),
            "CONTRACTOR_TYPE": ("contractor_type", "text"),
            "ESTIMATED_COST": ("estimated_cost", "numeric"),
            "PARCEL_NO": ("parcel_id", "text"),
            "LEGAL_USE": ("legal_use", "text"),
            "PARCEL_FLOOR_AREA": ("floor_area", "numeric"),
            "Neighborhood": ("neighborhood", "text"),
            "Council District": ("council_district", "text"),
            "Zip Code": ("zip_code", "text"),
            "Longitude": ("longitude", "numeric"),
            "Latitude": ("latitude", "numeric"),
        },
    },
    "blight": {
        "file": "blight.csv",
        "unique": ["ticket_id"],
        "columns": {
            "ticket_id": ("ticket_id", "bigint"),
            "agency_name": ("agency_name", "text"),
            "inspector_name": ("inspector_name", "text"),
            "violator_name": ("violator_name", "text"),
            "violation_street_number": ("street_number", "text"),
            "violation_street_name": ("street_name", "text"),
            "violation_zip_code": ("zip_code", "text"),
            "violation_date": ("violation_date", "timestamp"),
            "ticket_issued_date": ("ticket_issued_date", "timestamp"),
            "hearing_date": ("hearing_date", "timestamp"),
            "violation_code": ("violation_code", "text"),
            "violation_description": ("violation_description", "text"),
            "disposition": ("disposition", "text"),
            "fine_amount": ("fine_amount", "numeric"),
            "judgment_amount": ("judgment_amount", "numeric"),
            "balance_due": ("balance_due", "numeric"),
            "payment_status": ("payment_status", "text"),
            "compliance_status": ("compliance_status", "text"),
            "Neighborhood": ("neighborhood", "text"),
            "Council District": ("council_district", "text"),
            "Latitude": ("latitude", "numeric"),
            "Longitude": ("longitude", "numeric"),
        },
    },
    "assessment": {
        "file": "assessment_2026.csv",
        "unique": ["parcel_id"],
        "columns": {
            "PARCELNO": ("parcel_id", "text"),
            "PROPADDR": ("address", "text"),
            "PROPCLASS": ("property_class", "text"),
            "TAXSTATUS": ("tax_status", "text"),
            "TOTASSDVAL": ("total_assessed_value", "numeric"),
            "TOTTAXVAL": ("total_taxable_value", "numeric"),
            "LANDVALUE": ("land_value", "numeric"),
            "IMPVALUE": ("improvement_value", "numeric"),
            "NBRHOOD": ("neighborhood", "text"),
            "RESYRBUILT": ("year_built", "integer"),
            "RESBLDGCLASS": ("bldg_class", "text"),
            "TOTFLRAREA": ("total_floor_area", "numeric"),
            "RESFLOORS": ("floors", "numeric"),
            "RESBDRMS": ("bedrooms", "integer"),
            "RESFULLBATH": ("full_baths", "integer"),
            "RESHALFBATH": ("half_baths", "integer"),
            "RESEXTWALL": ("ext_wall", "text"),
            "RESHEATTYPE": ("heat_type", "text"),
            "RESHEATING": ("heating", "text"),
            "SALE_DATE": ("last_sale_date", "date"),
            "SALE_PRICE": ("last_sale_price", "numeric"),
            "OWNERNAME1": ("owner_name", "text"),
            "Longitude": ("longitude", "numeric"),
            "Latitude": ("latitude", "numeric"),
            "Council District": ("council_district", "text"),
            "Zip Code": ("zip_code", "text"),
        },
    },
    "demos": {
        "file": "demos.csv",
        "unique": ["permit_no"],
        "columns": {
            "PERMIT_NO": ("permit_no", "text"),
            "SITE_ADDRESS": ("address", "text"),
            "PERMIT_ISSUED": ("permit_issued", "date"),
            "PERMIT_STATUS": ("permit_status", "text"),
            "BLD_TYPE_USE": ("bld_type_use", "text"),
            "PARCEL_NO": ("parcel_id", "text"),
            "CONTRACTOR_NAME": ("contractor_name", "text"),
            "Neighborhood": ("neighborhood", "text"),
            "Council District": ("council_district", "text"),
            "Longitude": ("longitude", "numeric"),
            "Latitude": ("latitude", "numeric"),
        },
    },
    "rentals": {
        "file": "rentals.csv",
        "unique": ["certificate_number"],
        "columns": {
            "Certificate Number": ("certificate_number", "text"),
            "Certificate Status": ("status", "text"),
            "Property Address": ("address", "text"),
            "Parcel ID": ("parcel_id", "text"),
            "Rental Type": ("rental_type", "text"),
            "Number of Units": ("num_units", "integer"),
            "Owner Name": ("owner_name", "text"),
            "Property Manager Name": ("manager_name", "text"),
            "Neighborhood": ("neighborhood", "text"),
            "Council District": ("council_district", "text"),
            "Zip Code": ("zip_code", "text"),
            "Longitude": ("longitude", "numeric"),
            "Latitude": ("latitude", "numeric"),
        },
    },
    "presale": {
        "file": "presale.csv",
        "unique": ["case_id"],
        "columns": {
            "CaseID": ("case_id", "text"),
            "Address": ("address", "text"),
            "CaseStatus": ("status", "text"),
            "Rating": ("rating", "text"),
            "ParcelID": ("parcel_id", "text"),
            "CaseType": ("case_type", "text"),
            "Neighborhood": ("neighborhood", "text"),
            "Council District": ("council_district", "text"),
            "Longitude": ("longitude", "numeric"),
            "Latitude": ("latitude", "numeric"),
        },
    },
    "vacant": {
        "file": "vacant.csv",
        "unique": ["task_id"],
        "columns": {
            "task_id": ("task_id", "text"),
            "Address": ("address", "text"),
            "Date Issued": ("date_issued", "date"),
            "owner_name": ("owner_name", "text"),
            "Neighborhood": ("neighborhood", "text"),
            "Council District": ("council_district", "text"),
            "Zip Code": ("zip_code", "text"),
            "Parcel ID": ("parcel_id", "text"),
            "Longitude": ("longitude", "numeric"),
            "Latitude": ("latitude", "numeric"),
        },
    },
    "dlba_auction": {
        "file": "dlba_auction.csv",
        "unique": ["object_id"],
        "columns": {
            "ObjectId": ("object_id", "integer"),
            "Address": ("address", "text"),
            "Parcel ID": ("parcel_id", "text"),
            "Sale Date": ("sale_date", "date"),
            "Sale Price": ("sale_price", "numeric"),
            "Buyer": ("buyer", "text"),
            "Neighborhood": ("neighborhood", "text"),
            "Council District": ("council_district", "text"),
            "Zip Code": ("zip_code", "text"),
            "Longitude": ("longitude", "numeric"),
            "Latitude": ("latitude", "numeric"),
        },
    },
    "dlba_owned": {
        "file": "dlba_owned.csv",
        "unique": ["parcel_id"],
        "columns": {
            "parcel_id": ("parcel_id", "text"),
            "address": ("address", "text"),
            "council_district": ("council_district", "text"),
            "zip_code": ("zip_code", "text"),
            "neighborhood": ("neighborhood", "text"),
            "property_class": ("property_class", "text"),
            "Longitude": ("longitude", "numeric"),
            "Latitude": ("latitude", "numeric"),
        },
    },
    "trades": {
        "file": "trades.csv",
        "unique": ["permit_no"],
        "columns": {
            "PERMIT_NO": ("permit_no", "text"),
            "SITE_ADDRESS": ("address", "text"),
            "PERMIT_ISSUED": ("permit_issued", "date"),
            "PERMIT_STATUS": ("permit_status", "text"),
            "PERMIT_TYPE": ("permit_type", "text"),
            "DESCRIPTION": ("description", "text"),
            "CONTRACTOR_NAME": ("contractor_name", "text"),
            "ESTIMATED_COST": ("estimated_cost", "numeric"),
            "PARCEL_NO": ("parcel_id", "text"),
            "Neighborhood": ("neighborhood", "text"),
            "Council District": ("council_district", "text"),
            "Longitude": ("longitude", "numeric"),
            "Latitude": ("latitude", "numeric"),
        },
    },
    "crime": {
        "file": "crime_combined",  # special: combine 2024+2025+2026
        "unique": ["crime_id", "year"],
        "columns": {
            "crime_id": ("crime_id", "bigint"),
            "year": ("year", "integer"),
            "report_number": ("report_number", "text"),
            "address": ("address", "text"),
            "offense_description": ("offense_description", "text"),
            "offense_category": ("offense_category", "text"),
            "incident_timestamp": ("incident_timestamp", "timestamp"),
            "neighborhood": ("neighborhood", "text"),
            "council_district": ("council_district", "text"),
            "longitude": ("longitude", "numeric"),
            "latitude": ("latitude", "numeric"),
        },
    },
}


def supabase_post(path, data, method="POST"):
    """POST/PATCH to Supabase REST API"""
    body = json.dumps(data).encode()
    req = urllib.request.Request(
        f"{URL}/rest/v1/{path}",
        data=body,
        method=method,
        headers={
            "apikey": KEY,
            "Authorization": f"Bearer {KEY}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        }
    )
    try:
        resp = urllib.request.urlopen(req, timeout=60)
        return {"ok": True, "status": resp.status}
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        return {"ok": False, "status": e.code, "error": body[:500]}


def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE) as f:
            return json.load(f)
    return {}


def save_state(state):
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f, indent=2)


def clean_value(val, dtype):
    """Clean a CSV value for Postgres"""
    if val is None or val.strip() == '':
        return None
    val = val.strip()
    if dtype == "numeric":
        try:
            return float(val.replace(',', ''))
        except:
            return None
    elif dtype == "integer" or dtype == "bigint":
        try:
            return int(float(val.replace(',', '')))
        except:
            return None
    elif dtype == "boolean":
        return val.lower() in ('true', '1', 'yes', 't')
    elif dtype == "date":
        # Handle various date formats
        for fmt in ["%Y-%m-%d", "%m/%d/%Y", "%Y-%m-%dT%H:%M:%S"]:
            try:
                return datetime.strptime(val[:10], fmt[:len(val[:10])+2]).strftime("%Y-%m-%d")
            except:
                continue
        return val[:10] if len(val) >= 10 else val
    elif dtype == "timestamp":
        return val
    return val


def create_table_sql(table_name, columns, unique_keys):
    """Generate CREATE TABLE SQL"""
    cols = []
    for csv_col, (pg_col, dtype) in columns.items():
        pg_type = {
            "text": "TEXT",
            "integer": "INTEGER",
            "bigint": "BIGINT",
            "numeric": "NUMERIC",
            "boolean": "BOOLEAN",
            "date": "DATE",
            "timestamp": "TIMESTAMPTZ",
        }.get(dtype, "TEXT")
        cols.append(f'  "{pg_col}" {pg_type}')
    
    cols.append(f'  "created_at" TIMESTAMPTZ DEFAULT NOW()')
    cols.append(f'  "updated_at" TIMESTAMPTZ DEFAULT NOW()')
    
    pk = ", ".join(f'"{k}"' for k in unique_keys)
    
    sql = f'CREATE TABLE IF NOT EXISTS "public"."{table_name}" (\n'
    sql += ",\n".join(cols)
    sql += f',\n  PRIMARY KEY ({pk})'
    sql += "\n);"
    return sql


if __name__ == "__main__":
    state = load_state()
    
    # Print what we need to do
    for table_name, config in TABLES.items():
        loaded = state.get(table_name, {}).get("loaded", 0)
        fname = config["file"]
        if fname == "crime_combined":
            print(f"  {table_name}: crime combined (special handling)")
        else:
            fpath = os.path.join(RAW_DIR, fname)
            if os.path.exists(fpath):
                total = sum(1 for _ in open(fpath)) - 1
                print(f"  {table_name}: {total:,} rows, loaded {loaded:,}")
            else:
                print(f"  {table_name}: FILE MISSING ({fname})")
    
    # Generate CREATE TABLE statements
    print("\n--- CREATE TABLE SQL ---\n")
    for table_name, config in TABLES.items():
        if table_name == "crime":
            continue  # special
        sql = create_table_sql(table_name, config["columns"], config["unique"])
        print(sql)
        print()
