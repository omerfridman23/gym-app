import { BadRequestException, Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  PublicService,
  type PublicConfirmInfo,
  type PublicPayInfo,
} from './public.service.js';

/** Unauthenticated endpoints for client-facing token links. */
@Controller('public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Get('confirm/:token')
  async getConfirm(@Param('token') token: string): Promise<{ info: PublicConfirmInfo }> {
    return { info: await this.publicService.getConfirmInfo(token) };
  }

  @Post('confirm/:token/answer')
  async answer(
    @Param('token') token: string,
    @Body() body: { answer?: string },
  ): Promise<{ info: PublicConfirmInfo }> {
    const answer = body?.answer;
    if (answer !== 'confirm' && answer !== 'decline') {
      throw new BadRequestException('תשובה לא תקינה');
    }
    return { info: await this.publicService.answer(token, answer) };
  }

  @Get('pay/:clientId')
  async getPay(@Param('clientId') clientId: string): Promise<{ info: PublicPayInfo }> {
    return { info: await this.publicService.getPayInfo(clientId) };
  }
}
