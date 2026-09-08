import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentCoach } from '../auth/current-coach.decorator.js';
import { RemindersService, type DueReminder } from './reminders.service.js';

@Controller('reminders')
@UseGuards(AuthGuard)
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  @Get('due')
  async due(
    @CurrentCoach() coachId: string,
  ): Promise<{ reminders: DueReminder[] }> {
    return { reminders: await this.remindersService.listDue(coachId) };
  }

  @Post(':id/sent')
  async markSent(
    @CurrentCoach() coachId: string,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    await this.remindersService.markSent(coachId, id);
    return { ok: true };
  }
}
