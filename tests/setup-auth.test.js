const assert = require('node:assert/strict');
const test = require('node:test');

const setupHandler = require('../api/setup');

function createResponse() {
  return {
    statusCode: null,
    headers: {},
    body: null,
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
      this.ended = true;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

async function callSetup(req) {
  const res = createResponse();
  await setupHandler({
    method: 'POST',
    headers: {},
    query: {},
    body: {},
    ...req,
  }, res);
  return res;
}

test('setup refuses unauthenticated requests before requiring database configuration', async () => {
  const oldSecret = process.env.SETUP_SECRET;
  const oldKey = process.env.SETUP_KEY;
  const oldToken = process.env.SETUP_TOKEN;
  const oldDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.SETUP_SECRET;
  delete process.env.SETUP_KEY;
  delete process.env.SETUP_TOKEN;
  process.env.DATABASE_URL = 'postgres://user:pass@example.com:5432/prod';

  try {
    const res = await callSetup();

    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: 'unauthorized' });
  } finally {
    if (oldSecret === undefined) delete process.env.SETUP_SECRET;
    else process.env.SETUP_SECRET = oldSecret;
    if (oldKey === undefined) delete process.env.SETUP_KEY;
    else process.env.SETUP_KEY = oldKey;
    if (oldToken === undefined) delete process.env.SETUP_TOKEN;
    else process.env.SETUP_TOKEN = oldToken;
    if (oldDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = oldDatabaseUrl;
  }
});

test('setup rejects the wrong key and accepts a bearer token', async () => {
  const oldSecret = process.env.SETUP_SECRET;
  const oldDatabaseUrl = process.env.DATABASE_URL;
  process.env.SETUP_SECRET = 'setup-secret';
  delete process.env.DATABASE_URL;

  try {
    const rejected = await callSetup({ body: { key: 'wrong' } });
    assert.equal(rejected.statusCode, 403);
    assert.deepEqual(rejected.body, { error: 'unauthorized' });

    const accepted = await callSetup({
      headers: { authorization: 'Bearer setup-secret' },
    });
    assert.equal(accepted.statusCode, 400);
    assert.deepEqual(accepted.body, { error: 'db_url is required (Supabase pooler connection string)' });
  } finally {
    if (oldSecret === undefined) delete process.env.SETUP_SECRET;
    else process.env.SETUP_SECRET = oldSecret;
    if (oldDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = oldDatabaseUrl;
  }
});
