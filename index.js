/**
 * @local/dsh-mobile-shell — Host half.
 *
 * The mobile shell is a browser-side surface: the drawer, bottom bar, touch
 * rules, and viewport handling all live in client.js. The Host half hands that
 * browser half its row config and its update channel.
 *
 * `GET /plugins/mobile-shell/config` returns non-secret booleans and one
 * breakpoint. `GET /plugins/mobile-shell/update` compares the installed version
 * with the latest GitHub release, and `POST` on the same route installs that
 * release through the profile's package manager. Both routes are fenced by the
 * Host's own browser-trust check (loopback, the listener bind address, and
 * configured trusted hosts), falling back to a loopback-only check when the
 * connection service is absent.
 */

import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Stable route used by the browser half for its row config. */
export const ROUTE = '/plugins/mobile-shell/config';
/** Update check (GET) and one-click update (POST). */
export const UPDATE_ROUTE = '/plugins/mobile-shell/update';

/** The config route needs the Host web server; every other dependency is optional. */
export const inject = ['webServer'];

const DEFAULTS = {
  enabled: true,
  breakpointPx: 767,
  bottomBar: true,
  panelChip: true,
  keyboardFit: true,
};

const REPO = 'RedCarl/dsh-mobile-shell';
const PACKAGE_NAME = '@local/dsh-mobile-shell';
const UPDATE_CACHE_MS = 10 * 60 * 1000;
const UPDATE_TIMEOUT_MS = 180 * 1000;
const VERSION = /^\d+\.\d+\.\d+$/;

/** Cached latest release and the one running install, shared by the routes. */
let releaseCache;
let updateInFlight;

/** Clamp a number into an inclusive range. */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Normalize the row config into the shape the browser half consumes. */
function normalizeConfig(config) {
  const input = config !== null && typeof config === 'object' ? config : {};
  return {
    enabled: input.enabled !== false,
    breakpointPx:
      typeof input.breakpointPx === 'number' && Number.isFinite(input.breakpointPx)
        ? clamp(Math.round(input.breakpointPx), 320, 1024)
        : DEFAULTS.breakpointPx,
    bottomBar: input.bottomBar !== false,
    panelChip: input.panelChip !== false,
    keyboardFit: input.keyboardFit !== false,
  };
}

/** Loopback socket check used only when the Host connection service is absent. */
function isLoopbackRequest(request) {
  const address = request.socket?.remoteAddress;
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return false;
  const host = request.headers.host;
  if (typeof host !== 'string') return false;
  let hostUrl;
  try {
    hostUrl = new URL(`http://${host}`);
  } catch {
    return false;
  }
  if (hostUrl.hostname !== '127.0.0.1' && hostUrl.hostname !== 'localhost' && hostUrl.hostname !== '[::1]') {
    return false;
  }
  if (request.headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = request.headers.origin;
  if (origin === undefined) return true;
  try {
    return new URL(origin).host === hostUrl.host;
  } catch {
    return false;
  }
}

/** Return a rejection status for an untrusted request, or undefined when allowed. */
function rejectionFor(ctx, request) {
  const connection = ctx.get('connection');
  if (typeof connection?.requestRejection === 'function') return connection.requestRejection(request);
  return isLoopbackRequest(request) ? undefined : 403;
}

/** Write one JSON response. */
function sendJson(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
  });
  res.end(JSON.stringify(body));
}

/** Read and parse a JSON file, or return undefined. */
async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return undefined;
  }
}

/** Parse a release tag into comparable parts, or null. */
function parseVersion(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(String(value ?? '').trim());
  if (match === null) return null;
  return { major: +match[1], minor: +match[2], patch: +match[3], pre: match[4] ?? '' };
}

