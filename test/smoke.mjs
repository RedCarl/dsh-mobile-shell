// Smoke test for the browser half without a real browser.
//
// Stubs just enough DOM / React / cordis surface to execute apply(), boot(), and
// the three slot registrations, so a runtime typo or a missing cleanup path is
// caught here instead of on a phone.
//
//   node test/smoke.mjs            # phone viewport (390 x 844)
//   WIDTH=1400 node test/smoke.mjs # desktop no-op check

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const CLIENT_URL = new URL('../client.js', import.meta.url);
const WIDTH = Number(process.env.WIDTH ?? 390);
const HEIGHT = Number(process.env.HEIGHT ?? 844);
const isPhone = WIDTH <= 767;

const calls = { toggleSidebar: 0, selectPanel: [], startSession: 0, openTab: [] };

class FakeElement {
  constructor(tag = 'div', attrs = {}) {
    this.tagName = tag.toUpperCase();
    this.attrs = { ...attrs };
    this.children = [];
    this.parentElement = null;
    this.isConnected = true;
    this.inert = false;
    this.listeners = {};
    this.style = { setProperty() {}, removeProperty() {} };
    this.dataset = {};
  }
  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
  }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  removeAttribute(name) { delete this.attrs[name]; }
  hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name); }
  appendChild(child) { this.children.push(child); child.parentElement = this; return child; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  removeEventListener(type, fn) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((entry) => entry !== fn);
  }
  querySelector() { return null; }
  closest() { return null; }
  getBoundingClientRect() { return { width: WIDTH, height: HEIGHT }; }
  remove() {
    const parent = this.parentElement;
    if (parent === null) return;
    const index = parent.children.indexOf(this);
    if (index >= 0) parent.children.splice(index, 1);
  }
}

const html = new FakeElement('html');
const body = new FakeElement('body');
const head = new FakeElement('head');
const meta = new FakeElement('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1' });
const sidebar = new FakeElement('div', { class: 'AppFrame_sidebarCol_hash' });
const center = new FakeElement('div', { class: 'AppFrame_centerCol_hash' });
const frame = new FakeElement('div', { class: 'AppFrame_frame_hash' });
frame.appendChild(sidebar);
frame.appendChild(center);
frame.setAttribute('data-sidebar-collapsed', '');
body.parentElement = html;
sidebar.querySelector = (selector) =>
  String(selector).includes('_newSession') ? new FakeElement('button', { class: 'SidebarRoot_newSession_hash' }) : null;

const document = {
  documentElement: html,
  body,
  head,
  baseURI: 'http://127.0.0.1:3080/',
  createElement: (tag) => new FakeElement(tag),
  addEventListener() {},
  removeEventListener() {},
  querySelector(selector) {
    if (String(selector).includes('_sidebarCol')) return sidebar;
    if (String(selector).includes('_centerCol')) return center;
    if (String(selector).includes('meta[name="viewport"]')) return meta;
    return null;
  },
};

const window = {
  innerWidth: WIDTH,
  innerHeight: HEIGHT,
  location: { reload() {} },
  addEventListener() {},
  removeEventListener() {},
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id),
  matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
  localStorage: (() => {
    const map = new Map();
    return {
      getItem: (key) => (map.has(key) ? map.get(key) : null),
      setItem: (key, value) => map.set(key, String(value)),
      removeItem: (key) => map.delete(key),
    };
  })(),
  visualViewport: { height: HEIGHT, offsetTop: 0, addEventListener() {}, removeEventListener() {} },
  __ModuleLoader__: { load() {} },
};

const React = {
  Fragment: Symbol.for('fragment'),
  createElement(type, props, ...children) {
    return { type, props: props ?? {}, children: children.length === 1 ? children[0] : children };
  },
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  useRef: (value) => ({ current: value }),
  useCallback: (fn) => fn,
  useMemo: (fn) => fn(),
  useState: (value) => [typeof value === 'function' ? value() : value, () => {}],
  useEffect: () => {},
};

const config = { enabled: true, breakpointPx: 767, bottomBar: true, panelChip: true, keyboardFit: true };
const registered = [];
let plugin = null;

globalThis.Element = FakeElement;
globalThis.window = window;
globalThis.document = document;
globalThis.MutationObserver = class { observe() {} disconnect() {} };
globalThis.fetch = async () => ({ ok: true, json: async () => config });
globalThis.location = window.location;
globalThis.localStorage = window.localStorage;

window.__ModuleLoader__.load = (registration) => {
  plugin = registration.factory((specifier) => {
    if (specifier === 'react') return React;
    throw new Error(`unexpected require: ${specifier}`);
  });
};

