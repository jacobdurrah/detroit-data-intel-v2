/**
 * Shared Supabase client + field mapping utilities for backward-compatible responses
 */
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://vgtwkgckvryxbgujnqro.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

// --- Compact mappers: Supabase full column names → abbreviated for backward compat ---

function mapSaleCompact(s) {
  return {
    id: s.sales_id,
    pid: s.parcel_id,
    addr: s.address,
    dt: s.sale_date,
    pr: Number(s.sale_price) || 0,
    gr: s.grantor,
    ge: s.grantee,
    tos: s.terms_of_sale,
    si: s.sale_instrument,
    pcc: s.property_class_code,
    pcd: s.property_class_desc,
    nb: s.neighborhood,
    ecf: s.ecf_neighborhood,
    cd: s.council_district,
    zip: s.zip_code,
    lat: Number(s.latitude) || null,
    lng: Number(s.longitude) || null,
  };
}

function mapSaleExpanded(s) {
  return {
    id: s.sales_id,
    parcel_id: s.parcel_id,
    address: s.address,
    sale_date: s.sale_date,
    sale_price: Number(s.sale_price) || 0,
    grantor: s.grantor,
    grantee: s.grantee,
    term_of_sale: s.terms_of_sale,
    sale_instrument: s.sale_instrument,
    property_class_code: s.property_class_code,
    property_class_description: s.property_class_desc,
    neighborhood: s.neighborhood,
    ecf_neighborhood: s.ecf_neighborhood,
    council_district: s.council_district,
    zip: s.zip_code,
    lat: Number(s.latitude) || null,
    lng: Number(s.longitude) || null,
  };
}

function mapBlightCompact(b) {
  return {
    id: b.ticket_id,
    addr: [b.street_number, b.street_name].filter(Boolean).join(' '),
    dt: b.ticket_issued_date || b.violation_date,
    fine: Number(b.fine_amount) || 0,
    judgment: Number(b.judgment_amount) || 0,
    balance: Number(b.balance_due) || 0,
    payment_status: b.payment_status,
    violation: b.violation_description,
    nb: b.neighborhood,
    lat: Number(b.latitude) || null,
    lng: Number(b.longitude) || null,
  };
}

function mapPermitCompact(p) {
  return {
    id: p.permit_no,
    addr: p.address,
    dt: p.permit_issued,
    type: p.permit_type,
    desc: p.description,
    cost: Number(p.estimated_cost) || 0,
    status: p.permit_status,
    nb: p.neighborhood,
    lat: Number(p.latitude) || null,
    lng: Number(p.longitude) || null,
  };
}

function mapTradeCompact(t) {
  return {
    id: t.permit_no,
    addr: t.address,
    dt: t.permit_issued,
    type: t.permit_type,
    desc: t.description,
    biz: t.contractor_name,
    con: t.contractor_name,
    nb: t.neighborhood,
    lat: Number(t.latitude) || null,
    lng: Number(t.longitude) || null,
  };
}

function mapDemoCompact(d) {
  return {
    id: d.permit_no,
    addr: d.address,
    dt: d.permit_issued,
    status: d.permit_status,
    con: d.contractor_name,
    nb: d.neighborhood,
    lat: Number(d.latitude) || null,
    lng: Number(d.longitude) || null,
  };
}

function mapRentalCompact(r) {
  return {
    id: r.certificate_number,
    addr: r.address,
    type: r.rental_type,
    owner: r.owner_name,
    units: r.num_units,
    status: r.status,
    nb: r.neighborhood,
    lat: Number(r.latitude) || null,
    lng: Number(r.longitude) || null,
  };
}

function mapDlbaCompact(d) {
  return {
    pid: d.parcel_id,
    addr: d.address,
    nb: d.neighborhood,
    class: d.property_class,
    lat: Number(d.latitude) || null,
    lng: Number(d.longitude) || null,
  };
}

function mapVacantCompact(v) {
  return {
    id: v.task_id,
    addr: v.address,
    dt: v.date_issued,
    owner: v.owner_name,
    nb: v.neighborhood,
    lat: Number(v.latitude) || null,
    lng: Number(v.longitude) || null,
  };
}

function mapCrimeCompact(c) {
  return {
    id: c.crime_id,
    addr: c.address,
    dt: c.incident_timestamp,
    type: c.offense_category,
    desc: c.offense_description,
    nb: c.neighborhood,
    lat: Number(c.latitude) || null,
    lng: Number(c.longitude) || null,
  };
}

function mapDlbaAuctionCompact(a) {
  return {
    id: a.object_id,
    addr: a.address,
    dt: a.sale_date,
    pr: Number(a.sale_price) || 0,
    buyer: a.buyer,
    pid: a.parcel_id,
    nb: a.neighborhood,
    lat: Number(a.latitude) || null,
    lng: Number(a.longitude) || null,
  };
}

/** Layer name → Supabase table name */
const layerTable = {
  sales: 'sales',
  permits: 'permits',
  trades: 'trades',
  blight: 'blight',
  dlba: 'dlba_owned',
  demos: 'demos',
  rentals: 'rentals',
  crime: 'crime',
  vacant: 'vacant',
};

/** Layer name → compact mapper function */
const layerMappers = {
  sales: mapSaleCompact,
  permits: mapPermitCompact,
  trades: mapTradeCompact,
  blight: mapBlightCompact,
  dlba: mapDlbaCompact,
  demos: mapDemoCompact,
  rentals: mapRentalCompact,
  crime: mapCrimeCompact,
  vacant: mapVacantCompact,
};

module.exports = {
  supabase,
  mapSaleCompact,
  mapSaleExpanded,
  mapBlightCompact,
  mapPermitCompact,
  mapTradeCompact,
  mapDemoCompact,
  mapRentalCompact,
  mapDlbaCompact,
  mapDlbaAuctionCompact,
  mapVacantCompact,
  mapCrimeCompact,
  layerTable,
  layerMappers,
};
