/**
 * The coach's core journey over HTTP: finish onboarding, add a client, book
 * sessions (one-off and weekly), mark attendance, and settle the debt.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createE2eApp,
  login,
  randomIsraeliPhone,
  type E2eContext,
  type LoggedInCoach,
} from './e2e-app.js';
import {
  addDaysToIsoDate,
  israelWallClockToUtc,
} from '../src/sessions/sessions.service.js';

/** Israel wall-clock "HH:MM" of an instant, matching what the app renders. */
function israelTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

function israelDateIso(at: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Jerusalem',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
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

    expect(saved.body.coach).toMatchObject({
      name: 'דנה כהן',
      vertical: 'padel',
    });

    const me = await ctx
      .http()
      .get('/api/auth/me')
      .set('Cookie', coach.cookie)
      .expect(200);
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

  describe('public self-booking', () => {
    const slug = `qa-${Math.random().toString(36).slice(2, 10)}`;

    beforeAll(async () => {
      await ctx
        .http()
        .patch('/api/coaches/me')
        .set('Cookie', coach.cookie)
        .send({
          bookingSlug: slug,
          bookingEnabled: true,
          bookingStartHour: 8,
          bookingEndHour: 21,
        })
        .expect(200);
    });

    it('publishes availability without exposing private coach data', async () => {
      const response = await ctx
        .http()
        .get(`/api/public/book/${slug}`)
        .expect(200);

      expect(response.body.info).toMatchObject({
        coachName: 'דנה כהן',
        vertical: 'padel',
        durationMin: 60,
        priceAgorot: 15000,
      });
      expect(response.body.info.days).toHaveLength(14);
      expect(JSON.stringify(response.body.info)).not.toContain(coach.phone);
      expect(JSON.stringify(response.body.info)).not.toContain(coach.coachId);
    });

    it('allows only one winner when two clients request the same slot concurrently', async () => {
      const date = addDaysToIsoDate(israelDateIso(new Date()), 10);
      const startsAt = israelWallClockToUtc(date, '10:00').toISOString();

      const [first, second] = await Promise.all([
        ctx
          .http()
          .post(`/api/public/book/${slug}`)
          .send({
            startsAt,
            name: 'מתאמן מרוץ א',
            phone: randomIsraeliPhone(),
          }),
        ctx
          .http()
          .post(`/api/public/book/${slug}`)
          .send({
            startsAt,
            name: 'מתאמן מרוץ ב',
            phone: randomIsraeliPhone(),
          }),
      ]);

      expect([first.status, second.status].sort()).toEqual([201, 409]);
      await expect(
        ctx.admin.session.count({
          where: { coachId: coach.coachId, startsAt: new Date(startsAt) },
        }),
      ).resolves.toBe(1);

      const availability = await ctx
        .http()
        .get(`/api/public/book/${slug}`)
        .expect(200);
      const day = availability.body.info.days.find(
        (entry: { date: string }) => entry.date === date,
      );
      expect(
        day.slots.map((entry: { timeLocal: string }) => entry.timeLocal),
      ).not.toContain('10:00');
    });

    it('allows only one winner across public and authenticated booking paths', async () => {
      const createdClient = await ctx
        .http()
        .post('/api/clients')
        .set('Cookie', coach.cookie)
        .send({
          name: 'מתאמן מרוץ פנימי',
          phone: randomIsraeliPhone(),
          priceAgorot: 15000,
        })
        .expect(201);
      const date = addDaysToIsoDate(israelDateIso(new Date()), 12);
      const startsAt = israelWallClockToUtc(date, '12:00').toISOString();

      const [publicResult, authenticatedResult] = await Promise.all([
        ctx.http().post(`/api/public/book/${slug}`).send({
          startsAt,
          name: 'מתאמן מרוץ ציבורי',
          phone: randomIsraeliPhone(),
        }),
        ctx
          .http()
          .post('/api/sessions')
          .set('Cookie', coach.cookie)
          .send({
            clientId: createdClient.body.client.id,
            typeId: 'private',
            startsAt,
            durationMin: 60,
          }),
      ]);

      expect([publicResult.status, authenticatedResult.status].sort()).toEqual([
        201, 409,
      ]);
      await expect(
        ctx.admin.session.count({
          where: { coachId: coach.coachId, startsAt: new Date(startsAt) },
        }),
      ).resolves.toBe(1);
    });
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
        .send({
          clientId,
          typeId: 'private',
          startsAt,
          durationMin: 60,
          location: 'מגרש 1',
        })
        .expect(201);

      expect(booked.body.sessions).toHaveLength(1);
      const session = booked.body.sessions[0];
      expect(session).toMatchObject({
        status: 'pending',
        paid: false,
        location: 'מגרש 1',
      });
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

      expect(listed.body.sessions.map((s: { id: string }) => s.id)).toContain(
        session.id,
      );
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
      const october = new Date(
        Date.UTC(new Date().getUTCFullYear(), 9, 6, 15, 0, 0),
      );
      const startsAt = new Date(
        october.getTime() > Date.now()
          ? october
          : october.setUTCFullYear(october.getUTCFullYear() + 1),
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
        series.body.sessions.map((s: { startsAt: string }) =>
          israelTime(s.startsAt),
        ),
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
      expect(done.body.session).toMatchObject({
        status: 'done',
        attendance: 'arrived',
      });

      // The public pay link should now show this session as owed.
      const owed = await ctx
        .http()
        .get(`/api/public/pay/${clientId}`)
        .expect(200);
      expect(owed.body.info.totalAgorot).toBe(12000);

      const paid = await ctx
        .http()
        .post('/api/payments')
        .set('Cookie', coach.cookie)
        .send({
          clientId,
          amountAgorot: 12000,
          method: 'bit',
          sessionIds: [sessionId],
        })
        .expect(201);
      expect(paid.body.payment.amountAgorot).toBe(12000);

      // ...and the debt is cleared, because the payment marked the session paid.
      const settled = await ctx
        .http()
        .get(`/api/public/pay/${clientId}`)
        .expect(200);
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

      expect(sold.body.package).toMatchObject({
        totalSessions: 10,
        remaining: 10,
      });
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

      const remaining = await ctx
        .http()
        .get('/api/clients')
        .set('Cookie', coach.cookie)
        .expect(200);
      expect(
        remaining.body.clients.map((c: { id: string }) => c.id),
      ).not.toContain(doomed.body.client.id);
    });
  });
});