vm.runInThisContext(readFileSync(CLIENT_URL, 'utf8'), { filename: fileURLToPath(CLIENT_URL) });

if (plugin === null) throw new Error('factory did not run');
if (typeof plugin.apply !== 'function') throw new Error('apply missing');
if (!Array.isArray(plugin.inject)) throw new Error('inject missing');

const effects = [];
const ctx = {
  effect(fn) {
    const dispose = fn();
    effects.push(dispose);
    return dispose;
  },
  locale: { register() {}, bind: () => (key, fallback) => (fallback === undefined ? key : fallback) },
  slots: {
    inject(_key, callback) { callback(); return () => {}; },
    register(spec, component) { registered.push({ spec, component }); return () => {}; },
    entries(key) {
      if (key !== 'sidebar.panellist') return [];
      return [
        { options: { id: 'plugins', order: 0, label: () => '插件' } },
        { options: { id: 'balance-panel', order: 5, label: () => '余额' } },
      ];
    },
  },
  inject(_deps, callback) {
    callback({
      sidebarRight: {
        mounted: { getSnapshot: () => 'session-1', subscribe: () => () => {} },
        openTab: (kind) => calls.openTab.push(kind),
      },
    });
    return () => {};
  },
  get(name) {
    if (name === 'uiWorkspace') return { startSession: () => { calls.startSession += 1; } };
    if (name === 'sidebarRight') {
      return {
        mounted: { getSnapshot: () => 'session-1', subscribe: () => () => {} },
        openTab: (kind) => calls.openTab.push(kind),
      };
    }
    return undefined;
  },
  layout: {
    panelInfo: { getSnapshot: () => ({ activePanelId: null }), subscribe: () => () => {} },
    toggleSidebar() {
      calls.toggleSidebar += 1;
      if (frame.hasAttribute('data-sidebar-collapsed')) frame.removeAttribute('data-sidebar-collapsed');
      else frame.setAttribute('data-sidebar-collapsed', '');
    },
    selectPanel(id) { calls.selectPanel.push(id); },
  },
};

const assert = (condition, message) => {
  if (!condition) throw new Error(`assertion failed: ${message}`);
};

plugin.apply(ctx);
await new Promise((resolve) => setTimeout(resolve, 60));

assert(frame.hasAttribute('data-dsh-ms-frame'), 'frame tagged');
assert(sidebar.hasAttribute('data-dsh-ms-sidebar'), 'sidebar tagged');
assert(center.hasAttribute('data-dsh-ms-center'), 'center tagged');

const byName = new Map(
  registered.map((entry) => [entry.spec.name + (entry.spec.id ? `:${entry.spec.id}` : ''), entry.component]),
);
const bar = byName.get('shell.bottom');
const overlay = byName.get('shell.overlay:mobile-shell');
const header = byName.get('conversation.header.leading');
assert(bar !== undefined && overlay !== undefined && header !== undefined, 'three registrations placed');

if (!isPhone) {
  assert(!html.hasAttribute('data-dsh-mobile'), 'desktop: no mobile attribute');
  assert(meta.getAttribute('content') === 'width=device-width, initial-scale=1', 'desktop: viewport untouched');
  assert(sidebar.inert === false, 'desktop: sidebar not inert');
  assert(bar({}) === null, 'desktop: no bottom bar');
  assert(!JSON.stringify(overlay()).includes('dsh-ms-backdrop'), 'desktop: no backdrop');
  for (const dispose of effects) if (typeof dispose === 'function') dispose();
  assert(meta.getAttribute('content') === 'width=device-width, initial-scale=1', 'desktop: viewport still untouched');
  console.log('smoke OK (desktop no-op)', { registered: [...byName.keys()] });
  process.exit(0);
}

assert(html.hasAttribute('data-dsh-mobile'), 'phone layout attribute set');
assert(sidebar.inert === true, 'closed drawer is inert');
assert(meta.getAttribute('content').includes('viewport-fit=cover'), 'viewport meta owned');
assert(html.getAttribute('data-dsh-ms-drawer') === 'closed', 'drawer starts closed');
assert(html.getAttribute('data-dsh-ms-bar') === 'on', 'bottom bar reserves drawer space');

const nav = bar({});
assert(nav.type === 'nav', 'bar renders a nav');
const navText = JSON.stringify(nav, (key, value) => (typeof value === 'function' ? '[fn]' : value));
assert(navText.includes('Sessions') && navText.includes('Files'), 'bar labels present');

