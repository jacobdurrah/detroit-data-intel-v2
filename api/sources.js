const { handleCors, sendJson } = require('./_helpers');
const fs = require('fs');
const path = require('path');

function getFileStats(filename) {
  try {
    const fp = path.join(__dirname, '_data', filename);
    const stat = fs.statSync(fp);
    const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
    const records = Array.isArray(data) ? data.length : (data.data ? data.data.length : 0);
    return { records, size_mb: Math.round(stat.size / 1024 / 1024 * 10) / 10, modified: stat.mtime.toISOString() };
  } catch (e) {
    return { records: 0, size_mb: 0, modified: null, error: e.message };
  }
}

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  const sources = {
    tabs: [
      {
        tab: 'Map',
        description: 'Interactive map with property sales, permits, blight, demolitions, rentals, crime, DLBA, and vacant property layers.',
        datasets: [
          {
            name: 'Property Sales',
            file: 'sales.json',
            source: 'City of Detroit Open Data Portal — Assessor Property Sales',
            url: 'https://data.detroitmi.gov/datasets/d26fda1e80b04630a6e56627e6fbceb8_0',
            api: 'https://services2.arcgis.com/qvkbeam7Wirps6zC/ArcGIS/rest/services/assessor_property_sales_view/FeatureServer/0/query',
            fields: '28 fields: parcel_id, address, sale_date, amt_sale_price, grantor, grantee, liber_page, term_of_sale, sale_instrument, property_class_code/description, neighborhood, ecf_neighborhood, council_district, zip_code, lat/lng',
            notes: 'Paginated at 2000 records per request. Current dataset capped at 60,000 records (ArcGIS limit). Includes sales from 2011-2025.',
            ...getFileStats('sales.json'),
          },
          {
            name: 'Building Permits',
            file: 'permits.json',
            source: 'City of Detroit Open Data Portal — BSEED Building Permits',
            url: 'https://data.detroitmi.gov/datasets/86d47e86062e4beeb19344eb125b75d2_0',
            api: 'https://services2.arcgis.com/qvkbeam7Wirps6zC/ArcGIS/rest/services/bseed_building_permits/FeatureServer/0/query',
            fields: '37 fields: permit_type, work_description, issued_date, construction_type, current/proposed use, zoning, stories, units, contractor cost, DLBA flags',
            notes: 'Current pull limited to 5,000 records. Full dataset has ~30K+ permits.',
            ...getFileStats('permits.json'),
          },
          {
            name: 'Trade Permits (Contractors)',
            file: 'trades.json',
            source: 'City of Detroit Open Data Portal — BSEED Trade Permits',
            api: 'https://services2.arcgis.com/qvkbeam7Wirps6zC/ArcGIS/rest/services/bseed_trades_permits/FeatureServer/0/query',
            fields: '24 fields: permit_type, work_description, contractor business name, contact name/address, owner name, property owner address',
            ...getFileStats('trades.json'),
          },
          {
            name: 'Blight Violations',
            file: 'blight.json',
            source: 'City of Detroit Open Data Portal — Blight Tickets',
            url: 'https://data.detroitmi.gov/datasets/9ce72b42872844bdbe272c607224e3b3_0',
            api: 'https://services2.arcgis.com/qvkbeam7Wirps6zC/ArcGIS/rest/services/blight_tickets/FeatureServer/0/query',
            fields: '50 fields: ordinance description, fine/judgment/balance amounts, payment status, property owner name/address, hearing/judgment dates, agency',
            notes: 'Current date range appears truncated (2004-2006). May need re-fetch with proper date sorting.',
            ...getFileStats('blight.json'),
          },
          {
            name: 'Demolition Permits',
            file: 'demos.json',
            source: 'City of Detroit Open Data Portal — BSEED Demolition Permits',
            api: 'https://services2.arcgis.com/qvkbeam7Wirps6zC/ArcGIS/rest/services/bseed_demolition_permits/FeatureServer/0/query',
            ...getFileStats('demos.json'),
          },
          {
            name: 'Rental Registrations',
            file: 'rentals.json',
            source: 'City of Detroit Open Data Portal — BSEED Rental Registrations',
            api: 'https://services2.arcgis.com/qvkbeam7Wirps6zC/ArcGIS/rest/services/bseed_rental_registrations/FeatureServer/0/query',
            ...getFileStats('rentals.json'),
          },
          {
            name: 'DLBA Properties',
            file: 'dlba.json',
            source: 'Detroit Land Bank Authority — Owned Properties & Own It Now inventory',
            url: 'https://data.detroitmi.gov/datasets/detroitmi::dlba-owned-properties-1',
            ...getFileStats('dlba.json'),
          },
          {
            name: 'Vacant Property Registrations',
            file: 'vacant.json',
            source: 'City of Detroit Open Data Portal — BSEED Vacant Property Registrations',
            api: 'https://services2.arcgis.com/qvkbeam7Wirps6zC/ArcGIS/rest/services/bseed_vacant_property_registrations/FeatureServer/0/query',
            ...getFileStats('vacant.json'),
          },
          {
            name: 'Crime / 911 Calls',
            file: 'crime.json',
            source: 'City of Detroit Open Data Portal — 911 Calls for Service',
            api: 'https://services2.arcgis.com/qvkbeam7Wirps6zC/ArcGIS/rest/services/911_Calls_for_Service/FeatureServer/0/query',
            notes: 'Dates stored as unix timestamps. Large dataset (200K+ records).',
            ...getFileStats('crime.json'),
          },
        ],
      },
      {
        tab: 'Investors',
        description: 'Investor profiles derived from property sales data. Entity resolution groups related buyers.',
        datasets: [
          {
            name: 'Investor Profiles',
            file: 'investors.json',
            source: 'DERIVED from Property Sales',
            method: 'Entity Resolution Pipeline',
            entity_resolution: [
              '1. Extract all unique grantees (buyers) from 60K property sales',
              '2. Normalize names: uppercase, strip LLC/INC/CORP suffixes, remove punctuation',
              '3. Group by shared mailing addresses across LLCs',
              '4. Fuzzy matching (Levenshtein distance) to merge similar names — merged 261 pairs',
              '5. Result: 7,408 investor entity groups from 60K sales',
              '6. Each profile: total purchases, total spend, avg/min/max price, date range, top neighborhoods, investment tier',
            ],
            tiers: 'Institutional (100+ purchases), Large (50-99), Medium (10-49), Small (1-9)',
            ...getFileStats('investors.json'),
          },
        ],
      },
      {
        tab: 'Areas (Neighborhoods)',
        description: 'Neighborhood momentum scores combining multiple signals.',
        datasets: [
          {
            name: 'Neighborhood Scores',
            file: 'neighborhoods.json',
            source: 'DERIVED from Sales + Permits + Blight + Demolitions + DLBA + Rentals',
            method: 'Neighborhood Momentum Score (0-100)',
            scoring: [
              'Sales trends: median price changes, volume trends',
              'Permit density: building permits per area (positive signal)',
              'Blight decline: decreasing violations (positive signal)',
              'DLBA velocity: land bank turnover rate',
              'Rental registrations: active rentals count',
              'Demolition activity: clearing for new development',
            ],
            ...getFileStats('neighborhoods.json'),
          },
        ],
      },
      {
        tab: 'Contractors',
        description: 'Contractor profiles derived from trade permits.',
        datasets: [
          {
            name: 'Contractor Profiles',
            file: 'contractors.json',
            source: 'DERIVED from Trade Permits (bseed_trades_permits)',
            method: 'Aggregate by contact_business_name from trade permits. Count permits, identify specialties (electrical, plumbing, HVAC, mechanical), map neighborhoods served.',
            ...getFileStats('contractors.json'),
          },
        ],
      },
      {
        tab: 'Lending',
        description: 'Lender profiles and individual loans from federal HMDA data.',
        datasets: [
          {
            name: 'HMDA Individual Loans',
            file: 'hmda_loans.json',
            source: 'Federal Financial Institutions Examination Council (FFIEC) — Home Mortgage Disclosure Act (HMDA) Data Browser',
            url: 'https://ffiec.cfpb.gov/data-browser/',
            api: 'https://ffiec.cfpb.gov/v2/data-browser-api/view/csv?states=MI&counties=26163&years={year}&actions_taken=1',
            fields: 'LEI, activity year, loan type (Conventional/FHA/VA/USDA), loan purpose, loan amount, interest rate, property value, total units, occupancy type, census tract, business/commercial purpose flag',
            years_fetched: '2018, 2019, 2020, 2021, 2022, 2023',
            years_missing: '2024 (HMDA API timed out — may not be published yet)',
            notes: 'HMDA data does NOT contain property addresses (federal privacy law). Addresses shown are from cross-referencing loan amounts with Detroit property sales records. Match rate is low (~0.5%) because HMDA amounts are rounded to nearest $5K and span all of Wayne County.',
            entity_resolution: [
              '1. Each loan has a LEI (Legal Entity Identifier) for the lender',
              '2. LEI codes resolved to real company names via GLEIF API (gleif.org)',
              '3. Cross-reference with sales: match loan amount ± $5K tolerance to sale price in same neighborhood',
              '4. LLC detection: HMDA field business_or_commercial_purpose=1 (federal mandate, not inference)',
            ],
            ...getFileStats('hmda_loans.json'),
          },
          {
            name: 'Lender Profiles',
            file: 'lending.json',
            source: 'DERIVED from HMDA Loans — aggregated by LEI',
            method: 'Group all loans by LEI, compute: total loans, volume, avg rate, sub-$60K count, LLC count, investment count, loan type distribution, year distribution. Names resolved via GLEIF API.',
            ...getFileStats('lending.json'),
          },
        ],
      },
      {
        tab: 'Pipeline (Motivated Sellers)',
        description: 'Properties likely available for acquisition, scored by distress signals.',
        datasets: [
          {
            name: 'Motivated Seller Profiles',
            file: 'sellers.json',
            source: 'DERIVED from Sales + Blight + DLBA + Permits + Vacant + Rentals',
            method: 'Motivated Seller Scoring (9 weighted signals)',
            scoring: [
              'Tax delinquency (weight: 30) — from blight/court records',
              'Estate/probate indicators (25) — grantee contains "estate" or "trust"',
              'Absentee owners (20) — owner address differs from property',
              'Blight stacking (20) — 3+ blight violations',
              'Vacant property (15) — on vacant registry',
              'Failed permits (15) — permit applied but not completed',
              'DLBA compliance issues (15) — in DLBA system',
              'Long-term equity with no activity (10) — owned 5+ years, no permits',
              'Code violations + long ownership (10) — combined signal',
            ],
            notes: '29,578 properties scored. Higher score = more motivated seller.',
            ...getFileStats('sellers.json'),
          },
        ],
      },
    ],
    data_freshness: {
      note: 'Data was fetched from ArcGIS REST APIs on initial build (March 2026). HMDA data covers 2018-2023 filings. A GitHub Actions workflow is configured for daily refresh but requires secrets to be set.',
      refresh_workflow: '.github/workflows/refresh-data.yml',
      known_issues: [
        'Sales capped at 60,000 records (ArcGIS pagination limit on initial fetch)',
        'Blight dates may be truncated — need re-fetch with date ordering',
        'Building permits limited to 5,000 records — full dataset has 30K+',
        'HMDA 2024 data not yet available (API timeout)',
        'Crime dates stored as unix timestamps instead of ISO format',
        'Cross-reference match rate between HMDA and sales is low (~0.5%) due to amount rounding and county-wide coverage',
      ],
    },
  };

  sendJson(res, sources);
};
