const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');

function loadApi(relativePath) {
  const fullPath = path.join(repoRoot, relativePath);
  delete require.cache[require.resolve(fullPath)];
  return require(fullPath);
}

function makeReq(method, options = {}) {
  return {
    method,
    headers: options.headers || {},
    query: options.query || {},
    body: options.body || {},
  };
}

function makeRes() {
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

async function withEnv(env, fn) {
  const oldValues = {};
  for (const key of Object.keys(env)) {
    oldValues[key] = process.env[key];
    if (env[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = env[key];
    }
  }

  try {
    await fn();
  } finally {
    for (const key of Object.keys(env)) {
      if (oldValues[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = oldValues[key];
      }
    }
  }
}

test('/api/setup fails closed when SETUP_API_KEY is missing', async () => {
  await withEnv({ SETUP_API_KEY: undefined, DATABASE_URL: undefined }, async () => {
    const handler = loadApi('api/setup.js');
    const res = makeRes();

    await handler(makeReq('POST', { body: { db_url: 'postgres://attacker/db' } }), res);

    assert.equal(res.statusCode, 503);
    assert.match(res.body.error, /setup API is not configured/);
  });
});

test('/api/setup requires bearer auth before accepting setup requests', async () => {
  await withEnv({ SETUP_API_KEY: 'setup-secret', DATABASE_URL: undefined }, async () => {
    const handler = loadApi('api/setup.js');
    const res = makeRes();

    await handler(makeReq('POST', { body: { db_url: 'postgres://attacker/db' } }), res);

    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'unauthorized');
  });
});

test('/api/setup ignores caller supplied db_url and requires server DATABASE_URL', async () => {
  await withEnv({ SETUP_API_KEY: 'setup-secret', DATABASE_URL: undefined }, async () => {
    const handler = loadApi('api/setup.js');
    const res = makeRes();

    await handler(makeReq('POST', {
      headers: { authorization: 'Bearer setup-secret' },
      body: { db_url: 'postgres://attacker/db' },
    }), res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'DATABASE_URL is required');
  });
});

test('property pipeline mutation endpoints require bearer auth', async () => {
  await withEnv({
    PROPERTY_PIPELINE_API_KEY: 'pipeline-secret',
    SUPABASE_SERVICE_KEY: 'service-secret',
  }, async () => {
    const cases = [
      { file: 'api/property-searches.js', method: 'POST' },
      { file: 'api/saved-properties.js', method: 'POST' },
      { file: 'api/saved-properties.js', method: 'PUT', query: { id: '1' } },
      { file: 'api/search-feedback.js', method: 'POST' },
      { file: 'api/property-reports.js', method: 'POST' },
    ];

    for (const apiCase of cases) {
      const handler = loadApi(apiCase.file);
      const res = makeRes();

      await handler(makeReq(apiCase.method, { query: apiCase.query }), res);

      assert.equal(res.statusCode, 401, apiCase.file + ' should reject missing auth');
      assert.equal(res.body.error, 'unauthorized');
    }
  });
});

test('property pipeline mutation endpoints fail closed when key is missing', async () => {
  await withEnv({
    PROPERTY_PIPELINE_API_KEY: undefined,
    SUPABASE_SERVICE_KEY: 'service-secret',
  }, async () => {
    const handler = loadApi('api/property-searches.js');
    const res = makeRes();

    await handler(makeReq('POST'), res);

    assert.equal(res.statusCode, 503);
    assert.match(res.body.error, /property pipeline API is not configured/);
  });
});
