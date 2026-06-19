const assert = require('node:assert/strict');
const test = require('node:test');

process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-service-key';

const { getRequiredSupabaseServiceKey } = require('../scripts/run-search');

test('uses SUPABASE_SERVICE_KEY when present', () => {
  assert.equal(
    getRequiredSupabaseServiceKey({
      SUPABASE_SERVICE_KEY: 'service',
      SUPABASE_KEY: 'legacy',
    }),
    'service'
  );
});

test('falls back to SUPABASE_KEY for older search runner environments', () => {
  assert.equal(
    getRequiredSupabaseServiceKey({
      SUPABASE_KEY: 'legacy',
    }),
    'legacy'
  );
});

test('fails clearly when no Supabase write key is configured', () => {
  assert.throws(
    () => getRequiredSupabaseServiceKey({}),
    /Missing SUPABASE_SERVICE_KEY or SUPABASE_KEY/
  );
});
