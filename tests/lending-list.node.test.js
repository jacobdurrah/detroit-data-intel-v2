/**
 * Lending tab must paginate from API `meta.total` and honor the sort
 * dropdown values actually sent by public/index.html.
 *
 * Live `/api/lending?limit=100&sort=total_loans` returns
 * `{ data: [100], meta: { total: 858, page: 1, limit: 100 } }`.
 * The Lenders view ignored `meta.total` (no pager) and sent
 * `total_loans` / `total_volume` / `avg_rate` / `name` while the API
 * only recognized `loans` / `volume` / `rate` — so 758 lenders were
 * unreachable and Highest Volume / Lowest Rate / Name A-Z did nothing.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const handler = require('../api/lending');

function mockRes() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    end() {},
  };
}

function mockReq(query) {
  return { method: 'GET', query: Object.assign({ key: 'frameworkai' }, query), headers: {} };
}

function call(query) {
  const res = mockRes();
  handler(mockReq(query), res);
  return res;
}

function loadJs(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

test('lending list reports meta.total 858 and paginates off it', () => {
  const res = call({ limit: '50', page: '1', sort: 'total_loans' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.length, 50);
  assert.equal(res.body.meta.total, 858);
  assert.equal(res.body.meta.page, 1);
  assert.equal(res.body.meta.limit, 50);
  assert.equal(Math.ceil(res.body.meta.total / 50), 18);
});

test('page 2 is a different slice, not a repeat of page 1', () => {
  const page1 = call({ limit: '50', page: '1', sort: 'total_loans' });
  const page2 = call({ limit: '50', page: '2', sort: 'total_loans' });
  assert.equal(page2.body.data.length, 50);
  assert.notEqual(page1.body.data[0].lei, page2.body.data[0].lei);
  assert.equal(page2.body.meta.total, 858);
});

test('UI sort value total_loans ranks Rocket first', () => {
  const res = call({ limit: '3', sort: 'total_loans' });
  assert.equal(res.body.data[0].name, 'ROCKET MORTGAGE, LLC');
  assert.ok(res.body.data[0].total_loans >= res.body.data[1].total_loans);
});

test('UI sort value total_volume differs from loan-count ranking', () => {
  const byLoans = call({ limit: '10', sort: 'total_loans' });
  const byVolume = call({ limit: '10', sort: 'total_volume' });
  const loanNames = byLoans.body.data.map((l) => l.name);
  const volumeNames = byVolume.body.data.map((l) => l.name);
  assert.notDeepEqual(volumeNames, loanNames);
  for (let i = 1; i < byVolume.body.data.length; i++) {
    assert.ok(byVolume.body.data[i - 1].total_volume >= byVolume.body.data[i].total_volume);
  }
});

test('UI sort value avg_rate ranks by lowest rate, not loan count', () => {
  const res = call({ limit: '5', sort: 'avg_rate' });
  assert.notEqual(res.body.data[0].name, 'ROCKET MORTGAGE, LLC');
  for (let i = 1; i < res.body.data.length; i++) {
    const prev = res.body.data[i - 1].avg_rate || 999;
    const next = res.body.data[i].avg_rate || 999;
    assert.ok(prev <= next);
  }
});

test('UI sort value name returns A-Z order', () => {
  const res = call({ limit: '5', sort: 'name' });
  const names = res.body.data.map((l) => l.name);
  const sorted = names.slice().sort((a, b) => a.localeCompare(b));
  assert.deepEqual(names, sorted);
});

test('short aliases loans/volume/rate still work', () => {
  const a = call({ limit: '3', sort: 'loans' });
  const b = call({ limit: '3', sort: 'total_loans' });
  assert.deepEqual(a.body.data.map((l) => l.lei), b.body.data.map((l) => l.lei));
});

test('lenders UI reads meta.total and sends page', () => {
  const src = loadJs('public/js/lending.js');
  assert.match(src, /function listTotal\(/);
  assert.match(src, /meta\.total != null/);
  assert.match(src, /page: lendersPage/);
  assert.match(src, /App\.renderPagination\(pagEl/);
  assert.doesNotMatch(src, /limit: 100/);
});

test('index.html sort option values are accepted by the API', () => {
  const html = loadJs('public/index.html');
  const select = html.match(/id="lending-sort"[\s\S]*?<\/select>/)[0];
  const optionValues = [...select.matchAll(/value="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(optionValues, ['total_loans', 'total_volume', 'avg_rate', 'name']);
  const apiSrc = loadJs('api/lending.js');
  for (const value of optionValues) {
    assert.match(apiSrc, new RegExp(`case '${value}':`));
  }
});
