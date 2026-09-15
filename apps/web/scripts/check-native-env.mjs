// The native bundle has no web server in front of it, so unlike the browser
// build it cannot fall back to same-origin /api requests or read env.js at
// runtime. VITE_API_URL is compiled into the bundle and is the only way the app
// can reach the API — a missing or http:// value ships a permanently broken app,
// so fail the build here instead of at the App Review stage.

const apiUrl = process.env.VITE_API_URL

if (!apiUrl) {
  throw new Error(
    'VITE_API_URL is required for the native build.\n' +
      'Set it to the public API origin, e.g. VITE_API_URL=https://api.coachos.app',
  )
}

let parsed
try {
  parsed = new URL(apiUrl)
} catch {
  throw new Error(`VITE_API_URL is not a valid URL: ${apiUrl}`)
}

// App Transport Security blocks cleartext HTTP in a released iOS app.
if (parsed.protocol !== 'https:') {
  throw new Error(
    `VITE_API_URL must use https:// — iOS App Transport Security blocks ${parsed.protocol}// in a release build.\n` +
      `Received: ${apiUrl}`,
  )
}

if (parsed.pathname !== '/') {
  throw new Error(
    `VITE_API_URL must be an origin with no path — the client appends /api itself.\n` +
      `Received: ${apiUrl}`,
  )
}

console.log(`Native build target API: ${parsed.origin}`)
