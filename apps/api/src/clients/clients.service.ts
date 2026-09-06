import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { Client, Prisma } from '../generated/prisma/client.js';

export interface CreateClientInput {
  name: string;
  phone: string;
  fields?: Record<string, string>;
  priceAgorot?: number;
}

export interface UpdateClientInput {
  name?: string;
  phone?: string;
  fields?: Record<string, string>;
  priceAgorot?: number;
}

const PG_INT4_MAX = 2_147_483_647;
const TEXT_MAX = 200;

function text(value: unknown, maxLength = TEXT_MAX): string {
  return String(value ?? '')
    .trim()
    .slice(0, maxLength);
}

function money(value: unknown): number {
  const n = Math.trunc(Number(value));
  if (Number.isNaN(n)) return 0;
  return Math.min(Math.max(0, n), PG_INT4_MAX);
}

/** Keeps only string values and bounds their size — `fields` is schemaless JSONB. */
function sanitizeFields(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null) return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value).slice(0, 20)) {
    out[text(key, 50)] = text(raw, 500);
  }
  return out;
}

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  list(coachId: string): Promise<Client[]> {
    return this.prisma.withCoach(coachId, (tx) =>
      tx.client.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' } }),
    );
  }

  // `async` so invalid input surfaces as a rejected promise rather than a
  // synchronous throw from a Promise-returning method.
  async create(coachId: string, input: CreateClientInput): Promise<Client> {
    const name = text(input?.name);
    const phone = text(input?.phone, 30);
    if (!name || !phone) throw new BadRequestException('שם וטלפון הם שדות חובה');

    return this.prisma.withCoach(coachId, (tx) =>
      tx.client.create({
        data: {
          coachId,
          name,
          phone,
          fields: sanitizeFields(input?.fields) as Prisma.InputJsonValue,
          priceAgorot: money(input?.priceAgorot),
        },
      }),
    );
  }

  update(coachId: string, clientId: string, input: UpdateClientInput): Promise<Client> {
    return this.prisma.withCoach(coachId, async (tx) => {
      const existing = await tx.client.findFirst({ where: { id: clientId, deletedAt: null } });
      if (!existing) throw new NotFoundException();

      return tx.client.update({
        where: { id: clientId },
        data: {
          ...(input.name !== undefined && { name: text(input.name) }),
          ...(input.phone !== undefined && { phone: text(input.phone, 30) }),
          ...(input.fields !== undefined && {
            fields: sanitizeFields(input.fields) as Prisma.InputJsonValue,
          }),
          ...(input.priceAgorot !== undefined && { priceAgorot: money(input.priceAgorot) }),
        },
      });
    });
  }

  softDelete(coachId: string, clientId: string): Promise<void> {
    return this.prisma.withCoach(coachId, async (tx) => {
      const existing = await tx.client.findFirst({ where: { id: clientId, deletedAt: null } });
      if (!existing) throw new NotFoundException();
      await tx.client.update({ where: { id: clientId }, data: { deletedAt: new Date() } });
    });
  }
}
