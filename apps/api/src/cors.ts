const LOCALHOST_ORIGIN = /^http:\/\/localhost:\d+$/;

/**
 * WKWebView serves the bundled Capacitor app from these origins, so the native
 * iOS build is always cross-origin against the API and needs them allowlisted.
 * Native requests authenticate with a bearer token, not the session cookie.
 */
const NATIVE_APP_ORIGINS = ['capacitor://localhost', 'ionic://localhost'];

export function resolveCorsOrigin(
  nodeEnv = process.env.NODE_ENV,
  webOrigin = process.env.WEB_ORIGIN,
): (string | RegExp)[] {
  if (nodeEnv !== 'production') {
    return [LOCALHOST_ORIGIN, ...NATIVE_APP_ORIGINS];
  }

  const webOrigins = (webOrigin ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return [...webOrigins, ...NATIVE_APP_ORIGINS];
}
