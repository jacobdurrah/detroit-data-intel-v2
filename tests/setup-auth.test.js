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

test('setup endpoint rejects POST requests without SETUP_SECRET configured', async (t) => {
  t.mock.method(console, 'error', () => {});
  t.mock.property(process, 'env', { ...process.env, DATABASE_URL: 'postgres://example' });
  delete process.env.SETUP_SECRET;

  const res = mockResponse();
  await setupHandler({ method: 'POST', headers: {}, body: {} }, res);

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: 'Unauthorized' });
});

test('setup endpoint rejects POST requests with an invalid bearer token', async (t) => {
  t.mock.property(process, 'env', {
    ...process.env,
    DATABASE_URL: 'postgres://example',
    SETUP_SECRET: 'correct-secret',
  });

  const res = mockResponse();
  await setupHandler(
    { method: 'POST', headers: { authorization: 'Bearer wrong-secret' }, body: {} },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: 'Unauthorized' });
});

test('setup endpoint checks db_url only after a valid setup secret', async (t) => {
  t.mock.property(process, 'env', { ...process.env, SETUP_SECRET: 'correct-secret' });
  delete process.env.DATABASE_URL;

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
