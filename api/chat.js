const { handleCors, checkAuth, sendJson, sendError } = require('./_helpers');
const { supabase } = require('./_supabase');

const SCHEMA_DESCRIPTION = `You are a Detroit real estate data analyst with access to a Supabase PostgreSQL database containing 2M+ records.

TABLES:
- sales (505K): sales_id, address, sale_date, sale_price, grantor (seller), grantee (buyer), neighborhood, parcel_id, zip_code, terms_of_sale, property_class_desc
- blight (872K): ticket_id, violator_name, street_number, street_name, violation_description, fine_amount, judgment_amount, balance_due, payment_status, neighborhood, ticket_issued_date
- assessment (388K): parcel_id, address, property_class, tax_status, total_assessed_value, total_taxable_value, land_value, improvement_value, year_built, bedrooms, full_baths, owner_name, neighborhood, zip_code
- permits (43K): permit_no, address, permit_issued, permit_type, description, estimated_cost, contractor_name, parcel_id, neighborhood
- trades (112K): permit_no, address, permit_issued, permit_type, description, contractor_name, parcel_id, neighborhood
- rentals (38K): certificate_number, address, parcel_id, rental_type, owner_name, neighborhood
- dlba_owned (59K): parcel_id, address, neighborhood, property_class
- dlba_auction (5K): object_id, address, sale_date, sale_price, buyer, parcel_id, neighborhood
- presale (15K): case_id, address, status, rating, parcel_id, neighborhood
- demos (16K): permit_no, address, permit_issued, contractor_name, parcel_id, neighborhood
- vacant (1.4K): task_id, address, date_issued, owner_name, parcel_id, neighborhood
- contractor_directory (301): id, name, specialties (text[]), permit_types (text[]), total_permits, recent_permits, neighborhoods (text[]), zip_codes (text[]), phone, website, rating, sample_descriptions (text[]), last_permit_date, search_vector (tsvector — use websearch_to_tsquery for FTS)

Generate a JSON query plan:
{
  "queries": [
    {
      "table": "table_name",
      "select": "col1, col2",
      "filters": [{"column": "col", "op": "ilike|eq|gt|lt|gte|lte", "value": "val"}],
      "order": {"column": "col", "ascending": false},
      "limit": 20
    }
  ],
  "analysis": "What we're looking for",
  "answer_approach": "How to present the results"
}

RULES:
- Use ilike with % wildcards for text search
- Names stored as "LAST, FIRST" — search BOTH orderings AND just last name
- For person searches, check grantee/grantor in sales AND owner_name in assessment
- For "how many purchases" questions, search grantee with just the entity name (e.g., "%HANTZ%")
- For permits in a neighborhood, filter by neighborhood column
- RESPOND WITH ONLY THE JSON OBJECT. No markdown, no explanation, no code blocks.`;

const MAX_CHAT_QUERY_LIMIT = 1000;
const ALLOWED_CHAT_COLUMNS = {
  sales: ['sales_id', 'address', 'sale_date', 'sale_price', 'grantor', 'grantee', 'neighborhood', 'parcel_id', 'zip_code', 'terms_of_sale', 'property_class_desc'],
  blight: ['ticket_id', 'violator_name', 'street_number', 'street_name', 'violation_description', 'fine_amount', 'judgment_amount', 'balance_due', 'payment_status', 'neighborhood', 'ticket_issued_date', 'violation_date'],
  assessment: ['parcel_id', 'address', 'property_class', 'tax_status', 'total_assessed_value', 'total_taxable_value', 'land_value', 'improvement_value', 'year_built', 'bedrooms', 'full_baths', 'owner_name', 'neighborhood', 'zip_code'],
  permits: ['permit_no', 'address', 'permit_issued', 'permit_type', 'description', 'estimated_cost', 'contractor_name', 'parcel_id', 'neighborhood'],
  trades: ['permit_no', 'address', 'permit_issued', 'permit_type', 'description', 'contractor_name', 'parcel_id', 'neighborhood'],
  rentals: ['certificate_number', 'address', 'parcel_id', 'rental_type', 'owner_name', 'neighborhood'],
  dlba_owned: ['parcel_id', 'address', 'neighborhood', 'property_class'],
  dlba_auction: ['object_id', 'address', 'sale_date', 'sale_price', 'buyer', 'parcel_id', 'neighborhood'],
  presale: ['case_id', 'address', 'status', 'rating', 'parcel_id', 'neighborhood'],
  demos: ['permit_no', 'address', 'permit_issued', 'contractor_name', 'parcel_id', 'neighborhood', 'permit_status'],
  vacant: ['task_id', 'address', 'date_issued', 'owner_name', 'parcel_id', 'neighborhood'],
  contractor_directory: ['id', 'name', 'specialties', 'permit_types', 'total_permits', 'recent_permits', 'neighborhoods', 'zip_codes', 'phone', 'website', 'rating', 'sample_descriptions', 'last_permit_date'],
};
const ALLOWED_FILTER_OPS = new Set(['ilike', 'eq', 'gt', 'lt', 'gte', 'lte']);

