/**
 * The coach's core journey over HTTP: finish onboarding, add a client, book
 * sessions (one-off and weekly), mark attendance, and settle the debt.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createE2eApp, login, type E2eContext, type LoggedInCoach } from './e2e-app.js';

/** Israel wall-clock "HH:MM" of an instant, matching what the app renders. */
function israelTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

describe('booking (e2e)', () => {
  let ctx: E2eContext;
  let coach: LoggedInCoach;

  beforeAll(async () => {
    ctx = await createE2eApp();
    coach = await login(ctx);
  }, 60_000);

  afterAll(async () => {
    await ctx.close();
  });

  it('marks the coach onboarded once the profile is saved', async () => {
    const saved = await ctx
      .http()
      .patch('/api/coaches/me')
      .set('Cookie', coach.cookie)
      .send({
        name: 'דנה כהן',
        vertical: 'padel',
        defaultPriceAgorot: 15000,
        onboarded: true,
      })
      .expect(200);

    expect(saved.body.coach).toMatchObject({ name: 'דנה כהן', vertical: 'padel' });

    const me = await ctx.http().get('/api/auth/me').set('Cookie', coach.cookie).expect(200);
    expect(me.body.coach.onboarded).toBe(true);
  });

  it('rejects a vertical the app does not support', async () => {
    await ctx
      .http()
      .patch('/api/coaches/me')
      .set('Cookie', coach.cookie)
      .send({ vertical: 'quidditch' })
      .expect(400);
  });

  describe('with a client', () => {
    let clientId: string;

    beforeAll(async () => {
      const created = await ctx
        .http()
        .post('/api/clients')
        .set('Cookie', coach.cookie)
        .send({
          name: 'רון אביב',
          phone: '0545551201',
          priceAgorot: 12000,
          fields: { level: 'B', side: 'ימין' },
        })
        .expect(201);
      clientId = created.body.client.id;
    });

    it('requires a name and a phone', async () => {
      await ctx
        .http()
        .post('/api/clients')
        .set('Cookie', coach.cookie)
        .send({ name: '', phone: '' })
        .expect(400);
    });

    it('books a single session and lists it in range', async () => {
      const startsAt = new Date(Date.now() + 2 * 86_400_000).toISOString();

      const booked = await ctx
        .http()
        .post('/api/sessions')
        .set('Cookie', coach.cookie)
        .send({ clientId, typeId: 'private', startsAt, durationMin: 60, location: 'מגרש 1' })
        .expect(201);

      expect(booked.body.sessions).toHaveLength(1);
      const session = booked.body.sessions[0];
      expect(session).toMatchObject({ status: 'pending', paid: false, location: 'מגרש 1' });
      // Every session carries its own public confirm token.
      expect(session.confirmToken).toMatch(/^[0-9a-f-]{36}$/);

      const listed = await ctx
        .http()
        .get('/api/sessions')
        .query({
          from: new Date(Date.now() + 86_400_000).toISOString(),
          to: new Date(Date.now() + 3 * 86_400_000).toISOString(),
        })
        .set('Cookie', coach.cookie)
        .expect(200);

      expect(listed.body.sessions.map((s: { id: string }) => s.id)).toContain(session.id);
    });

    it('rejects a booking with no client or a bad date', async () => {
      await ctx
        .http()
        .post('/api/sessions')
        .set('Cookie', coach.cookie)
        .send({ typeId: 'private', startsAt: new Date().toISOString() })
        .expect(400);

      await ctx
        .http()
        .post('/api/sessions')
        .set('Cookie', coach.cookie)
        .send({ clientId, typeId: 'private', startsAt: 'לא-תאריך' })
        .expect(400);
    });

    it('rejects an unparseable date range', async () => {
      await ctx
        .http()
        .get('/api/sessions')
        .query({ from: 'not-a-date' })
        .set('Cookie', coach.cookie)
        .expect(400);
    });

    it('holds the local hour across the whole weekly series', async () => {
      // Start in October so the 12-week series crosses Israel's DST switch.
      const october = new Date(Date.UTC(new Date().getUTCFullYear(), 9, 6, 15, 0, 0));
      const startsAt = new Date(
        october.getTime() > Date.now() ? october : october.setUTCFullYear(october.getUTCFullYear() + 1),
      ).toISOString();

      const series = await ctx
        .http()
        .post('/api/sessions')
        .set('Cookie', coach.cookie)
        .send({ clientId, typeId: 'private', startsAt, repeatWeekly: true })
        .expect(201);

      expect(series.body.sessions.length).toBeGreaterThan(1);

      // A fixed 7*24h step would drift by an hour after the clocks change.
      const hours = new Set(
        series.body.sessions.map((s: { startsAt: string }) => israelTime(s.startsAt)),
      );
      expect(hours).toEqual(new Set([israelTime(startsAt)]));
    });

    it('records attendance and settles the debt', async () => {
      const startsAt = new Date(Date.now() - 3 * 3_600_000).toISOString();
      const booked = await ctx
        .http()
        .post('/api/sessions')
        .set('Cookie', coach.cookie)
        .send({ clientId, typeId: 'private', startsAt, priceAgorot: 12000 })
        .expect(201);
      const sessionId = booked.body.sessions[0].id;

      const done = await ctx
        .http()
        .patch(`/api/sessions/${sessionId}`)
        .set('Cookie', coach.cookie)
        .send({ status: 'done', attendance: 'arrived' })
        .expect(200);
      expect(done.body.session).toMatchObject({ status: 'done', attendance: 'arrived' });

      // The public pay link should now show this session as owed.
      const owed = await ctx.http().get(`/api/public/pay/${clientId}`).expect(200);
      expect(owed.body.info.totalAgorot).toBe(12000);

      const paid = await ctx
        .http()
        .post('/api/payments')
        .set('Cookie', coach.cookie)
        .send({ clientId, amountAgorot: 12000, method: 'bit', sessionIds: [sessionId] })
        .expect(201);
      expect(paid.body.payment.amountAgorot).toBe(12000);

      // ...and the debt is cleared, because the payment marked the session paid.
      const settled = await ctx.http().get(`/api/public/pay/${clientId}`).expect(200);
      expect(settled.body.info.totalAgorot).toBe(0);
    });

    it('rejects an unknown payment method', async () => {
      await ctx
        .http()
        .post('/api/payments')
        .set('Cookie', coach.cookie)
        .send({ clientId, amountAgorot: 5000, method: 'bitcoin' })
        .expect(400);
    });

    it('sells a package and reports the remaining sessions', async () => {
      const sold = await ctx
        .http()
        .post('/api/packages')
        .set('Cookie', coach.cookie)
        .send({ clientId, totalSessions: 10, purchasedAgorot: 100_000 })
        .expect(201);

      expect(sold.body.package).toMatchObject({ totalSessions: 10, remaining: 10 });
    });

    it('hides a soft-deleted client from the list', async () => {
      const doomed = await ctx
        .http()
        .post('/api/clients')
        .set('Cookie', coach.cookie)
        .send({ name: 'מתאמן זמני', phone: '0545559999' })
        .expect(201);

      await ctx
        .http()
        .delete(`/api/clients/${doomed.body.client.id}`)
        .set('Cookie', coach.cookie)
        .expect(204);

      const remaining = await ctx.http().get('/api/clients').set('Cookie', coach.cookie).expect(200);
      expect(remaining.body.clients.map((c: { id: string }) => c.id)).not.toContain(
        doomed.body.client.id,
      );
    });
  });
});
