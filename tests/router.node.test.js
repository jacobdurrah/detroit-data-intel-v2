const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const appSource = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'js', 'app.js'),
  'utf8'
);

function loadApp(hash, modules) {
  let onReady;
  const appElement = { style: {} };
  const contentElement = { classList: { add() {}, remove() {} } };
  const document = {
    addEventListener(event, handler) {
      if (event === 'DOMContentLoaded') onReady = handler;
    },
    getElementById(id) {
      return id === 'app' ? appElement : null;
    },
    querySelector(selector) {
      return selector.startsWith('#tab-') ? contentElement : null;
    },
    querySelectorAll() {
      return [];
    }
  };
  const storage = {
    getItem(key) {
      return key === 'ddi_key' ? 'test-key' : null;
    },
    setItem() {},
    removeItem() {}
  };
  const location = { hash, search: '' };
  const window = {
    ...modules,
    addEventListener() {},
    location
  };

  vm.runInNewContext(appSource, {
    URLSearchParams,
    console,
    document,
    fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }),
    history: { pushState() {}, replaceState() {} },
    localStorage: storage,
    location,
    setTimeout(handler) {
      handler();
      return 1;
    },
    window
  });

  assert.equal(typeof onReady, 'function');
  onReady();
  return window;
}

const tabModules = {
  search: 'SearchModule',
  saved: 'SavedModule',
  reports: 'ReportsModule',
  investors: 'InvestorsModule',
  neighborhoods: 'NeighborhoodsModule',
  blocks: 'BlocksModule',
  contractors: 'ContractorsModule',
  lending: 'LendingModule',
  pipeline: 'PipelineModule',
  sources: 'SourcesModule'
};

test('initial non-map hash initializes its tab module', () => {
  for (const [tab, moduleName] of Object.entries(tabModules)) {
    let initCalls = 0;
    const window = loadApp(`#${tab}`, {
      [moduleName]: { init() { initCalls += 1; } }
    });

    assert.equal(initCalls, 1, `${tab} should initialize once`);
    assert.equal(window.App.state.loadedTabs[tab], true);
  }
});

test('investor detail hash calls the exported detail method', () => {
  let detailName;
  loadApp('#investors/HANTZ%20GROUP', {
    InvestorsModule: {
      init() {},
      showInvestorDetail(name) {
        detailName = name;
      }
    }
  });

  assert.equal(detailName, 'HANTZ GROUP');
});

test('neighborhood detail hash calls the exported detail method', () => {
  let detailName;
  loadApp('#neighborhoods/Corktown', {
    NeighborhoodsModule: {
      init() {},
      showNeighborhoodDetail(name) {
        detailName = name;
      }
    }
  });

  assert.equal(detailName, 'Corktown');
});
