const { handleCors, sendJson, sendError } = require('./_helpers');

let investorsData = null;
let salesData = null;
let neighborhoodsData = null;
let statsData = null;

function loadInvestors() {
  if (!investorsData) investorsData = require('./_data/investors.json');
  return investorsData;
}

function loadSales() {
  if (!salesData) salesData = require('./_data/sales.json');
  return salesData;
}

function loadNeighborhoods() {
  if (!neighborhoodsData) neighborhoodsData = require('./_data/neighborhoods.json');
  return neighborhoodsData;
}

function loadStats() {
  if (!statsData) statsData = require('./_data/stats.json');
  return statsData;
}

/**
 * Parse a chat question and route to appropriate data query
 */
function handleQuestion(question) {
  const q = question.toLowerCase().trim();

  // "who is [name]" -> investor lookup
  const whoIsMatch = q.match(/^who\s+is\s+(.+)/);
  if (whoIsMatch) {
    const name = whoIsMatch[1].trim().toUpperCase();
    const investors = loadInvestors();
    const investor = investors.find(i => i.name && i.name.toUpperCase().includes(name));
    if (investor) {
      const sales = loadSales();
      const purchases = sales
        .filter(s => s.ge && s.ge.toUpperCase() === investor.name.toUpperCase())
        .sort((a, b) => (b.dt || '').localeCompare(a.dt || ''))
        .slice(0, 10)
        .map(s => ({ address: s.addr, sale_price: s.pr, sale_date: s.dt, neighborhood: s.nb, lat: s.lat, lng: s.lng }));

      return {
        answer: `${investor.name} is a ${investor.investment_tier} investor with ${investor.total_purchases} purchases totaling $${(investor.total_spend || 0).toLocaleString()}. Most active in ${investor.top_neighborhood}. Average price: $${Math.round(investor.avg_price || 0).toLocaleString()}.`,
        data: [investor],
        mapPoints: purchases,
      };
    }
    return {
      answer: `I couldn't find an investor matching "${whoIsMatch[1]}". Try searching with a different name.`,
      data: [],
      mapPoints: [],
    };
  }

  // "top investors" -> sorted investors
  if (q.includes('top investor')) {
    const investors = loadInvestors();
    const top = investors
      .slice()
      .sort((a, b) => b.total_purchases - a.total_purchases)
      .slice(0, 10);
    return {
      answer: `Here are the top 10 investors by number of purchases in Detroit:`,
      data: top.map(i => ({
        name: i.name,
        total_purchases: i.total_purchases,
        total_spend: i.total_spend,
        investment_tier: i.investment_tier,
        top_neighborhood: i.top_neighborhood,
      })),
      mapPoints: [],
    };
  }

  // "show properties in [neighborhood]" or "properties in [neighborhood]"
  const propertiesMatch = q.match(/(?:show\s+)?properties\s+in\s+(.+)/);
  if (propertiesMatch) {
    const nbQuery = propertiesMatch[1].trim().toLowerCase();
    const sales = loadSales();
    const matches = sales
      .filter(s => s.nb && s.nb.toLowerCase().includes(nbQuery))
      .sort((a, b) => (b.dt || '').localeCompare(a.dt || ''))
      .slice(0, 50);

    const expanded = matches.map(s => ({
      address: s.addr,
      sale_price: s.pr,
      sale_date: s.dt,
      grantee: s.ge,
      neighborhood: s.nb,
      lat: s.lat,
      lng: s.lng,
    }));

    const neighborhood = matches.length > 0 ? matches[0].nb : propertiesMatch[1].trim();
    return {
      answer: `Found ${matches.length} recent property sales in ${neighborhood}.`,
      data: expanded,
      mapPoints: expanded.filter(s => s.lat && s.lng),
    };
  }

  // "what's happening in [neighborhood]" or "whats happening in [neighborhood]"
  const happeningMatch = q.match(/what(?:'?s| is)\s+happening\s+in\s+(.+)/);
  if (happeningMatch) {
    const nbQuery = happeningMatch[1].trim().toLowerCase();
    const neighborhoods = loadNeighborhoods();
    const nb = neighborhoods.find(n => n.neighborhood && n.neighborhood.toLowerCase().includes(nbQuery));

    if (nb) {
      return {
        answer: `${nb.neighborhood} has a neighborhood score of ${nb.score.toFixed(1)}. There have been ${nb.total_sales} sales (median $${Math.round(nb.median_price || 0).toLocaleString()}), ${nb.total_permits} permits, ${nb.total_blight} blight violations, ${nb.total_rentals} rental registrations, and ${nb.total_demos} demolitions.`,
        data: [nb],
        mapPoints: [],
      };
    }
    return {
      answer: `I couldn't find a neighborhood matching "${happeningMatch[1]}". Try using the full neighborhood name.`,
      data: [],
      mapPoints: [],
    };
  }

  // "stats" or "overview"
  if (q.includes('stats') || q.includes('overview') || q.includes('summary')) {
    const stats = loadStats();
    return {
      answer: `Detroit Data Intel tracks ${stats.sales.toLocaleString()} property sales, ${stats.permits.toLocaleString()} building permits, ${stats.blight.toLocaleString()} blight violations, ${stats.investors.toLocaleString()} investors, ${stats.neighborhoods} neighborhoods, and ${stats.contractors.toLocaleString()} contractors.`,
      data: [stats],
      mapPoints: [],
    };
  }

  // Neighborhood lookup by name (simple query that's just a neighborhood name)
  const neighborhoods = loadNeighborhoods();
  const directNb = neighborhoods.find(n => n.neighborhood && n.neighborhood.toLowerCase() === q);
  if (directNb) {
    return {
      answer: `${directNb.neighborhood}: Score ${directNb.score.toFixed(1)}, ${directNb.total_sales} sales (median $${Math.round(directNb.median_price || 0).toLocaleString()}), ${directNb.total_permits} permits, ${directNb.total_blight} blight violations.`,
      data: [directNb],
      mapPoints: [],
    };
  }

  // Default: return helpful suggestions
  return {
    answer: `I can help you explore Detroit property data. Try asking:\n- "Who is [investor name]"\n- "Show properties in [neighborhood]"\n- "Top investors"\n- "What's happening in [neighborhood]"\n- "Stats" for an overview`,
    data: [],
    mapPoints: [],
  };
}

module.exports = (req, res) => {
  if (handleCors(req, res)) return;

  try {
    if (req.method !== 'POST') {
      return sendError(res, 'Method not allowed. Use POST.', 405);
    }

    const { question } = req.body || {};

    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return sendError(res, 'question field is required in request body', 400);
    }

    const result = handleQuestion(question);
    sendJson(res, result);
  } catch (err) {
    console.error('Error in /api/chat:', err);
    sendError(res, 'Internal server error');
  }
};
