const LOCALHOST_ORIGIN = /^http:\/\/localhost:\d+$/;

export function resolveCorsOrigin(
  nodeEnv = process.env.NODE_ENV,
  webOrigin = process.env.WEB_ORIGIN,
): string[] | RegExp {
  if (nodeEnv !== 'production') {
    return LOCALHOST_ORIGIN;
  }

  return (webOrigin ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
