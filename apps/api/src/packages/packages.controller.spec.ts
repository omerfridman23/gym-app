import { describe, expect, it, vi } from 'vitest';
import { PackagesController } from './packages.controller.js';
import type { PackagesService } from './packages.service.js';

const OWNER = 'coach-1';

function packageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'package-1',
    coachId: OWNER,
    clientId: 'client-1',
    totalSessions: 10,
    purchasedAgorot: 150_000,
    remaining: 7,
    ...overrides,
  };
}

function makeController() {
  const list = vi.fn().mockResolvedValue([packageRow()]);
  const create = vi.fn().mockResolvedValue(packageRow({ remaining: 10 }));
  const controller = new PackagesController({ list, create } as unknown as PackagesService);
  return { controller, list, create };
}

describe('PackagesController', () => {
  it('wraps the list in a { packages } envelope, remaining included', async () => {
    const { controller, list } = makeController();
    const result = await controller.list(OWNER);
    expect(list).toHaveBeenCalledWith(OWNER);
    expect(result).toEqual({ packages: [packageRow()] });
    expect(result.packages[0].remaining).toBe(7);
  });

  it('wraps a new package in a { package } envelope', async () => {
    const { controller } = makeController();
    await expect(
      controller.create(OWNER, { clientId: 'client-1', totalSessions: 10, purchasedAgorot: 150_000 }),
    ).resolves.toEqual({ package: packageRow({ remaining: 10 }) });
  });

  it('forwards the body and the session coach id', async () => {
    const { controller, create } = makeController();
    const body = { clientId: 'client-1', totalSessions: 8, purchasedAgorot: 0 };
    await controller.create(OWNER, body);
    expect(create).toHaveBeenCalledWith(OWNER, body);
  });

  it('turns a missing body into an empty object so the service can reject it', async () => {
    const { controller, create } = makeController();
    await controller.create(OWNER, undefined as never);
    expect(create).toHaveBeenCalledWith(OWNER, {});
  });
});
