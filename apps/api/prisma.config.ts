import path from 'node:path'
import { defineConfig, env } from 'prisma/config'
import { config as loadEnv } from 'dotenv'

// Env vars live in .env.local at the repo root (repo convention).
loadEnv({ path: path.resolve(import.meta.dirname, '../../.env.local') })

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // The CLI (migrate/introspect) must use the direct, non-pooled URL.
    url: env('DATABASE_URL_UNPOOLED'),
  },
})
