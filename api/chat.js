const { handleCors, sendJson, sendError } = require('./_helpers');

// Load all data sources
let data = {};
function loadAll() {
  if (data.loaded) return;
  data.investors = require('./_data/investors.json');
  data.sales = require('./_data/sales.json');
  data.neighborhoods = require('./_data/neighborhoods.json');
  data.lending = require('./_data/lending.json');
  data.contractors = require('./_data/contractors.json');
  data.stats = require('./_data/stats.json');
  data.loans = require('./_data/hmda_loans.json');
  data.loaded = true;
}

// Schema description for the AI
const SCHEMA = `You are a Detroit real estate data analyst. You have access to these datasets:

INVESTORS (${() => { loadAll(); return data.investors.length; }}): name, total_purchases, total_spend, avg_price, min_price, max_price, first_purchase, last_purchase, top_neighborhood, investment_tier (institutional/large/medium/small), neighborhood_count
SALES (60,000): address, amt_sale_price (raw $), grantee (buyer), grantor (seller), sale_date, neighborhood, ecf_neighborhood, term_of_sale, sale_instrument, property_class_description, zip_code, parcel_id
NEIGHBORHOODS (198): neighborhood, score, total_sales, median_price, total_permits, total_blight, total_rentals, total_demos
LENDING (200 lenders): name, lei, total_loans, total_volume, avg_amount, min_amount, max_amount, avg_rate, sub_60k_loans, investment_loans, llc_sub_60k_loans, business_loans, does_multifamily, loan_types{}
HMDA_LOANS (26,707 individual loans): lei, loan_type, loan_purpose, loan_amount, interest_rate, property_value, total_units, occupancy, census_tract, is_business (LLC/business flag from federal HMDA reporting), matched_address, matched_grantee, matched_grantor, matched_neighborhood, matched_date
CONTRACTORS (4,780): name, contact_name, address, total_permits, top_neighborhood, top_specialty, recent_permits, neighborhoods_served

Reply with a JSON object: {"query": "description of what to search", "filters": {}, "datasets": ["which datasets to search"], "answer_template": "template with {placeholders}"}
If the question can be answered with keyword search, include "search_terms": ["term1", "term2"].
If it needs cross-referencing, describe in "strategy".`;

// AI-powered query classification (using Anthropic API)
async function classifyWithAI(question) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  
  if (!apiKey) {
    // Fall back to enhanced keyword matching if no API key
    return classifyKeyword(question);
  }

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
        system: `You are a Detroit real estate data query engine. Given a user question about Detroit real estate, generate a structured query plan as JSON.

Available datasets and their fields:
- investors: name, total_purchases, total_spend, avg_price, top_neighborhood, investment_tier, first_purchase, last_purchase
- sales: address, amt_sale_price, grantee (buyer), grantor (seller), sale_date, neighborhood, term_of_sale, property_class_description, zip_code, parcel_id
- neighborhoods: neighborhood, score, total_sales, median_price, total_permits, total_blight, total_rentals, total_demos
- lending: name, lei, total_loans, total_volume, avg_amount, avg_rate, sub_60k_loans, investment_loans, llc_sub_60k_loans, business_loans, does_multifamily
- hmda_loans: lei, loan_type, loan_purpose, loan_amount, interest_rate, occupancy, is_business (true=LLC/business), matched_address, matched_grantee, matched_grantor, matched_neighborhood, matched_date
- contractors: name, contact_name, address, total_permits, top_neighborhood, top_specialty

Reply ONLY with valid JSON:
{
  "intent": "investor_lookup|sales_search|neighborhood_info|lender_search|loan_search|contractor_search|cross_reference|stats",
  "datasets": ["which datasets to query"],
  "search_terms": ["search terms to look for"],
  "filters": {"field": "value or comparison"},
  "sort": {"field": "asc|desc"},
  "limit": 20,
  "explanation": "brief description of what we're looking for"
}`,
        messages: [{ role: 'user', content: question }],
      }),
    });

    const result = await response.json();
    const text = result.content?.[0]?.text || '';
    
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error('AI classification error:', e);
  }
  
  return classifyKeyword(question);
}

