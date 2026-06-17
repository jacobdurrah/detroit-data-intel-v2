const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

const setup = require('../api/setup');
const setupTables = require('../api/setup-tables');

function makeReq({ method = 'POST', headers = {}, query = {}, body = {} } = {}) {
  return { method, headers, query, body };
}

function makeRes() {
  return {
    statusCode: null,
    headers: {},
    payload: null,
    ended: false,
    setHeader(name, value) {
      this.headers[name] = value;
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
      this.ended = true;
      return this;
    },
  };
}

function withEnv(values, fn) {
  const previous = {};
  for (const key of Object.keys(values)) {
    previous[key] = process.env[key];
    if (values[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = values[key];
    }
  }

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const key of Object.keys(values)) {
        if (previous[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = previous[key];
        }
      }
    });
}

function withMockedModule(moduleName, replacement, fn) {
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === moduleName) return replacement;
    return originalLoad.call(this, request, parent, isMain);
  };

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      Module._load = originalLoad;
    });
}

test('/api/setup rejects unauthenticated requests', async () => {
  await withEnv({ SETUP_API_KEY: 'server-secret', DATABASE_URL: 'postgres://server' }, async () => {
    const res = makeRes();

    await setup(makeReq({ body: { db_url: 'postgres://attacker' } }), res);

    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.payload, { error: 'Unauthorized' });
  });
});

test('/api/setup fails closed when the setup key is not configured', async () => {
  await withEnv({ SETUP_API_KEY: undefined, DATABASE_URL: 'postgres://server' }, async () => {
    const res = makeRes();

    await setup(makeReq({ headers: { authorization: 'Bearer anything' } }), res);

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.payload, { error: 'Setup API key is not configured' });
  });
});

test('/api/setup uses only the server DATABASE_URL', async () => {
  let clientOptions;
  let queryRan = false;

  class MockClient {
    constructor(options) {
      clientOptions = options;
    }

    async connect() {}

    async query() {
      queryRan = true;
    }

    async end() {}
  }

  await withEnv({ SETUP_API_KEY: 'server-secret', DATABASE_URL: 'postgres://server' }, async () => {
    await withMockedModule('pg', { Client: MockClient }, async () => {
      const res = makeRes();

      await setup(
        makeReq({
          headers: { authorization: 'Bearer server-secret' },
          body: { db_url: 'postgres://attacker' },
        }),
        res
      );

      assert.equal(res.statusCode, 200);
      assert.equal(clientOptions.connectionString, 'postgres://server');
      assert.equal(queryRan, true);
    });
  });
});

test('/api/setup-tables rejects the old hard-coded query secret', async () => {
  await withEnv({ SETUP_API_KEY: 'server-secret', SUPABASE_SERVICE_KEY: 'service-key' }, async () => {
    const res = makeRes();

    await setupTables(makeReq({ method: 'GET', query: { key: 'frameworkai-setup-2026' } }), res);

    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.payload, { error: 'Unauthorized' });
  });
});
