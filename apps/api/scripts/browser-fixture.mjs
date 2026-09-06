import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: '../../.env.local' });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED });
await db.connect();

if (process.argv[2] === 'delete') {
  await db.query('DELETE FROM sessions WHERE coach_id = $1', [process.argv[3]]);
  await db.query('DELETE FROM clients WHERE coach_id = $1', [process.argv[3]]);
  await db.query('DELETE FROM coaches WHERE id = $1', [process.argv[3]]);
} else {
  const phone = `+972599${String(Date.now()).slice(-6)}`;
  const result = await db.query(
    `WITH coach AS (
       INSERT INTO coaches (phone, name, vertical, onboarded_at)
       VALUES ($1, 'מאמן בדיקה', 'fitness', now())
       RETURNING id
     ), client AS (
       INSERT INTO clients (coach_id, name, phone, price_agorot)
       SELECT id, 'יוסי בדיקה', '+972501112222', 12000 FROM coach
       RETURNING id, coach_id
     )
     INSERT INTO sessions (
       coach_id, client_id, type_id, starts_at, duration_min, location,
       price_agorot, status, confirm_expires_at
     )
     SELECT coach_id, id, 'private', '2026-12-01 16:00:00+00', 90,
       'סטודיו תל אביב', 12000, 'confirmed', '2026-12-02 16:00:00+00'
     FROM client
     RETURNING id, coach_id, client_id, confirm_token`,
    [phone],
  );
  console.log(JSON.stringify(result.rows[0]));
}

await db.end();
