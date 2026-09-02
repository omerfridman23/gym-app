/**
 * Grants LOGIN + a fresh random password to the app_user role on the branch
 * that DATABASE_URL_UNPOOLED points at, and prints the runtime connection
 * strings. Run once per Neon branch after `prisma migrate`:
 *
 *   node scripts/setup-app-user.mjs
 *
 * The role itself is created by the initial migration (SQL, not the Neon
 * console) so it stays a plain role without neon_superuser/BYPASSRLS.
 */
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import pg from 'pg'

const here = path.dirname(fileURLToPath(import.meta.url))
loadEnv({ path: path.resolve(here, '../../../.env.local') })

const adminUrl = process.env.DATABASE_URL_UNPOOLED
if (!adminUrl) {
  console.error('DATABASE_URL_UNPOOLED is not set')
  process.exit(1)
}

const password = randomBytes(24).toString('base64url')
const client = new pg.Client({ connectionString: adminUrl })

await client.connect()
// Identifier is fixed ('app_user'); only the password is interpolated, and
// pg's escapeLiteral makes it safe.
await client.query(`ALTER ROLE app_user WITH LOGIN PASSWORD ${client.escapeLiteral(password)}`)
await client.end()

const admin = new URL(adminUrl)
const directHost = admin.hostname
const pooledHost = directHost.replace(/^([^.]+)/, '$1-pooler')

const asAppUser = (host) => {
  const url = new URL(adminUrl)
  url.hostname = host
  url.username = 'app_user'
  url.password = password
  return url.toString()
}

console.log('app_user credentials updated on', directHost)
console.log('')
console.log('Set this as the runtime DATABASE_URL in .env.local / Railway:')
console.log(asAppUser(pooledHost))
console.log('')
console.log('Direct (non-pooled) variant, if ever needed:')
console.log(asAppUser(directHost))
