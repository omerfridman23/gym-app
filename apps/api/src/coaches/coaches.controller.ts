import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import type { CoachSession } from '../auth/auth.service.js';
import { AuthService } from '../auth/auth.service.js';
import { CurrentCoach } from '../auth/current-coach.decorator.js';
import {
  CoachesService,
  toProfile,
  type CoachProfile,
  type UpdateCoachInput,
} from './coaches.service.js';

@Controller('coaches')
@UseGuards(AuthGuard)
export class CoachesController {
  constructor(
    private readonly coachesService: CoachesService,
    private readonly authService: AuthService,
  ) {}

  @Get('me')
  async getMe(
    @CurrentCoach() coachId: string,
  ): Promise<{ coach: CoachProfile }> {
    return { coach: toProfile(await this.coachesService.getMe(coachId)) };
  }

  @Patch('me')
  async updateMe(
    @CurrentCoach() coachId: string,
    @Body() body: UpdateCoachInput,
  ): Promise<{ coach: CoachSession; profile: CoachProfile }> {
    if (
      body?.vertical !== undefined &&
      !['padel', 'fitness'].includes(body.vertical)
    ) {
      throw new BadRequestException('vertical must be padel or fitness');
    }
    const coach = await this.coachesService.updateMe(coachId, body ?? {});
    return {
      coach: this.authService.toSession(coach),
      profile: toProfile(coach),
    };
  }
}
