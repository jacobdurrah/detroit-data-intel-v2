const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const SETUP_PATH = '../api/setup';
const SETUP_TABLES_PATH = '../api/setup-tables';

function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    ended: false,
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
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

function clearModule(modulePath) {
  delete require.cache[require.resolve(modulePath)];
}

function restoreEnv(snapshot) {
  for (const key of ['SETUP_API_KEY', 'DATABASE_URL', 'SUPABASE_DB_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY']) {
    if (snapshot[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = snapshot[key];
    }
  }
}

async function withPgMock(fn) {
  const originalLoad = Module._load;
  const clients = [];

  class FakeClient {
    constructor(options) {
      this.options = options;
      this.queries = [];
      clients.push(this);
    }

    async connect() {}

    async query(sql) {
      this.queries.push(sql);
      return { rows: [] };
    }

    async end() {}
  }

  Module._load = function mockLoad(request, parent, isMain) {
    if (request === 'pg') {
      return { Client: FakeClient };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    await fn(clients);
  } finally {
    Module._load = originalLoad;
    clearModule(SETUP_PATH);
  }
}

async function withSupabaseMock(fn) {
  const originalLoad = Module._load;
  const calls = [];

  Module._load = function mockLoad(request, parent, isMain) {
    if (request === '@supabase/supabase-js') {
      return {
        createClient(url, key) {
          calls.push({ url, key });
          return {
            from(table) {
              return {
                async select() {
                  return { error: null, table };
                },
              };
            },
          };
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    await fn(calls);
  } finally {
    Module._load = originalLoad;
    clearModule(SETUP_TABLES_PATH);
  }
}

test('setup endpoint fails closed when SETUP_API_KEY is missing', async () => {
  const env = { ...process.env };
  delete process.env.SETUP_API_KEY;
  process.env.DATABASE_URL = 'postgres://safe';

  await withPgMock(async (clients) => {
    clearModule(SETUP_PATH);
    const handler = require(SETUP_PATH);
    const res = makeRes();

    await handler({ method: 'POST', query: {}, headers: {}, body: {} }, res);

    assert.equal(res.statusCode, 500);
    assert.match(res.body.error, /SETUP_API_KEY/);
    assert.equal(clients.length, 0);
  });

  restoreEnv(env);
});

test('setup endpoint requires bearer auth and ignores caller db_url', async () => {
  const env = { ...process.env };
  process.env.SETUP_API_KEY = 'setup-secret';
  process.env.DATABASE_URL = 'postgres://safe';

  await withPgMock(async (clients) => {
    clearModule(SETUP_PATH);
    const handler = require(SETUP_PATH);
    const res = makeRes();

    await handler({
      method: 'POST',
      query: {},
      headers: { authorization: 'Bearer setup-secret' },
      body: { db_url: 'postgres://attacker' },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(clients.length, 1);
    assert.equal(clients[0].options.connectionString, 'postgres://safe');
    assert.equal(clients[0].queries.length, 1);
    assert.match(clients[0].queries[0], /DROP POLICY IF EXISTS "anon_all"/);
    assert.match(clients[0].queries[0], /CREATE POLICY "anon_read"/);
    assert.doesNotMatch(clients[0].queries[0], /CREATE POLICY "anon_all"/);
  });

  restoreEnv(env);
});

test('setup-tables endpoint rejects legacy query secret without bearer auth', async () => {
  const env = { ...process.env };
  process.env.SETUP_API_KEY = 'setup-secret';
  process.env.SUPABASE_SERVICE_KEY = 'service-key';

  await withSupabaseMock(async (calls) => {
    clearModule(SETUP_TABLES_PATH);
    const handler = require(SETUP_TABLES_PATH);
    const res = makeRes();

    await handler({
      method: 'GET',
      query: { key: 'frameworkai-setup-2026' },
      headers: {},
    }, res);

    assert.equal(res.statusCode, 401);
    assert.equal(calls.length, 0);
  });

  restoreEnv(env);
});

test('setup-tables endpoint allows bearer setup key', async () => {
  const env = { ...process.env };
  process.env.SETUP_API_KEY = 'setup-secret';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'service-key';

  await withSupabaseMock(async (calls) => {
    clearModule(SETUP_TABLES_PATH);
    const handler = require(SETUP_TABLES_PATH);
    const res = makeRes();

    await handler({
      method: 'GET',
      query: {},
      headers: { authorization: 'Bearer setup-secret' },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
      url: 'https://example.supabase.co',
      key: 'service-key',
    });
    assert.equal(res.body.tables.length, 5);
  });

  restoreEnv(env);
});