function sanitizeSelect(selectCols, allowedColumns) {
  const requested = (selectCols || '')
    .replace(/,?\s*COUNT\([^)]*\)\s*(?:as\s+\w+)?/gi, '')
    .replace(/,\s*$/, '')
    .split(',')
    .map(col => col.trim())
    .filter(Boolean);

  if (requested.length === 0 || requested.includes('*')) {
    return allowedColumns.join(', ');
  }

  const safeColumns = requested.filter(col => /^[a-z_][a-z0-9_]*$/i.test(col) && allowedColumns.includes(col));
  return safeColumns.length > 0 ? safeColumns.join(', ') : allowedColumns.join(', ');
}

function sanitizeLimit(limit) {
  const parsed = Number.parseInt(limit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 20;
  return Math.min(parsed, MAX_CHAT_QUERY_LIMIT);
}

async function classifyWithAI(question) {
  // Try keyword classification first — it's fast and handles common patterns well
  const keywordResult = classifyKeyword(question);
  // If keyword matched a specific pattern (not the default fallback), use it
  if (keywordResult.matched) return keywordResult;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return keywordResult;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: SCHEMA_DESCRIPTION,
        messages: [{ role: 'user', content: question }],
      }),
    });

    const result = await response.json();
    const text = result.content?.[0]?.text || '';
    let cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const plan = JSON.parse(jsonMatch[0]);
        if (plan.queries && Array.isArray(plan.queries)) {
          return { ai: true, plan };
        }
      } catch (e) {
        console.error('AI JSON parse error:', e.message);
      }
    }
    // AI failed to produce valid JSON — fall back to keyword with original question
    console.log('AI fallback to keyword for:', question);
    const keywordResult = classifyKeyword(question);
    return { ai: true, plan: keywordResult.plan };
  } catch (err) {
    console.error('AI classification error:', err);
    return classifyKeyword(question);
  }
}

