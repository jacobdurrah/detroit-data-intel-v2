const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

const setupPath = path.join(__dirname, '..', 'api', 'setup.js');

function createRes() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
}

function loadSetupHandler() {
  delete require.cache[setupPath];
  return require(setupPath);
}

async function withMockedPg(pgStub, fn) {
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'pg') return pgStub;
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return await fn();
  } finally {
    Module._load = originalLoad;
  }
}

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test('setup fails closed when SETUP_API_KEY is missing', async () => {
  const oldSetupKey = process.env.SETUP_API_KEY;
  delete process.env.SETUP_API_KEY;
  const handler = loadSetupHandler();
  const res = createRes();

  await handler({ method: 'POST', headers: {}, body: { db_url: 'postgres://attacker' } }, res);

  assert.equal(res.statusCode, 503);
  assert.match(res.body.error, /Setup API key/);
  restoreEnv('SETUP_API_KEY', oldSetupKey);
});

test('setup rejects requests without the setup bearer token', async () => {
  const oldSetupKey = process.env.SETUP_API_KEY;
  process.env.SETUP_API_KEY = 'setup-secret';
  let constructed = false;
  const handler = loadSetupHandler();
  const res = createRes();

  await withMockedPg({ Client: function Client() { constructed = true; } }, async () => {
    await handler({ method: 'POST', headers: { authorization: 'Bearer wrong' }, body: {} }, res);
  });

  assert.equal(res.statusCode, 401);
  assert.equal(constructed, false);
  restoreEnv('SETUP_API_KEY', oldSetupKey);
});

test('authorized setup uses server DATABASE_URL and removes anonymous write policies', async () => {
  const oldSetupKey = process.env.SETUP_API_KEY;
  const oldDatabaseUrl = process.env.DATABASE_URL;
  process.env.SETUP_API_KEY = 'setup-secret';
  process.env.DATABASE_URL = 'postgres://server-db';
  const calls = {};
  const handler = loadSetupHandler();
  const pgStub = {
    Client: class Client {
      constructor(options) {
        calls.connectionString = options.connectionString;
      }
      async connect() {}
      async query(sql) { calls.sql = sql; }
      async end() { calls.ended = true; }
    },
  };
  const res = createRes();

  await withMockedPg(pgStub, async () => {
    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer setup-secret' },
      body: { db_url: 'postgres://attacker-db' },
    }, res);
  });

  assert.equal(res.statusCode, 200);
  assert.equal(calls.connectionString, 'postgres://server-db');
  assert.match(calls.sql, /DROP POLICY IF EXISTS "anon_all" ON property_searches/);
  assert.match(calls.sql, /CREATE POLICY "anon_read" ON property_searches FOR SELECT/);
  assert.doesNotMatch(calls.sql, /FOR ALL USING \(true\) WITH CHECK \(true\)/);
  assert.equal(calls.ended, true);

  restoreEnv('SETUP_API_KEY', oldSetupKey);
  restoreEnv('DATABASE_URL', oldDatabaseUrl);
});
