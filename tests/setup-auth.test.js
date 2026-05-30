const assert = require('assert');
const setupHandler = require('../api/setup');

function createResponse() {
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
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
  };
}

async function callSetup(req) {
  const res = createResponse();
  await setupHandler(Object.assign({ method: 'POST', headers: {}, query: {}, body: {} }, req), res);
  return res;
}

(async () => {
  const originalSetupKey = process.env.SETUP_KEY;
  const originalDatabaseUrl = process.env.DATABASE_URL;

  try {
    delete process.env.SETUP_KEY;
    delete process.env.DATABASE_URL;
    let res = await callSetup({ body: { db_url: 'postgres://example' } });
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error, 'unauthorized');

    process.env.SETUP_KEY = 'expected-secret';
    res = await callSetup({
      headers: { authorization: 'Bearer wrong-secret' },
      body: { db_url: 'postgres://example' },
    });
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error, 'unauthorized');

    res = await callSetup({ headers: { authorization: 'Bearer expected-secret' } });
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error, 'db_url is required (Supabase pooler connection string)');

    console.log('setup auth tests passed');
  } finally {
    if (originalSetupKey === undefined) delete process.env.SETUP_KEY;
    else process.env.SETUP_KEY = originalSetupKey;

    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
