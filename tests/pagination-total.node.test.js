/**
 * List tabs must paginate from API `meta.total`, not the current page length.
 *
 * Live `/api/investors?limit=20` returns `{ data: [20], meta: { total: 71101 } }`
 * with no top-level `total`. Reading `data.total || items.length` makes the
 * Investors tab show "1–20 of 20" and hide ~71k remaining rows.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function listTotal(payload, pageItems) {
  const meta = (payload && payload.meta) || {};
  if (meta.total != null) return meta.total;
  if (payload && payload.total != null) return payload.total;
  if (payload && payload.count != null) return payload.count;
  return (pageItems && pageItems.length) || 0;
}

function loadJs(name) {
  return fs.readFileSync(path.join(__dirname, '..', 'public', 'js', name), 'utf8');
}

test('investor-shaped payload uses meta.total, not page length', () => {
  const payload = {
    data: Array.from({ length: 20 }, () => ({ name: 'X' })),
    meta: { total: 71101, page: 1, limit: 20 },
  };
  const items = payload.data;
  const broken = payload.total || payload.count || items.length;
  const total = listTotal(payload, items);

  assert.equal(broken, 20);
  assert.equal(total, 71101);
  assert.equal(Math.ceil(total / 20), 3556);
});

test('seller-shaped payload uses meta.total when it exceeds the page', () => {
  const payload = {
    data: Array.from({ length: 20 }, () => ({ address: '1 Main' })),
    meta: { total: 84, page: 1, limit: 20 },
  };
  assert.equal(listTotal(payload, payload.data), 84);
  assert.equal(Math.ceil(84 / 20), 5);
});

test('zero total is not replaced by page length', () => {
  const payload = { data: [], meta: { total: 0, page: 1, limit: 20 } };
  assert.equal(listTotal(payload, payload.data), 0);
});

test('investors list reads meta.total for pagination', () => {
  const src = loadJs('investors.js');
  assert.match(src, /var meta = data\.meta \|\| \{\}/);
  assert.match(src, /meta\.total != null \? meta\.total/);
  assert.doesNotMatch(src, /var total = data\.total \|\| data\.count \|\| investors\.length/);
});

test('pipeline list reads meta.total for pagination', () => {
  const src = loadJs('pipeline.js');
  assert.match(src, /var meta = data\.meta \|\| \{\}/);
  assert.match(src, /meta\.total != null \? meta\.total/);
  assert.doesNotMatch(src, /var total = data\.total \|\| data\.count \|\| sellers\.length/);
});
