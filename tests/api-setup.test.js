const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

const setupHandler = require('../api/setup');

function mockResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: undefined,
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
      this.ended = true;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

async function withEnv(values, fn) {
  const keys = Object.keys(values);
  const previous = {};
  keys.forEach((key) => {
    previous[key] = process.env[key];
    if (values[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = values[key];
    }
  });

  try {
    await fn();
  } finally {
    keys.forEach((key) => {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    });
  }
}

async function withMockedPg(mockPg, fn) {
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'pg') {
      return mockPg();
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    await fn();
  } finally {
    Module._load = originalLoad;
  }
}

test('/api/setup is hidden and does not load pg unless explicitly enabled', async () => {
  await withEnv({
    SETUP_API_ENABLED: undefined,
    SETUP_API_SECRET: undefined,
    DATABASE_URL: 'postgres://prod-db',
  }, async () => {
    let loadedPg = false;
    await withMockedPg(() => {
      loadedPg = true;
      throw new Error('pg should not be loaded');
    }, async () => {
      const res = mockResponse();
      await setupHandler({ method: 'POST', headers: {}, body: { db_url: 'postgres://attacker' } }, res);

      assert.equal(res.statusCode, 404);
      assert.deepEqual(res.body, { error: 'Not found' });
      assert.equal(loadedPg, false);
    });
  });
});

test('/api/setup rejects wrong secrets before opening a database connection', async () => {
  await withEnv({
    SETUP_API_ENABLED: 'true',
    SETUP_API_SECRET: 'correct-secret',
    DATABASE_URL: 'postgres://prod-db',
  }, async () => {
    let loadedPg = false;
    await withMockedPg(() => {
      loadedPg = true;
      throw new Error('pg should not be loaded');
    }, async () => {
      const res = mockResponse();
      await setupHandler({
        method: 'POST',
        headers: { 'x-setup-secret': 'wrong-secret' },
        body: {},
      }, res);

      assert.equal(res.statusCode, 403);
      assert.deepEqual(res.body, { error: 'Forbidden' });
      assert.equal(loadedPg, false);
    });
  });
});

test('/api/setup uses only server DATABASE_URL after authentication', async () => {
  await withEnv({
    SETUP_API_ENABLED: 'true',
    SETUP_API_SECRET: 'correct-secret',
    DATABASE_URL: 'postgres://server-db',
  }, async () => {
    let clientConfig;
    let connected = false;
    let queried = false;
    let ended = false;

    await withMockedPg(() => ({
      Client: class MockClient {
        constructor(config) {
          clientConfig = config;
        }

        async connect() {
          connected = true;
        }

        async query(sql) {
          queried = sql.includes('CREATE TABLE IF NOT EXISTS property_searches');
        }

        async end() {
          ended = true;
        }
      },
    }), async () => {
      const res = mockResponse();
      await setupHandler({
        method: 'POST',
        headers: { authorization: 'Bearer correct-secret' },
        body: { db_url: 'postgres://attacker-db' },
      }, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(clientConfig.connectionString, 'postgres://server-db');
      assert.equal(connected, true);
      assert.equal(queried, true);
      assert.equal(ended, true);
    });
  });
});
