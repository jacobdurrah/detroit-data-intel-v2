#!/usr/bin/env python3
"""Detroit Data Intelligence V2 — Data Processing Pipeline
Pre-computes all aggregations and creates API-ready JSON files.
"""

import json
import os
import sys
import time
from collections import defaultdict
from pathlib import Path
from statistics import median

CACHE_DIR = Path(__file__).resolve().parent.parent / "data-source" / "cache"
LENDING_PATH = Path("/Users/agent-x/Projects/detroit-data-intel/deploy/api/lending.json")
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "api" / "_data"


def load_json(path):
    with open(path) as f:
        return json.load(f)


def save_json(name, data):
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUTPUT_DIR / f"{name}.json"
    with open(path, "w") as f:
        json.dump(data, f, separators=(",", ":"))
    size_mb = path.stat().st_size / 1024 / 1024
    print(f"  Saved {name}.json ({size_mb:.1f} MB, {len(data) if isinstance(data, list) else 'obj'} items)")


def clean_coord(val):
    if val is None:
        return None
    try:
        v = float(val)
        return round(v, 6) if v != 0 else None
    except (ValueError, TypeError):
        return None


def process_sales():
    print("\n=== Processing Sales ===")
    raw = load_json(CACHE_DIR / "sales.json")
    records = []
    for r in raw:
        lat = clean_coord(r.get("latitude"))
        lng = clean_coord(r.get("longitude"))
        price = r.get("amt_sale_price")
        try:
            price = float(price) if price else 0
        except (ValueError, TypeError):
            price = 0
        records.append({
            "id": r.get("sale_id"),
            "pid": r.get("parcel_id"),
            "addr": r.get("address"),
            "dt": r.get("sale_date"),
            "pr": price,
            "gr": r.get("grantor"),
            "ge": r.get("grantee"),
            "tos": r.get("term_of_sale"),
            "si": r.get("sale_instrument"),
            "pcc": r.get("property_class_code"),
            "pcd": r.get("property_class_description"),
            "nb": r.get("neighborhood"),
            "ecf": r.get("ecf_neighborhood"),
            "cd": r.get("council_district"),
            "zip": r.get("zip_code"),
            "lat": lat,
            "lng": lng,
        })
    save_json("sales", records)
    return records


def process_permits():
    print("\n=== Processing Building Permits ===")
    raw = load_json(CACHE_DIR / "permits.json")
    records = []
    for r in raw:
        records.append({
            "id": r.get("record_id"),
            "addr": r.get("address"),
            "type": r.get("permit_type"),
            "desc": r.get("work_description"),
            "dt": r.get("issued_date"),
            "nb": r.get("neighborhood"),
            "cur": r.get("current_use_type"),
            "prop": r.get("proposed_use_type"),
            "dlba": r.get("is_purchased_from_dlba"),
            "lat": clean_coord(r.get("latitude")),
            "lng": clean_coord(r.get("longitude")),
        })
    save_json("permits", records)
    return records


def process_trades():
    print("\n=== Processing Trades Permits ===")
    raw = load_json(CACHE_DIR / "trades.json")
    records = []
    for r in raw:
        records.append({
            "id": r.get("record_id"),
            "addr": r.get("address"),
            "type": r.get("permit_type"),
            "desc": r.get("work_description"),
            "dt": r.get("issued_date"),
            "own": r.get("owner_name"),
            "biz": r.get("contact_business_name"),
            "con": r.get("contact_name"),
            "caddr": r.get("contact_address"),
            "kaddr": r.get("contractor_address"),
            "nb": r.get("neighborhood"),
            "lat": clean_coord(r.get("latitude")),
            "lng": clean_coord(r.get("longitude")),
        })
    save_json("trades", records)
    return records


def process_blight():
    print("\n=== Processing Blight Tickets ===")
    raw = load_json(CACHE_DIR / "blight.json")
    records = []
    for r in raw:
        fine = r.get("amt_fine")
        try:
            fine = float(fine) if fine else 0
        except (ValueError, TypeError):
            fine = 0
        records.append({
            "id": r.get("ticket_id"),
            "addr": r.get("address"),
            "desc": r.get("ordinance_description"),
            "dt": r.get("ticket_issued_date"),
            "disp": r.get("disposition"),
            "fine": fine,
            "nb": r.get("neighborhood"),
            "lat": clean_coord(r.get("latitude") or r.get("_lat")),
            "lng": clean_coord(r.get("longitude") or r.get("_lng")),
        })
    save_json("blight", records)
    return records


