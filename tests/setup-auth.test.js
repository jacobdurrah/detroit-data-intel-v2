const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

function createResponse() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    ended: false,
    setHeader(name, value) {
      this.headers[name] = value;
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
      this.ended = true;
      return this;
    },
  };
}

async function withPgMock(pgMock, fn) {
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'pg') return pgMock;
    return originalLoad.apply(this, arguments);
  };

  try {
    const setupPath = require.resolve('../api/setup');
    delete require.cache[setupPath];
    const handler = require('../api/setup');
    await fn(handler);
  } finally {
    Module._load = originalLoad;
  }
}

function withEnv(env, fn) {
  const original = {};
  for (const key of Object.keys(env)) {
    original[key] = process.env[key];
    if (env[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = env[key];
    }
  }

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const key of Object.keys(env)) {
        if (original[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = original[key];
        }
      }
    });
}

test('setup endpoint fails closed when SETUP_API_KEY is not configured', async () => {
  await withEnv({ SETUP_API_KEY: undefined, DATABASE_URL: 'postgres://server-db' }, async () => {
    const handler = require('../api/setup');
    const res = createResponse();

    await handler({ method: 'POST', headers: {}, body: {} }, res);

    assert.equal(res.statusCode, 503);
    assert.match(res.body.error, /SETUP_API_KEY/);
  });
});

test('setup endpoint rejects missing or invalid bearer tokens', async () => {
  await withEnv({ SETUP_API_KEY: 'expected-token', DATABASE_URL: 'postgres://server-db' }, async () => {
    const handler = require('../api/setup');

    const missingRes = createResponse();
    await handler({ method: 'POST', headers: {}, body: {} }, missingRes);
    assert.equal(missingRes.statusCode, 401);

    const invalidRes = createResponse();
    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer wrong-token' },
      body: {},
    }, invalidRes);
    assert.equal(invalidRes.statusCode, 401);
  });
});

test('setup endpoint ignores caller-supplied db_url and uses server DATABASE_URL', async () => {
  let clientConfig;
  let queryRan = false;

  class MockClient {
    constructor(config) {
      clientConfig = config;
    }
    async connect() {}
    async query(sql) {
      queryRan = sql.includes('CREATE TABLE IF NOT EXISTS property_searches');
    }
    async end() {}
  }

  await withEnv({
    SETUP_API_KEY: 'expected-token',
    DATABASE_URL: 'postgres://server-db',
  }, async () => {
    await withPgMock({ Client: MockClient }, async (handler) => {
      const res = createResponse();

      await handler({
        method: 'POST',
        headers: { authorization: 'Bearer expected-token' },
        body: { db_url: 'postgres://attacker-db' },
      }, res);

      assert.equal(res.statusCode, 200);
      assert.equal(clientConfig.connectionString, 'postgres://server-db');
      assert.equal(queryRan, true);
    });
  });
});

test('setup endpoint does not use body db_url when DATABASE_URL is absent', async () => {
  await withEnv({
    SETUP_API_KEY: 'expected-token',
    DATABASE_URL: undefined,
  }, async () => {
    const handler = require('../api/setup');
    const res = createResponse();

    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer expected-token' },
      body: { db_url: 'postgres://attacker-db' },
    }, res);

    assert.equal(res.statusCode, 500);
    assert.match(res.body.error, /DATABASE_URL/);
  });
});
