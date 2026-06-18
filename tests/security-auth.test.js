const assert = require('node:assert/strict');
const test = require('node:test');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'anon-test-key';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'service-test-key';

function makeReq(overrides) {
  return {
    method: 'GET',
    headers: {},
    query: {},
    body: {},
    ...overrides,
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

test('private workflow APIs fail closed when WORKFLOW_API_KEY is unset', async () => {
  delete process.env.WORKFLOW_API_KEY;

  const handlers = [
    require('../api/saved-properties'),
    require('../api/property-searches'),
    require('../api/property-reports'),
    require('../api/search-feedback'),
    require('../api/search-preferences'),
  ];

  for (const handler of handlers) {
    const res = makeRes();
    await handler(makeReq(), res);
    assert.equal(res.statusCode, 503);
    assert.match(res.body.error, /Workflow API is not configured/);
  }
});

test('private workflow APIs reject missing bearer tokens', async () => {
  process.env.WORKFLOW_API_KEY = 'workflow-secret';

  const res = makeRes();
  await require('../api/saved-properties')(makeReq(), res);

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'Unauthorized');
  assert.equal(res.headers['WWW-Authenticate'], 'Bearer');
});

test('/api/setup requires setup auth and rejects caller-supplied database URLs', async () => {
  const setup = require('../api/setup');

  delete process.env.SETUP_API_KEY;
  let res = makeRes();
  await setup(makeReq({ method: 'POST' }), res);
  assert.equal(res.statusCode, 503);

  process.env.SETUP_API_KEY = 'setup-secret';
  res = makeRes();
  await setup(makeReq({
    method: 'POST',
    headers: { authorization: 'Bearer setup-secret' },
    body: { db_url: 'postgres://attacker@example.test/db' },
  }), res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /db_url is not allowed/);
});

test('chat query sanitizer rejects private tables and disallowed columns', () => {
  const { sanitizeChatQuery } = require('../api/chat')._test;

  assert.equal(sanitizeChatQuery({ table: 'saved_properties', select: '*' }), null);
  assert.equal(sanitizeChatQuery({ table: 'sales', select: 'address, report_data' }), null);
  assert.equal(sanitizeChatQuery({ table: 'sales', select: 'address', filters: { column: 'address' } }), null);
  assert.equal(sanitizeChatQuery({ table: 'sales', select: 'address', filters: [{ column: 'address', op: 'eq', value: { nested: true } }] }), null);

  const sanitized = sanitizeChatQuery({
    table: 'sales',
    select: '*',
    filters: [{ column: 'grantee', op: 'ilike', value: '%HANTZ%' }],
    order: { column: 'sale_date', ascending: false },
    limit: 999999,
  });

  assert.ok(sanitized);
  assert.equal(sanitized.limit, 5000);
  assert.notEqual(sanitized.select, '*');
  assert.match(sanitized.select, /address/);
});
