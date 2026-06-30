const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '@supabase/supabase-js') {
    return {
      createClient: function () {
        return {
          from: function () {
            throw new Error('Supabase should not be reached before auth passes');
          },
        };
      },
    };
  }
  return originalLoad.apply(this, arguments);
};

const setup = require('../api/setup');
const setupTables = require('../api/setup-tables');
const propertySearches = require('../api/property-searches');
const propertyReports = require('../api/property-reports');
const savedProperties = require('../api/saved-properties');
const searchFeedback = require('../api/search-feedback');

function mockReq(method, options) {
  options = options || {};
  return {
    method,
    headers: options.headers || {},
    query: options.query || {},
    body: options.body || {},
  };
}

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    ended: false,
    setHeader: function (key, value) {
      this.headers[key] = value;
      return this;
    },
    status: function (code) {
      this.statusCode = code;
      return this;
    },
    json: function (body) {
      this.body = body;
      this.ended = true;
      return this;
    },
    end: function () {
      this.ended = true;
      return this;
    },
  };
}

function resetSecrets() {
  delete process.env.SETUP_API_KEY;
  delete process.env.PROPERTY_PIPELINE_API_KEY;
  delete process.env.DATABASE_URL;
  delete process.env.SUPABASE_SERVICE_KEY;
}

test('setup fails closed when SETUP_API_KEY is missing', async () => {
  resetSecrets();
  const res = mockRes();

  await setup(mockReq('POST'), res);

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error, 'SETUP_API_KEY is not configured');
});

test('setup ignores db_url without the setup bearer token', async () => {
  resetSecrets();
  process.env.SETUP_API_KEY = 'secret';
  const res = mockRes();

  await setup(mockReq('POST', { body: { db_url: 'postgres://attacker' } }), res);

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'unauthorized');
});

test('hardcoded setup-tables query key no longer authorizes access', async () => {
  resetSecrets();
  process.env.SETUP_API_KEY = 'secret';
  const res = mockRes();

  await setupTables(mockReq('GET', { query: { key: 'frameworkai-setup-2026' } }), res);

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'unauthorized');
});

test('property mutation endpoints require PROPERTY_PIPELINE_API_KEY', async () => {
  resetSecrets();
  process.env.PROPERTY_PIPELINE_API_KEY = 'pipeline-secret';
  const cases = [
    [propertySearches, mockReq('POST', { body: { address: '1 Main' } })],
    [propertyReports, mockReq('POST', { body: { address: '1 Main' } })],
    [savedProperties, mockReq('POST', { body: { address: '1 Main' } })],
    [savedProperties, mockReq('PUT', { query: { id: '1' }, body: { notes: 'x' } })],
    [searchFeedback, mockReq('POST', { body: { search_id: 1, feedback: 'up' } })],
  ];

  for (const [handler, req] of cases) {
    const res = mockRes();
    await handler(req, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'unauthorized');
  }
});

test('CORS preflight is handled before privileged auth checks', async () => {
  resetSecrets();
  const res = mockRes();

  await savedProperties(mockReq('OPTIONS'), res);

  assert.equal(res.statusCode, 204);
  assert.equal(res.ended, true);
  assert.equal(res.headers['Access-Control-Allow-Headers'], 'Content-Type, Authorization');
});