/** Compare two parsed versions (-1, 0, 1); unparseable values compare equal. */
function compareVersions(left, right) {
  if (left === null || right === null) return 0;
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return left[key] > right[key] ? 1 : -1;
  }
  if (left.pre === right.pre) return 0;
  if (left.pre === '') return 1;
  if (right.pre === '') return -1;
  return left.pre > right.pre ? 1 : -1;
}

/** Version of the package this Host half belongs to. */
async function installedVersion() {
  const manifest = await readJson(fileURLToPath(new URL('./package.json', import.meta.url)));
  return typeof manifest?.version === 'string' ? manifest.version : '0.0.0';
}

/**
 * Walk up from the loaded module to the profile manifest. A GitHub/tarball
 * install lives under `<profile>/node_modules/...`, so the manifest is an
 * ancestor; a `link:` development install lives outside the profile and yields
 * no manifest, which is how the caller recognizes it.
 */
async function profileInstall() {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    const manifest = await readJson(join(dir, 'package.json'));
    if (manifest?.dsh?.profile !== undefined) {
      const spec = manifest?.dependencies?.[PACKAGE_NAME];
      return { dir, manifest, spec: typeof spec === 'string' ? spec : undefined };
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/** Classify the dependency spec of this package. */
function installSource(spec) {
  if (typeof spec !== 'string' || spec.trim() === '') return 'unknown';
  if (spec.startsWith('link:')) return 'link';
  if (/\.tgz(\?.*)?$/i.test(spec) || spec.startsWith('file:')) return 'tarball';
  if (/^(github:|git\+|https:\/\/github\.com)/i.test(spec)) return 'github';
  if (/^(\.\.?\/|\/)/.test(spec)) return 'tarball';
  return 'other';
}

/** Fetch JSON with a short timeout. */
async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'dsh-mobile-shell' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Latest published release (falling back to the newest tag), cached. */
async function latestRelease() {
  const now = Date.now();
  if (releaseCache !== undefined && now - releaseCache.at < UPDATE_CACHE_MS) return releaseCache.data;
  try {
    const release = await fetchJson(`https://api.github.com/repos/${REPO}/releases/latest`);
    const tag = String(release?.tag_name ?? '');
    const data = {
      tag,
      version: tag.replace(/^v/, ''),
      htmlUrl: typeof release?.html_url === 'string' ? release.html_url : `https://github.com/${REPO}/releases`,
      publishedAt: typeof release?.published_at === 'string' ? release.published_at : '',
      notes: String(release?.body ?? '').slice(0, 400),
    };
    releaseCache = { at: now, data };
    return data;
  } catch (error) {
    try {
      const tags = await fetchJson(`https://api.github.com/repos/${REPO}/tags?per_page=1`);
      const tag = String(tags?.[0]?.name ?? '');
      const data = {
        tag,
        version: tag.replace(/^v/, ''),
        htmlUrl: `https://github.com/${REPO}/releases`,
        publishedAt: '',
        notes: '',
      };
      releaseCache = { at: now, data };
      return data;
    } catch (fallbackError) {
      return { error: String(error?.message ?? error) };
    }
  }
}

/** Combined check result consumed by the browser half. */
async function updateState() {
  const current = await installedVersion();
  const install = await profileInstall();
  const spec = install?.spec;
  const source = install === undefined ? 'link' : installSource(spec);
  const latest = await latestRelease();
  const available =
    source !== 'link' &&
    typeof latest.version === 'string' &&
    VERSION.test(latest.version) &&
    compareVersions(parseVersion(latest.version), parseVersion(current)) > 0;
  return {
    ok: true,
    current,
    source,
    spec: spec ?? null,
    latest: typeof latest.version === 'string' ? latest.version : '',
    tag: latest.tag ?? '',
    htmlUrl: latest.htmlUrl ?? `https://github.com/${REPO}`,
    publishedAt: latest.publishedAt ?? '',
    available,
    error: latest.error ?? undefined,
  };
}

/** Install one published version through the profile's package manager. */
async function runUpdate(version) {
  if (!VERSION.test(version)) throw new Error('invalid release version');
  const install = await profileInstall();
  if (install === undefined) throw Object.assign(new Error('development install'), { code: 'link' });
  const spec = `https://github.com/${REPO}/releases/download/v${version}/local-dsh-mobile-shell-${version}.tgz`;
  const output = await new Promise((resolve, reject) => {
    const child = spawn(process.env.PNPM_BIN ?? 'pnpm', ['add', spec], {
      cwd: install.dir,
      shell: false,
      env: { ...process.env, CI: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let text = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(Object.assign(new Error('update timed out'), { output: text }));
    }, UPDATE_TIMEOUT_MS);
    child.stdout?.on('data', (chunk) => {
      text = (text + chunk).slice(-8000);
    });
    child.stderr?.on('data', (chunk) => {
      text = (text + chunk).slice(-8000);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(Object.assign(error, { output: text }));
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(text);
      else reject(Object.assign(new Error(`pnpm exited with ${code}`), { output: text }));
    });
  });
  releaseCache = undefined;
  return { version, spec, output };
}

/** The mobile shell Host plugin. */
export function apply(ctx, config) {
  const webServer = ctx.get('webServer');
  if (webServer === undefined || typeof webServer.register !== 'function') return;

  const settings = normalizeConfig(config);
  const body = JSON.stringify(settings);

  ctx.effect(
    () =>
      webServer.register({
        kind: 'exact',
        path: ROUTE,
        handler: async (req, res) => {
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            sendJson(res, 405, { ok: false, error: 'method not allowed' });
            return;
          }
          const rejection = rejectionFor(ctx, req);
          if (rejection !== undefined) {
            sendJson(res, rejection, { ok: false, error: 'forbidden' });
            return;
          }
          res.writeHead(200, {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
            'referrer-policy': 'no-referrer',
          });
          res.end(body);
        },
      }),
    `mobile-shell: GET ${ROUTE}`,
  );

  ctx.effect(
    () =>
      webServer.register({
        kind: 'exact',
        path: UPDATE_ROUTE,
        handler: async (req, res) => {
          const rejection = rejectionFor(ctx, req);
          if (rejection !== undefined) {
            sendJson(res, rejection, { ok: false, error: 'forbidden' });
            return;
          }
          if (req.method === 'GET' || req.method === 'HEAD') {
            sendJson(res, 200, await updateState());
            return;
          }
          if (req.method !== 'POST') {
            sendJson(res, 405, { ok: false, error: 'method not allowed' });
            return;
          }
          if (updateInFlight !== undefined) {
            sendJson(res, 409, { ok: false, error: 'update already running' });
            return;
          }
          let state;
          try {
            state = await updateState();
          } catch (error) {
            sendJson(res, 500, { ok: false, error: String(error?.message ?? error) });
            return;
          }
          if (state.source === 'link') {
            sendJson(res, 409, {
              ok: false,
              error: 'development install',
              source: 'link',
              current: state.current,
              latest: state.latest,
            });
            return;
          }
          if (state.error !== undefined) {
            sendJson(res, 502, { ok: false, error: state.error });
            return;
          }
          if (!state.available) {
            sendJson(res, 200, { ok: true, upToDate: true, current: state.current, version: state.current });
            return;
          }
          updateInFlight = runUpdate(state.latest);
          try {
            const result = await updateInFlight;
            sendJson(res, 200, {
              ok: true,
              current: state.current,
              version: result.version,
              spec: result.spec,
              restartRequired: true,
              output: String(result.output ?? '').slice(-2000),
            });
          } catch (error) {
            sendJson(res, 500, {
              ok: false,
              error: String(error?.message ?? error),
              output: String(error?.output ?? '').slice(-2000),
            });
          } finally {
            updateInFlight = undefined;
          }
        },
      }),
    `mobile-shell: GET/POST ${UPDATE_ROUTE}`,
  );
}
