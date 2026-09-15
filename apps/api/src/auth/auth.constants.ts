export const AUTH_COOKIE = 'coach_session';
export const AUTH_TOKEN_TTL = '30d';

/**
 * Clients that cannot hold a cookie (the native iOS build) send this header to
 * receive the session JWT in the response body instead. Browsers never send it,
 * so the token stays out of reach of web page JavaScript.
 */
export const AUTH_MODE_HEADER = 'x-auth-mode';
export const AUTH_MODE_TOKEN = 'token';

/** Local-only login shortcut while SMS is not configured. Disabled in production. */
export const DEV_LOGIN_CODE = '1111';
export const DEV_COACH_PHONE = '+972501111111';
export const DEV_COACH_NAME = 'עומר';
