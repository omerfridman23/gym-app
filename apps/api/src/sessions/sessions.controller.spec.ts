import { describe, expect, it, vi } from 'vitest';
import { SessionsController } from './sessions.controller.js';
import type { SessionsService } from './sessions.service.js';

const OWNER = 'coach-1';

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    coachId: OWNER,
    clientId: 'client-1',
    startsAt: new Date('2026-09-06T15:00:00.000Z'),
    durationMin: 60,
    status: 'pending',
    ...overrides,
  };
}

function makeController() {
  const list = vi.fn().mockResolvedValue([sessionRow()]);
  const create = vi.fn().mockResolvedValue([sessionRow({ id: 'created-1' })]);
  const update = vi.fn().mockResolvedValue(sessionRow({ status: 'confirmed' }));
  const controller = new SessionsController({
    list,
    create,
    update,
  } as unknown as SessionsService);
  return { controller, list, create, update };
}

describe('SessionsController', () => {
  describe('list', () => {
    it('wraps the rows in a { sessions } envelope', async () => {
      const { controller } = makeController();
      await expect(controller.list(OWNER)).resolves.toEqual({
        sessions: [sessionRow()],
      });
    });

    it('forwards the optional from/to query to the service', async () => {
      const { controller, list } = makeController();
      await controller.list(
        OWNER,
        '2026-09-06T00:00:00Z',
        '2026-09-13T00:00:00Z',
      );
      expect(list).toHaveBeenCalledWith(
        OWNER,
        '2026-09-06T00:00:00Z',
        '2026-09-13T00:00:00Z',
      );
    });

    it('omits the range when the query is empty', async () => {
      const { controller, list } = makeController();
      await controller.list(OWNER);
      expect(list).toHaveBeenCalledWith(OWNER, undefined, undefined);
    });
  });

  describe('create', () => {
    it('wraps the created instances in a { sessions } envelope (plural — a series returns 12)', async () => {
      const { controller, create } = makeController();
      create.mockResolvedValue([
        sessionRow({ id: 'a' }),
        sessionRow({ id: 'b' }),
      ]);

      await expect(
        controller.create(OWNER, {
          clientId: 'client-1',
          typeId: 'private',
          startsAt: 'x',
        }),
      ).resolves.toEqual({
        sessions: [sessionRow({ id: 'a' }), sessionRow({ id: 'b' })],
      });
    });

    it('forwards the body and the session coach id', async () => {
      const { controller, create } = makeController();
      const body = {
        clientId: 'client-1',
        typeId: 'private',
        startsAt: '2026-09-06T15:00:00Z',
      };
      await controller.create(OWNER, body);
      expect(create).toHaveBeenCalledWith(OWNER, body);
    });

    it('turns a missing body into an empty object so the service can reject it', async () => {
      const { controller, create } = makeController();
      await controller.create(OWNER, undefined as never);
      expect(create).toHaveBeenCalledWith(OWNER, {});
    });
  });

  describe('update', () => {
    it('wraps the updated row in a { session } envelope (singular)', async () => {
      const { controller } = makeController();
      await expect(
        controller.update(OWNER, 'session-1', { status: 'confirmed' }),
      ).resolves.toEqual({
        session: sessionRow({ status: 'confirmed' }),
      });
    });

    it('forwards the route id, the session coach and the patch', async () => {
      const { controller, update } = makeController();
      await controller.update(OWNER, 'session-1', { paid: true });
      expect(update).toHaveBeenCalledWith(OWNER, 'session-1', { paid: true });
    });

    it('turns a missing body into an empty patch', async () => {
      const { controller, update } = makeController();
      await controller.update(OWNER, 'session-1', undefined as never);
      expect(update).toHaveBeenCalledWith(OWNER, 'session-1', {});
    });
  });
});
