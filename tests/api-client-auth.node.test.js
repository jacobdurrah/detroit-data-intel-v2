const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

/**
 * After the API-key gate (checkAuth on every /api/* handler), browser calls
 * must send ?key= / Bearer. App.api() does this; raw fetch('/api/...') does not.
 *
 * Live probe 2026-08-17:
 *   POST /api/chat                      → 401
 *   POST /api/chat?key=<valid>          → 200
 *   GET  /api/property-reports?date=…   → 401
 *   POST /api/saved-properties          → 401
 */

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

function unauthenticatedApiFetches(src) {
  const hits = [];
  const re = /fetch\(\s*(['"`])(\/api\/[^'"`]*)\1/g;
  let m;
  while ((m = re.exec(src))) {
    const url = m[2];
    if (!/[?&]key=/.test(url)) hits.push(url);
  }
  return hits;
}

const appJs = read('public/js/app.js');
const chatJs = read('public/js/chat.js');
const searchJs = read('public/js/search.js');
const savedJs = read('public/js/saved.js');

test('App.api always attaches the login key as ?key=', () => {
  assert.match(appJs, /params\.key = API_KEY/);
});

test('App.api supports POST/PUT via options.method and options.body', () => {
  assert.match(appJs, /options = options \|\| \{\}/);
  assert.match(appJs, /if \(options\.method\) fetchOpts\.method = options\.method/);
  assert.match(appJs, /options\.body !== undefined/);
  assert.match(appJs, /JSON\.stringify\(options\.body\)/);
});

test('chat sends questions through App.api, not an unauthenticated fetch', () => {
  assert.match(chatJs, /App\.api\(\s*['"]chat['"]/);
  assert.deepEqual(unauthenticatedApiFetches(chatJs), []);
});

test('search tab loads reports and writes through App.api', () => {
  assert.match(searchJs, /App\.api\(\s*['"]property-reports['"]/);
  assert.match(searchJs, /App\.api\(\s*['"]property-searches['"]/);
  assert.match(searchJs, /App\.api\(\s*['"]search-feedback['"]/);
  assert.match(searchJs, /App\.api\(\s*['"]saved-properties['"]/);
  assert.deepEqual(unauthenticatedApiFetches(searchJs), []);
});

test('saved tab mutations go through App.api so PUT/POST carry the key', () => {
  assert.match(savedJs, /App\.api\(\s*['"]saved-properties['"][\s\S]*method:\s*['"]POST['"]/);
  assert.match(savedJs, /App\.api\(\s*['"]saved-properties['"][\s\S]*method:\s*['"]PUT['"]/);
  assert.deepEqual(unauthenticatedApiFetches(savedJs), []);
});

test('pre-fix raw chat fetch would have been flagged', () => {
  const preFixChat = "var res = await fetch('/api/chat', { method: 'POST' });";
  assert.deepEqual(unauthenticatedApiFetches(preFixChat), ['/api/chat']);
});
