const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

/**
 * Map popups must read the compact keys /api/map-tiles actually emits.
 * Live probe 2026-08-16:
 *   blight → { id, addr, desc, fine, balance, nb, lat, lng, type }
 *   dlba   → { id, addr, nb, class, lat, lng, type }
 *   sales  → { id, addr, pr, dt, ge, nb, lat, lng, type }  (already aliased)
 */

function pickValue(pt, keys) {
  const list = Array.isArray(keys) ? keys : [keys];
  for (const k of list) {
    if (pt[k] !== null && pt[k] !== undefined && pt[k] !== '') return pt[k];
  }
  return null;
}

function visibleLabels(fields, pt) {
  const labels = [];
  for (const f of fields) {
    const val = pickValue(pt, f.k);
    if (val !== null) labels.push(f.l);
  }
  return labels;
}

function extractLayerFields(src, layer) {
  const re = new RegExp(
    `layer === '${layer}'\\) \\{\\s*fields = \\[([\\s\\S]*?)\\];`
  );
  const m = src.match(re);
  assert.ok(m, `could not find field config for layer ${layer}`);
  const keys = [];
  const keyRe = /k:\s*(?:'([^']+)'|\[([^\]]+)\])/g;
  let km;
  while ((km = keyRe.exec(m[1]))) {
    if (km[1]) {
      keys.push(km[1]);
    } else {
      for (const part of km[2].split(',')) {
        const inner = part.match(/'([^']+)'/);
        if (inner) keys.push(inner[1]);
      }
    }
  }
  return keys;
}

const mapJs = fs.readFileSync(
  path.join(__dirname, '..', 'public/js/map.js'),
  'utf8'
);
const mapTilesJs = fs.readFileSync(
  path.join(__dirname, '..', 'api/map-tiles.js'),
  'utf8'
);

test('map.js blight aliases include compact map-tiles keys', () => {
  const keys = extractLayerFields(mapJs, 'blight');
  for (const needed of ['desc', 'fine', 'balance', 'nb', 'dt']) {
    assert.ok(keys.includes(needed), `blight aliases missing compact key "${needed}": ${keys.join(',')}`);
  }
});

test('map.js dlba aliases include compact map-tiles keys', () => {
  const keys = extractLayerFields(mapJs, 'dlba');
  for (const needed of ['class', 'nb', 'id']) {
    assert.ok(keys.includes(needed), `dlba aliases missing compact key "${needed}": ${keys.join(',')}`);
  }
});

test('map-tiles blight mapper emits dt for ticket date', () => {
  assert.match(
    mapTilesJs,
    /type: 'blight'[\s\S]{0,80}dt: b\.ticket_issued_date|dt: b\.ticket_issued_date[\s\S]{0,120}type: 'blight'/
  );
});

test('compact blight payload fills violation, fine, balance, neighborhood, date', () => {
  const fields = [
    { k: ['desc', 'ordinance_description', 'violation_description'], l: 'Violation' },
    { k: ['dt', 'ticket_issued_date'], l: 'Issued' },
    { k: ['fine', 'amt_fine', 'fine_amount'], l: 'Fine' },
    { k: ['balance', 'amt_balance_due', 'balance_due'], l: 'Balance Due' },
    { k: ['nb', 'neighborhood'], l: 'Neighborhood' },
  ];
  const liveBlight = {
    id: 495537,
    addr: '2482 Clifford',
    desc: 'Certificate of Compliance required',
    fine: 1000,
    balance: 0,
    dt: '2024-03-01',
    nb: 'Midtown',
    type: 'blight',
  };
  const labels = visibleLabels(fields, liveBlight);
  assert.deepEqual(labels, ['Violation', 'Issued', 'Fine', 'Balance Due', 'Neighborhood']);

  const v1OnlyFields = [
    { k: 'ordinance_description', l: 'Violation' },
    { k: 'ticket_issued_date', l: 'Issued' },
    { k: 'amt_fine', l: 'Fine' },
    { k: 'amt_balance_due', l: 'Balance Due' },
    { k: 'neighborhood', l: 'Neighborhood' },
  ];
  assert.deepEqual(visibleLabels(v1OnlyFields, liveBlight), [], 'pre-fix v1 keys must miss compact blight payload');
});

test('compact dlba payload fills status, neighborhood, parcel id', () => {
  const fields = [
    { k: ['class', 'inventory_status_socrata', 'property_class'], l: 'Status' },
    { k: ['nb', 'neighborhood'], l: 'Neighborhood' },
    { k: ['id', 'pid', 'parcel_id'], l: 'Parcel ID' },
  ];
  const liveDlba = {
    id: '01000240.001',
    addr: '400 Gratiot',
    nb: 'Downtown',
    class: 'DLBA Owned Structure',
    type: 'dlba',
  };
  assert.deepEqual(visibleLabels(fields, liveDlba), ['Status', 'Neighborhood', 'Parcel ID']);
});
