import { writeFileSync } from 'node:fs';

const apiUrl = (process.env.API_URL ?? '').replace(/\/$/, '');
writeFileSync('dist/env.js', `window.__API_URL__=${JSON.stringify(apiUrl)};\n`);
