const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

const scriptPath = path.join(__dirname, '..', 'scripts', 'run-search.js');
const refreshPath = path.join(__dirname, '..', 'scripts', 'refresh_v2.py');

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function loadRunSearchWithSupabase(supabase) {
  delete require.cache[scriptPath];
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '@supabase/supabase-js') {
      return { createClient: () => supabase };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return require(scriptPath);
  } finally {
    Module._load = originalLoad;
  }
}

test('updateMedians selects zip_code and computes zip medians from live sales', async () => {
  const oldKey = process.env.SUPABASE_SERVICE_KEY;
  process.env.SUPABASE_SERVICE_KEY = 'service-key';
  let selectedColumns = null;
  let page = 0;
  const salesRows = [
    { sale_price: 100000, zip_code: '48221' },
    { sale_price: 120000, zip_code: '48221' },
    { sale_price: 140000, zip_code: '48221' },
    { sale_price: 160000, zip_code: '48221' },
    { sale_price: 180000, zip_code: '48221' },
  ];
  const supabase = {
    from(table) {
      assert.equal(table, 'sales');
      return {
        select(columns) { selectedColumns = columns; return this; },
        gte() { return this; },
        gt() { return this; },
        async range() {
          page += 1;
          return { data: page === 1 ? salesRows : [] };
        },
      };
    },
  };
  const { updateMedians } = loadRunSearchWithSupabase(supabase);

  const medians = await updateMedians();

  assert.equal(selectedColumns, 'neighborhood, sale_price, zip_code');
  assert.deepEqual(medians, { '48221': 140000 });
  restoreEnv('SUPABASE_SERVICE_KEY', oldKey);
});

test('run-search persists seen addresses only after storage failure checks', () => {
  const source = fs.readFileSync(scriptPath, 'utf8');
  const propertyFailure = source.indexOf("throw new Error('Failed to store '");
  const reportFailure = source.indexOf("throw new Error('Report store error: '");
  const saveSeen = source.indexOf('saveSeenAddresses(seenMap);');

  assert.ok(propertyFailure !== -1, 'property row failures must be fatal');
  assert.ok(reportFailure !== -1, 'report insert failures must be fatal');
  assert.ok(saveSeen !== -1, 'seen-address persistence should still occur after successful storage');
  assert.ok(propertyFailure < saveSeen, 'property row failure check must run before saving seen addresses');
  assert.ok(reportFailure < saveSeen, 'report failure check must run before saving seen addresses');
});

test('refresh_v2 protects truncates with a transaction and fails partial REST loads', () => {
  const source = fs.readFileSync(refreshPath, 'utf8');

  assert.match(source, /BEGIN;\s*\nTRUNCATE \{name\};\s*\n\\copy \{name\}/);
  assert.match(source, /COMMIT;/);
  assert.match(source, /if errors > 0 or loaded != total:/);
  assert.match(source, /return False/);
});
