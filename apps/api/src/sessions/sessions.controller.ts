import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentCoach } from '../auth/current-coach.decorator.js';
import type { Session } from '../generated/prisma/client.js';
import {
  SessionsService,
  type CreateSessionInput,
  type UpdateSessionInput,
} from './sessions.service.js';

@Controller('sessions')
@UseGuards(AuthGuard)
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get()
  async list(
    @CurrentCoach() coachId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<{ sessions: Session[] }> {
    return { sessions: await this.sessionsService.list(coachId, from, to) };
  }

  @Post()
  async create(
    @CurrentCoach() coachId: string,
    @Body() body: CreateSessionInput,
  ): Promise<{ sessions: Session[] }> {
    return {
      sessions: await this.sessionsService.create(
        coachId,
        body ?? ({} as CreateSessionInput),
      ),
    };
  }

  @Patch(':id')
  async update(
    @CurrentCoach() coachId: string,
    @Param('id') id: string,
    @Body() body: UpdateSessionInput,
  ): Promise<{ session: Session }> {
    return {
      session: await this.sessionsService.update(coachId, id, body ?? {}),
    };
  }
}
