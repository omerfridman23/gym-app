import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { Payment } from '../generated/prisma/client.js';

export interface CreatePaymentInput {
  clientId: string;
  amountAgorot: number;
  method: 'cash' | 'bit' | 'transfer' | 'card';
  /** Sessions settled by this payment — they get marked paid in the same transaction. */
  sessionIds?: string[];
}

const PG_INT4_MAX = 2_147_483_647;
const PAYMENT_METHODS = new Set(['cash', 'bit', 'transfer', 'card']);

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  list(coachId: string): Promise<Payment[]> {
    return this.prisma.withCoach(coachId, (tx) =>
      tx.payment.findMany({ where: { deletedAt: null }, orderBy: { paidAt: 'desc' } }),
    );
  }

  // `async` so invalid input rejects instead of throwing synchronously out of
  // a Promise-returning method.
  async create(coachId: string, input: CreatePaymentInput): Promise<Payment> {
    const amount = Math.trunc(Number(input?.amountAgorot));
    if (!input?.clientId || Number.isNaN(amount) || amount <= 0 || amount > PG_INT4_MAX) {
      throw new BadRequestException('סכום לא תקין');
    }
    if (!PAYMENT_METHODS.has(input?.method)) {
      throw new BadRequestException('אמצעי תשלום לא תקין');
    }
    const sessionIds = Array.isArray(input.sessionIds)
      ? input.sessionIds.filter((id): id is string => typeof id === 'string').slice(0, 200)
      : [];

    return this.prisma.withCoach(coachId, async (tx) => {
      const client = await tx.client.findFirst({ where: { id: input.clientId, deletedAt: null } });
      if (!client) throw new NotFoundException('מתאמן לא נמצא');

      const payment = await tx.payment.create({
        data: { coachId, clientId: client.id, amountAgorot: amount, method: input.method },
      });

      if (sessionIds.length > 0) {
        await tx.session.updateMany({
          where: { id: { in: sessionIds }, clientId: client.id, deletedAt: null },
          data: { paid: true },
        });
      }

      return payment;
    });
  }
}
