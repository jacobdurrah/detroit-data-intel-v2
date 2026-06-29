const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key';

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === './_supabase' && parent && parent.filename && parent.filename.includes('/api/')) {
    return {
      supabase: {
        from() {
          throw new Error('Supabase should not be called before auth succeeds');
        },
      },
    };
  }
  return originalLoad.apply(this, arguments);
};

test.after(() => {
  Module._load = originalLoad;
});

function mockRes() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
  };
}

function clearEnv(name) {
  const previous = process.env[name];
  delete process.env[name];
  return () => {
    if (previous === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = previous;
    }
  };
}

test('requireBearerToken fails closed when the expected key is unset', () => {
  const restore = clearEnv('PROPERTY_PIPELINE_API_KEY');
  const { requireBearerToken } = require('../api/_helpers');
  const res = mockRes();

  assert.equal(
    requireBearerToken({ headers: {} }, res, 'PROPERTY_PIPELINE_API_KEY', 'Property pipeline API key'),
    true
  );
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, { error: 'Property pipeline API key is not configured' });
  restore();
});

test('requireBearerToken rejects missing or wrong bearer tokens', () => {
  process.env.PROPERTY_PIPELINE_API_KEY = 'secret-token';
  const { requireBearerToken } = require('../api/_helpers');

  for (const headers of [{}, { authorization: 'Bearer wrong-token' }]) {
    const res = mockRes();
    assert.equal(
      requireBearerToken({ headers }, res, 'PROPERTY_PIPELINE_API_KEY', 'Property pipeline API key'),
      true
    );
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { error: 'Unauthorized' });
  }
});

test('requireBearerToken accepts the configured bearer token', () => {
  process.env.PROPERTY_PIPELINE_API_KEY = 'secret-token';
  const { requireBearerToken } = require('../api/_helpers');
  const res = mockRes();

  assert.equal(
    requireBearerToken(
      { headers: { authorization: 'Bearer secret-token' } },
      res,
      'PROPERTY_PIPELINE_API_KEY',
      'Property pipeline API key'
    ),
    false
  );
  assert.equal(res.statusCode, null);
  assert.equal(res.body, null);
});

test('/api/setup ignores caller db_url and requires server DATABASE_URL', async () => {
  const restoreDbUrl = clearEnv('DATABASE_URL');
  process.env.SETUP_API_KEY = 'setup-token';
  const setup = require('../api/setup');
  const res = mockRes();

  await setup(
    {
      method: 'POST',
      headers: { authorization: 'Bearer setup-token' },
      body: { db_url: 'postgres://attacker-controlled.example/db' },
    },
    res
  );

  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, { error: 'DATABASE_URL is required' });
  restoreDbUrl();
});

test('property mutation endpoints reject unauthenticated writes before storage calls', async () => {
  process.env.PROPERTY_PIPELINE_API_KEY = 'pipeline-token';
  const endpoints = [
    { handler: require('../api/property-searches'), req: { method: 'POST', body: {} } },
    { handler: require('../api/saved-properties'), req: { method: 'POST', body: { address: '1 Main St' } } },
    { handler: require('../api/saved-properties'), req: { method: 'PUT', query: { id: '1' }, body: {} } },
    { handler: require('../api/search-feedback'), req: { method: 'POST', body: { search_id: 1, feedback: 'up' } } },
    { handler: require('../api/property-reports'), req: { method: 'POST', body: { address: '1 Main St' } } },
  ];

  for (const { handler, req } of endpoints) {
    const res = mockRes();
    await handler({ headers: {}, query: {}, ...req }, res);
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { error: 'Unauthorized' });
  }
});
