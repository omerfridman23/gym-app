import { writeFileSync } from 'node:fs';

// Production requests stay on the web origin and are proxied by start.mjs.
// This makes the HttpOnly session cookie first-party in every browser.
writeFileSync('dist/env.js', "window.__API_URL__='';\n");
