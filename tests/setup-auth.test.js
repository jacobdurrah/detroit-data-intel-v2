const assert = require('node:assert/strict');
const test = require('node:test');

const setupHandler = require('../api/setup');

function mockResponse() {
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
    json(body) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
  };
}

async function withEnv(vars, callback) {
  const previous = {};
  for (const key of Object.keys(vars)) {
    previous[key] = process.env[key];
    if (vars[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = vars[key];
    }
  }

  try {
    await callback();
  } finally {
    for (const key of Object.keys(vars)) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

test('setup endpoint rejects POST requests without SETUP_SECRET configured', async () => {
  await withEnv({ DATABASE_URL: 'postgres://example', SETUP_SECRET: undefined }, async () => {
    const res = mockResponse();
    await setupHandler({ method: 'POST', headers: {}, body: {} }, res);

    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: 'Unauthorized' });
  });
});

test('setup endpoint rejects POST requests with an invalid bearer token', async () => {
  await withEnv({
    DATABASE_URL: 'postgres://example',
    SETUP_SECRET: 'correct-secret',
  }, async () => {
    const res = mockResponse();
    await setupHandler(
      { method: 'POST', headers: { authorization: 'Bearer wrong-secret' }, body: {} },
      res
    );

    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: 'Unauthorized' });
  });
});

test('setup endpoint checks db_url only after a valid setup secret', async () => {
  await withEnv({ DATABASE_URL: undefined, SETUP_SECRET: 'correct-secret' }, async () => {
    const res = mockResponse();
    await setupHandler(
      { method: 'POST', headers: { authorization: 'Bearer correct-secret' }, body: {} },
      res
    );

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, {
      error: 'db_url is required (Supabase pooler connection string)',
    });
  });
});
