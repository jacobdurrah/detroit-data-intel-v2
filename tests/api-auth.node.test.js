const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key';

const setup = require('../api/setup');
const setupTables = require('../api/setup-tables');
const propertySearches = require('../api/property-searches');
const savedProperties = require('../api/saved-properties');
const propertyReports = require('../api/property-reports');
const searchFeedback = require('../api/search-feedback');

function mockReq(method, options = {}) {
  return {
    method,
    headers: options.headers || {},
    body: options.body || {},
    query: options.query || {},
  };
}

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    payload: undefined,
    setHeader(key, value) {
      this.headers[key] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
    end() {
      return this;
    },
  };
}

async function invoke(handler, req) {
  const res = mockRes();
  await handler(req, res);
  return res;
}

test('setup endpoint requires configured setup bearer token', async () => {
  const priorSetupKey = process.env.SETUP_API_KEY;
  const priorDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.SETUP_API_KEY;
  delete process.env.DATABASE_URL;

  try {
    const missingKey = await invoke(setup, mockReq('POST', {
      body: { db_url: 'postgresql://attacker.example/db' },
    }));
    assert.equal(missingKey.statusCode, 503);

    process.env.SETUP_API_KEY = 'setup-secret';
    const wrongKey = await invoke(setup, mockReq('POST', {
      headers: { authorization: 'Bearer wrong' },
      body: { db_url: 'postgresql://attacker.example/db' },
    }));
    assert.equal(wrongKey.statusCode, 401);

    const callerSuppliedDbUrl = await invoke(setup, mockReq('POST', {
      headers: { authorization: 'Bearer setup-secret' },
      body: { db_url: 'postgresql://attacker.example/db' },
    }));
    assert.equal(callerSuppliedDbUrl.statusCode, 503);
    assert.equal(callerSuppliedDbUrl.payload.error, 'DATABASE_URL is not configured');
  } finally {
    if (priorSetupKey === undefined) delete process.env.SETUP_API_KEY;
    else process.env.SETUP_API_KEY = priorSetupKey;
    if (priorDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = priorDatabaseUrl;
  }
});

test('setup table check requires setup bearer token', async () => {
  const priorSetupKey = process.env.SETUP_API_KEY;
  const priorServiceKey = process.env.SUPABASE_SERVICE_KEY;
  delete process.env.SETUP_API_KEY;
  delete process.env.SUPABASE_SERVICE_KEY;

  try {
    const res = await invoke(setupTables, mockReq('GET', { query: { key: 'frameworkai-setup-2026' } }));
    assert.equal(res.statusCode, 503);

    process.env.SETUP_API_KEY = 'setup-secret';
    const wrongKey = await invoke(setupTables, mockReq('GET', {
      headers: { authorization: 'Bearer wrong' },
      query: { key: 'frameworkai-setup-2026' },
    }));
    assert.equal(wrongKey.statusCode, 401);

    const missingServiceKey = await invoke(setupTables, mockReq('GET', {
      headers: { authorization: 'Bearer setup-secret' },
      query: { key: 'frameworkai-setup-2026' },
    }));
    assert.equal(missingServiceKey.statusCode, 503);
    assert.equal(missingServiceKey.payload.error, 'SUPABASE_SERVICE_KEY is not configured');
  } finally {
    if (priorSetupKey === undefined) delete process.env.SETUP_API_KEY;
    else process.env.SETUP_API_KEY = priorSetupKey;
    if (priorServiceKey === undefined) delete process.env.SUPABASE_SERVICE_KEY;
    else process.env.SUPABASE_SERVICE_KEY = priorServiceKey;
  }
});

test('property pipeline mutations require configured pipeline bearer token', async () => {
  const priorPipelineKey = process.env.PROPERTY_PIPELINE_API_KEY;
  const priorServiceKey = process.env.SUPABASE_SERVICE_KEY;
  delete process.env.PROPERTY_PIPELINE_API_KEY;
  delete process.env.SUPABASE_SERVICE_KEY;

  const mutationCases = [
    [propertySearches, mockReq('POST', { body: { address: '1 Main St' } })],
    [savedProperties, mockReq('POST', { body: { address: '1 Main St' } })],
    [savedProperties, mockReq('PUT', { query: { id: '1' }, body: { status: 'passed' } })],
    [propertyReports, mockReq('POST', { body: { address: '1 Main St' } })],
    [searchFeedback, mockReq('POST', { body: { search_id: 1, feedback: 'up' } })],
  ];

  try {
    for (const [handler, req] of mutationCases) {
      const res = await invoke(handler, req);
      assert.equal(res.statusCode, 503);
      assert.equal(res.payload.error, 'Endpoint auth is not configured');
    }

    process.env.PROPERTY_PIPELINE_API_KEY = 'pipeline-secret';
    for (const [handler, req] of mutationCases) {
      req.headers = { authorization: 'Bearer wrong' };
      const res = await invoke(handler, req);
      assert.equal(res.statusCode, 401);
      assert.equal(res.payload.error, 'Unauthorized');
    }

    for (const [handler, req] of mutationCases) {
      req.headers = { authorization: 'Bearer pipeline-secret' };
      const res = await invoke(handler, req);
      assert.equal(res.statusCode, 503);
      assert.equal(res.payload.error, 'SUPABASE_SERVICE_KEY is not configured');
    }
  } finally {
    if (priorPipelineKey === undefined) delete process.env.PROPERTY_PIPELINE_API_KEY;
    else process.env.PROPERTY_PIPELINE_API_KEY = priorPipelineKey;
    if (priorServiceKey === undefined) delete process.env.SUPABASE_SERVICE_KEY;
    else process.env.SUPABASE_SERVICE_KEY = priorServiceKey;
  }
});