def process_dlba():
    print("\n=== Processing DLBA Inventory ===")
    raw = load_json(CACHE_DIR / "dlba_inventory.json")
    records = []
    for r in raw:
        records.append({
            "pid": r.get("parcel_id"),
            "addr": r.get("name"),
            "st": r.get("inventory_status_socrata"),
            "nb": r.get("neighborhood"),
            "lat": clean_coord(r.get("latitude")),
            "lng": clean_coord(r.get("longitude")),
        })
    save_json("dlba", records)
    return records


def process_demos():
    print("\n=== Processing Demolitions ===")
    raw = load_json(CACHE_DIR / "demos.json")
    records = []
    for r in raw:
        records.append({
            "addr": r.get("address"),
            "dt": r.get("issued_date"),
            "desc": r.get("work_description"),
            "con": r.get("demolition_contractor"),
            "nb": r.get("neighborhood"),
            "lat": clean_coord(r.get("latitude")),
            "lng": clean_coord(r.get("longitude")),
        })
    save_json("demos", records)
    return records


def process_rentals():
    print("\n=== Processing Rental Registrations ===")
    raw = load_json(CACHE_DIR / "rentals.json")
    records = []
    for r in raw:
        records.append({
            "addr": r.get("address"),
            "type": r.get("registration_type"),
            "dt": r.get("issued_date"),
            "nb": r.get("neighborhood"),
            "lat": clean_coord(r.get("latitude")),
            "lng": clean_coord(r.get("longitude")),
        })
    save_json("rentals", records)
    return records


def process_vacant():
    print("\n=== Processing Vacant Properties ===")
    raw = load_json(CACHE_DIR / "vacant.json")
    records = []
    for r in raw:
        records.append({
            "addr": r.get("address"),
            "dt": r.get("issued_date"),
            "nb": r.get("neighborhood"),
            "lat": clean_coord(r.get("latitude")),
            "lng": clean_coord(r.get("longitude")),
        })
    save_json("vacant", records)
    return records


def process_crime():
    print("\n=== Processing Crime Incidents ===")
    all_records = []
    for fname in ["crime.json", "crime_2025.json", "crime_2026.json"]:
        raw = load_json(CACHE_DIR / fname)
        for r in raw:
            all_records.append({
                "iid": str(r.get("incident_id")),
                "addr": r.get("incident_location"),
                "desc": r.get("call_description"),
                "cat": r.get("category"),
                "dt": r.get("called_at"),
                "lat": clean_coord(r.get("latitude")),
                "lng": clean_coord(r.get("longitude")),
            })
    save_json("crime", all_records)
    return all_records


def compute_investor_profiles(sales):
    print("\n=== Computing Investor Profiles ===")
    investors = defaultdict(lambda: {
        "purchases": [],
        "neighborhoods": set(),
        "total_spend": 0,
        "prices": [],
    })

    for s in sales:
        ge = s.get("ge")
        if not ge or ge.strip() == "":
            continue
        ge = ge.strip()
        inv = investors[ge]
        inv["purchases"].append(s)
        if s.get("nb"):
            inv["neighborhoods"].add(s["nb"])
        pr = s.get("pr", 0) or 0
        inv["total_spend"] += pr
        if pr > 0:
            inv["prices"].append(pr)

    profiles = []
    for name, data in investors.items():
        n = len(data["purchases"])
        if n < 2:
            continue

        prices = data["prices"]
        total_spend = data["total_spend"]
        dates = [p["dt"] for p in data["purchases"] if p.get("dt")]
        dates.sort()

        # Determine tier
        if total_spend >= 10_000_000:
            tier = "institutional"
        elif total_spend >= 1_000_000:
            tier = "large"
        elif total_spend >= 100_000:
            tier = "medium"
        else:
            tier = "small"

        # Top neighborhood (mode)
        nb_counts = defaultdict(int)
        for p in data["purchases"]:
            if p.get("nb"):
                nb_counts[p["nb"]] += 1
        top_nb = max(nb_counts, key=nb_counts.get) if nb_counts else None

        profiles.append({
            "name": name,
            "total_purchases": n,
            "total_spend": round(total_spend, 2),
            "avg_price": round(total_spend / n, 2) if n > 0 else 0,
            "min_price": min(prices) if prices else 0,
            "max_price": max(prices) if prices else 0,
            "first_purchase": dates[0] if dates else None,
            "last_purchase": dates[-1] if dates else None,
            "neighborhood_count": len(data["neighborhoods"]),
            "top_neighborhood": top_nb,
            "investment_tier": tier,
        })

    profiles.sort(key=lambda x: x["total_purchases"], reverse=True)
    save_json("investors", profiles)
    return profiles


