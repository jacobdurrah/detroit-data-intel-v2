const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

const setupHandler = require('../api/setup');

function createResponse() {
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
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

function withEnv(env, fn) {
  const previous = {};
  for (const key of Object.keys(env)) {
    previous[key] = process.env[key];
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
        if (previous[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = previous[key];
        }
      }
    });
}

async function invoke(reqOverrides = {}) {
  const req = {
    method: 'POST',
    headers: {},
    body: {},
    ...reqOverrides,
  };
  const res = createResponse();
  await setupHandler(req, res);
  return res;
}

test('setup endpoint fails closed when SETUP_API_KEY is not configured', async () => {
  await withEnv({ SETUP_API_KEY: undefined, DATABASE_URL: 'postgres://env-db' }, async () => {
    const res = await invoke({
      headers: { authorization: 'Bearer any-token' },
      body: { db_url: 'postgres://attacker-db' },
    });

    assert.equal(res.statusCode, 500);
    assert.equal(res.body.error, 'SETUP_API_KEY is not configured');
  });
});

test('setup endpoint requires a bearer token before touching the database', async () => {
  await withEnv({ SETUP_API_KEY: 'secret', DATABASE_URL: 'postgres://env-db' }, async () => {
    const res = await invoke({ body: { db_url: 'postgres://attacker-db' } });

    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'Authorization bearer token required');
  });
});

test('setup endpoint rejects incorrect bearer tokens', async () => {
  await withEnv({ SETUP_API_KEY: 'secret', DATABASE_URL: 'postgres://env-db' }, async () => {
    const res = await invoke({ headers: { authorization: 'Bearer wrong' } });

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error, 'Invalid setup credentials');
  });
});

test('setup endpoint ignores caller-supplied db_url and uses DATABASE_URL', async () => {
  await withEnv({ SETUP_API_KEY: 'secret', DATABASE_URL: 'postgres://env-db' }, async () => {
    const originalLoad = Module._load;
    let capturedConnectionString;

    Module._load = function mockedLoad(request, parent, isMain) {
      if (request === 'pg') {
        return {
          Client: class FakeClient {
            constructor(options) {
              capturedConnectionString = options.connectionString;
            }
            async connect() {}
            async query(sql) {
              assert.match(sql, /CREATE TABLE IF NOT EXISTS property_searches/);
            }
            async end() {}
          },
        };
      }
      return originalLoad.apply(this, arguments);
    };

    try {
      const res = await invoke({
        headers: { authorization: 'Bearer secret' },
        body: { db_url: 'postgres://attacker-db' },
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(capturedConnectionString, 'postgres://env-db');
    } finally {
      Module._load = originalLoad;
    }
  });
});
