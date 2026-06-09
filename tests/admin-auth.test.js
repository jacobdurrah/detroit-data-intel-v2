const assert = require('node:assert/strict');
const test = require('node:test');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key';

const setupHandler = require('../api/setup');
const setupTablesHandler = require('../api/setup-tables');
const savedPropertiesHandler = require('../api/saved-properties');
const propertySearchesHandler = require('../api/property-searches');
const propertyReportsHandler = require('../api/property-reports');
const searchFeedbackHandler = require('../api/search-feedback');

function mockResponse() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    setHeader(key, value) {
      this.headers[key] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
  };
}

async function withEnv(vars, callback) {
  const previous = {};
  for (const key of Object.keys(vars)) {
    previous[key] = process.env[key];
    if (vars[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = vars[key];
    }
  }

  try {
    await callback();
  } finally {
    for (const key of Object.keys(vars)) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

async function assertUnauthorized(handler, req, envOverrides) {
  await withEnv(envOverrides, async () => {
    const res = mockResponse();
    await handler(req, res);

    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: 'Unauthorized' });
  });
}

test('setup endpoint rejects POST requests without SETUP_SECRET configured', async () => {
  await assertUnauthorized(
    setupHandler,
    { method: 'POST', headers: {}, body: {} },
    { DATABASE_URL: 'postgres://example', SETUP_SECRET: undefined }
  );
});

test('setup endpoint rejects POST requests with an invalid bearer token', async () => {
  await assertUnauthorized(
    setupHandler,
    { method: 'POST', headers: { authorization: 'Bearer wrong-secret' }, body: {} },
    { DATABASE_URL: 'postgres://example', SETUP_SECRET: 'correct-secret' }
  );
});

test('setup endpoint checks db_url only after a valid setup secret', async () => {
  await withEnv({ DATABASE_URL: undefined, SETUP_SECRET: 'correct-secret' }, async () => {
    const res = mockResponse();
    await setupHandler(
      { method: 'POST', headers: { authorization: 'Bearer correct-secret' }, body: {} },
      res
    );

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, {
      error: 'db_url is required (Supabase pooler connection string)',
    });
  });
});

test('setup table probe rejects requests without SETUP_SECRET configured', async () => {
  await assertUnauthorized(
    setupTablesHandler,
    { method: 'GET', headers: {}, query: {} },
    { SETUP_SECRET: undefined }
  );
});

test('property write endpoints fail closed without an admin secret', async () => {
  const env = { PROPERTY_API_SECRET: undefined, ADMIN_API_SECRET: undefined };
  const cases = [
    [savedPropertiesHandler, { method: 'POST', headers: {}, query: {}, body: {} }],
    [savedPropertiesHandler, { method: 'PUT', headers: {}, query: { id: '1' }, body: {} }],
    [propertySearchesHandler, { method: 'POST', headers: {}, query: {}, body: {} }],
    [propertyReportsHandler, { method: 'POST', headers: {}, query: {}, body: {} }],
    [searchFeedbackHandler, { method: 'POST', headers: {}, query: {}, body: {} }],
  ];

  for (const [handler, req] of cases) {
    await assertUnauthorized(handler, req, env);
  }
});

test('property write endpoints reject invalid admin tokens', async () => {
  await assertUnauthorized(
    savedPropertiesHandler,
    {
      method: 'POST',
      headers: { authorization: 'Bearer wrong-secret' },
      query: {},
      body: {},
    },
    { PROPERTY_API_SECRET: 'correct-secret', ADMIN_API_SECRET: undefined }
  );
});

test('property write endpoints accept configured admin bearer tokens', async () => {
  await withEnv({
    PROPERTY_API_SECRET: undefined,
    ADMIN_API_SECRET: 'correct-secret',
  }, async () => {
    const res = mockResponse();
    await savedPropertiesHandler(
      {
        method: 'POST',
        headers: { authorization: 'Bearer correct-secret' },
        query: {},
        body: {},
      },
      res
    );

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: 'address is required' });
  });
});