def compute_neighborhood_scores(sales, permits, blight, rentals, demos):
    print("\n=== Computing Neighborhood Scores ===")
    neighborhoods = set()
    for s in sales:
        if s.get("nb"):
            neighborhoods.add(s["nb"])

    # Sales stats
    sales_by_nb = defaultdict(list)
    for s in sales:
        if s.get("nb") and s.get("pr", 0) > 0:
            sales_by_nb[s["nb"]].append(s["pr"])

    # Permits by neighborhood
    permits_by_nb = defaultdict(int)
    for p in permits:
        if p.get("nb"):
            permits_by_nb[p["nb"]] += 1

    # Blight by neighborhood
    blight_by_nb = defaultdict(int)
    for b in blight:
        if b.get("nb"):
            blight_by_nb[b["nb"]] += 1

    # Rentals by neighborhood
    rentals_by_nb = defaultdict(int)
    for r in rentals:
        if r.get("nb"):
            rentals_by_nb[r["nb"]] += 1

    # Demos by neighborhood
    demos_by_nb = defaultdict(int)
    for d in demos:
        if d.get("nb"):
            demos_by_nb[d["nb"]] += 1

    scores = []
    for nb in neighborhoods:
        prices = sales_by_nb.get(nb, [])
        med_price = median(prices) if prices else 0
        total_sales = len(sales_by_nb.get(nb, []))
        total_permits = permits_by_nb.get(nb, 0)
        total_blight = blight_by_nb.get(nb, 0)
        total_rentals = rentals_by_nb.get(nb, 0)
        total_demos = demos_by_nb.get(nb, 0)

        # Compute composite score (higher = better investment potential)
        # Factors: sales volume (+), median price (+), permits (+), blight (-), demos (-)
        score = (
            min(total_sales, 500) * 0.3 +
            min(med_price / 1000, 200) * 0.25 +
            min(total_permits, 100) * 0.2 +
            max(0, 100 - total_blight) * 0.15 +
            max(0, 50 - total_demos) * 0.1
        )

        scores.append({
            "neighborhood": nb,
            "total_sales": total_sales,
            "median_price": round(med_price, 2),
            "total_permits": total_permits,
            "total_blight": total_blight,
            "total_rentals": total_rentals,
            "total_demos": total_demos,
            "score": round(score, 2),
        })

    scores.sort(key=lambda x: x["score"], reverse=True)
    save_json("neighborhoods", scores)
    return scores


def compute_contractor_profiles(trades):
    print("\n=== Computing Contractor Profiles ===")
    contractors = defaultdict(lambda: {
        "permits": [],
        "neighborhoods": set(),
        "types": defaultdict(int),
        "contact_name": None,
        "contact_address": None,
    })

    for t in trades:
        biz = t.get("biz")
        if not biz or biz.strip() == "":
            continue
        biz = biz.strip()
        c = contractors[biz]
        c["permits"].append(t)
        if t.get("nb"):
            c["neighborhoods"].add(t["nb"])
        if t.get("type"):
            c["types"][t["type"]] += 1
        if t.get("con"):
            c["contact_name"] = t["con"]
        if t.get("caddr"):
            c["contact_address"] = t["caddr"]

    profiles = []
    for name, data in contractors.items():
        n = len(data["permits"])
        if n < 1:
            continue

        # Top specialty
        top_spec = max(data["types"], key=data["types"].get) if data["types"] else None
        # Top neighborhood
        nb_counts = defaultdict(int)
        for p in data["permits"]:
            if p.get("nb"):
                nb_counts[p["nb"]] += 1
        top_nb = max(nb_counts, key=nb_counts.get) if nb_counts else None

        # Recent permits (2024+)
        recent = sum(1 for p in data["permits"] if p.get("dt") and p["dt"] >= "2024-01-01")

        profiles.append({
            "name": name,
            "contact_name": data["contact_name"],
            "contact_address": data["contact_address"],
            "total_permits": n,
            "neighborhoods_served": len(data["neighborhoods"]),
            "top_neighborhood": top_nb,
            "top_specialty": top_spec,
            "recent_permits": recent,
        })

    profiles.sort(key=lambda x: x["total_permits"], reverse=True)
    save_json("contractors", profiles)
    return profiles


