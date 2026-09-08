import { describe, expect, it, vi } from 'vitest';
import { ClientsController } from './clients.controller.js';
import type { ClientsService } from './clients.service.js';

const OWNER = 'coach-1';
const OTHER = 'coach-2';

function clientRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'client-1',
    coachId: OWNER,
    name: 'דני לוי',
    phone: '+972501234567',
    fields: {},
    priceAgorot: 18_000,
    ...overrides,
  };
}

function makeController() {
  const list = vi.fn().mockResolvedValue([clientRow()]);
  const create = vi.fn().mockResolvedValue(clientRow({ name: 'חדש' }));
  const update = vi.fn().mockResolvedValue(clientRow({ name: 'עודכן' }));
  const softDelete = vi.fn().mockResolvedValue(undefined);
  const controller = new ClientsController({
    list,
    create,
    update,
    softDelete,
  } as unknown as ClientsService);
  return { controller, list, create, update, softDelete };
}

describe('ClientsController', () => {
  describe('list', () => {
    it('wraps the coach clients in a { clients } envelope', async () => {
      const { controller } = makeController();
      await expect(controller.list(OWNER)).resolves.toEqual({
        clients: [clientRow()],
      });
    });

    it('asks the service for the authenticated coach, never a body field', async () => {
      const { controller, list } = makeController();
      await controller.list(OWNER);
      expect(list).toHaveBeenCalledWith(OWNER);
    });
  });

  describe('create', () => {
    it('wraps the created row in a { client } envelope', async () => {
      const { controller } = makeController();
      await expect(
        controller.create(OWNER, { name: 'חדש', phone: '050' }),
      ).resolves.toEqual({
        client: clientRow({ name: 'חדש' }),
      });
    });

    it('forwards the body and the session coach id', async () => {
      const { controller, create } = makeController();
      const body = { name: 'דני', phone: '0501234567', priceAgorot: 18_000 };
      await controller.create(OWNER, body);
      expect(create).toHaveBeenCalledWith(OWNER, body);
    });

    it('turns a missing body into an empty object so the service can reject it', async () => {
      const { controller, create } = makeController();
      await controller.create(OWNER, undefined as never);
      expect(create).toHaveBeenCalledWith(OWNER, {});
    });

    it('does not let the caller pick a different coach', async () => {
      const { controller, create } = makeController();
      await controller.create(OWNER, { name: 'x', phone: 'y' });
      expect(create.mock.calls[0][0]).toBe(OWNER);
      expect(create.mock.calls[0][0]).not.toBe(OTHER);
    });
  });

  describe('update', () => {
    it('wraps the updated row in a { client } envelope', async () => {
      const { controller } = makeController();
      await expect(
        controller.update(OWNER, 'client-1', { name: 'עודכן' }),
      ).resolves.toEqual({
        client: clientRow({ name: 'עודכן' }),
      });
    });

    it('forwards the route id, the session coach and the patch', async () => {
      const { controller, update } = makeController();
      await controller.update(OWNER, 'client-1', { phone: '050' });
      expect(update).toHaveBeenCalledWith(OWNER, 'client-1', { phone: '050' });
    });

    it('turns a missing body into an empty patch', async () => {
      const { controller, update } = makeController();
      await controller.update(OWNER, 'client-1', undefined as never);
      expect(update).toHaveBeenCalledWith(OWNER, 'client-1', {});
    });
  });

  describe('remove', () => {
    it('soft-deletes and returns nothing (204)', async () => {
      const { controller, softDelete } = makeController();
      await expect(
        controller.remove(OWNER, 'client-1'),
      ).resolves.toBeUndefined();
      expect(softDelete).toHaveBeenCalledWith(OWNER, 'client-1');
    });

    it('never hard-deletes: the only service method it calls is softDelete', async () => {
      const { controller, list, create, update, softDelete } = makeController();
      await controller.remove(OWNER, 'client-1');
      expect(softDelete).toHaveBeenCalledTimes(1);
      expect(list).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });
  });
});
