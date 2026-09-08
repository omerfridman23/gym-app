import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import './write-env.mjs'

const port = process.env.PORT ?? '4173'
const serveEntrypoint = fileURLToPath(
  new URL('../node_modules/serve/build/main.js', import.meta.url),
)
const child = spawn(process.execPath, [serveEntrypoint, '-s', 'dist', '-l', `tcp://0.0.0.0:${port}`], {
  stdio: 'inherit',
  env: process.env,
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 1)
})
