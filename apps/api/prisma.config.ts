import path from 'node:path'
import { defineConfig } from 'prisma/config'
import { config as loadEnv } from 'dotenv'

// Env vars live in .env.local at the repo root (repo convention).
loadEnv({ path: path.resolve(import.meta.dirname, '../../.env.local') })

// The CLI (migrate/introspect) must use the direct, non-pooled URL.
const directUrl = process.env.DATABASE_URL_UNPOOLED

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  // Declared only when the URL is actually present. `prisma generate` — which
  // runs on every build — needs no database, but `env()` resolves eagerly and
  // aborted the build with "Cannot resolve environment variable", meaning a
  // deploy could not even compile without production credentials. Commands
  // that do need a connection (migrate, introspect) still get the direct URL.
  ...(directUrl ? { datasource: { url: directUrl } } : {}),
})
