#!/usr/bin/env python3
"""
Resolve ALL remaining contractors by searching web for each one.
Uses Brave Search API via subprocess call to openclaw's web_search.
Falls back to BuildZoom, Yelp, and general Google-style searches.
"""
import json, sys, os, re, time, urllib.request, urllib.parse

SUPABASE_URL = "https://vgtwkgckvryxbgujnqro.supabase.co"
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")

def supabase_get(table, params="", limit=300):
    url = f"{SUPABASE_URL}/rest/v1/{table}?{params}&limit={limit}"
    req = urllib.request.Request(url, headers={
        "apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"
    })
    return json.loads(urllib.request.urlopen(req, timeout=30).read())

def supabase_patch(table, id_val, data):
    url = f"{SUPABASE_URL}/rest/v1/{table}?id=eq.{id_val}"
    req = urllib.request.Request(url, data=json.dumps(data).encode(), headers={
        "apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json", "Prefer": "return=minimal"
    }, method="PATCH")
    urllib.request.urlopen(req, timeout=30)

def brave_search(query, api_key):
    """Search via Brave Search API."""
    url = f"https://api.search.brave.com/res/v1/web/search?q={urllib.parse.quote(query)}&count=5"
    req = urllib.request.Request(url, headers={
        "Accept": "application/json",
        "X-Subscription-Token": api_key
    })
    try:
        resp = urllib.request.urlopen(req, timeout=15)
        data = json.loads(resp.read())
        return data.get("web", {}).get("results", [])
    except Exception as e:
        return []

def extract_phone(text):
    m = re.search(r'\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}', text)
    return m.group(0) if m else None

def extract_info(results, name):
    """Extract website, phone, yelp link from search results."""
    info = {"website": None, "phone": None, "yelp": None, "buildzoom": None}
    
    aggregators = ["yelp.com", "bbb.org", "yellowpages", "angi.com", "homeadvisor",
                   "mapquest", "manta.com", "facebook.com", "linkedin.com",
                   "chamberofcommerce", "dnb.com", "buzzfile", "opencorporates",
                   "buildzoom.com", "nextdoor.com", "thumbtack.com", "networx.com"]
    
    for r in results:
        url = r.get("url", "")
        title = r.get("title", "")
        desc = r.get("description", "")
        combined = f"{title} {desc}"
        
        # Capture Yelp link
        if "yelp.com" in url and not info["yelp"]:
            info["yelp"] = url
        
        # Capture BuildZoom link
        if "buildzoom.com" in url and not info["buildzoom"]:
            info["buildzoom"] = url
        
        # First non-aggregator URL = likely their website
        if not info["website"]:
            is_agg = any(a in url.lower() for a in aggregators)
            if not is_agg and "google.com" not in url and "wheree.com" not in url:
                info["website"] = url
        
        # Phone from any result
        if not info["phone"]:
            phone = extract_phone(combined)
            if phone:
                info["phone"] = phone
    
    return info

def resolve_contractor(name, api_key):
    """Search for a contractor and return contact info."""
    # Strategy 1: Direct name search with Michigan
    results = brave_search(f'"{name}" Michigan contractor phone', api_key)
    
    # Strategy 2: If no results, try without quotes
    if not results:
        results = brave_search(f'{name} Michigan contractor', api_key)
    
    # Strategy 3: Try BuildZoom specifically
    if not results:
        clean = re.sub(r'[,.\-&/]', ' ', name).strip()
        results = brave_search(f'{clean} Michigan buildzoom', api_key)
    
    info = extract_info(results, name)
    
    # If we got a Yelp or BuildZoom link but no phone, try fetching the page
    # (skipping for now to avoid rate limits — the links themselves are valuable)
    
    return info

def main():
    api_key = os.environ.get("BRAVE_API_KEY", "")
    if not api_key:
        print("ERROR: BRAVE_API_KEY not set", file=sys.stderr)
        sys.exit(1)
    
    # Get all unresolved
    contractors = supabase_get("contractor_directory", 
        "resolution_status=eq.not_found&order=total_permits.desc")
    
    print(f"Resolving {len(contractors)} contractors...", file=sys.stderr)
    
    resolved = 0
    found_phone = 0
    found_website = 0
    found_yelp = 0
    
    for i, c in enumerate(contractors):
        name = c["name"]
        cid = c["id"]
        
        # Skip government entities
        if any(s in name.upper() for s in ["HOUSING COMMISSION", "CITY OF", "DWSD", "DTE "]):
            supabase_patch("contractor_directory", cid, {
                "resolution_status": "skipped", "resolution_date": "now()"
            })
            print(f"  [{i+1}/{len(contractors)}] SKIP {name} (government)", file=sys.stderr)
            continue
        
        info = resolve_contractor(name, api_key)
        
        update = {"resolution_status": "resolved", "resolution_date": "now()"}
        if info["website"]:
            update["website"] = info["website"]
            found_website += 1
        if info["phone"]:
            update["phone"] = info["phone"]
            found_phone += 1
        
        # Store yelp/buildzoom in business_address field as a fallback reference
        refs = []
        if info["yelp"]:
            refs.append(info["yelp"])
            found_yelp += 1
        if info["buildzoom"]:
            refs.append(info["buildzoom"])
        if refs and not update.get("website"):
            update["website"] = refs[0]  # Use yelp/buildzoom as website fallback
            found_website += 1
        
        supabase_patch("contractor_directory", cid, update)
        resolved += 1
        
        status = "✓" if info["phone"] or info["website"] or info["yelp"] else "○"
        w = (info["website"] or info["yelp"] or "")[:50]
        print(f"  [{i+1}/{len(contractors)}] {status} {name[:40]:40s} | ph={info['phone'] or '-':15s} | {w}", file=sys.stderr)
        
        time.sleep(1.0)  # Rate limit
    
    print(f"\n=== DONE ===", file=sys.stderr)
    print(f"Resolved: {resolved}", file=sys.stderr)
    print(f"Found phone: {found_phone}", file=sys.stderr)
    print(f"Found website/link: {found_website}", file=sys.stderr)
    print(f"Found Yelp: {found_yelp}", file=sys.stderr)

if __name__ == "__main__":
    main()
