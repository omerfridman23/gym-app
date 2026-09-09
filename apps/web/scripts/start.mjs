import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import handler from 'serve-handler'
import './write-env.mjs'

const port = process.env.PORT ?? '4173'
const apiUrl = (process.env.API_URL ?? '').replace(/\/$/, '')

if (!apiUrl) {
  throw new Error('API_URL is required')
}

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'expect',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

async function proxyApi(req, res) {
  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined || HOP_BY_HOP_HEADERS.has(name)) continue
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item)
    } else {
      headers.set(name, value)
    }
  }
  headers.delete('host')
  headers.delete('content-length')
  // Let undici negotiate its own compression: it transparently decompresses
  // the upstream body but keeps the original content-encoding/content-length
  // headers. Forwarding the browser's accept-encoding therefore produced a
  // decoded body labeled as gzip → ERR_CONTENT_DECODING_FAILED in the browser
  // for any response large enough to be compressed (the "שמירה נכשלה" bug).
  headers.delete('accept-encoding')

  const method = req.method ?? 'GET'
  const init = {
    method,
    headers,
    redirect: 'manual',
  }
  if (method !== 'GET' && method !== 'HEAD') {
    init.body = Readable.toWeb(req)
    init.duplex = 'half'
  }

  const upstream = await fetch(new URL(req.url, apiUrl), init)
  res.statusCode = upstream.status
  for (const [name, value] of upstream.headers) {
    // content-encoding/content-length describe the *compressed* upstream body;
    // fetch hands us the decoded stream, so forwarding them corrupts responses.
    if (
      name !== 'set-cookie' &&
      name !== 'content-encoding' &&
      name !== 'content-length' &&
      !HOP_BY_HOP_HEADERS.has(name)
    ) {
      res.setHeader(name, value)
    }
  }
  const cookies = upstream.headers.getSetCookie()
  if (cookies.length > 0) res.setHeader('set-cookie', cookies)

  if (upstream.body) {
    await pipeline(Readable.fromWeb(upstream.body), res)
  } else {
    res.end()
  }
}

const server = createServer(async (req, res) => {
  try {
    if (req.url?.startsWith('/api/')) {
      await proxyApi(req, res)
      return
    }
    await handler(req, res, {
      public: 'dist',
      rewrites: [{ source: '**', destination: '/index.html' }],
    })
  } catch (error) {
    const cause =
      error instanceof Error &&
      typeof error.cause === 'object' &&
      error.cause !== null
        ? error.cause
        : undefined
    console.error(
      'Web request failed:',
      error instanceof Error ? error.message : 'unknown error',
      cause && 'code' in cause ? String(cause.code) : '',
      cause && 'message' in cause ? String(cause.message) : '',
    )
    if (res.headersSent) {
      res.destroy()
      return
    }
    res.statusCode = 502
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ message: 'שירות ה-API אינו זמין כרגע' }))
  }
})

server.listen(Number(port), '0.0.0.0', () => {
  console.log(`CoachOS web listening on 0.0.0.0:${port}`)
})