assert(Array.isArray(overlay().children), 'overlay renders a fragment');
header();
assert(true, 'header renders');

nav.children[0].props.onClick();
assert(calls.toggleSidebar === 1, 'toggleSidebar called');
assert(!frame.hasAttribute('data-sidebar-collapsed'), 'drawer open in frame');
assert(html.getAttribute('data-dsh-ms-drawer') === 'open', 'drawer attr opened');
await new Promise((resolve) => setTimeout(resolve, 80));
assert(sidebar.inert === false, 'open drawer not inert');

// Workspace rows only expand/collapse their group; they must not dismiss the drawer.
const clickHandlers = sidebar.listeners.click ?? [];
assert(clickHandlers.length > 0, 'drawer click delegate attached');
const workspaceTarget = new FakeElement('div');
workspaceTarget.closest = (selector) => (String(selector).includes('_projectRow') ? workspaceTarget : null);
for (const handler of clickHandlers) handler({ target: workspaceTarget });
await new Promise((resolve) => setTimeout(resolve, 140));
assert(!frame.hasAttribute('data-sidebar-collapsed'), 'workspace expand keeps the drawer open');

// A session row is navigation, so it does dismiss the drawer.
const sessionTarget = new FakeElement('div');
sessionTarget.closest = (selector) => {
  const text = String(selector);
  if (text.includes('_rowActions') || text.includes('_projectRow') || text.includes('_sessionOverflowButton')) return null;
  return text.includes('treeitem') ? sessionTarget : null;
};
for (const handler of clickHandlers) handler({ target: sessionTarget });
await new Promise((resolve) => setTimeout(resolve, 140));
assert(frame.hasAttribute('data-sidebar-collapsed'), 'session click closes the drawer');

nav.children[2].props.onClick();
assert(calls.openTab[0] === 'files', 'files tab opened');
nav.children[1].props.onClick();
assert(calls.startSession === 1, 'startSession called');

nav.children[3].props.onClick();
const overlayTree = overlay();
const sheetElement = overlayTree.children.find((child) => child !== null && typeof child === 'object' && typeof child.type === 'function');
assert(sheetElement !== undefined, 'sheet element present');
const sheetText = JSON.stringify(sheetElement.type(sheetElement.props), (key, value) => (typeof value === 'function' ? '[fn]' : value));
assert(sheetText.includes('dsh-ms-sheet-wrap'), 'more sheet renders');
assert(sheetText.includes('余额') && sheetText.includes('插件'), 'panel shortcuts listed');
assert(sheetText.includes('Desktop view') || sheetText.includes('桌面版视图'), 'desktop switch listed');
assert(sheetText.includes('dsh-ms-tile'), 'panel tiles rendered');
assert(sheetText.includes('dsh-ms-group'), 'display group rendered');
assert(sheetText.includes('dsh-ms-sheet-close'), 'sheet close control rendered');
assert(sheetText.includes('dsh-ms-foot'), 'sheet footer rendered');
assert(sheetText.includes('Settings'), 'settings row listed');
assert(sheetText.includes('Account & sign-in'), 'account row listed');
assert(!sheetText.includes('dsh-ms-sheet-row'), 'old sheet rows are gone');

// The More button toggles the sheet: close keeps it mounted briefly for the exit animation.
nav.children[3].props.onClick();
const closingOverlay = overlay();
const closingSheet = closingOverlay.children.find(
  (child) => child !== null && typeof child === 'object' && typeof child.type === 'function',
);
assert(closingSheet !== undefined, 'closing sheet still mounted');
const closingTree = JSON.stringify(closingSheet.type(closingSheet.props), (key, value) =>
  typeof value === 'function' ? '[fn]' : value,
);
assert(closingTree.includes('"data-closing":"true"'), 'sheet plays the exit animation');
await new Promise((resolve) => setTimeout(resolve, 260));
assert(!JSON.stringify(overlay()).includes('dsh-ms-sheet-wrap'), 'sheet unmounted after the exit');

for (const dispose of effects) if (typeof dispose === 'function') dispose();
assert(!html.hasAttribute('data-dsh-mobile'), 'mobile attr removed on dispose');
assert(html.getAttribute('data-dsh-ms-bar') === null, 'bar attr removed on dispose');
assert(!frame.hasAttribute('data-dsh-ms-frame'), 'frame tag removed');
assert(!sidebar.hasAttribute('data-dsh-ms-sidebar'), 'sidebar tag removed');
assert(meta.getAttribute('content') === 'width=device-width, initial-scale=1', 'viewport restored');

console.log('smoke OK', { registered: [...byName.keys()], calls });
