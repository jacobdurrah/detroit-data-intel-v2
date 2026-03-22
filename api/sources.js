const { handleCors, sendJson } = require('./_helpers');
const { supabase } = require('./_supabase');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  // Get live counts from Supabase
  const tableCounts = {};
  const tables = ['sales', 'blight', 'assessment', 'permits', 'trades', 'rentals', 'dlba_owned', 'dlba_auction', 'presale', 'demos', 'vacant'];
  
  await Promise.all(tables.map(async (t) => {
    try {
      const { count } = await supabase.from(t).select('*', { count: 'exact', head: true });
      tableCounts[t] = count || 0;
    } catch { tableCounts[t] = 0; }
  }));

  const sources = {
    tabs: [
      {
        tab: 'Map',
        description: 'Interactive map with property sales, permits, blight, demolitions, rentals, crime, DLBA, and vacant property layers.',
        datasets: [
          {
            name: 'Property Sales',
            source: 'City of Detroit Open Data Portal',
            url: 'https://data.detroitmi.gov/datasets/d26fda1e80b04630a6e56627e6fbceb8_0',
            storage: 'Supabase (live)',
            records: tableCounts.sales,
            fields: 'sales_id, address, sale_date, sale_price, grantor, grantee, neighborhood, ecf_neighborhood, parcel_id, zip_code, terms_of_sale, property_class_desc, lat/lng',
            notes: 'Complete dataset — all property sales in Detroit. Updated via bulk CSV download.',
          },
          {
            name: 'Building Permits',
            source: 'City of Detroit Open Data Portal — BSEED',
            url: 'https://data.detroitmi.gov/datasets/86d47e86062e4beeb19344eb125b75d2_0',
            storage: 'Supabase (live)',
            records: tableCounts.permits,
            fields: 'permit_no, address, permit_issued, permit_type, description, estimated_cost, contractor_name, parcel_id, neighborhood',
          },
          {
            name: 'Trade Permits',
            source: 'City of Detroit Open Data Portal — BSEED',
            storage: 'Supabase (live)',
            records: tableCounts.trades,
            fields: 'permit_no, address, permit_issued, permit_type, description, contractor_name, parcel_id, neighborhood',
          },
          {
            name: 'Blight Tickets',
            source: 'City of Detroit Open Data Portal',
            url: 'https://data.detroitmi.gov/datasets/9ce72b42872844bdbe272c607224e3b3_0',
            storage: 'Supabase (live)',
            records: tableCounts.blight,
            fields: 'ticket_id, violator_name, violation_description, fine_amount, judgment_amount, balance_due, payment_status, neighborhood',
          },
          {
            name: 'Assessment Roll 2026',
            source: 'City of Detroit Open Data Portal',
            storage: 'Supabase (live)',
            records: tableCounts.assessment,
            fields: 'parcel_id, address, total_assessed_value, total_taxable_value, land_value, improvement_value, year_built, bedrooms, owner_name, property_class, neighborhood',
          },
          {
            name: 'Rental Registrations',
            source: 'City of Detroit Open Data Portal',
            storage: 'Supabase (live)',
            records: tableCounts.rentals,
            fields: 'certificate_number, address, rental_type, owner_name, parcel_id, neighborhood',
          },
          {
            name: 'DLBA Owned Properties',
            source: 'City of Detroit Open Data Portal',
            storage: 'Supabase (live)',
            records: tableCounts.dlba_owned,
            fields: 'parcel_id, address, neighborhood, property_class',
          },
          {
            name: 'DLBA Auction Sales',
            source: 'City of Detroit Open Data Portal',
            storage: 'Supabase (live)',
            records: tableCounts.dlba_auction,
            fields: 'address, sale_date, sale_price, buyer, parcel_id, neighborhood',
          },
          {
            name: 'Presale Inspections',
            source: 'City of Detroit Open Data Portal',
            storage: 'Supabase (live)',
            records: tableCounts.presale,
            fields: 'case_id, address, status, rating, parcel_id, neighborhood',
          },
          {
            name: 'Demolition Permits',
            source: 'City of Detroit Open Data Portal',
            storage: 'Supabase (live)',
            records: tableCounts.demos,
            fields: 'permit_no, address, permit_issued, contractor_name, parcel_id, neighborhood',
          },
          {
            name: 'Vacant Property Registrations',
            source: 'City of Detroit Open Data Portal',
            storage: 'Supabase (live)',
            records: tableCounts.vacant,
            fields: 'task_id, address, date_issued, owner_name, parcel_id, neighborhood',
          },
        ],
      },
      {
        tab: 'Investors',
        description: 'Aggregated from Property Sales — identifies repeat buyers, tracks purchase patterns, neighborhood focus.',
        datasets: [{
          name: 'Investor Analytics',
          source: 'Derived from Property Sales table',
          storage: 'Computed on-demand from Supabase',
          records: tableCounts.sales,
          notes: 'Groups sales by grantee (buyer) to identify institutional, large, medium, and small investors.',
        }],
      },
      {
        tab: 'Lending',
        description: 'HMDA federal lending data for Detroit — individual loans with rates, amounts, lender names.',
        datasets: [{
          name: 'HMDA Loans',
          source: 'Federal HMDA (Home Mortgage Disclosure Act) via CFPB',
          storage: 'Supabase (live)',
          notes: 'Cross-referenced with GLEIF for lender name resolution. 179 LEI codes resolved.',
        }],
      },
      {
        tab: 'Contractors',
        description: 'Aggregated from Building + Trade Permits — shows who is doing work and where.',
        datasets: [{
          name: 'Contractor Analytics',
          source: 'Derived from Permits + Trades tables',
          storage: 'Computed on-demand from Supabase',
          records: (tableCounts.permits || 0) + (tableCounts.trades || 0),
        }],
      },
    ],
    summary: {
      total_records: Object.values(tableCounts).reduce((a, b) => a + b, 0),
      total_datasets: tables.length,
      storage: 'Supabase PostgreSQL (Pro plan, 8GB)',
      data_source: 'data.detroitmi.gov — City of Detroit Open Data Portal',
      refresh_method: 'Bulk CSV download → idempotent upsert',
      last_loaded: new Date().toISOString(),
    },
  };

  sendJson(res, sources);
};
