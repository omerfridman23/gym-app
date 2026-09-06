/**
 * The client-facing side: the confirm and pay links, which are reachable with
 * no session at all. The only thing standing between a stranger and someone
 * else's data here is the unguessable token, so these tests check both that
 * the happy path works and that the endpoints stay tight-lipped.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createE2eApp, login, type E2eContext, type LoggedInCoach } from './e2e-app.js';

describe('public links (e2e)', () => {
  let ctx: E2eContext;
  let coach: LoggedInCoach;
  let clientId: string;

  /** Books a session that is close enough to be reminder-due. */
  async function bookSoon(): Promise<{ id: string; confirmToken: string }> {
    const booked = await ctx
      .http()
      .post('/api/sessions')
      .set('Cookie', coach.cookie)
      .send({
        clientId,
        typeId: 'private',
        startsAt: new Date(Date.now() + 2 * 3_600_000).toISOString(),
        location: 'מגרש 1',
        priceAgorot: 12000,
      })
      .expect(201);
    return booked.body.sessions[0];
  }

  beforeAll(async () => {
    ctx = await createE2eApp();
    coach = await login(ctx);

    await ctx
      .http()
      .patch('/api/coaches/me')
      .set('Cookie', coach.cookie)
      .send({ name: 'דנה כהן', vertical: 'padel', onboarded: true })
      .expect(200);

    const client = await ctx
      .http()
      .post('/api/clients')
      .set('Cookie', coach.cookie)
      .send({ name: 'רון אביב', phone: '0545551201', priceAgorot: 12000 })
      .expect(201);
    clientId = client.body.client.id;
  }, 60_000);

  afterAll(async () => {
    await ctx.close();
  });

  it('shows the session to whoever holds the link, with no session cookie', async () => {
    const session = await bookSoon();

    const info = await ctx.http().get(`/api/public/confirm/${session.confirmToken}`).expect(200);

    expect(info.body.info).toMatchObject({
      clientFirstName: 'רון',
      coachName: 'דנה כהן',
      location: 'מגרש 1',
      status: 'pending',
    });
  });

  it('gives away no phone numbers, ids or surnames', async () => {
    const session = await bookSoon();

    const info = await ctx.http().get(`/api/public/confirm/${session.confirmToken}`).expect(200);

    const body = JSON.stringify(info.body);
    expect(body).not.toContain('0545551201');
    expect(body).not.toContain(coach.phone);
    expect(body).not.toContain(clientId);
    expect(body).not.toContain('אביב'); // surname stays private
  });

  it('confirms the session and takes it out of the coach reminder queue', async () => {
    const session = await bookSoon();

    const due = await ctx.http().get('/api/reminders/due').set('Cookie', coach.cookie).expect(200);
    expect(due.body.reminders.map((r: { sessionId: string }) => r.sessionId)).toContain(session.id);

    const answered = await ctx
      .http()
      .post(`/api/public/confirm/${session.confirmToken}/answer`)
      .send({ answer: 'confirm' })
      .expect(201);
    expect(answered.body.info.status).toBe('confirmed');

    // Answered sessions must stop nagging the coach.
    const after = await ctx.http().get('/api/reminders/due').set('Cookie', coach.cookie).expect(200);
    expect(after.body.reminders.map((r: { sessionId: string }) => r.sessionId)).not.toContain(
      session.id,
    );
  });

  it('cancels the session when the client declines, with a reason', async () => {
    const session = await bookSoon();

    const answered = await ctx
      .http()
      .post(`/api/public/confirm/${session.confirmToken}/answer`)
      .send({ answer: 'decline' })
      .expect(201);

    expect(answered.body.info.status).toBe('cancelled');

    const owner = await ctx.http().get('/api/sessions').set('Cookie', coach.cookie).expect(200);
    const cancelled = owner.body.sessions.find((s: { id: string }) => s.id === session.id);
    expect(cancelled.cancelReason).toBe('ביטל/ה דרך הקישור');
  });

  it('refuses an answer it does not understand', async () => {
    const session = await bookSoon();

    for (const answer of ['maybe', '', 'CONFIRM', 'confirmed']) {
      await ctx
        .http()
        .post(`/api/public/confirm/${session.confirmToken}/answer`)
        .send({ answer })
        .expect(400);
    }
  });

  it('reveals nothing for a token that is not a real session', async () => {
    // A well-formed UUID that was never issued, plus outright garbage.
    await ctx.http().get('/api/public/confirm/3f2504e0-4f89-41d3-9a0c-0305e82c3301').expect(404);
    await ctx.http().get('/api/public/confirm/not-a-uuid').expect(404);
    await ctx.http().get("/api/public/confirm/' OR 1=1--").expect(404);
  });

  it('stops working once the coach deletes the session', async () => {
    const session = await bookSoon();

    await ctx
      .http()
      .patch(`/api/sessions/${session.id}`)
      .set('Cookie', coach.cookie)
      .send({ status: 'cancelled' })
      .expect(200);

    // Cancelling keeps the link alive (the client should see the cancellation),
    // but a soft-deleted session must 404.
    await ctx.admin.session.update({
      where: { id: session.id },
      data: { deletedAt: new Date() },
    });

    await ctx.http().get(`/api/public/confirm/${session.confirmToken}`).expect(404);
  });

  it('serves the pay link by client id and 404s for anything else', async () => {
    const info = await ctx.http().get(`/api/public/pay/${clientId}`).expect(200);
    expect(info.body.info).toMatchObject({ clientFirstName: 'רון', coachName: 'דנה כהן' });

    await ctx.http().get('/api/public/pay/3f2504e0-4f89-41d3-9a0c-0305e82c3301').expect(404);
    await ctx.http().get('/api/public/pay/nonsense').expect(404);
  });
});
