const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function mockRes() {
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
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    }
  };
}

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test('requireApiAuth fails closed without server-side token', () => {
  const original = process.env.SETUP_API_KEY;
  delete process.env.SETUP_API_KEY;

  const { requireApiAuth } = require('../api/_helpers');
  const res = mockRes();
  const allowed = requireApiAuth({ headers: { authorization: 'Bearer anything' } }, res);

  restoreEnv('SETUP_API_KEY', original);

  assert.equal(allowed, false);
  assert.equal(res.statusCode, 500);
  assert.match(res.body.error, /SETUP_API_KEY is not configured/);
});

test('requireApiAuth requires matching bearer token', () => {
  const original = process.env.SETUP_API_KEY;
  process.env.SETUP_API_KEY = 'correct-secret';

  const { requireApiAuth } = require('../api/_helpers');

  const missing = mockRes();
  assert.equal(requireApiAuth({ headers: {} }, missing), false);
  assert.equal(missing.statusCode, 401);

  const wrong = mockRes();
  assert.equal(requireApiAuth({ headers: { authorization: 'Bearer wrong-secret' } }, wrong), false);
  assert.equal(wrong.statusCode, 403);

  const ok = mockRes();
  assert.equal(requireApiAuth({ headers: { authorization: 'Bearer correct-secret' } }, ok), true);
  assert.equal(ok.statusCode, null);

  restoreEnv('SETUP_API_KEY', original);
});

test('/api/setup ignores caller db_url and requires server DATABASE_URL', async () => {
  const originalSetupKey = process.env.SETUP_API_KEY;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  process.env.SETUP_API_KEY = 'setup-secret';
  delete process.env.DATABASE_URL;

  const setup = require('../api/setup');
  const res = mockRes();

  await setup({
    method: 'POST',
    headers: { authorization: 'Bearer setup-secret' },
    body: { db_url: 'postgres://attacker.example/db' }
  }, res);

  restoreEnv('SETUP_API_KEY', originalSetupKey);
  restoreEnv('DATABASE_URL', originalDatabaseUrl);

  assert.equal(res.statusCode, 500);
  assert.match(res.body.error, /DATABASE_URL is not configured/);
});

test('property-pipeline setup SQL does not create anonymous all-access policies', () => {
  const files = [
    'api/setup.js',
    'scripts/setup-tables.js',
    'supabase/migrations/20260319000000_create_property_search_tables.sql',
    'supabase/migrations/20260620000000_lock_property_search_rls.sql'
  ];

  for (const file of files) {
    const content = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(content, /CREATE POLICY\s+"anon_all"/i, file);
  }

  const lockMigration = fs.readFileSync(
    path.join(root, 'supabase/migrations/20260620000000_lock_property_search_rls.sql'),
    'utf8'
  );
  assert.match(lockMigration, /DROP POLICY IF EXISTS "anon_all" ON property_searches/);
});
