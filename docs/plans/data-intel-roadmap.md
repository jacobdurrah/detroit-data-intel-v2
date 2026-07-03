# Detroit Data Intel v2 — Execution Ledger

**Status:** v1 — checkbox execution format. Single source of truth for this work.
**Goal:** turn Detroit Data Intel from a standalone dashboard into the enrichment engine
behind Detroit Code AI and Framework 2.0 — reproducible schema, fresh data, machine-consumable
APIs, parcel geometry, and block intelligence — while hardening the product it already is.
**Repo:** `jacobdurrah/detroit-data-intel-v2` · Vercel project `detroit-data-intel` · live at
https://detroit-data-intel-v2.vercel.app
**Origin:** created 2026-07-03 to capture the data-intel plans that came out of the Detroit
Code AI agentic-retrieval project (see
[`detroit-zoning-ai/docs/plans/agentic-retrieval-plan.md`](https://github.com/jacobdurrah/detroit-zoning-ai/blob/main/docs/plans/agentic-retrieval-plan.md),
Phase P) plus the standing roadmap. Sibling specs in this repo: `SPEC.md`,
`BLOCKS_UI_SPEC.md`, `FEEDBACK_IMPL.md`, `REFACTOR_SPEC.md`,
`detroit-data-intel-overview.md`.

---

> **How to work this plan:** Find the first `- [ ]` item in a phase the operator has
> scheduled. Verify the items above it are actually reflected in the codebase; if plan and
> code disagree, stop and report. Implement only that one item — no batching, no adjacent
> fixes (add new items instead). Verify it's functional (builds, tests pass, repo works),
> commit it with a message referencing this file and the exact item text, then check the
> box and record the short SHA in a separate `docs(plan)` commit — IMMEDIATELY after the
> item commit, never batched. Never check a box without a SHA. If an item is too big for
> one functional commit, split it into sub-items first. Stop after one item and report
> what's next.
>
> **Test capture:** every live verification is recorded as a committed, replayable JSON
> artifact under `eval/results/` with a row in `eval/results/INDEX.md` (the convention
> ported from detroit-zoning-ai — see its `mvp/eval/` for the reference implementation).
>
> **Branch discipline:** docs-only commits (like ledger updates) go to `main`. Code
> phases run on a feature branch with Vercel preview deploys; production is touched only
> at explicit merge items. Anything that writes to the shared Supabase project is called
> out in the item text (there is no staging database today — see A5).
>
> **Scheduling:** ALL PHASES ARE UNSCHEDULED until the operator directs execution.
> Dependency notes per phase; within a phase, execute strictly in order.

---

## 0. Environment & access (read before item 1)

- **Supabase:** project `vgtwkgckvryxbgujnqro` (PostGIS enabled). Keys in Vercel env /
  local `.env`. Some RPCs exist ONLY in the Supabase console, not in
  `supabase/migrations/` — see A2.
- **Vercel:** project `detroit-data-intel` (NOT the repo name). `npm run dev` uses the
  Vercel CLI. `api/` = serverless endpoints (31 files).
- **Data pipeline:** `refresh_v2.py` downloads city open-data extracts (ArcGIS item IDs)
  and bulk-loads Supabase; freshness state in `api/_data/load_state.json`.
- **Playwright tests:** `tests/`.
- **Related repos:** `jacobdurrah/detroit-zoning-ai` (Detroit Code AI — production chat,
  the consumer of Phase B); Framework 2.0 system plan at
  `real-estate-plan/04-FRAMEWORK-2.0-SYSTEM-PLAN.md` (local).

## 1. Facts (verified 2026-07-03 — re-verify anything load-bearing before relying on it)

**Inventory:**
- Supabase, ~2.06M records / 12 core tables: sales 505K · blight 872K · assessment 388K ·
  trades 125K · permits 43K · dlba_owned 59K · rentals 38K · demos 16K · presale 15K ·
  dlba_auction 5K · vacant 1.4K · crime (by year). Plus block infrastructure:
  `streets` 36,104 street segments (LineString geojson) and `address_street_map`
  486,724 address→street_id→parcel_id rows.
- Product tables: `property_searches`, `saved_properties`, `property_reports`
  (BUY/WATCH/PASS verdicts, JSONB).
- API surface: 31 endpoints incl. `address-lookup`, `blocks`, `block/[id]`, `search`,
  `chat`, `investors`, `contractors`, `find-contractor` (geo radius), `lending`,
  `health`, `stats`, `feedback`.
- Console-only RPCs (not in migrations): `get_block_scores_v2`, `search_contractors`,
  `search_investors`.

**Cross-repo decision records (from the zoning-ai Phase P work, 2026-07-03):**
- **Data-intel has street segments + parcel POINTS — no parcel polygons.** It cannot
  answer "which lot touches mine"; Detroit Code AI therefore built its parcel tools
  (lookup, adjacency, radius/owner/use search) directly on the city's public ArcGIS
  layer `parcel_file_current` (services2.arcgis.com/qvkbeam7Wirps6zC, FeatureServer/0).
  Phase C here closes that geometry gap on the data-intel side.
- **Data-intel's unique value to the chat is ENRICHMENT** — blight tickets, permit
  history, sales history, rental registration, DLBA status, block scoring — none of
  which the city parcel layer carries. Phase B ships that integration (deferred from
  zoning-ai's Phase P preamble: "a natural FUTURE item").
- ArcGIS layer lessons already learned (reuse, don't re-debug): `esriSpatialRelTouches`
  returns nothing on this layer (boundaries don't share exact edges — use Intersects +
  5-ft buffer); addresses stored caps, usually suffix-less ("2404 PENNSYLVANIA");
  `%LIKE%` scans over the full layer time out — page a radius window and filter
  client-side; assessor vocabulary: churches are "RELIGIOUS STRUCTURE/USE".
- Detroit Code AI production: https://detroitmuni-codeai.frameworkrealestatesolutions.com
  (merged 2026-07-03, `b4ab192`). Its geocoded BZA case data
  (`mvp/data/bza/cases-enriched.json`, 290 cases with lat/lng + official minutes URLs)
  is importable here — Phase D3.

---

### Phase A — Foundations & harness (NOT YET SCHEDULED)

**What Phase A delivers (impact):** the repo becomes safe to build on. Today the schema
can't be rebuilt from the repo (console-only RPCs), freshness is invisible (a stale
table looks identical to a fresh one), there's no README, and there's no way to record
a test result you can replay later. Phase A is the same foundation-first move that made
the zoning-ai project auditable: after it, every later item can prove itself with a
committed artifact, and a new contributor (or agent) can stand the system up from the
repo alone.

- [ ] **A1** README.md: what the platform is, data inventory (the §1 table), deploy
  (Vercel project name, `npm run dev`), env/secrets list, pipeline
  (`refresh_v2.py`) usage, links to SPEC.md / BLOCKS_UI_SPEC.md / this ledger.
  Verify: renders on GitHub; a cold reader can run local dev from it alone.
  **Enables:** the repo explains itself — prerequisites for every agent or contributor
  who touches anything below. — commit: _pending_
- [ ] **A2** Schema reproducibility: export the console-only RPCs
  (`get_block_scores_v2`, `search_contractors`, `search_investors`) and any other
  console-side objects into `supabase/migrations/` files. Verify: fresh shadow
  schema applies migrations cleanly; RPC signatures match production (diff recorded
  as an artifact).
  **Enables:** the database rebuilds from the repo — no more logic that exists only
  in a web console. — commit: _pending_
- [ ] **A3** Data freshness surfaced: `/api/health` returns per-table last-refresh
  dates (from `load_state.json` and/or max(date) probes) + a `stale` flag per table
  (threshold documented, e.g. >45 days); refresh cadence documented in README.
  Verify: health endpoint artifact committed showing all 12 tables with dates.
  **Enables:** stale data announces itself — the standing answer to "is this
  current?" for every consumer, incl. the Phase B chat tools. — commit: _pending_
- [ ] **A4** Capture/replay harness: `scripts/api-probe.js` (or .ts) — hits an API
  endpoint with recorded params, saves `eval/results/<label>-<ts>.json` + INDEX.md
  row, `--expect` regex, `--compare` vs a prior artifact. Port of the zoning-ai
  chat-probe pattern. Verify: two probe artifacts committed (e.g. address-lookup +
  block detail for a known address).
  **Enables:** every later item's "verify" step becomes a committed, replayable
  artifact instead of a claim. — commit: _pending_
- [ ] **A5** Staging decision record: document (in this file, as a decision) how
  non-production verification works for DB-writing items — options: Supabase branch
  database, a second free project, or explicit "production with pre-clean +
  backup" (the zoning-ai Phase C pattern). Pick one, record why.
  Verify: decision block added here with the chosen mechanics.
  **Enables:** DB-writing phases (C, D3) have a sanctioned safety story before any
  of them start. — commit: _pending_

### Phase B — Detroit Code AI integration (NOT YET SCHEDULED; needs A3, A4)

**What Phase B delivers (impact):** the zoning chat gains the half of the picture the
city parcel layer can't see. Today Detroit Code AI answers "what is this parcel and
what can I build?" (zoning, dimensions, owner, adjacency — live city data); after
Phase B it also answers "what has HAPPENED here?" — blight tickets and fines, permit
activity, sale-by-sale history, rental registration, DLBA status, and how the block is
trending (momentum, investor share, median price). That's the underwriting view:
Framework's own "should we buy near this?" questions become one chat turn. This is the
integration explicitly deferred from zoning-ai Phase P.

- [ ] **B1** Enrichment endpoint: `GET /api/property-intel?address=...` (and
  `?parcel_id=`) returning a compact JSON block — blight (count, open/paid fines,
  latest violation), permits + trades (count, latest, est. cost sum), sales history
  (date/price/grantor→grantee, arms-length flag), rental registration status, DLBA
  owned/auction status. Keyed via existing API-key convention; documented in README.
  Verify: probe artifacts for 2 known addresses (one blighted, one clean).
  **Enables:** one HTTP call answers "what has happened at this address?" — the
  contract everything else in this phase consumes. — commit: _pending_
- [ ] **B2** Block-context endpoint hardening: `GET /api/block-context?address=...` —
  resolves address → street_id (existing `address-lookup`) → block score/trend
  (`get_block_scores_v2` + `block/[id]` aggregates) in ONE call with graceful
  partial results. Verify: probe artifacts incl. an address whose block has rich
  sales and one with sparse data.
  **Enables:** "how is this block trending?" becomes a single deterministic call —
  no client-side orchestration. — commit: _pending_
- [ ] **B3** `property_history` chat tool in Detroit Code AI (cross-repo: code lands
  in `jacobdurrah/detroit-zoning-ai` `mvp/`, mirroring its `lookup_parcel` tool
  shape; a pointer item is added to that repo's ledger when this schedules).
  Calls B1; formatter attributes to "Detroit Data Intel" with per-table freshness
  from A3. Verify: staging chat probe "what's the blight and permit history of
  <address>?" answers from live data; artifact in that repo.
  **Enables:** the chat stops being blind to property HISTORY — inspections,
  fines, permits, sales — the exact enrichment the city layer lacks.
  — commit: _pending_
- [ ] **B4** `block_trends` chat tool in Detroit Code AI calling B2 (same cross-repo
  mechanics as B3). Verify: staging probe "is <address>'s block improving?" cites
  momentum/investor-share/median-price with the data-intel attribution; artifact.
  **Enables:** block-level judgment in the chat — "buy on this block?" gets data,
  not vibes. — commit: _pending_
- [ ] **B5** Integration acceptance: recorded probe set replaying both tools against
  Detroit Code AI staging AND the raw endpoints (B1/B2) — committed on BOTH repos'
  eval trees; add 2 eval queries to zoning-ai's `eval-queries.json`.
  Verify: all probes pass; INDEX rows on both sides.
  **Enables:** the cross-repo seam is pinned by replayable tests on both sides of
  it. — commit: _pending_

### Phase C — Parcel geometry (NOT YET SCHEDULED; needs A2, A5)

**What Phase C delivers (impact):** data-intel gains the geometry it was missing —
the gap that forced zoning-ai to bypass it for adjacency. With parcel polygons in
PostGIS, adjacency/nearby/containment become server-side SQL joins against data-intel's
OWN enrichment tables (blight-next-door, permits-on-the-block, DLBA-adjacent-to-target)
— queries the city API can't do because it has no enrichment, and the chat can't do
because it has no database. Also unblocks the block-adjacency the Blocks UI spec
assumed existed.

- [ ] **C1** Ingest city parcel polygons: new `parcels_geo` table (parcel_id PK,
  address, geometry MultiPolygon 4326, GIST index) loaded from the
  `parcel_file_current` ArcGIS layer (paged export; ~380K parcels). Writes to the
  shared Supabase — follow the A5 safety story. Verify: row count vs layer count;
  5 spot parcels' geometry valid (`ST_IsValid`); artifact.
  **Enables:** the platform can finally answer spatial questions about LOTS, not
  just points and street segments. — commit: _pending_
- [ ] **C2** Adjacency + nearby RPCs: `get_adjacent_parcels(parcel_id)` (ST_Intersects
  on a ~1.5 m buffer — NOT ST_Touches; the zoning-ai lesson: exact touches fails on
  this data) and `get_parcels_within(parcel_id, meters)`; exposed as
  `/api/parcel-neighbors`. Verify: 2404 PENNSYLVANIA returns 2416 + 2244
  PENNSYLVANIA (the verified zoning-ai ground truth); artifact.
  **Enables:** adjacency joined to enrichment — "who owns the lot next door and
  what are its blight fines?" in one query. — commit: _pending_
- [ ] **C3** `get_adjacent_blocks(street_id)` RPC + `/api/blocks/:id/neighbors`
  (ST_DWithin on street centroids/geometry, ~200 m default) — the missing piece
  BLOCKS_UI_SPEC assumed. Verify: probe artifact for a known block returns its
  cross streets/neighbors.
  **Enables:** block-to-block navigation and "compare this block to its
  neighbors" in the UI and APIs. — commit: _pending_

### Phase D — Product: Blocks UI & reports (NOT YET SCHEDULED; needs A4)

**What Phase D delivers (impact):** the operator-facing product catches up to its own
spec and gains the zoning dimension. The Blocks tab reconciles against
BLOCKS_UI_SPEC.md (gaps become explicit items, not folklore), property reports get a
regression harness so BUY/WATCH/PASS verdicts can be trusted and re-scored, and BZA
variance activity lands on the map — connecting Framework's block-watching to real
zoning-relief signals.

- [ ] **D1** Spec reconciliation: audit BLOCKS_UI_SPEC.md against the implementation;
  for each gap add a checkbox sub-item HERE (D1a, D1b, …) with an Enables line.
  Verify: audit table committed in this file; no silent gaps.
  **Enables:** the spec stops drifting — remaining Blocks work is enumerated and
  executable one commit at a time. — commit: _pending_
- [ ] **D2** Property-report regression harness: recorded artifact of
  `property_reports` generation for a fixed set of 5 addresses (verdict, score,
  key inputs), replayable via the A4 probe (`--compare`). Verify: two consecutive
  runs diff clean; artifact + INDEX rows.
  **Enables:** verdict changes become visible diffs — report logic can be tuned
  without silently flipping BUY/PASS calls. — commit: _pending_
- [ ] **D3** BZA overlay: import Detroit Code AI's geocoded BZA cases
  (`detroit-zoning-ai mvp/data/bza/cases-enriched.json` — 290 rows with lat/lng,
  decision, vote, official minutes URL) into a `bza_cases` table; surface count +
  latest case per block in `block/[id]` and as a map layer. Writes to shared
  Supabase — follow A5. Verify: known ground truth — cases near 2404 PENNSYLVANIA
  include 2108 BURNS (denied, ~2,731 ft); artifact.
  **Enables:** variance activity visible per block — zoning-relief precedent joins
  the investment picture (and refreshes monthly with zoning-ai's refresh-bza).
  — commit: _pending_

### Phase E — Framework 2.0 alignment (NOT YET SCHEDULED; needs A3)

**What Phase E delivers (impact):** data-intel formally becomes Framework 2.0's data
layer instead of an assumed dependency. The system plan
(`real-estate-plan/04-FRAMEWORK-2.0-SYSTEM-PLAN.md`) builds on this data; E writes the
contract down (so Framework work can't silently depend on tables/endpoints that don't
exist or aren't fresh) and makes the refresh pipeline runnable by the chosen Framework
architecture (GitHub Actions + Postgres queue — not Airflow; see the architecture
decision record in the Framework plan).

- [ ] **E1** Data contract doc: `docs/design/framework-data-contract.md` — which
  tables/endpoints Framework 2.0 consumes, auth, freshness SLAs (from A3), schemas,
  and what is explicitly NOT promised; reviewed line-by-line against the Framework
  2.0 system plan. Verify: doc committed; discrepancies with the plan listed and
  resolved or ticketed here.
  **Enables:** Framework 2.0 sprints can start against a stable, written contract
  instead of tribal knowledge. — commit: _pending_
- [ ] **E2** Pipeline-as-job: `refresh_v2.py` invocable headlessly from a GitHub
  Actions workflow (secrets via repo env; per-table exit status; freshness state
  committed or reported) — dry-run mode first. Verify: workflow dispatch run green
  on a dry-run; log artifact committed.
  **Enables:** scheduled, observable refreshes under the Framework 2.0 job
  architecture — no laptop required for data currency. — commit: _pending_

---

*Ledger created 2026-07-03 from the Detroit Code AI agentic-retrieval project's
decision records and the operator's full-roadmap scope choice. Nothing here is
scheduled; the operator directs which phase runs next.*