// Enhanced keyword-based classification (fallback)
function classifyKeyword(question) {
  const q = question.toLowerCase().trim();
  
  // Lender queries
  if (q.match(/lend|financ|mortgage|loan|rate|bank|credit union|refi|fha|sub.?60|llc.*(lend|loan|financ)/i)) {
    const filters = {};
    if (q.includes('sub') && q.includes('60')) filters.sub60k = true;
    if (q.includes('llc') || q.includes('business')) filters.is_business = true;
    if (q.includes('investment')) filters.investment = true;
    if (q.includes('multifamily') || q.includes('multi')) filters.multifamily = true;
    if (q.includes('fha')) filters.loan_type = 'FHA';
    if (q.includes('lowest rate') || q.includes('best rate')) filters.sort = 'rate_asc';
    
    return { intent: 'lender_search', datasets: ['lending', 'hmda_loans'], filters, search_terms: extractNames(q), limit: 20, explanation: 'Searching lender/loan data' };
  }
  
  // Investor queries
  if (q.match(/who is|investor|buyer|bought|purchas|owner|who owns/i)) {
    return { intent: 'investor_lookup', datasets: ['investors', 'sales'], search_terms: extractNames(q), limit: 20, explanation: 'Looking up investor/buyer' };
  }
  
  // Contractor queries
  if (q.match(/contractor|plumb|electric|hvac|mechanic|who (built|works|does work)/i)) {
    return { intent: 'contractor_search', datasets: ['contractors'], search_terms: extractNames(q), limit: 20, explanation: 'Searching contractors' };
  }
  
  // Neighborhood queries
  if (q.match(/neighborhood|area|hood|growing|trending|score|compare|vs|safest|cheapest|expensive/i)) {
    return { intent: 'neighborhood_info', datasets: ['neighborhoods'], search_terms: extractNames(q), limit: 20, explanation: 'Neighborhood analysis' };
  }
  
  // Sales/property queries
  if (q.match(/propert|sold|sale|address|house|home|under \$|over \$|price|deed/i)) {
    const filters = {};
    const priceMatch = q.match(/under \$?([\d,]+k?)/i);
    if (priceMatch) {
      let val = priceMatch[1].replace(/,/g, '');
      if (val.endsWith('k')) val = parseFloat(val) * 1000;
      filters.max_price = parseFloat(val);
    }
    return { intent: 'sales_search', datasets: ['sales'], search_terms: extractNames(q), filters, limit: 50, explanation: 'Searching property sales' };
  }

  // Stats
  if (q.match(/stats|overview|summary|how much|total/i)) {
    return { intent: 'stats', datasets: ['stats'], search_terms: [], limit: 1, explanation: 'Overall statistics' };
  }

  // Default: try cross-referencing
  return { intent: 'cross_reference', datasets: ['investors', 'sales', 'lending'], search_terms: extractNames(q), limit: 20, explanation: 'General search across all data' };
}

function extractNames(q) {
  // Remove common words to extract potential entity names
  const stopwords = ['who', 'is', 'are', 'the', 'what', 'where', 'show', 'me', 'find', 'get', 'list', 'all', 'in', 'for', 'of', 'to', 'and', 'or', 'with', 'has', 'have', 'does', 'do', 'a', 'an', 'that', 'this', 'properties', 'property', 'sales', 'sold', 'investors', 'investor', 'lenders', 'lender', 'loans', 'loan', 'contractor', 'contractors', 'neighborhood', 'area', 'under', 'over', 'between', 'most', 'top', 'best', 'how', 'many', 'much'];
  const words = q.replace(/[?!.,]/g, '').split(/\s+/).filter(w => !stopwords.includes(w.toLowerCase()) && w.length > 1);
  return words;
}

