#!/usr/bin/env python3
"""
Phase 2: Entity resolution for contractor directory.
Search for each contractor online and find website/phone/rating.
"""
import json, sys, time, urllib.request, urllib.parse, re, os

SUPABASE_URL = "https://vgtwkgckvryxbgujnqro.supabase.co"
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", os.environ["SUPABASE_KEY"])
BRAVE_API_KEY = os.environ.get("BRAVE_API_KEY", "")

def supabase_get(table, params="", limit=1000):
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

def brave_search(query, count=5):
    """Search using Brave Search API."""
    if not BRAVE_API_KEY:
        return []
    url = f"https://api.search.brave.com/res/v1/web/search?q={urllib.parse.quote(query)}&count={count}"
    req = urllib.request.Request(url, headers={
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": BRAVE_API_KEY
    })
    try:
        resp = urllib.request.urlopen(req, timeout=15)
        data = json.loads(resp.read())
        return data.get("web", {}).get("results", [])
    except Exception as e:
        print(f"  Search error: {e}", file=sys.stderr)
        return []

def extract_phone(text):
    """Extract phone number from text."""
    patterns = [
        r'\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}',
    ]
    for p in patterns:
        m = re.search(p, text)
        if m:
            return m.group(0)
    return None

def extract_contact_info(results, contractor_name):
    """Extract website, phone, etc. from search results."""
    info = {"website": None, "phone": None, "rating": None, "business_address": None}
    
    # Skip government/utility entities
    skip_names = ["DWSD", "DTE", "CONSUMERS", "MICH CONSOLIDATED"]
    if any(s in contractor_name.upper() for s in skip_names):
        return info
    
    for r in results:
        url = r.get("url", "")
        title = r.get("title", "")
        desc = r.get("description", "")
        combined = f"{title} {desc}"
        
        # Skip aggregator sites for website
        aggregators = ["yelp.com", "bbb.org", "yellowpages", "angi.com", "homeadvisor",
                       "mapquest", "manta.com", "facebook.com", "linkedin.com",
                       "chamberofcommerce", "dnb.com", "buzzfile", "opencorporates"]
        
        # First non-aggregator URL is likely their website
        if not info["website"]:
            is_aggregator = any(a in url.lower() for a in aggregators)
            if not is_aggregator and "google.com" not in url:
                info["website"] = url
        
        # Extract phone from any result
        if not info["phone"]:
            phone = extract_phone(combined)
            if phone:
                info["phone"] = phone
        
        # Check for rating
        rating_match = re.search(r'(\d(?:\.\d)?)\s*(?:out of 5|stars?|/5|rating)', combined.lower())
        if rating_match and not info["rating"]:
            try:
                info["rating"] = float(rating_match.group(1))
            except:
                pass
        
        # Address in Detroit
        addr_match = re.search(r'\d+\s+[A-Za-z]+(?:\s+[A-Za-z]+)*(?:,\s*Detroit)?(?:,\s*MI)?(?:\s+\d{5})?', combined)
        if addr_match and not info["business_address"] and "detroit" in combined.lower():
            info["business_address"] = addr_match.group(0)
    
    return info

def resolve_batch(contractors, limit=50):
    """Resolve a batch of contractors."""
    resolved = 0
    skipped = 0
    
    for c in contractors[:limit]:
        name = c["name"]
        cid = c["id"]
        
        # Skip already resolved
        if c.get("resolution_status") == "resolved":
            skipped += 1
            continue
        
        # Skip government/utility
        if any(s in name.upper() for s in ["DWSD", "DTE ENERGY", "CONSUMERS ENERGY"]):
            supabase_patch("contractor_directory", cid, {
                "resolution_status": "skipped",
                "resolution_date": "now()"
            })
            skipped += 1
            continue
        
        print(f"  Resolving: {name}...", end="", file=sys.stderr)
        
        query = f'"{name}" Detroit MI contractor phone'
        results = brave_search(query)
        
        if not results:
            # Try without quotes
            query = f'{name} Detroit Michigan contractor'
            results = brave_search(query)
        
        info = extract_contact_info(results, name)
        
        update = {
            "resolution_status": "resolved" if info["website"] or info["phone"] else "not_found",
            "resolution_date": "now()",
        }
        if info["website"]:
            update["website"] = info["website"]
        if info["phone"]:
            update["phone"] = info["phone"]
        if info["rating"]:
            update["rating"] = info["rating"]
        if info["business_address"]:
            update["business_address"] = info["business_address"]
        
        supabase_patch("contractor_directory", cid, update)
        
        status = "✓" if info["website"] or info["phone"] else "✗"
        w = info["website"][:40] + "..." if info["website"] and len(info["website"]) > 40 else info["website"]
        print(f" {status} web={w} phone={info['phone']}", file=sys.stderr)
        
        resolved += 1
        time.sleep(1.2)  # Rate limit
    
    print(f"\nResolved: {resolved}, Skipped: {skipped}", file=sys.stderr)

if __name__ == "__main__":
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 50
    
    print(f"Fetching contractors (limit={limit})...", file=sys.stderr)
    contractors = supabase_get(
        "contractor_directory",
        f"resolution_status=eq.pending&order=total_permits.desc",
        limit=limit
    )
    print(f"Got {len(contractors)} pending contractors", file=sys.stderr)
    
    if not contractors:
        print("No pending contractors to resolve.", file=sys.stderr)
        sys.exit(0)
    
    resolve_batch(contractors, limit=limit)
