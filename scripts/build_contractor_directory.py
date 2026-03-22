#!/usr/bin/env python3
"""
Build contractor directory from trades + permits data.
Phase 1: Aggregate contractor stats from permit data.
Phase 2: Entity resolution via web search.
"""
import json, re, sys, time, urllib.request, urllib.parse, os
from collections import defaultdict

SUPABASE_URL = "https://vgtwkgckvryxbgujnqro.supabase.co"
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", os.environ["SUPABASE_KEY"])

def supabase_get(table, params="", limit=5000):
    """Fetch from Supabase REST API with pagination."""
    all_data = []
    offset = 0
    while True:
        sep = "&" if params else ""
        url = f"{SUPABASE_URL}/rest/v1/{table}?{params}{sep}limit={limit}&offset={offset}"
        req = urllib.request.Request(url, headers={
            "apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"
        })
        resp = urllib.request.urlopen(req, timeout=30)
        data = json.loads(resp.read())
        all_data.extend(data)
        if len(data) < limit:
            break
        offset += limit
        print(f"  ...fetched {len(all_data)} rows", file=sys.stderr)
    return all_data

def supabase_post(table, rows, upsert_col=None):
    """Insert/upsert to Supabase."""
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    if upsert_col:
        headers["Prefer"] = f"resolution=merge-duplicates"
    
    # Batch in chunks of 100
    for i in range(0, len(rows), 100):
        batch = rows[i:i+100]
        url = f"{SUPABASE_URL}/rest/v1/{table}"
        if upsert_col:
            url += f"?on_conflict={upsert_col}"
        req = urllib.request.Request(url, data=json.dumps(batch).encode(),
                                     headers=headers, method="POST")
        try:
            urllib.request.urlopen(req, timeout=30)
        except Exception as e:
            print(f"  Error inserting batch {i}: {e}", file=sys.stderr)

def normalize_name(name):
    """Normalize contractor name for deduplication."""
    if not name:
        return ""
    n = name.upper().strip()
    # Remove common suffixes
    for suffix in [" LLC", " INC", " INC.", " CO", " CO.", " CORP", " CORP.", " LTD", " LTD."]:
        n = n.replace(suffix, "")
    # Remove punctuation
    n = re.sub(r'[^A-Z0-9\s]', '', n)
    # Collapse whitespace
    n = re.sub(r'\s+', ' ', n).strip()
    return n

def classify_specialty(permit_type, description):
    """Classify work into a specialty category."""
    desc = (description or "").lower()
    ptype = (permit_type or "").lower()
    
    categories = {
        "HVAC/Heating": ["furnace", "hvac", "heating", "cooling", "air condition", "a/c", "boiler", "heat pump", "mechanical permit"],
        "Electrical": ["electric", "wiring", "circuit", "panel", "amp service", "lighting", "electrical permit"],
        "Plumbing": ["plumb", "water heater", "sewer", "drain", "pipe", "faucet", "toilet", "plumbing permit"],
        "Roofing": ["roof", "shingle", "gutter"],
        "General Construction": ["alteration", "renovation", "rehab", "remodel", "construction", "framing", "drywall"],
        "Foundation/Structural": ["foundation", "structural", "basement", "waterproof", "concrete"],
        "Fire Protection": ["fire alarm", "sprinkler", "fire suppression", "fire alarm permit"],
        "Elevator": ["elevator", "elevator permit"],
        "Solar/Energy": ["solar", "generator", "battery", "generator permit"],
        "Demolition": ["demol", "wreck", "tear down"],
        "Windows/Doors": ["window", "door", "glass"],
        "Siding/Exterior": ["siding", "exterior", "brick", "masonry", "tuckpoint"],
        "Painting": ["paint"],
        "Landscaping": ["landscape", "fence", "deck", "porch"],
        "Insulation": ["insul"],
    }
    
    matched = set()
    for cat, keywords in categories.items():
        for kw in keywords:
            if kw in desc or kw in ptype:
                matched.add(cat)
                break
    
    return list(matched) if matched else ["General"]

def extract_zip_from_address(address, lat, lng):
    """Extract zip code from address or approximate from coordinates."""
    if not address:
        return None
    m = re.search(r'\b(482\d{2})\b', address)
    if m:
        return m.group(1)
    # Approximate zip from lat/lng (Detroit zips rough mapping)
    if lat and lng:
        if lat > 42.43:
            return "48235" if lng < -83.1 else "48205"
        elif lat > 42.38:
            return "48238" if lng < -83.1 else "48213"
        elif lat > 42.35:
            return "48206" if lng < -83.05 else "48214"
        else:
            return "48209" if lng < -83.1 else "48214"
    return None

