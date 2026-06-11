const assert = require('node:assert/strict');
const test = require('node:test');

const setupHandler = require('../api/setup');

function createRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    ended: false,
    setHeader(key, value) {
      this.headers[key] = value;
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

async function callSetup(req) {
  const res = createRes();
  await setupHandler({
    method: 'POST',
    headers: {},
    query: {},
    body: {},
    ...req,
  }, res);
  return res;
}

test('setup endpoint allows unauthenticated CORS preflight only', async () => {
  const originalSecret = process.env.SETUP_SECRET;
  delete process.env.SETUP_SECRET;

  try {
    const res = await callSetup({ method: 'OPTIONS' });

    assert.equal(res.statusCode, 204);
    assert.equal(res.ended, true);
  } finally {
    if (originalSecret === undefined) delete process.env.SETUP_SECRET;
    else process.env.SETUP_SECRET = originalSecret;
  }
});

test('setup endpoint rejects POST when setup secret is missing', async () => {
  const originalSecret = process.env.SETUP_SECRET;
  delete process.env.SETUP_SECRET;

  try {
    const res = await callSetup({
      body: { db_url: 'postgres://example.invalid/db' },
    });

    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: 'Unauthorized' });
  } finally {
    if (originalSecret === undefined) delete process.env.SETUP_SECRET;
    else process.env.SETUP_SECRET = originalSecret;
  }
});

test('setup endpoint rejects POST with wrong setup secret', async () => {
  const originalSecret = process.env.SETUP_SECRET;
  process.env.SETUP_SECRET = 'correct-secret';

  try {
    const res = await callSetup({
      headers: { 'x-setup-secret': 'wrong-secret' },
      body: { db_url: 'postgres://example.invalid/db' },
    });

    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: 'Unauthorized' });
  } finally {
    if (originalSecret === undefined) delete process.env.SETUP_SECRET;
    else process.env.SETUP_SECRET = originalSecret;
  }
});

test('setup endpoint reaches request validation with valid setup secret', async () => {
  const originalSecret = process.env.SETUP_SECRET;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  process.env.SETUP_SECRET = 'correct-secret';
  delete process.env.DATABASE_URL;

  try {
    const res = await callSetup({
      body: { key: 'correct-secret' },
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
