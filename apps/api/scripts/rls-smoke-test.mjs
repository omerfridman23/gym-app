/**
 * RLS isolation smoke test. Proves that with DATABASE_URL (app_user):
 *   1. no rows are visible without app.coach_id being set
 *   2. coach A sees only their own rows
 *   3. coach A cannot insert rows for coach B
 *   4. app_user cannot hard-delete anything (no DELETE grant)
 *   5. app_user cannot touch otp_codes
 *
 * Creates two throwaway coaches as the owner, runs the checks as app_user,
 * then cleans up. Run: node scripts/rls-smoke-test.mjs
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import pg from 'pg'

const here = path.dirname(fileURLToPath(import.meta.url))
loadEnv({ path: path.resolve(here, '../../../.env.local') })

const owner = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED })
const app = new pg.Client({ connectionString: process.env.DATABASE_URL })

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

await owner.connect()
await app.connect()

// --- Seed two coaches with one client each (as owner; RLS does not bind owners)
const seed = await owner.query(`
  WITH a AS (INSERT INTO coaches (phone, name) VALUES ('+972500000001', 'Coach A') RETURNING id),
       b AS (INSERT INTO coaches (phone, name) VALUES ('+972500000002', 'Coach B') RETURNING id)
  SELECT (SELECT id FROM a) AS a_id, (SELECT id FROM b) AS b_id
`)
const { a_id: coachA, b_id: coachB } = seed.rows[0]
await owner.query(
  `INSERT INTO clients (coach_id, name, phone) VALUES ($1, 'Client of A', '050A'), ($2, 'Client of B', '050B')`,
  [coachA, coachB],
)

try {
  // 1. No coach context → nothing visible
  const noCtx = await app.query('SELECT count(*)::int AS n FROM clients')
  check('no rows visible without app.coach_id', noCtx.rows[0].n === 0, `saw ${noCtx.rows[0].n}`)

  // 2. Coach A context → only A's rows
  await app.query('BEGIN')
  await app.query(`SELECT set_config('app.coach_id', $1, true)`, [coachA])
  const mine = await app.query('SELECT name FROM clients')
  check(
    "coach A sees only coach A's clients",
    mine.rows.length === 1 && mine.rows[0].name === 'Client of A',
    JSON.stringify(mine.rows.map((r) => r.name)),
  )

  // 3. Insert for the other coach must fail (WITH CHECK)
  let crossInsertBlocked = false
  try {
    await app.query(`INSERT INTO clients (coach_id, name, phone) VALUES ($1, 'intruder', 'x')`, [coachB])
  } catch {
    crossInsertBlocked = true
  }
  check('coach A cannot insert a client for coach B', crossInsertBlocked)
  await app.query('ROLLBACK')

  // 4. DELETE is not granted at all
  let deleteBlocked = false
  try {
    await app.query('BEGIN')
    await app.query(`SELECT set_config('app.coach_id', $1, true)`, [coachA])
    await app.query('DELETE FROM clients')
  } catch {
    deleteBlocked = true
  } finally {
    await app.query('ROLLBACK')
  }
  check('app_user cannot hard-delete (no DELETE grant)', deleteBlocked)

  // 5. otp_codes is owner-only
  let otpBlocked = false
  try {
    await app.query('SELECT count(*) FROM otp_codes')
  } catch {
    otpBlocked = true
  }
  check('app_user cannot read otp_codes', otpBlocked)

  // 6. Views respect RLS (security_invoker)
  await app.query('BEGIN')
  await app.query(`SELECT set_config('app.coach_id', $1, true)`, [coachA])
  const debtRows = await app.query('SELECT count(*)::int AS n FROM client_debt')
  await app.query('ROLLBACK')
  check('client_debt view is RLS-scoped', debtRows.rows[0].n === 1, `saw ${debtRows.rows[0].n} row(s)`)
} finally {
  // --- Cleanup (owner)
  await owner.query('DELETE FROM clients WHERE coach_id = ANY($1)', [[coachA, coachB]])
  await owner.query('DELETE FROM coaches WHERE id = ANY($1)', [[coachA, coachB]])
  await owner.end()
  await app.end()
}

const failed = results.filter((r) => !r.ok)
console.log(failed.length === 0 ? '\nAll RLS checks passed.' : `\n${failed.length} check(s) FAILED`)
process.exit(failed.length === 0 ? 0 : 1)
