import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createE2eApp,
  login,
  randomIsraeliPhone,
  toE164,
  type E2eContext,
} from './e2e-app.js';

describe('auth (e2e)', () => {
  let ctx: E2eContext;

  beforeAll(async () => {
    ctx = await createE2eApp();
  }, 60_000);

  afterAll(async () => {
    await ctx.close();
  });

  it('logs a coach in with the code that was actually texted', async () => {
    const phone = randomIsraeliPhone();

    await ctx.http().post('/api/auth/otp/request').send({ phone }).expect(204);
    const code = ctx.sms.codes.get(toE164(phone));
    expect(code).toMatch(/^\d{6}$/);

    const verified = await ctx
      .http()
      .post('/api/auth/otp/verify')
      .send({ phone, code })
      .expect(201);

    expect(verified.body.coach).toMatchObject({ phone: toE164(phone), onboarded: false });
    ctx.track(verified.body.coach.id, phone);

    // The session must not be readable by client-side JavaScript.
    const cookie = (verified.headers['set-cookie'] as unknown as string[])[0];
    expect(cookie).toContain('coach_session=');
    expect(cookie).toContain('HttpOnly');
  });

  it('does not hand out a session for the wrong code', async () => {
    const phone = randomIsraeliPhone();
    await ctx.http().post('/api/auth/otp/request').send({ phone }).expect(204);
    const real = ctx.sms.codes.get(toE164(phone))!;
    const wrong = String((Number(real) + 1) % 1_000_000).padStart(6, '0');

    const rejected = await ctx
      .http()
      .post('/api/auth/otp/verify')
      .send({ phone, code: wrong })
      .expect(401);

    expect(rejected.headers['set-cookie']).toBeUndefined();
    ctx.track('00000000-0000-0000-0000-000000000000', phone); // clean up the otp row
  });

  it('burns the code once it has been used', async () => {
    const phone = randomIsraeliPhone();
    const session = await login(ctx, phone);
    const code = ctx.sms.codes.get(toE164(phone))!;
    expect(session.cookie).toContain('coach_session=');

    await ctx.http().post('/api/auth/otp/verify').send({ phone, code }).expect(401);
  });

  it('refuses phone numbers that are not Israeli mobiles', async () => {
    for (const phone of ['', '123', '+15551234567', '05123', 'לא-טלפון']) {
      await ctx.http().post('/api/auth/otp/request').send({ phone }).expect(400);
    }
  });

  it('stops a phone after three codes in the window', async () => {
    const phone = randomIsraeliPhone();
    for (let i = 0; i < 3; i += 1) {
      await ctx.http().post('/api/auth/otp/request').send({ phone }).expect(204);
    }

    await ctx.http().post('/api/auth/otp/request').send({ phone }).expect(429);
    ctx.track('00000000-0000-0000-0000-000000000000', phone);
  });

  describe('protected routes', () => {
    it('turns away requests with no cookie', async () => {
      await ctx.http().get('/api/auth/me').expect(401);
      await ctx.http().get('/api/clients').expect(401);
      await ctx.http().get('/api/sessions').expect(401);
      await ctx.http().get('/api/coaches/me').expect(401);
      await ctx.http().get('/api/reminders/due').expect(401);
    });

    it('turns away a forged cookie', async () => {
      await ctx
        .http()
        .get('/api/auth/me')
        .set('Cookie', 'coach_session=not.a.jwt')
        .expect(401);
    });

    it('answers /auth/me for a real session', async () => {
      const coach = await login(ctx);

      const me = await ctx.http().get('/api/auth/me').set('Cookie', coach.cookie).expect(200);

      expect(me.body.coach.id).toBe(coach.coachId);
    });

    it('clears the cookie on logout', async () => {
      const coach = await login(ctx);

      const out = await ctx
        .http()
        .post('/api/auth/logout')
        .set('Cookie', coach.cookie)
        .expect(204);

      expect((out.headers['set-cookie'] as unknown as string[])[0]).toContain('coach_session=;');
    });
  });
});