def phase1_aggregate():
    """Aggregate contractor data from trades and permits tables."""
    print("Phase 1: Fetching trades data...", file=sys.stderr)
    trades = supabase_get("trades", "contractor_name=not.is.null&permit_issued=gte.2024-01-01&select=contractor_name,permit_type,description,address,neighborhood,permit_issued,latitude,longitude")
    print(f"  Got {len(trades)} trades", file=sys.stderr)
    
    print("Fetching permits data...", file=sys.stderr)
    permits = supabase_get("permits", "contractor_name=not.is.null&permit_issued=gte.2024-01-01&select=contractor_name,permit_type,description,estimated_cost,address,neighborhood,permit_issued,latitude,longitude")
    print(f"  Got {len(permits)} permits", file=sys.stderr)
    
    # Aggregate by normalized name
    contractors = defaultdict(lambda: {
        "names": set(),
        "permit_types": set(),
        "specialties": set(),
        "descriptions": [],
        "neighborhoods": set(),
        "zips": set(),
        "lats": [],
        "lngs": [],
        "dates": [],
        "total": 0,
        "recent": 0,  # last 6 months
    })
    
    cutoff_recent = "2025-09-01"
    
    for r in trades + permits:
        name = r.get("contractor_name", "").strip()
        if not name or len(name) < 2:
            continue
        
        norm = normalize_name(name)
        if not norm:
            continue
        
        c = contractors[norm]
        c["names"].add(name)
        c["total"] += 1
        
        pt = r.get("permit_type", "")
        if pt:
            c["permit_types"].add(pt)
        
        desc = r.get("description", "")
        if desc and len(c["descriptions"]) < 10:
            c["descriptions"].append(desc[:200])
        
        for spec in classify_specialty(pt, desc):
            c["specialties"].add(spec)
        
        nb = r.get("neighborhood")
        if nb:
            c["neighborhoods"].add(nb)
        
        lat, lng = r.get("latitude"), r.get("longitude")
        if lat and lng:
            c["lats"].append(float(lat))
            c["lngs"].append(float(lng))
        
        z = extract_zip_from_address(r.get("address", ""), lat, lng)
        if z:
            c["zips"].add(z)
        
        dt = r.get("permit_issued", "")
        if dt:
            c["dates"].append(dt)
            if dt >= cutoff_recent:
                c["recent"] += 1
    
    print(f"Aggregated {len(contractors)} unique contractors", file=sys.stderr)
    
    # Build rows
    rows = []
    for norm, c in contractors.items():
        # Use the most common name variant
        name = max(c["names"], key=lambda n: sum(1 for x in trades + permits if x.get("contractor_name", "").strip() == n))
        
        avg_lat = sum(c["lats"]) / len(c["lats"]) if c["lats"] else None
        avg_lng = sum(c["lngs"]) / len(c["lngs"]) if c["lngs"] else None
        
        sorted_dates = sorted(c["dates"])
        
        rows.append({
            "name": name,
            "name_normalized": norm,
            "specialties": sorted(c["specialties"]),
            "permit_types": sorted(c["permit_types"]),
            "sample_descriptions": c["descriptions"][:5],
            "total_permits": c["total"],
            "recent_permits": c["recent"],
            "neighborhoods": sorted(c["neighborhoods"])[:20],
            "avg_lat": avg_lat,
            "avg_lng": avg_lng,
            "zip_codes": sorted(c["zips"]),
            "first_permit_date": sorted_dates[0] if sorted_dates else None,
            "last_permit_date": sorted_dates[-1] if sorted_dates else None,
        })
    
    # Sort by total permits desc
    rows.sort(key=lambda r: r["total_permits"], reverse=True)
    
    print(f"Upserting {len(rows)} contractors to directory...", file=sys.stderr)
    supabase_post("contractor_directory", rows, upsert_col="name_normalized")
    print("Done!", file=sys.stderr)
    
    # Print summary
    print(f"\nContractor Directory Summary:")
    print(f"  Total contractors: {len(rows)}")
    print(f"  With recent permits (6mo): {sum(1 for r in rows if r['recent_permits'] > 0)}")
    print(f"\nTop 20 by permits:")
    for r in rows[:20]:
        specs = ", ".join(r["specialties"][:3])
        print(f"  {r['name']}: {r['total_permits']} permits ({specs})")

if __name__ == "__main__":
    phase1_aggregate()
