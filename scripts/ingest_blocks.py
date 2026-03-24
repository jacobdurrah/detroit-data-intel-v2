#!/usr/bin/env python3
"""
Ingest ArcGIS street segments and address-parcel mappings into Supabase.
- 36,104 street segments → streets table
- 486,724 addresses → address_street_map table
Paginated at 2000 records per request.
"""
import json, sys, time, urllib.request, urllib.parse, psycopg2

DB_URL = ""  # no fallback — set PSQL_URL env var

STREETS_URL = "https://services2.arcgis.com/qvkbeam7Wirps6zC/ArcGIS/rest/services/BaseUnitFeatures/FeatureServer/1/query"
ADDRESSES_URL = "https://services2.arcgis.com/qvkbeam7Wirps6zC/ArcGIS/rest/services/BaseUnitFeatures/FeatureServer/0/query"

def fetch_paginated(base_url, fields, page_size=2000, return_geometry=True, max_retries=3):
    """Fetch all records from ArcGIS feature service with pagination and retry."""
    all_features = []
    offset = 0
    while True:
        params = {
            'where': '1=1',
            'outFields': ','.join(fields),
            'returnGeometry': 'true' if return_geometry else 'false',
            'outSR': '4326',
            'f': 'json',
            'resultRecordCount': str(page_size),
            'resultOffset': str(offset),
        }
        url = base_url + '?' + urllib.parse.urlencode(params)
        
        for attempt in range(max_retries):
            try:
                with urllib.request.urlopen(url, timeout=120) as resp:
                    data = json.loads(resp.read())
                break
            except Exception as e:
                if attempt < max_retries - 1:
                    wait = (attempt + 1) * 5
                    print(f'  ⚠️ Retry {attempt+1}/{max_retries} after {wait}s: {e}')
                    time.sleep(wait)
                else:
                    raise
        
        features = data.get('features', [])
        if not features:
            break
        all_features.extend(features)
        print(f'  Fetched {len(all_features)} records (offset {offset})...')
        
        if not data.get('exceededTransferLimit', False) and len(features) < page_size:
            break
        offset += page_size
        time.sleep(0.5)
    
    return all_features

def create_tables(cur):
    """Create streets and address_street_map tables."""
    cur.execute("""
    DROP TABLE IF EXISTS address_street_map CASCADE;
    DROP TABLE IF EXISTS streets CASCADE;
    
    CREATE TABLE streets (
        street_id INTEGER PRIMARY KEY,
        streetname_id INTEGER,
        street_prefix TEXT,
        street_name TEXT NOT NULL,
        street_type TEXT,
        full_street_name TEXT,
        from_addr_left INTEGER,
        to_addr_left INTEGER,
        from_addr_right INTEGER,
        to_addr_right INTEGER,
        functional_class TEXT,
        center_lat NUMERIC(12,8),
        center_lng NUMERIC(12,8),
        geojson TEXT
    );
    
    CREATE INDEX idx_streets_name ON streets(street_name);
    CREATE INDEX idx_streets_full ON streets(full_street_name);
    CREATE INDEX idx_streets_center ON streets(center_lat, center_lng);
    
    CREATE TABLE address_street_map (
        address_id INTEGER PRIMARY KEY,
        street_id INTEGER REFERENCES streets(street_id),
        parcel_id TEXT,
        building_id INTEGER,
        street_number INTEGER,
        street_name TEXT,
        street_type TEXT,
        unit_type TEXT,
        unit_number TEXT,
        zip_code TEXT,
        neighborhood TEXT,
        latitude NUMERIC(12,8),
        longitude NUMERIC(12,8)
    );
    
    CREATE INDEX idx_asm_street_id ON address_street_map(street_id);
    CREATE INDEX idx_asm_parcel_id ON address_street_map(parcel_id);
    CREATE INDEX idx_asm_neighborhood ON address_street_map(neighborhood);
    CREATE INDEX idx_asm_zip ON address_street_map(zip_code);
    CREATE INDEX idx_asm_street_name ON address_street_map(street_name);
    
    -- RLS
    ALTER TABLE streets ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "anon_read_streets" ON streets FOR SELECT TO anon USING (true);
    ALTER TABLE address_street_map ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "anon_read_asm" ON address_street_map FOR SELECT TO anon USING (true);
    """)

