const assert = require('node:assert/strict');
const test = require('node:test');

const setupHandler = require('../api/setup');

function makeReq({ headers = {}, body = {} } = {}) {
  return {
    method: 'POST',
    headers,
    body,
  };
}

function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
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
      return this;
    },
  };
}

async function withEnv(env, fn) {
  const previous = {
    SETUP_SECRET: process.env.SETUP_SECRET,
    DATABASE_URL: process.env.DATABASE_URL,
    SUPABASE_DB_URL: process.env.SUPABASE_DB_URL,
  };

  for (const key of Object.keys(previous)) {
    if (env[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = env[key];
    }
  }

  try {
    await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test('setup endpoint is disabled when SETUP_SECRET is not configured', async () => {
  await withEnv({}, async () => {
    const res = makeRes();

    await setupHandler(
      makeReq({ body: { db_url: 'postgres://attacker-controlled' } }),
      res
    );

    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error, 'Setup endpoint is disabled');
  });
});

test('setup endpoint rejects requests without the configured setup secret', async () => {
  await withEnv({ SETUP_SECRET: 'correct-secret' }, async () => {
    const res = makeRes();

    await setupHandler(
      makeReq({
        headers: { 'x-setup-secret': 'wrong-secret' },
        body: { db_url: 'postgres://attacker-controlled' },
      }),
      res
    );

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error, 'Unauthorized');
  });
});

test('setup endpoint never accepts caller-supplied database URLs', async () => {
  await withEnv({ SETUP_SECRET: 'correct-secret' }, async () => {
    const res = makeRes();

    await setupHandler(
      makeReq({
        headers: { 'x-setup-secret': 'correct-secret' },
        body: { db_url: 'postgres://attacker-controlled' },
      }),
      res
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'DATABASE_URL or SUPABASE_DB_URL is required');
  });
});
