const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');

const setup = require('../api/setup');

const ORIGINAL_SETUP_API_KEY = process.env.SETUP_API_KEY;
const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;

function setEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

function createResponse() {
  return {
    headers: {},
    statusCode: 200,
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
      this.ended = true;
      return this;
    },
  };
}

async function callSetup(req) {
  const res = createResponse();
  await setup(
    {
      method: 'POST',
      headers: {},
      body: {},
      query: {},
      ...req,
    },
    res
  );
  return res;
}

afterEach(() => {
  setEnv('SETUP_API_KEY', ORIGINAL_SETUP_API_KEY);
  setEnv('DATABASE_URL', ORIGINAL_DATABASE_URL);
});

test('setup endpoint fails closed when the server API key is missing', async () => {
  setEnv('SETUP_API_KEY', undefined);

  const res = await callSetup({
    headers: { authorization: 'Bearer anything' },
  });

  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, { error: 'Setup API key is not configured' });
});

test('setup endpoint rejects missing or incorrect bearer tokens', async () => {
  setEnv('SETUP_API_KEY', 'expected-secret');

  const missing = await callSetup();
  assert.equal(missing.statusCode, 401);
  assert.deepEqual(missing.body, { error: 'Unauthorized' });

  const wrong = await callSetup({
    headers: { authorization: 'Bearer wrong-secret' },
  });
  assert.equal(wrong.statusCode, 401);
  assert.deepEqual(wrong.body, { error: 'Unauthorized' });
});

test('setup endpoint ignores caller-supplied database URLs', async () => {
  setEnv('SETUP_API_KEY', 'expected-secret');
  setEnv('DATABASE_URL', undefined);

  const res = await callSetup({
    headers: { authorization: 'Bearer expected-secret' },
    body: { db_url: 'postgres://attacker.example/db' },
  });

  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, { error: 'DATABASE_URL is not configured' });
});
