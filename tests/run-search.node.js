const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('run-search median refresh uses the sales zip_code column', () => {
  const script = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'run-search.js'), 'utf8');

  assert.match(script, /\.select\('neighborhood, sale_price, zip_code'\)/);
  assert.match(script, /s\.zip_code/);
  assert.doesNotMatch(script, /\.select\('neighborhood, sale_price, zip'\)/);
});