def process_lending():
    print("\n=== Processing Lending Data ===")
    if not LENDING_PATH.exists():
        print("  Lending file not found, skipping")
        save_json("lending", [])
        return []

    raw = load_json(LENDING_PATH)
    lenders = raw.get("data", raw) if isinstance(raw, dict) else raw

    profiles = []
    for l in lenders:
        profiles.append({
            "lei": l.get("lei"),
            "name": l.get("name"),
            "total_loans": l.get("total_loans", 0),
            "total_volume": l.get("total_volume", 0),
            "avg_amount": round(l.get("avg_amount", 0), 2),
            "min_amount": l.get("min_amount", 0),
            "max_amount": l.get("max_amount", 0),
            "avg_rate": l.get("avg_rate"),
            "loan_types": l.get("loan_types", {}),
            "purposes": l.get("purposes", {}),
            "occupancy": l.get("occupancy", {}),
            "sub_60k_loans": l.get("sub_60k_loans", 0),
            "investment_loans": l.get("investment_loans", 0),
            "does_multifamily": l.get("does_multifamily", False),
        })

    profiles.sort(key=lambda x: x["total_loans"], reverse=True)
    save_json("lending", profiles)
    return profiles


def compute_motivated_sellers(sales, blight, dlba):
    print("\n=== Computing Motivated Sellers ===")
    # Score properties by distress signals:
    # - Multiple blight tickets
    # - DLBA ownership
    # - Low sale price history
    # - Long time since last sale

    # Index blight by address
    blight_by_addr = defaultdict(int)
    for b in blight:
        if b.get("addr"):
            blight_by_addr[b["addr"].upper().strip()] += 1

    # Index DLBA by address
    dlba_addrs = set()
    for d in dlba:
        if d.get("addr"):
            dlba_addrs.add(d["addr"].upper().strip())

    # Score sales addresses
    sellers = []
    seen_addrs = set()
    for s in sales:
        addr = (s.get("addr") or "").upper().strip()
        if not addr or addr in seen_addrs:
            continue
        seen_addrs.add(addr)

        score = 0
        reasons = []

        # Blight tickets
        blight_count = blight_by_addr.get(addr, 0)
        if blight_count > 0:
            score += min(blight_count * 10, 40)
            reasons.append(f"{blight_count} blight tickets")

        # DLBA owned
        if addr in dlba_addrs:
            score += 20
            reasons.append("DLBA inventory")

        # Low price
        price = s.get("pr", 0) or 0
        if 0 < price < 10000:
            score += 20
            reasons.append("Low sale price")
        elif 0 < price < 30000:
            score += 10
            reasons.append("Below-market price")

        # Old sale date
        dt = s.get("dt")
        if dt and dt < "2020-01-01":
            score += 10
            reasons.append("Stale listing")

        if score >= 20:
            sellers.append({
                "addr": s.get("addr"),
                "lat": s.get("lat"),
                "lng": s.get("lng"),
                "nb": s.get("nb"),
                "price": price,
                "date": dt,
                "grantor": s.get("gr"),
                "grantee": s.get("ge"),
                "score": score,
                "reasons": reasons,
            })

    sellers.sort(key=lambda x: x["score"], reverse=True)
    save_json("sellers", sellers)
    return sellers


def compute_stats(sales, permits, trades, blight, dlba, demos, rentals, vacant, crime, investors, neighborhoods, contractors, lending):
    print("\n=== Computing Stats ===")
    stats = {
        "sales": len(sales),
        "permits": len(permits),
        "trades": len(trades),
        "blight": len(blight),
        "dlba": len(dlba),
        "demos": len(demos),
        "rentals": len(rentals),
        "vacant": len(vacant),
        "crime": len(crime),
        "investors": len(investors),
        "neighborhoods": len(neighborhoods),
        "contractors": len(contractors),
        "lenders": len(lending),
    }
    save_json("stats", stats)
    return stats


def main():
    start = time.time()
    print("Detroit Data Intel V2 — Data Processing Pipeline")
    print("=" * 50)

    # Process raw data
    sales = process_sales()
    permits = process_permits()
    trades = process_trades()
    blight = process_blight()
    dlba = process_dlba()
    demos = process_demos()
    rentals = process_rentals()
    vacant = process_vacant()
    crime = process_crime()

    # Compute aggregations
    investors = compute_investor_profiles(sales)
    neighborhoods = compute_neighborhood_scores(sales, permits, blight, rentals, demos)
    contractors = compute_contractor_profiles(trades)
    lending = process_lending()
    sellers = compute_motivated_sellers(sales, blight, dlba)

    # Stats
    stats = compute_stats(
        sales, permits, trades, blight, dlba, demos, rentals, vacant, crime,
        investors, neighborhoods, contractors, lending
    )

    elapsed = time.time() - start
    print(f"\n{'=' * 50}")
    print(f"Processing complete in {elapsed:.1f}s")
    print(f"Stats: {json.dumps(stats, indent=2)}")

    # Calculate total output size
    total_size = sum(f.stat().st_size for f in OUTPUT_DIR.glob("*.json"))
    print(f"Total output: {total_size / 1024 / 1024:.1f} MB")


if __name__ == "__main__":
    main()