// Execute query against loaded data
function executeQuery(plan) {
  loadAll();
  const results = { answer: '', items: [], mapPoints: [] };

  switch (plan.intent) {
    case 'lender_search': {
      let lenders = [...data.lending];
      const terms = (plan.search_terms || []).map(t => t.toLowerCase());
      
      if (terms.length > 0) {
        const nameMatch = lenders.filter(l => terms.some(t => (l.name || '').toLowerCase().includes(t)));
        if (nameMatch.length > 0) lenders = nameMatch;
      }
      
      if (plan.filters?.sub60k) lenders = lenders.filter(l => (l.sub_60k_loans || 0) > 0);
      if (plan.filters?.is_business) lenders = lenders.filter(l => (l.llc_sub_60k_loans || 0) > 0 || (l.business_loans || 0) > 0);
      if (plan.filters?.investment) lenders = lenders.filter(l => (l.investment_loans || 0) > 0);
      if (plan.filters?.multifamily) lenders = lenders.filter(l => l.does_multifamily);
      if (plan.filters?.loan_type) lenders = lenders.filter(l => l.loan_types && l.loan_types[plan.filters.loan_type] > 0);
      
      if (plan.filters?.sort === 'rate_asc') {
        lenders = lenders.filter(l => l.avg_rate > 0).sort((a, b) => a.avg_rate - b.avg_rate);
      } else {
        lenders.sort((a, b) => (b.total_loans || 0) - (a.total_loans || 0));
      }

      const top = lenders.slice(0, plan.limit || 20);
      results.answer = `Found ${lenders.length} lenders matching your query:\n\n` + 
        top.map((l, i) => `**${i+1}. ${l.name}** — ${l.total_loans} loans, $${Math.round((l.total_volume||0)/1000000)}M volume, ${l.avg_rate ? l.avg_rate.toFixed(2) + '%' : '--'} avg rate${l.sub_60k_loans ? ', ' + l.sub_60k_loans + ' sub-$60K' : ''}${l.llc_sub_60k_loans ? ', ' + l.llc_sub_60k_loans + ' LLC sub-$60K' : ''}`).join('\n');
      results.items = top;
      break;
    }

    case 'investor_lookup': {
      const terms = (plan.search_terms || []).map(t => t.toLowerCase());
      let investors = data.investors;
      
      if (terms.length > 0) {
        investors = investors.filter(inv => terms.some(t => (inv.name || '').toLowerCase().includes(t)));
      }
      
      if (investors.length === 0 && terms.length > 0) {
        // Try sales grantee search
        const sales = data.sales.filter(s => terms.some(t => 
          (s.grantee || '').toLowerCase().includes(t) || (s.grantor || '').toLowerCase().includes(t)
        ));
        if (sales.length > 0) {
          results.answer = `Found ${sales.length} property transactions matching "${terms.join(' ')}":\n\n` +
            sales.slice(0, 15).map(s => `📍 ${s.address} — $${(s.amt_sale_price||0).toLocaleString()} | Buyer: ${s.grantee || '?'} | Seller: ${s.grantor || '?'} | ${(s.sale_date||'').split('T')[0]} | ${s.neighborhood || ''}`).join('\n');
          results.items = sales.slice(0, 50);
          results.mapPoints = sales.filter(s => s.latitude && s.longitude).slice(0, 100).map(s => ({
            lat: s.latitude, lng: s.longitude, address: s.address, price: s.amt_sale_price
          }));
          return results;
        }
      }
      
      investors.sort((a, b) => (b.total_purchases || 0) - (a.total_purchases || 0));
      const top = investors.slice(0, plan.limit || 20);

      if (top.length === 1) {
        const inv = top[0];
        results.answer = `**${inv.name}**\n🏷️ ${inv.investment_tier} investor\n📦 ${inv.total_purchases} purchases | $${Math.round((inv.total_spend||0)/1000).toLocaleString()}K total\n💰 Avg: $${Math.round(inv.avg_price||0).toLocaleString()} | Range: $${Math.round(inv.min_price||0).toLocaleString()} - $${Math.round(inv.max_price||0).toLocaleString()}\n📍 Top area: ${inv.top_neighborhood} (${inv.neighborhood_count} neighborhoods)\n📅 ${(inv.first_purchase||'').split('T')[0]} → ${(inv.last_purchase||'').split('T')[0]}`;
        
        // Find their sales
        const sales = data.sales.filter(s => (s.grantee || '').toUpperCase().includes(inv.name.toUpperCase())).slice(0, 20);
        results.mapPoints = sales.filter(s => s.latitude && s.longitude).map(s => ({
          lat: s.latitude, lng: s.longitude, address: s.address, price: s.amt_sale_price
        }));
      } else {
        results.answer = `Found ${investors.length} investors:\n\n` +
          top.map((inv, i) => `**${i+1}. ${inv.name}** — ${inv.total_purchases} purchases, $${Math.round((inv.total_spend||0)/1000).toLocaleString()}K, ${inv.investment_tier}, top area: ${inv.top_neighborhood}`).join('\n');
      }
      results.items = top;
      break;
    }

    case 'neighborhood_info': {
      const terms = (plan.search_terms || []).map(t => t.toLowerCase());
      let hoods = data.neighborhoods;
      
      if (terms.length > 0) {
        const matched = hoods.filter(n => terms.some(t => (n.neighborhood || '').toLowerCase().includes(t)));
        if (matched.length > 0) hoods = matched;
      }

      // Check for comparison
      if (terms.length >= 2) {
        const h1 = hoods.find(h => (h.neighborhood || '').toLowerCase().includes(terms[0]));
        const h2 = hoods.find(h => (h.neighborhood || '').toLowerCase().includes(terms[1]));
        if (h1 && h2) {
          results.answer = `**${h1.neighborhood} vs ${h2.neighborhood}**\n\n` +
            `| Metric | ${h1.neighborhood} | ${h2.neighborhood} |\n` +
            `|--------|----------|----------|\n` +
            `| Score | ${h1.score?.toFixed(1)} | ${h2.score?.toFixed(1)} |\n` +
            `| Sales | ${h1.total_sales} | ${h2.total_sales} |\n` +
            `| Median | $${Math.round(h1.median_price||0).toLocaleString()} | $${Math.round(h2.median_price||0).toLocaleString()} |\n` +
            `| Permits | ${h1.total_permits} | ${h2.total_permits} |\n` +
            `| Blight | ${h1.total_blight} | ${h2.total_blight} |`;
          results.items = [h1, h2];
          return results;
        }
      }
      
      hoods.sort((a, b) => (b.score || 0) - (a.score || 0));
      const top = hoods.slice(0, plan.limit || 20);
      
      if (top.length === 1) {
        const h = top[0];
        results.answer = `**${h.neighborhood}**\n📊 Score: ${h.score?.toFixed(1)}\n🏠 ${h.total_sales} sales (median $${Math.round(h.median_price||0).toLocaleString()})\n🔧 ${h.total_permits} permits\n⚠️ ${h.total_blight} blight tickets\n🏗️ ${h.total_demos} demolitions\n🏘️ ${h.total_rentals} rentals`;
      } else {
        results.answer = `Top ${top.length} neighborhoods by score:\n\n` +
          top.map((h, i) => `**${i+1}. ${h.neighborhood}** — Score: ${h.score?.toFixed(1)}, ${h.total_sales} sales, median $${Math.round(h.median_price||0).toLocaleString()}`).join('\n');
      }
      results.items = top;
      break;
    }

    case 'sales_search': {
      let sales = [...data.sales];
      const terms = (plan.search_terms || []).map(t => t.toLowerCase());
      
      if (terms.length > 0) {
        sales = sales.filter(s => terms.some(t =>
          (s.address || '').toLowerCase().includes(t) ||
          (s.grantee || '').toLowerCase().includes(t) ||
          (s.grantor || '').toLowerCase().includes(t) ||
          (s.neighborhood || '').toLowerCase().includes(t)
        ));
      }
      
      if (plan.filters?.max_price) sales = sales.filter(s => (s.amt_sale_price || 0) <= plan.filters.max_price && s.amt_sale_price > 0);
      if (plan.filters?.min_price) sales = sales.filter(s => (s.amt_sale_price || 0) >= plan.filters.min_price);
      
      sales.sort((a, b) => (b.sale_date || '').localeCompare(a.sale_date || ''));
      const top = sales.slice(0, plan.limit || 50);
      
      results.answer = `Found ${sales.length} sales:\n\n` +
        top.slice(0, 15).map(s => `📍 ${s.address} — $${(s.amt_sale_price||0).toLocaleString()} | ${s.grantee || '?'} ← ${s.grantor || '?'} | ${(s.sale_date||'').split('T')[0]} | ${s.neighborhood || ''}`).join('\n');
      if (sales.length > 15) results.answer += `\n\n...and ${sales.length - 15} more.`;
      results.items = top;
      results.mapPoints = top.filter(s => s.latitude && s.longitude).map(s => ({
        lat: s.latitude, lng: s.longitude, address: s.address, price: s.amt_sale_price
      }));
      break;
    }

    case 'contractor_search': {
      let contractors = [...data.contractors];
      const terms = (plan.search_terms || []).map(t => t.toLowerCase());
      
      if (terms.length > 0) {
        const matched = contractors.filter(c => terms.some(t =>
          (c.name || '').toLowerCase().includes(t) ||
          (c.top_specialty || '').toLowerCase().includes(t) ||
          (c.top_neighborhood || '').toLowerCase().includes(t)
        ));
        if (matched.length > 0) contractors = matched;
      }
      
      contractors.sort((a, b) => (b.total_permits || 0) - (a.total_permits || 0));
      const top = contractors.slice(0, plan.limit || 20);
      
      results.answer = `Found ${contractors.length} contractors:\n\n` +
        top.map((c, i) => `**${i+1}. ${c.name}**${c.contact_name ? ' (Contact: ' + c.contact_name + ')' : ''} — ${c.total_permits} permits, ${c.top_specialty || 'General'}, Top area: ${c.top_neighborhood || 'N/A'}`).join('\n');
      results.items = top;
      break;
    }

    case 'loan_search': {
      let loans = [...data.loans];
      const terms = (plan.search_terms || []).map(t => t.toLowerCase());
      
      if (plan.filters?.is_business) loans = loans.filter(l => l.is_business);
      if (plan.filters?.sub60k) loans = loans.filter(l => l.loan_amount > 0 && l.loan_amount <= 60000);
      
      if (terms.length > 0) {
        loans = loans.filter(l => terms.some(t =>
          (l.matched_address || '').toLowerCase().includes(t) ||
          (l.matched_grantee || '').toLowerCase().includes(t) ||
          (l.matched_neighborhood || '').toLowerCase().includes(t)
        ));
      }
      
      loans.sort((a, b) => b.loan_amount - a.loan_amount);
      const top = loans.slice(0, plan.limit || 20);
      
      results.answer = `Found ${loans.length} loans:\n\n` +
        top.slice(0, 15).map(l => `$${l.loan_amount.toLocaleString()} | ${l.loan_type} | ${l.interest_rate ? l.interest_rate.toFixed(2) + '%' : '--'} | ${l.matched_address || 'N/A'} | ${l.is_business ? '🏢 LLC' : ''}`).join('\n');
      results.items = top;
      break;
    }

    case 'stats': {
      const s = data.stats;
      results.answer = `**Detroit Data Intelligence — Overview**\n\n📊 ${(s.sales||0).toLocaleString()} property sales\n🏗️ ${(s.permits||0).toLocaleString()} building permits\n⚠️ ${(s.blight||0).toLocaleString()} blight violations\n📈 ${(s.investors||0).toLocaleString()} investors tracked\n🏘️ ${s.neighborhoods} neighborhoods\n🏦 200 HMDA lenders\n🔧 ${(s.contractors||0).toLocaleString()} contractors`;
      results.items = [s];
      break;
    }

    case 'cross_reference':
    default: {
      // Search across everything
      const terms = (plan.search_terms || []).map(t => t.toLowerCase());
      if (terms.length === 0) {
        results.answer = 'Ask me anything about Detroit real estate — investors, sales, lenders, contractors, neighborhoods. Try "Who are the top investors?" or "What lenders do sub-$60K loans to LLCs?"';
        return results;
      }

      // Search investors
      const invMatches = data.investors.filter(i => terms.some(t => (i.name || '').toLowerCase().includes(t))).slice(0, 5);
      // Search sales
      const saleMatches = data.sales.filter(s => terms.some(t => 
        (s.address || '').toLowerCase().includes(t) || (s.grantee || '').toLowerCase().includes(t) || (s.grantor || '').toLowerCase().includes(t)
      )).slice(0, 10);
      // Search lenders
      const lenderMatches = data.lending.filter(l => terms.some(t => (l.name || '').toLowerCase().includes(t))).slice(0, 5);
      // Search contractors
      const contMatches = data.contractors.filter(c => terms.some(t => (c.name || '').toLowerCase().includes(t))).slice(0, 5);

      let answer = `Search results for "${terms.join(' ')}":\n\n`;
      if (invMatches.length) answer += `**Investors (${invMatches.length}):**\n` + invMatches.map(i => `• ${i.name} — ${i.total_purchases} purchases, $${Math.round((i.total_spend||0)/1000)}K`).join('\n') + '\n\n';
      if (lenderMatches.length) answer += `**Lenders (${lenderMatches.length}):**\n` + lenderMatches.map(l => `• ${l.name} — ${l.total_loans} loans, ${l.avg_rate?.toFixed(2)}% rate`).join('\n') + '\n\n';
      if (saleMatches.length) answer += `**Sales (${saleMatches.length}):**\n` + saleMatches.map(s => `• ${s.address} — $${(s.amt_sale_price||0).toLocaleString()} | ${s.grantee}`).join('\n') + '\n\n';
      if (contMatches.length) answer += `**Contractors (${contMatches.length}):**\n` + contMatches.map(c => `• ${c.name} — ${c.total_permits} permits`).join('\n') + '\n\n';
      
      if (!invMatches.length && !saleMatches.length && !lenderMatches.length && !contMatches.length) {
        answer = `No results found for "${terms.join(' ')}". Try different search terms or ask a specific question like "Who lends to LLCs under $60K?" or "Show properties in Corktown"`;
      }

      results.answer = answer;
      results.items = [...invMatches, ...saleMatches.slice(0, 5), ...lenderMatches, ...contMatches];
      results.mapPoints = saleMatches.filter(s => s.latitude && s.longitude).map(s => ({
        lat: s.latitude, lng: s.longitude, address: s.address, price: s.amt_sale_price
      }));
      break;
    }
  }

  return results;
}

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  try {
    if (req.method !== 'POST') {
      return sendError(res, 'Method not allowed. Use POST.', 405);
    }

    const { question } = req.body || {};
    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return sendError(res, 'question field is required', 400);
    }

    // Classify the question (AI if available, keyword fallback)
    const plan = await classifyWithAI(question);
    
    // Execute the query
    const results = executeQuery(plan);
    
    sendJson(res, results);
  } catch (err) {
    console.error('Error in /api/chat:', err);
    sendError(res, 'Internal server error');
  }
};
