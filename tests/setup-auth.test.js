const assert = require('node:assert/strict');
const test = require('node:test');
const setupHandler = require('../api/setup');

function mockRes() {
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

async function callSetup(req) {
  const res = mockRes();
  await setupHandler({
    method: 'POST',
    headers: {},
    body: {},
    ...req,
  }, res);
  return res;
}

function withEnv(env, fn) {
  const previous = {
    SETUP_API_KEY: process.env.SETUP_API_KEY,
    DATABASE_URL: process.env.DATABASE_URL,
  };

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
}

test('setup endpoint fails closed when setup key is not configured', async () => {
  await withEnv({ SETUP_API_KEY: undefined, DATABASE_URL: 'postgres://prod' }, async () => {
    const res = await callSetup({});

    assert.equal(res.statusCode, 503);
    assert.equal(res.body.error, 'Setup endpoint is not configured');
  });
});

test('setup endpoint rejects missing or incorrect bearer token', async () => {
  await withEnv({ SETUP_API_KEY: 'secret', DATABASE_URL: 'postgres://prod' }, async () => {
    const missing = await callSetup({});
    const wrong = await callSetup({
      headers: { authorization: 'Bearer wrong' },
    });

    assert.equal(missing.statusCode, 403);
    assert.equal(wrong.statusCode, 403);
  });
});

test('setup endpoint ignores request db_url and requires server DATABASE_URL', async () => {
  await withEnv({ SETUP_API_KEY: 'secret', DATABASE_URL: undefined }, async () => {
    const res = await callSetup({
      headers: { authorization: 'Bearer secret' },
      body: { db_url: 'postgres://attacker-controlled' },
    });

    assert.equal(res.statusCode, 400);
    assert.equal(
      res.body.error,
      'DATABASE_URL is required (Supabase pooler connection string)'
    );
  });
});
