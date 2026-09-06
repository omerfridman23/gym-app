import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthService } from '../auth/auth.service.js';
import { CoachesController } from './coaches.controller.js';
import type { CoachesService } from './coaches.service.js';

function coachRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'coach-1',
    phone: '+972501234567',
    name: 'דני',
    vertical: 'fitness',
    defaultPriceAgorot: 18_000,
    reminderHoursBefore: 24,
    cancellationPolicy: '',
    templates: {},
    onboardedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

function makeController() {
  const getMe = vi.fn().mockResolvedValue(coachRow());
  const updateMe = vi.fn().mockResolvedValue(coachRow({ name: 'עודכן' }));
  const toSession = vi.fn().mockReturnValue({
    id: 'coach-1',
    phone: '+972501234567',
    name: 'עודכן',
    vertical: 'fitness',
    onboarded: true,
  });
  return {
    getMe,
    updateMe,
    toSession,
    controller: new CoachesController(
      { getMe, updateMe } as unknown as CoachesService,
      { toSession } as unknown as AuthService,
    ),
  };
}

describe('CoachesController', () => {
  it('gets only the authenticated coach and converts it to a profile', async () => {
    const h = makeController();
    const result = await h.controller.getMe('coach-1');
    expect(h.getMe).toHaveBeenCalledWith('coach-1');
    expect(result.coach).toMatchObject({
      id: 'coach-1',
      phone: '+972501234567',
      onboarded: true,
    });
  });

  it.each(['padel', 'fitness'] as const)('accepts the supported vertical %s', async (vertical) => {
    const h = makeController();
    await h.controller.updateMe('coach-1', { vertical });
    expect(h.updateMe).toHaveBeenCalledWith('coach-1', { vertical });
  });

  it.each([
    '',
    'PADel',
    'running',
    'padel ',
    null,
    1,
    {},
  ])('rejects hostile vertical %j before writing', async (vertical) => {
    const h = makeController();
    await expect(
      h.controller.updateMe('coach-1', { vertical } as never),
    ).rejects.toThrow(BadRequestException);
    expect(h.updateMe).not.toHaveBeenCalled();
  });

  it('allows an update that omits vertical', async () => {
    const h = makeController();
    await h.controller.updateMe('coach-1', { name: 'חדש' });
    expect(h.updateMe).toHaveBeenCalledWith('coach-1', { name: 'חדש' });
  });

  it('turns a missing body into an empty patch', async () => {
    const h = makeController();
    await h.controller.updateMe('coach-1', undefined as never);
    expect(h.updateMe).toHaveBeenCalledWith('coach-1', {});
  });

  it('returns both auth-session and full-profile views after an update', async () => {
    const h = makeController();
    const result = await h.controller.updateMe('coach-1', { name: 'עודכן' });

    expect(h.toSession).toHaveBeenCalledWith(expect.objectContaining({ name: 'עודכן' }));
    expect(result.coach).toMatchObject({ name: 'עודכן', onboarded: true });
    expect(result.profile).toMatchObject({
      name: 'עודכן',
      defaultPriceAgorot: 18_000,
      reminderHoursBefore: 24,
    });
  });

  it('propagates NotFound without constructing a response', async () => {
    const h = makeController();
    h.updateMe.mockRejectedValue(new NotFoundException());
    await expect(h.controller.updateMe('coach-1', { name: 'x' })).rejects.toThrow(
      NotFoundException,
    );
    expect(h.toSession).not.toHaveBeenCalled();
  });
});
