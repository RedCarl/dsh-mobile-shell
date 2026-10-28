/**
 * Minimal Host-half test: mount the plugin on a stub web server, stub GitHub,
 * and exercise the config and update routes without a real network or profile.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const routes = new Map();
const webServer = {
  register(spec) {
    routes.set(`${spec.kind}:${spec.path}`, spec.handler);
    return () => {};
  },
};
const ctx = {
  get: (name) => (name === 'webServer' ? webServer : undefined),
  effect: (fn) => {
    const dispose = fn();
    return () => {
      if (typeof dispose === 'function') dispose();
    };
  },
};

const release = {
  tag_name: 'v9.9.9',
  html_url: 'https://github.com/RedCarl/dsh-mobile-shell/releases/tag/v9.9.9',
  published_at: '2026-10-01T00:00:00Z',
  body: 'notes',
};
globalThis.fetch = async (url) => {
  const target = String(url);
  if (target.endsWith('/releases/latest')) {
    return { ok: true, status: 200, json: async () => release };
  }
  return { ok: false, status: 404, json: async () => ({}) };
};

const { apply, ROUTE, UPDATE_ROUTE } = await import('../index.js');
apply(ctx, { enabled: true });

/** Invoke one captured route with a fake request/response. */
async function call(path, method = 'GET') {
  const handler = routes.get(`exact:${path}`);
  assert.equal(typeof handler, 'function', `route ${path} registered`);
  const req = {
    method,
    headers: { host: '127.0.0.1:3080', 'sec-fetch-site': 'same-origin' },
    socket: { remoteAddress: '127.0.0.1' },
  };
  let status = 0;
  let payload = '';
  const res = {
    writeHead(value) {
      status = value;
    },
    end(chunk) {
      payload = String(chunk ?? '');
    },
  };
  await handler(req, res);
  return { status, body: JSON.parse(payload || '{}') };
}

const config = await call(ROUTE);
assert.equal(config.status, 200, 'config 200');
assert.equal(config.body.enabled, true, 'config enabled');

const check = await call(UPDATE_ROUTE);
assert.equal(check.status, 200, 'update check 200');
assert.equal(check.body.ok, true, 'update check ok');
assert.equal(check.body.current, manifest.version, 'installed version');
assert.equal(check.body.latest, '9.9.9', 'latest release');
assert.equal(check.body.available, false, 'no update for a link/unknown install');

const post = await call(UPDATE_ROUTE, 'POST');
assert.equal(post.status, 409, 'POST on a development install is refused');
assert.equal(post.body.source, 'link', 'refusal names the development install');

const configPost = await call(ROUTE, 'POST');
assert.equal(configPost.status, 405, 'config is read-only');

console.log('host OK', {
  current: check.body.current,
  latest: check.body.latest,
  source: check.body.source,
  postStatus: post.status,
});
