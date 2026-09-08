import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentCoach } from '../auth/current-coach.decorator.js';
import type { Payment } from '../generated/prisma/client.js';
import {
  PaymentsService,
  type CreatePaymentInput,
} from './payments.service.js';

@Controller('payments')
@UseGuards(AuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  async list(
    @CurrentCoach() coachId: string,
  ): Promise<{ payments: Payment[] }> {
    return { payments: await this.paymentsService.list(coachId) };
  }

  @Post()
  async create(
    @CurrentCoach() coachId: string,
    @Body() body: CreatePaymentInput,
  ): Promise<{ payment: Payment }> {
    return {
      payment: await this.paymentsService.create(
        coachId,
        body ?? ({} as CreatePaymentInput),
      ),
    };
  }
}