def load_streets(cur, features):
    """Load street segments into DB."""
    print(f'Loading {len(features)} streets...')
    batch = []
    for f in features:
        a = f['attributes']
        geo = f.get('geometry', {})
        paths = geo.get('paths', [[]])
        
        # Calculate center point from polyline
        all_pts = [pt for path in paths for pt in path]
        if all_pts:
            center_lng = sum(p[0] for p in all_pts) / len(all_pts)
            center_lat = sum(p[1] for p in all_pts) / len(all_pts)
        else:
            center_lat = center_lng = None
        
        # Store geometry as GeoJSON
        geojson = json.dumps({
            'type': 'MultiLineString' if len(paths) > 1 else 'LineString',
            'coordinates': paths if len(paths) > 1 else paths[0]
        }) if paths and paths[0] else None
        
        batch.append((
            a.get('street_id'), a.get('streetname_id'),
            a.get('street_prefix'), a.get('street_name'),
            a.get('street_type'), a.get('full_street_name'),
            a.get('from_address_left'), a.get('to_address_left'),
            a.get('from_address_right'), a.get('to_address_right'),
            a.get('functional_class_code'),
            center_lat, center_lng, geojson
        ))
    
    # Batch insert
    sql = """INSERT INTO streets (street_id, streetname_id, street_prefix, street_name,
             street_type, full_street_name, from_addr_left, to_addr_left, from_addr_right,
             to_addr_right, functional_class, center_lat, center_lng, geojson)
             VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING"""
    
    chunk_size = 500
    for i in range(0, len(batch), chunk_size):
        cur.executemany(sql, batch[i:i+chunk_size])
        print(f'  Inserted streets {i+chunk_size}/{len(batch)}')
    
    print(f'  ✅ Streets loaded: {len(batch)}')

def load_addresses(cur, features):
    """Load address-street mappings into DB."""
    print(f'Loading {len(features)} addresses...')
    batch = []
    for f in features:
        a = f['attributes']
        geo = f.get('geometry', {})
        lat = geo.get('y')
        lng = geo.get('x')
        
        batch.append((
            a.get('address_id'), a.get('street_id'), a.get('parcel_id'),
            a.get('building_id'), a.get('street_number'), a.get('street_name'),
            a.get('street_type'), a.get('unit_type'), a.get('unit_number'),
            a.get('zip_code'), a.get('neighborhood'),
            lat, lng
        ))
    
    sql = """INSERT INTO address_street_map (address_id, street_id, parcel_id, building_id,
             street_number, street_name, street_type, unit_type, unit_number,
             zip_code, neighborhood, latitude, longitude)
             VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING"""
    
    chunk_size = 500
    for i in range(0, len(batch), chunk_size):
        cur.executemany(sql, batch[i:i+chunk_size])
        print(f'  Inserted addresses {i+chunk_size}/{len(batch)}')
    
    print(f'  ✅ Addresses loaded: {len(batch)}')

def add_street_id_to_sales(cur):
    """Add street_id to sales table by joining on address."""
    print('Adding street_id to sales table...')
    cur.execute("ALTER TABLE sales ADD COLUMN IF NOT EXISTS street_id INTEGER")
    cur.execute("""
        UPDATE sales s
        SET street_id = asm.street_id
        FROM address_street_map asm
        WHERE UPPER(TRIM(s.address)) = UPPER(TRIM(asm.street_number || ' ' || asm.street_name))
        AND s.street_id IS NULL
    """)
    updated = cur.rowcount
    print(f'  ✅ Updated {updated:,} sales with street_id')
    
    cur.execute("CREATE INDEX IF NOT EXISTS idx_sales_street_id ON sales(street_id)")
    print('  ✅ Index created on sales.street_id')

def main():
    print('=== Detroit Block Data Ingestion ===\n')
    
    # Step 1: Fetch streets
    print('📥 Step 1: Fetching street segments from ArcGIS...')
    street_fields = ['street_id','streetname_id','street_prefix','street_name',
                     'street_type','full_street_name','from_address_left','to_address_left',
                     'from_address_right','to_address_right','functional_class_code']
    streets = fetch_paginated(STREETS_URL, street_fields)
    print(f'  Total streets: {len(streets)}\n')
    
    # Step 2: Fetch addresses
    print('📥 Step 2: Fetching address-street mappings from ArcGIS...')
    addr_fields = ['address_id','street_id','parcel_id','building_id','street_number',
                   'street_name','street_type','unit_type','unit_number',
                   'zip_code','neighborhood']
    addresses = fetch_paginated(ADDRESSES_URL, addr_fields, return_geometry=True)
    print(f'  Total addresses: {len(addresses)}\n')
    
    # Step 3: Load into DB
    print('💾 Step 3: Loading into Supabase...')
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor()
    
    try:
        create_tables(cur)
        load_streets(cur, streets)
        load_addresses(cur, addresses)
        conn.commit()
        print('\n✅ Tables created and loaded.\n')
    except Exception as e:
        conn.rollback()
        print(f'\n❌ Error: {e}')
        raise
    
    # Step 4: Link street_id to sales
    print('🔗 Step 4: Linking street_id to sales table...')
    try:
        add_street_id_to_sales(cur)
        conn.commit()
    except Exception as e:
        conn.rollback()
        print(f'  ⚠️ Sales linking failed (can retry): {e}')
    
    cur.close()
    conn.close()
    print('\n🎉 Done!')

if __name__ == '__main__':
    main()
