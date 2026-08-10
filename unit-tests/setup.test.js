const assert = require('node:assert/strict');
const test = require('node:test');

const setupHandler = require('../api/setup');

function createResponse() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    ended: false,
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
      this.ended = true;
      return this;
    },
  };
}

async function invokeSetup(req) {
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

test('setup endpoint denies POSTs when setup auth is not configured', async () => {
  const originalSecret = process.env.SETUP_SECRET;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.SETUP_SECRET;
  delete process.env.DATABASE_URL;

  try {
    const res = await invokeSetup({
      body: { db_url: 'postgres://attacker:secret@example.test/db' },
    });

    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: 'Unauthorized' });
  } finally {
    if (originalSecret === undefined) delete process.env.SETUP_SECRET;
    else process.env.SETUP_SECRET = originalSecret;

    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  }
});

test('setup endpoint denies POSTs with an invalid setup token', async () => {
  const originalSecret = process.env.SETUP_SECRET;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  process.env.SETUP_SECRET = 'expected-secret';
  delete process.env.DATABASE_URL;

  try {
    const res = await invokeSetup({
      headers: { authorization: 'Bearer wrong-secret' },
      body: { db_url: 'postgres://attacker:secret@example.test/db' },
    });

    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: 'Unauthorized' });
  } finally {
    if (originalSecret === undefined) delete process.env.SETUP_SECRET;
    else process.env.SETUP_SECRET = originalSecret;

    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  }
});

test('setup endpoint accepts a valid token before requiring a database URL', async () => {
  const originalSecret = process.env.SETUP_SECRET;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  process.env.SETUP_SECRET = 'expected-secret';
  delete process.env.DATABASE_URL;

  try {
    const res = await invokeSetup({
      headers: { authorization: 'Bearer expected-secret' },
    });

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: 'db_url is required (Supabase pooler connection string)' });
  } finally {
    if (originalSecret === undefined) delete process.env.SETUP_SECRET;
    else process.env.SETUP_SECRET = originalSecret;

    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  }
});

