const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key';

const setup = require('../api/setup');
const setupTables = require('../api/setup-tables');
const propertySearches = require('../api/property-searches');
const savedProperties = require('../api/saved-properties');
const propertyReports = require('../api/property-reports');
const searchFeedback = require('../api/search-feedback');

function makeReq(method, options = {}) {
  return {
    method,
    headers: options.headers || {},
    query: options.query || {},
    body: options.body || {},
  };
}

function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    ended: false,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      this.ended = true;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

function clearAuthEnv() {
  delete process.env.SETUP_API_KEY;
  delete process.env.PROPERTY_WRITE_API_KEY;
  delete process.env.DATABASE_URL;
}

test('setup endpoint fails closed when SETUP_API_KEY is missing', async () => {
  clearAuthEnv();
  const res = makeRes();

  await setup(makeReq('POST', { body: { db_url: 'postgres://attacker/db' } }), res);

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error, 'Server authorization is not configured');
});

test('setup endpoint requires bearer auth and ignores caller db_url', async () => {
  clearAuthEnv();
  process.env.SETUP_API_KEY = 'setup-secret';

  const unauthorized = makeRes();
  await setup(makeReq('POST', { body: { db_url: 'postgres://attacker/db' } }), unauthorized);
  assert.equal(unauthorized.statusCode, 401);

  const authorized = makeRes();
  await setup(makeReq('POST', {
    headers: { authorization: 'Bearer setup-secret' },
    body: { db_url: 'postgres://attacker/db' },
  }), authorized);
  assert.equal(authorized.statusCode, 400);
  assert.equal(authorized.body.error, 'DATABASE_URL is required on the server');
});

test('setup-tables no longer accepts the hard-coded query-string secret', async () => {
  clearAuthEnv();
  process.env.SETUP_API_KEY = 'setup-secret';
  const res = makeRes();

  await setupTables(makeReq('GET', { query: { key: 'frameworkai-setup-2026' } }), res);

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'Unauthorized');
});

test('property search mutation APIs reject writes without configured write auth', async () => {
  clearAuthEnv();
  const cases = [
    [propertySearches, makeReq('POST', { body: { address: '1 Test St' } })],
    [savedProperties, makeReq('POST', { body: { address: '1 Test St' } })],
    [savedProperties, makeReq('PUT', { query: { id: '1' }, body: { status: 'passed' } })],
    [propertyReports, makeReq('POST', { body: { address: '1 Test St' } })],
    [searchFeedback, makeReq('POST', { body: { search_id: 1, feedback: 'up' } })],
  ];

  for (const [handler, req] of cases) {
    const res = makeRes();
    await handler(req, res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.error, 'Server authorization is not configured');
  }
});

test('property search mutation APIs require bearer token when write auth is configured', async () => {
  clearAuthEnv();
  process.env.PROPERTY_WRITE_API_KEY = 'write-secret';
  const cases = [
    [propertySearches, makeReq('POST', { body: { address: '1 Test St' } })],
    [savedProperties, makeReq('POST', { body: { address: '1 Test St' } })],
    [savedProperties, makeReq('PUT', { query: { id: '1' }, body: { status: 'passed' } })],
    [propertyReports, makeReq('POST', { body: { address: '1 Test St' } })],
    [searchFeedback, makeReq('POST', { body: { search_id: 1, feedback: 'up' } })],
  ];

  for (const [handler, req] of cases) {
    const res = makeRes();
    await handler(req, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'Unauthorized');
  }
});

test('property search schema setup does not grant anonymous all-access policies', () => {
  const files = [
    path.join(__dirname, '..', 'supabase', 'migrations', '20260319000000_create_property_search_tables.sql'),
    path.join(__dirname, '..', 'scripts', 'setup-tables.js'),
    path.join(__dirname, '..', 'api', 'setup.js'),
  ];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(content, /CREATE\s+POLICY\s+"anon_all"/i, file);
    assert.doesNotMatch(content, /FOR\s+ALL\s+USING\s*\(\s*true\s*\)\s+WITH\s+CHECK\s*\(\s*true\s*\)/i, file);
  }
});
