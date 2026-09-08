import { describe, expect, it, vi } from 'vitest';
import { PaymentsController } from './payments.controller.js';
import type { PaymentsService } from './payments.service.js';

const OWNER = 'coach-1';

function paymentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'payment-1',
    coachId: OWNER,
    clientId: 'client-1',
    amountAgorot: 18_000,
    method: 'cash',
    ...overrides,
  };
}

function makeController() {
  const list = vi.fn().mockResolvedValue([paymentRow()]);
  const create = vi.fn().mockResolvedValue(paymentRow());
  const controller = new PaymentsController({
    list,
    create,
  } as unknown as PaymentsService);
  return { controller, list, create };
}

describe('PaymentsController', () => {
  it('wraps the list in a { payments } envelope', async () => {
    const { controller, list } = makeController();
    await expect(controller.list(OWNER)).resolves.toEqual({
      payments: [paymentRow()],
    });
    expect(list).toHaveBeenCalledWith(OWNER);
  });

  it('wraps a new payment in a { payment } envelope', async () => {
    const { controller } = makeController();
    await expect(
      controller.create(OWNER, {
        clientId: 'client-1',
        amountAgorot: 18_000,
        method: 'cash',
      }),
    ).resolves.toEqual({ payment: paymentRow() });
  });

  it('forwards the body and the session coach id', async () => {
    const { controller, create } = makeController();
    const body = {
      clientId: 'client-1',
      amountAgorot: 18_000,
      method: 'bit' as const,
      sessionIds: ['s1'],
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