function classifyKeyword(question) {
  const q = question.toLowerCase();
  const queries = [];

  // Contractor search — MUST come before address to avoid zip codes being treated as addresses
  // Matches: "plumber near 48214", "find a furnace installer", "need electrician", "contractor for roof", "HVAC near me"
  if (q.match(/(plumb|electric|hvac|heati|furnace|roof|contractor|handyman|roofer|instal|mechanic|boiler|drain|sewer)/i) && 
      q.match(/\b(find|need|near|hire|looking|recommend|who|where|get|contractor|48\d{3})\b/i)) {
    const zipMatch = question.match(/\b(482\d{2})\b/);
    const zip = zipMatch ? zipMatch[1] : '';
    const stopwords = new Set(['find','me','a','the','near','in','who','can','need','i','contractor','hire',
      'looking','for','someone','to','my','installed','install','around','get','recommend','where',
      'detroit','mi','michigan','street','st','ave','blvd','rd','dr','ct','pl','ln','way',
      'you','works','on','work','does','do','someone','anybody','anyone','that','with','and','or',
      'is','are','was','were','be','been','being','have','has','had','having','could','would','should']);
    // Strip zip codes, pure numbers (addresses), and common street names from search term
    const serviceWords = question.replace(/[?.,!'"]/g, '').split(/\s+/)
      .filter(w => !stopwords.has(w.toLowerCase()) && !w.match(/^482\d{2}$/) && !w.match(/^\d+$/))
      .filter(w => !w.match(/^(pennsylvania|michigan|woodward|gratiot|jefferson|grand|livernois|warren|joy|tireman|davison|telegraph|greenfield|schaefer|outer)$/i));
    const searchTerm = serviceWords.join(' ');
    return {
      ai: false, matched: true,
      plan: {
        queries: [{ _type: 'contractor_search', q: searchTerm, zip }],
        analysis: `Finding contractors: ${searchTerm}${zip ? ' near ' + zip : ''}`,
        answer_approach: 'contractor_search',
      }
    };
  }

  // Address search (starts with number, but NOT just a zip code)
  const addressMatch = q.match(/(\d+\s+[a-z]+(?:\s+[a-z]+)?(?:\s+(?:st|ave|blvd|rd|dr|ct|pl|ln|way))?)/i);
  if (addressMatch) {
    const addr = addressMatch[1].toUpperCase();
    queries.push(
      { table: 'sales', select: 'address, sale_price, sale_date, grantee, grantor, neighborhood, parcel_id', filters: [{ column: 'address', op: 'ilike', value: `%${addr}%` }], order: { column: 'sale_date', ascending: false }, limit: 10 },
      { table: 'assessment', select: 'address, total_assessed_value, total_taxable_value, year_built, bedrooms, owner_name, neighborhood, property_class', filters: [{ column: 'address', op: 'ilike', value: `%${addr}%` }], limit: 5 },
      { table: 'blight', select: 'street_number, street_name, violation_description, fine_amount, balance_due, payment_status, ticket_issued_date', filters: [{ column: 'street_name', op: 'ilike', value: `%${addr.split(' ').slice(1).join(' ')}%` }], order: { column: 'ticket_issued_date', ascending: false }, limit: 10 },
      { table: 'permits', select: 'address, permit_type, description, permit_issued, estimated_cost, contractor_name', filters: [{ column: 'address', op: 'ilike', value: `%${addr}%` }], order: { column: 'permit_issued', ascending: false }, limit: 10 },
      { table: 'trades', select: 'address, permit_type, description, permit_issued, contractor_name', filters: [{ column: 'address', op: 'ilike', value: `%${addr}%` }], order: { column: 'permit_issued', ascending: false }, limit: 10 },
    );
    return { ai: false, matched: true, plan: { queries, analysis: `Property profile: ${addr}`, answer_approach: 'Compile complete property report' } };
  }

  // Investor/buyer/property owner search
  if (q.match(/invest|buyer|buyers|buying|purchas|who.*(buy|bought)|top.*(buy|investor)|grantee|how many.*(buy|bought|purchas|sale|sold)|where does.*propert|where.*most.*propert|portfolio/)) {
    const nbMatch = q.match(/(?:in|at|around|near)\s+([a-z\s]+?)(?:\?|$|\.)/i);
    // Extract entity name — look for proper nouns (capitalized words not in common words)
    const commonWords = new Set(['how','many','has','have','had','made','the','a','an','is','are','was','were','what','who','where','when','which','top','most','biggest','largest','all','total','number','of','purchases','bought','buying','sales','sold','investor','investors','buyer','buyers','in','at','near','around','for','from','by','does','do','did','show','me','tell','find','get','list','give','much','any','some','its','their','his','her','they','them','properties','property','own','owns','owned','with','that','this','these','those']);
    const cleanQ = question.replace(/[?.,!'"]/g, '');
    const entityWords = cleanQ.split(/\s+/).filter(w => !commonWords.has(w.toLowerCase()) && w.length > 1);
    const entityName = entityWords.length > 0 ? entityWords.join(' ') : null;
    
    const filters = [];
    if (nbMatch) {
      filters.push({ column: 'neighborhood', op: 'ilike', value: `%${nbMatch[1].trim()}%` });
    } else if (entityName) {
      filters.push({ column: 'grantee', op: 'ilike', value: `%${entityName}%` });
    }
    queries.push({ table: 'sales', select: 'grantee, sale_price, neighborhood, sale_date', filters, order: { column: 'sale_date', ascending: false }, limit: 5000 });
    const label = entityName && !nbMatch ? ` for "${entityName}"` : nbMatch ? ' in ' + nbMatch[1].trim() : '';
    return { ai: false, matched: true, plan: { queries, analysis: `Top buyers${label}`, answer_approach: 'Group by grantee, rank by purchase count', group_by: 'grantee' } };
  }

  // Permit / construction activity search
  if (q.match(/permit|construction|building|work|renovat|repair|alterat/)) {
    const nbMatch = q.match(/(?:in|at|around|near|for)\s+([a-z\s]+?)(?:\?|$|\.)/i);
    const filters = nbMatch ? [{ column: 'neighborhood', op: 'ilike', value: `%${nbMatch[1].trim()}%` }] : [];
    queries.push(
      { table: 'permits', select: 'address, permit_type, description, permit_issued, estimated_cost, contractor_name, neighborhood', filters, order: { column: 'permit_issued', ascending: false }, limit: 25 },
      { table: 'trades', select: 'address, permit_type, description, permit_issued, contractor_name, neighborhood', filters, order: { column: 'permit_issued', ascending: false }, limit: 25 },
    );
    return { ai: false, matched: true, plan: { queries, analysis: `Recent permits${nbMatch ? ' in ' + nbMatch[1].trim() : ''}`, answer_approach: 'List recent permit activity' } };
  }

  // Neighborhood comparison / growth / trending
  if (q.match(/neighborhood.*(grow|trend|hot|best|worst|rising|up.and.coming|improv)|grow.*neighborhood|trending.*area|hottest|up.and.coming/)) {
    queries.push(
      { table: 'sales', select: 'neighborhood, sale_price, sale_date', filters: [], order: { column: 'sale_date', ascending: false }, limit: 50000 },
    );
    return { ai: false, matched: true, plan: { queries, analysis: 'Neighborhood growth analysis', answer_approach: 'Compare recent vs historical sales volume and prices by neighborhood to identify trending areas', group_by: 'neighborhood' } };
  }

  // General neighborhood / "properties in X" / "what's happening in X"
  const nbQuery = q.match(/(?:properties|sales|activity|happening|going on|data|show|what's)\s+(?:in|for|at|around)\s+([a-z\s]+?)(?:\?|$|\.)/i);
  if (nbQuery) {
    const nb = nbQuery[1].trim();
    queries.push(
      { table: 'sales', select: 'address, sale_price, sale_date, grantee, grantor, neighborhood', filters: [{ column: 'neighborhood', op: 'ilike', value: `%${nb}%` }], order: { column: 'sale_date', ascending: false }, limit: 20 },
      { table: 'assessment', select: 'address, total_assessed_value, year_built, owner_name, neighborhood', filters: [{ column: 'neighborhood', op: 'ilike', value: `%${nb}%` }], limit: 20 },
      { table: 'permits', select: 'address, permit_type, description, permit_issued, estimated_cost, neighborhood', filters: [{ column: 'neighborhood', op: 'ilike', value: `%${nb}%` }], order: { column: 'permit_issued', ascending: false }, limit: 15 },
      { table: 'blight', select: 'street_number, street_name, violation_description, fine_amount, balance_due, payment_status, neighborhood, ticket_issued_date', filters: [{ column: 'neighborhood', op: 'ilike', value: `%${nb}%` }], order: { column: 'ticket_issued_date', ascending: false }, limit: 15 },
    );
    return { ai: false, matched: true, plan: { queries, analysis: `Neighborhood overview: ${nb}`, answer_approach: 'Compile neighborhood profile with sales, assessment, permits, and blight' } };
  }

  // Blight search
  if (q.match(/blight|violation|fine|ticket|code.enforce/)) {
    const nbMatch = q.match(/(?:in|at|on|for)\s+([a-z\s]+?)(?:\?|$|\.)/i);
    const filters = nbMatch ? [{ column: 'neighborhood', op: 'ilike', value: `%${nbMatch[1].trim()}%` }] : [];
    queries.push({ table: 'blight', select: 'street_number, street_name, violator_name, violation_description, fine_amount, balance_due, payment_status, neighborhood, ticket_issued_date', filters, order: { column: 'ticket_issued_date', ascending: false }, limit: 25 });
    return { ai: false, matched: true, plan: { queries, analysis: `Blight tickets${nbMatch ? ' in ' + nbMatch[1].trim() : ''}`, answer_approach: 'Summarize blight activity' } };
  }

  // DLBA / vacant / auction
  if (q.match(/dlba|land.bank|auction|vacant|demo/)) {
    const nbMatch = q.match(/(?:in|at|for)\s+([a-z\s]+?)(?:\?|$|\.)/i);
    const filters = nbMatch ? [{ column: 'neighborhood', op: 'ilike', value: `%${nbMatch[1].trim()}%` }] : [];
    queries.push(
      { table: 'dlba_owned', select: 'address, neighborhood, property_class', filters, limit: 25 },
      { table: 'dlba_auction', select: 'address, sale_date, sale_price, buyer, neighborhood', filters, order: { column: 'sale_date', ascending: false }, limit: 25 },
      { table: 'vacant', select: 'address, owner_name, date_issued, neighborhood', filters, order: { column: 'date_issued', ascending: false }, limit: 25 },
    );
    return { ai: false, matched: true, plan: { queries, analysis: `DLBA/vacant properties${nbMatch ? ' in ' + nbMatch[1].trim() : ''}`, answer_approach: 'List DLBA and vacant properties' } };
  }

  // Person name search (no numbers, no question words, short = likely a name)
  const questionWords = /\b(what|which|where|when|how|show|list|find|get|tell|give|any|are|is|the|properties|neighborhoods|growing|trending|best|worst|most|least|new|old|recent)\b/i;
  const isName = !q.match(/\d/) && !q.match(questionWords) && q.split(/\s+/).length <= 4 && q.length > 3;
  if (isName) {
    const name = q.replace(/[?.,!'"]/g, '').trim().toUpperCase();
    // Also create "LAST, FIRST" variant for DB format
    const parts = name.split(/[\s-]+/).filter(Boolean);
    const variants = [name];
    if (parts.length >= 2) {
      variants.push(`${parts[parts.length - 1]}, ${parts.slice(0, -1).join(' ')}`); // LAST, FIRST
      variants.push(parts[parts.length - 1]); // Just last name
    }
    for (const v of variants) {
      queries.push(
        { table: 'sales', select: 'address, sale_price, sale_date, grantee, grantor, neighborhood', filters: [{ column: 'grantee', op: 'ilike', value: `%${v}%` }], order: { column: 'sale_date', ascending: false }, limit: 20 },
        { table: 'sales', select: 'address, sale_price, sale_date, grantee, grantor, neighborhood', filters: [{ column: 'grantor', op: 'ilike', value: `%${v}%` }], order: { column: 'sale_date', ascending: false }, limit: 20 },
        { table: 'assessment', select: 'address, total_assessed_value, year_built, owner_name, neighborhood', filters: [{ column: 'owner_name', op: 'ilike', value: `%${v}%` }], limit: 20 },
      );
    }
    queries.push(
      { table: 'rentals', select: 'address, rental_type, owner_name, neighborhood', filters: [{ column: 'owner_name', op: 'ilike', value: `%${name}%` }], limit: 10 },
    );
    return { ai: false, matched: true, plan: { queries, analysis: `Person search: ${name}`, answer_approach: 'Show all properties associated with this person as buyer, seller, or owner' } };
  }

  // Default: broad search across multiple columns
  const term = q.replace(/[?.,!'"]/g, '').trim().toUpperCase();
  queries.push(
    { table: 'sales', select: 'address, sale_price, sale_date, grantee, neighborhood', filters: [{ column: 'grantee', op: 'ilike', value: `%${term}%` }], order: { column: 'sale_date', ascending: false }, limit: 10 },
    { table: 'sales', select: 'address, sale_price, sale_date, grantee, neighborhood', filters: [{ column: 'address', op: 'ilike', value: `%${term}%` }], order: { column: 'sale_date', ascending: false }, limit: 10 },
    { table: 'assessment', select: 'address, total_assessed_value, owner_name, neighborhood', filters: [{ column: 'owner_name', op: 'ilike', value: `%${term}%` }], limit: 10 },
    { table: 'assessment', select: 'address, total_assessed_value, owner_name, neighborhood', filters: [{ column: 'address', op: 'ilike', value: `%${term}%` }], limit: 10 },
    { table: 'permits', select: 'address, permit_type, description, permit_issued, neighborhood', filters: [{ column: 'address', op: 'ilike', value: `%${term}%` }], limit: 10 },
  );
  return { ai: false, plan: { queries, analysis: `Search: ${term}`, answer_approach: 'Show matching results across all datasets' } };
}

async function executeQueryPlan(plan) {
  if (!plan || !plan.queries) return {};
  const results = {};

  for (const q of plan.queries) {
    // Handle contractor search via PostgreSQL FTS RPC
    if (q._type === 'contractor_search') {
      try {
        // Resolve zip to lat/lng
        const ZIP_COORDS = {
          "48201":[42.346,-83.062],"48202":[42.375,-83.075],"48203":[42.411,-83.118],
          "48204":[42.370,-83.130],"48205":[42.437,-82.980],"48206":[42.381,-83.098],
          "48207":[42.347,-83.016],"48208":[42.344,-83.092],"48209":[42.304,-83.112],
          "48210":[42.332,-83.132],"48211":[42.383,-83.054],"48212":[42.410,-83.035],
          "48213":[42.398,-82.981],"48214":[42.370,-82.980],"48215":[42.385,-82.930],
          "48216":[42.325,-83.075],"48217":[42.276,-83.155],"48219":[42.420,-83.245],
          "48221":[42.425,-83.150],"48224":[42.413,-82.936],"48227":[42.395,-83.192],
          "48228":[42.358,-83.210],"48234":[42.438,-83.055],"48235":[42.418,-83.178],
          "48238":[42.393,-83.155],
        };
        const coords = q.zip && ZIP_COORDS[q.zip] ? ZIP_COORDS[q.zip] : [null, null];

        const { data, error } = await supabase.rpc('search_contractors', {
          p_query: q.q || 'contractor',
          p_zip: q.zip || null,
          p_lat: coords[0],
          p_lng: coords[1],
          p_radius_miles: 5.0,
          p_limit: 15,
          p_offset: 0,
        });

        if (error) throw error;

        // If FTS returns nothing, fall back to specialty-based search
        let contractorData = data || [];
        if (contractorData.length === 0) {
          // Map search terms to specialties for fallback
          const FALLBACK_MAP = {
            roof: 'Roofing', slate: 'Roofing', shingle: 'Roofing', gutter: 'Roofing',
            plumb: 'Plumbing', pipe: 'Plumbing', drain: 'Plumbing', sewer: 'Plumbing', water: 'Plumbing',
            electric: 'Electrical', wiring: 'Electrical', panel: 'Electrical', outlet: 'Electrical',
            furnace: 'HVAC/Heating', hvac: 'HVAC/Heating', heat: 'HVAC/Heating', cool: 'HVAC/Heating', boiler: 'HVAC/Heating',
            foundation: 'Foundation/Structural', basement: 'Foundation/Structural',
            solar: 'Solar/Energy', generator: 'Solar/Energy',
            fire: 'Fire Protection', sprinkler: 'Fire Protection',
            elevator: 'Elevator',
          };
          const searchLower = (q.q || '').toLowerCase();
          const matchedSpecs = [...new Set(Object.entries(FALLBACK_MAP)
            .filter(([term]) => searchLower.includes(term))
            .map(([, spec]) => spec))];
          
          if (matchedSpecs.length > 0) {
            let fallbackQuery = supabase.from('contractor_directory')
              .select('*')
              .gt('total_permits', 0)
              .overlaps('specialties', matchedSpecs)
              .order('recent_permits', { ascending: false })
              .limit(15);
            if (q.zip) fallbackQuery = fallbackQuery.contains('zip_codes', [q.zip]);
            
            const { data: fbData } = await fallbackQuery;
            contractorData = fbData || [];
          }
        }

        results.contractors = contractorData.map(c => ({
          name: c.name, specialties: c.specialties, total_permits: c.total_permits,
          recent_permits: c.recent_permits, neighborhoods: (c.neighborhoods || []).slice(0, 5),
          zip_codes: c.zip_codes, phone: c.phone, website: c.website, rating: c.rating,
          sample_work: (c.sample_descriptions || []).slice(0, 3),
          last_active: c.last_permit_date,
          distance_miles: c.distance_miles ? Math.round(c.distance_miles * 10) / 10 : null,
          relevance: c.rank,
        }));
      } catch (err) {
        console.error('Contractor FTS search error:', err);
        results.contractors = [];
      }
      continue;
    }

    try {
      const allowedColumns = ALLOWED_CHAT_COLUMNS[q.table];
      if (!allowedColumns) {
        console.warn(`Skipping disallowed chat table: ${q.table}`);
        continue;
      }

      const selectCols = sanitizeSelect(q.select, allowedColumns);
      let query = supabase.from(q.table).select(selectCols);
      for (const f of (q.filters || [])) {
        if (!ALLOWED_FILTER_OPS.has(f.op) || !allowedColumns.includes(f.column)) continue;
        switch (f.op) {
          case 'ilike': query = query.ilike(f.column, f.value); break;
          case 'eq': query = query.eq(f.column, f.value); break;
          case 'gt': query = query.gt(f.column, f.value); break;
          case 'lt': query = query.lt(f.column, f.value); break;
          case 'gte': query = query.gte(f.column, f.value); break;
          case 'lte': query = query.lte(f.column, f.value); break;
        }
      }
      if (q.order && allowedColumns.includes(q.order.column)) query = query.order(q.order.column, { ascending: q.order.ascending ?? false });
      const requestedLimit = sanitizeLimit(q.limit);
      const pageSize = Math.min(requestedLimit, 1000);
      let allData = [];

      // Paginate if limit > 1000
      for (let offset = 0; offset < requestedLimit; offset += pageSize) {
        const batchLimit = Math.min(pageSize, requestedLimit - offset);
        const { data: batch, error: batchErr } = await query.range(offset, offset + batchLimit - 1);
        if (batchErr || !batch || batch.length === 0) break;
        allData = allData.concat(batch);
        if (batch.length < batchLimit) break; // no more data
      }

      const data = allData;
      const error = null;
      if (data.length > 0) {
        // Merge into existing table results or create new
        const key = q.table;
        if (results[key]) {
          // Deduplicate by merging
          const existing = new Set(results[key].map(r => JSON.stringify(r)));
          for (const row of data) {
            if (!existing.has(JSON.stringify(row))) results[key].push(row);
          }
        } else {
          results[key] = data;
        }
      }
    } catch (err) {
      console.error(`Query error ${q.table}:`, err.message);
    }
  }
  return results;
}

async function generateAnswer(question, plan, results, apiKey) {
  const totalResults = Object.values(results).reduce((sum, d) => sum + (Array.isArray(d) ? d.length : 0), 0);

  if (totalResults === 0) {
    return 'No results found. Try:\n• A specific address (e.g., "2404 Pennsylvania")\n• A person name (e.g., "John Doe")\n• A topic + neighborhood (e.g., "permits in East Village")\n• An investor query (e.g., "top buyers in Corktown")';
  }

  if (apiKey) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2048,
          system: `You are a Detroit real estate data analyst. Format answers cleanly using markdown:
- Use **bold** for key info
- Use bullet points for lists
- Include $ amounts, dates, and neighborhoods
- Group related data logically
- Highlight investment signals (price trends, multiple purchases, flip indicators)
- Keep it concise but complete
- For person searches, summarize their portfolio (what they own, bought, sold)
- For address searches, give a property profile (owner, value, history, issues)
- For permit queries, list the most recent activity clearly
- Never dump raw JSON — always format human-readable`,
          messages: [{
            role: 'user',
            content: `Question: ${question}\n\nContext: ${plan.analysis}\n\nData:\n${JSON.stringify(results, null, 0).slice(0, 6000)}\n\nProvide a clean, formatted answer based on the data above. If data is truncated, note that more records exist.`,
          }],
        }),
      });

      const result = await response.json();
      if (result.content?.[0]?.text) return result.content[0].text;
    } catch (err) {
      console.error('AI answer error:', err);
    }
  }

  // Fallback: clean formatted output
  return formatClean(plan, results);
}

function formatClean(plan, results) {
  const parts = [];
  if (plan?.analysis) parts.push(`**${plan.analysis}**\n`);

  for (const [table, data] of Object.entries(results)) {
    if (!Array.isArray(data) || data.length === 0) continue;

    switch (table) {
      case 'sales':
        if (plan?.group_by === 'neighborhood') {
          // Neighborhood growth analysis
          const now = new Date();
          const sixMonthsAgo = new Date(now - 180 * 24 * 60 * 60 * 1000);
          const oneYearAgo = new Date(now - 365 * 24 * 60 * 60 * 1000);
          const hoods = {};
          for (const s of data) {
            const nb = s.neighborhood || 'Unknown';
            if (!hoods[nb]) hoods[nb] = { recent: 0, recentTotal: 0, older: 0, olderTotal: 0 };
            const dt = new Date(s.sale_date);
            if (dt >= sixMonthsAgo) { hoods[nb].recent++; hoods[nb].recentTotal += (s.sale_price || 0); }
            else if (dt >= oneYearAgo) { hoods[nb].older++; hoods[nb].olderTotal += (s.sale_price || 0); }
          }
          const trending = Object.entries(hoods)
            .filter(([_, h]) => h.recent >= 3 && h.older >= 1)
            .map(([name, h]) => ({
              name, recent: h.recent, older: h.older,
              growth: Math.round(((h.recent - h.older) / h.older) * 100),
              recentAvg: h.recent > 0 ? Math.round(h.recentTotal / h.recent) : 0,
              olderAvg: h.older > 0 ? Math.round(h.olderTotal / h.older) : 0,
            }))
            .sort((a, b) => b.growth - a.growth)
            .slice(0, 20);
          parts.push(`**Trending Neighborhoods** (last 6 months vs prior 6 months)\n`);
          for (const t of trending) {
            const arrow = t.growth > 0 ? '📈' : t.growth < 0 ? '📉' : '➡️';
            parts.push(`• ${arrow} **${t.name}** — ${t.growth > 0 ? '+' : ''}${t.growth}% volume | ${t.recent} recent sales (avg $${t.recentAvg.toLocaleString()}) vs ${t.older} prior (avg $${t.olderAvg.toLocaleString()})`);
          }
          break;
        }
        if (plan?.group_by === 'grantee') {
          // Aggregate buyers
          const buyers = {};
          for (const s of data) {
            const name = s.grantee || 'Unknown';
            if (!buyers[name]) buyers[name] = { count: 0, total: 0, neighborhoods: new Set() };
            buyers[name].count++;
            buyers[name].total += (s.sale_price || 0);
            if (s.neighborhood) buyers[name].neighborhoods.add(s.neighborhood);
          }
          const sorted = Object.entries(buyers).sort((a, b) => b[1].count - a[1].count).slice(0, 15);
          parts.push(`**Top Buyers** (${Object.keys(buyers).length} unique)\n`);
          for (const [name, info] of sorted) {
            parts.push(`• **${name}** — ${info.count} purchases, $${info.total.toLocaleString()} total | ${[...info.neighborhoods].slice(0, 3).join(', ')}`);
          }
        } else {
          parts.push(`**Sales** (${data.length})\n`);
          for (const s of data.slice(0, 10)) {
            parts.push(`• **${s.address || 'N/A'}** — $${(s.sale_price || 0).toLocaleString()} on ${s.sale_date || '?'}\n  Buyer: ${s.grantee || '?'} | Seller: ${s.grantor || '?'} | ${s.neighborhood || ''}`);
          }
          if (data.length > 10) parts.push(`  _...and ${data.length - 10} more_`);
        }
        break;

      case 'assessment':
        parts.push(`**Assessment** (${data.length})\n`);
        for (const a of data.slice(0, 10)) {
          parts.push(`• **${a.address || 'N/A'}** — Assessed: $${(a.total_assessed_value || 0).toLocaleString()} | Built: ${a.year_built || '?'} | Owner: ${a.owner_name || '?'}\n  ${a.neighborhood || ''} | Bedrooms: ${a.bedrooms || '?'} | Class: ${a.property_class || '?'}`);
        }
        break;

      case 'permits':
        parts.push(`**Building Permits** (${data.length})\n`);
        for (const p of data.slice(0, 10)) {
          parts.push(`• **${p.address || 'N/A'}** — ${p.permit_type || '?'} (${p.permit_issued || '?'})\n  ${(p.description || '').slice(0, 100)} | Cost: $${(p.estimated_cost || 0).toLocaleString()} | ${p.contractor_name || ''}`);
        }
        break;

      case 'trades':
        parts.push(`**Trade Permits** (${data.length})\n`);
        for (const t of data.slice(0, 10)) {
          parts.push(`• **${t.address || 'N/A'}** — ${t.permit_type || '?'} (${t.permit_issued || '?'})\n  ${(t.description || '').slice(0, 100)} | ${t.contractor_name || ''}`);
        }
        break;

      case 'blight':
        parts.push(`**Blight Tickets** (${data.length})\n`);
        for (const b of data.slice(0, 10)) {
          const addr = `${b.street_number || ''} ${b.street_name || ''}`.trim();
          parts.push(`• **${addr}** — ${b.violation_description || '?'}\n  Fine: $${(b.fine_amount || 0).toLocaleString()} | Balance: $${(b.balance_due || 0).toLocaleString()} | ${b.payment_status || '?'} | ${b.ticket_issued_date?.slice(0, 10) || '?'}`);
        }
        break;

      case 'rentals':
        parts.push(`**Rental Registrations** (${data.length})\n`);
        for (const r of data.slice(0, 10)) {
          parts.push(`• **${r.address || 'N/A'}** — ${r.rental_type || '?'} | Owner: ${r.owner_name || '?'} | ${r.neighborhood || ''}`);
        }
        break;

      case 'dlba_owned':
        parts.push(`**DLBA Owned** (${data.length})\n`);
        for (const d2 of data.slice(0, 10)) {
          parts.push(`• **${d2.address || 'N/A'}** — ${d2.property_class || '?'} | ${d2.neighborhood || ''}`);
        }
        break;

      case 'dlba_auction':
        parts.push(`**DLBA Auction Sales** (${data.length})\n`);
        for (const d2 of data.slice(0, 10)) {
          parts.push(`• **${d2.address || 'N/A'}** — $${(d2.sale_price || 0).toLocaleString()} on ${d2.sale_date || '?'} | Buyer: ${d2.buyer || '?'}`);
        }
        break;

      case 'contractors':
        parts.push(`**Contractors Found** (${data.length})\n`);
        for (const c of data.slice(0, 10)) {
          const specs = (c.specialties || []).join(', ');
          const areas = (c.neighborhoods || []).slice(0, 3).join(', ');
          parts.push(`• **${c.name}** — ${specs}`);
          parts.push(`  ${c.total_permits} permits (${c.recent_permits} recent) | Areas: ${areas}`);
          if (c.phone) parts.push(`  📞 ${c.phone}`);
          if (c.website) parts.push(`  🌐 ${c.website}`);
          if (c.sample_work && c.sample_work.length > 0) parts.push(`  Recent work: "${c.sample_work[0].slice(0, 80)}..."`);
          parts.push('');
        }
        break;

      default:
        parts.push(`**${table}** (${data.length} results)`);
        break;
    }
  }

  return parts.join('\n') || 'No results found.';
}

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (checkAuth(req, res)) return;

  try {
    // Support both GET and POST
    let question;
    if (req.method === 'POST') {
      question = req.body?.question || req.body?.q;
    } else {
      question = req.query?.question || req.query?.q;
    }

    if (!question) return sendError(res, 'question is required', 400);

    const classification = await classifyWithAI(question);

    if (!classification.plan) {
      return sendJson(res, {
        answer: classification.raw || 'Could not understand the question. Try a specific address, person name, or topic like "permits in East Village".',
        meta: { ai_classified: classification.ai, query_plan: null },
      });
    }

    const results = await executeQueryPlan(classification.plan);
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const answer = await generateAnswer(question, classification.plan, results, apiKey);

    sendJson(res, {
      answer,
      meta: {
        ai_classified: classification.ai,
        ai_answered: !!apiKey,
        query_plan: classification.plan,
        tables_queried: Object.keys(results),
        total_results: Object.values(results).reduce((sum, d) => sum + (Array.isArray(d) ? d.length : 0), 0),
      },
    });
  } catch (err) {
    console.error('Error in /api/chat:', err);
    sendError(res, 'Internal server error');
  }
};
