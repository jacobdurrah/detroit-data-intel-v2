const assert = require('node:assert/strict');
const test = require('node:test');

const ENDPOINTS = [
  {
    name: 'saved-properties POST',
    modulePath: '../api/saved-properties',
    req: { method: 'POST', query: {}, body: { address: '123 Main' } },
  },
  {
    name: 'saved-properties PUT',
    modulePath: '../api/saved-properties',
    req: { method: 'PUT', query: { id: '1' }, body: { notes: 'changed' } },
  },
  {
    name: 'property-searches POST',
    modulePath: '../api/property-searches',
    req: { method: 'POST', query: {}, body: { address: '123 Main' } },
  },
  {
    name: 'property-reports POST',
    modulePath: '../api/property-reports',
    req: { method: 'POST', query: {}, body: { address: 'DAILY_REPORT_2026-06-23' } },
  },
  {
    name: 'search-feedback POST',
    modulePath: '../api/search-feedback',
    req: { method: 'POST', query: {}, body: { search_id: 1, feedback: 'up' } },
  },
];

function makeRes() {
  return {
    headers: {},
    statusCode: null,
    body: null,
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

function cloneReq(req, headers) {
  return Object.assign({}, req, {
    headers: headers || {},
    query: Object.assign({}, req.query),
    body: Object.assign({}, req.body),
  });
}

function withWriteKey(value, fn) {
  const original = process.env.PROPERTY_PIPELINE_API_KEY;
  if (value === undefined) {
    delete process.env.PROPERTY_PIPELINE_API_KEY;
  } else {
    process.env.PROPERTY_PIPELINE_API_KEY = value;
  }

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (original === undefined) {
        delete process.env.PROPERTY_PIPELINE_API_KEY;
      } else {
        process.env.PROPERTY_PIPELINE_API_KEY = original;
      }
    });
}

function loadHandler(modulePath, calls) {
  const supabasePath = require.resolve('../api/_supabase');
  const handlerPath = require.resolve(modulePath);
  delete require.cache[handlerPath];
  delete require.cache[supabasePath];
  require.cache[supabasePath] = {
    id: supabasePath,
    filename: supabasePath,
    loaded: true,
    exports: {
      supabase: {
        from(table) {
          calls.push(table);
          throw new Error('Supabase should not be called without valid write auth');
        },
      },
    },
  };
  return require(modulePath);
}

for (const endpoint of ENDPOINTS) {
  test(endpoint.name + ' fails closed when write key is not configured', async () => {
    await withWriteKey(undefined, async () => {
      const calls = [];
      const handler = loadHandler(endpoint.modulePath, calls);
      const res = makeRes();

      await handler(cloneReq(endpoint.req), res);

      assert.equal(res.statusCode, 503);
      assert.equal(res.body.error, 'Write API key is not configured');
      assert.deepEqual(calls, []);
    });
  });

  test(endpoint.name + ' rejects invalid bearer token before database access', async () => {
    await withWriteKey('correct-secret', async () => {
      const calls = [];
      const handler = loadHandler(endpoint.modulePath, calls);
      const res = makeRes();

      await handler(cloneReq(endpoint.req, { authorization: 'Bearer wrong-secret' }), res);

      assert.equal(res.statusCode, 401);
      assert.equal(res.body.error, 'Unauthorized');
      assert.deepEqual(calls, []);
    });
  });
}
