/**
 * @local/dsh-mobile-shell — Host half.
 *
 * The mobile shell is a browser-side surface: the drawer, bottom bar, touch
 * rules, and viewport handling all live in client.js. The Host half exists only
 * to hand that browser half the row config, so the profile patch stays the one
 * place to tune (or disable) the surface.
 *
 * `GET /plugins/mobile-shell/config` returns non-secret booleans and one
 * breakpoint. It is fenced by the Host's own browser-trust check (loopback, the
 * listener bind address, and configured trusted hosts), falling back to a
 * loopback-only check when the connection service is absent. The config is
 * static for one plugin lifetime: an HMR recompose re-applies this row and the
 * body is rebuilt.
 */

/** Stable route used by the browser half. */
export const ROUTE = '/plugins/mobile-shell/config';

/** The config route needs the Host web server; every other dependency is optional. */
export const inject = ['webServer'];

const DEFAULTS = {
  enabled: true,
  breakpointPx: 767,
  bottomBar: true,
  panelChip: true,
  keyboardFit: true,
};

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

/** Write one JSON response. */
function sendJson(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
  });
  res.end(JSON.stringify(body));
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
          const connection = ctx.get('connection');
          if (typeof connection?.requestRejection === 'function') {
            const rejection = connection.requestRejection(req);
            if (rejection !== undefined) {
              sendJson(res, rejection, { ok: false, error: 'forbidden' });
              return;
            }
          } else if (!isLoopbackRequest(req)) {
            sendJson(res, 403, { ok: false, error: 'forbidden' });
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
}
