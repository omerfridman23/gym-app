import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PublicController } from './public.controller.js';
import type { PublicService } from './public.service.js';

const TOKEN = '3f2b1c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d';
const CLIENT_ID = '8a7b6c5d-4e3f-4a2b-8c1d-0e9f8a7b6c5d';

const confirmInfo = {
  clientFirstName: 'יוסי',
  coachName: 'דני המאמן',
  startsAt: '2026-09-07T15:00:00.000Z',
  durationMin: 60,
  location: 'מגרש 1',
  status: 'pending' as const,
};

const payInfo = {
  clientFirstName: 'יוסי',
  coachName: 'דני המאמן',
  sessions: [{ id: 's1', startsAt: '2026-09-01T15:00:00.000Z', priceAgorot: 18_000 }],
  totalAgorot: 18_000,
};

function makeController() {
  const getConfirmInfo = vi.fn().mockResolvedValue(confirmInfo);
  const answer = vi.fn().mockResolvedValue({ ...confirmInfo, status: 'confirmed' });
  const getPayInfo = vi.fn().mockResolvedValue(payInfo);
  const controller = new PublicController({
    getConfirmInfo,
    answer,
    getPayInfo,
  } as unknown as PublicService);
  return { controller, getConfirmInfo, answer, getPayInfo };
}

describe('PublicController', () => {
  describe('getConfirm', () => {
    it('wraps the info in an { info } envelope', async () => {
      const { controller } = makeController();
      await expect(controller.getConfirm(TOKEN)).resolves.toEqual({ info: confirmInfo });
    });

    it('forwards the route token as-is', async () => {
      const { controller, getConfirmInfo } = makeController();
      await controller.getConfirm(TOKEN);
      expect(getConfirmInfo).toHaveBeenCalledWith(TOKEN);
    });

    it('lets a NotFound from the service bubble up', async () => {
      const { controller, getConfirmInfo } = makeController();
      getConfirmInfo.mockRejectedValue(new NotFoundException());
      await expect(controller.getConfirm('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('answer', () => {
    it('accepts confirm and wraps the updated info', async () => {
      const { controller, answer } = makeController();
      await expect(controller.answer(TOKEN, { answer: 'confirm' })).resolves.toEqual({
        info: { ...confirmInfo, status: 'confirmed' },
      });
      expect(answer).toHaveBeenCalledWith(TOKEN, 'confirm');
    });

    it('accepts decline', async () => {
      const { controller, answer } = makeController();
      await controller.answer(TOKEN, { answer: 'decline' });
      expect(answer).toHaveBeenCalledWith(TOKEN, 'decline');
    });

    it.each([
      [{}, 'missing'],
      [{ answer: '' }, 'empty'],
      [{ answer: 'CONFIRM' }, 'uppercased'],
      [{ answer: 'yes' }, 'yes'],
      [{ answer: 'no' }, 'no'],
      [{ answer: 'cancel' }, 'cancel'],
      [{ answer: 'confirmed' }, 'confirmed (the status, not the verb)'],
      [{ answer: null }, 'null'],
      [undefined, 'missing body'],
      [{ answer: ['confirm'] }, 'an array'],
    ])('rejects %j (%s) before calling the service', async (body) => {
      const { controller, answer } = makeController();
      await expect(controller.answer(TOKEN, body as never)).rejects.toThrow(BadRequestException);
      expect(answer).not.toHaveBeenCalled();
    });

    it('does not leak the rejected value in the Hebrew error', async () => {
      const { controller } = makeController();
      const error = await controller.answer(TOKEN, { answer: 'yes' }).catch((e: unknown) => e);
      expect((error as Error).message).toBe('תשובה לא תקינה');
      expect((error as Error).message).not.toContain('yes');
    });
  });

  describe('getPay', () => {
    it('wraps the info in an { info } envelope', async () => {
      const { controller } = makeController();
      await expect(controller.getPay(CLIENT_ID)).resolves.toEqual({ info: payInfo });
    });

    it('forwards the route client id as-is', async () => {
      const { controller, getPayInfo } = makeController();
      await controller.getPay(CLIENT_ID);
      expect(getPayInfo).toHaveBeenCalledWith(CLIENT_ID);
    });

    it('lets a NotFound from the service bubble up', async () => {
      const { controller, getPayInfo } = makeController();
      getPayInfo.mockRejectedValue(new NotFoundException());
      await expect(controller.getPay('nope')).rejects.toThrow(NotFoundException);
    });
  });
});
