/**
 * Tenant isolation, exercised the way an attacker would: a fully logged-in
 * coach presenting valid credentials and another coach's record ids.
 *
 * This is the one property the app cannot get wrong — a leak here exposes real
 * clients' names and phone numbers. Isolation is enforced by Postgres RLS
 * (the runtime connection is `app_user` with `app.coach_id` set per request),
 * so these tests deliberately go through HTTP rather than mocking Prisma.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createE2eApp,
  login,
  type E2eContext,
  type LoggedInCoach,
} from './e2e-app.js';

describe('coach isolation (e2e)', () => {
  let ctx: E2eContext;
  let alice: LoggedInCoach;
  let bob: LoggedInCoach;
  let aliceClientId: string;
  let aliceSessionId: string;

  beforeAll(async () => {
    ctx = await createE2eApp();
    alice = await login(ctx);
    bob = await login(ctx);

    const client = await ctx
      .http()
      .post('/api/clients')
      .set('Cookie', alice.cookie)
      .send({ name: 'רון אביב', phone: '0545551201', priceAgorot: 12000 })
      .expect(201);
    aliceClientId = client.body.client.id;

    const session = await ctx
      .http()
      .post('/api/sessions')
      .set('Cookie', alice.cookie)
      .send({
        clientId: aliceClientId,
        typeId: 'private',
        startsAt: new Date(Date.now() + 86_400_000).toISOString(),
        priceAgorot: 12000,
      })
      .expect(201);
    aliceSessionId = session.body.sessions[0].id;
  }, 60_000);

  afterAll(async () => {
    await ctx.close();
  });

  it("keeps another coach's clients out of the list", async () => {
    const mine = await ctx
      .http()
      .get('/api/clients')
      .set('Cookie', bob.cookie)
      .expect(200);

    expect(mine.body.clients).toEqual([]);
  });

  it("keeps another coach's sessions out of the list", async () => {
    const mine = await ctx
      .http()
      .get('/api/sessions')
      .set('Cookie', bob.cookie)
      .expect(200);

    expect(mine.body.sessions).toEqual([]);
  });

  it("will not read, edit or delete another coach's client by id", async () => {
    await ctx
      .http()
      .patch(`/api/clients/${aliceClientId}`)
      .set('Cookie', bob.cookie)
      .send({ name: 'נחטף' })
      .expect(404);

    await ctx
      .http()
      .delete(`/api/clients/${aliceClientId}`)
      .set('Cookie', bob.cookie)
      .expect(404);

    // ...and the record is untouched for its real owner.
    const owner = await ctx
      .http()
      .get('/api/clients')
      .set('Cookie', alice.cookie)
      .expect(200);
    expect(owner.body.clients).toHaveLength(1);
    expect(owner.body.clients[0].name).toBe('רון אביב');
  });

  it("will not edit another coach's session by id", async () => {
    await ctx
      .http()
      .patch(`/api/sessions/${aliceSessionId}`)
      .set('Cookie', bob.cookie)
      .send({ status: 'cancelled' })
      .expect(404);

    const owner = await ctx
      .http()
      .get('/api/sessions')
      .set('Cookie', alice.cookie)
      .expect(200);
    expect(owner.body.sessions[0].status).toBe('pending');
  });

  it("will not book a session against another coach's client", async () => {
    await ctx
      .http()
      .post('/api/sessions')
      .set('Cookie', bob.cookie)
      .send({
        clientId: aliceClientId,
        typeId: 'private',
        startsAt: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .expect(404);
  });

  it("will not take a payment against another coach's client", async () => {
    await ctx
      .http()
      .post('/api/payments')
      .set('Cookie', bob.cookie)
      .send({ clientId: aliceClientId, amountAgorot: 12000, method: 'cash' })
      .expect(404);
  });

  it("will not sell a package to another coach's client", async () => {
    await ctx
      .http()
      .post('/api/packages')
      .set('Cookie', bob.cookie)
      .send({
        clientId: aliceClientId,
        totalSessions: 10,
        purchasedAgorot: 100000,
      })
      .expect(404);
  });

  it("keeps another coach's reminders out of the due queue", async () => {
    const due = await ctx
      .http()
      .get('/api/reminders/due')
      .set('Cookie', bob.cookie)
      .expect(200);

    expect(due.body.reminders).toEqual([]);
  });

  it('scopes the coach profile to the caller', async () => {
    const mine = await ctx
      .http()
      .get('/api/coaches/me')
      .set('Cookie', bob.cookie)
      .expect(200);

    expect(mine.body.coach.id).toBe(bob.coachId);
    expect(mine.body.coach.id).not.toBe(alice.coachId);
  });
});
