import { Body, Controller, Get, HttpCode, Post, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';
import { PrismaService } from '../database/prisma.service.js';
import { AUTH_COOKIE } from './auth.constants.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService, type CoachSession } from './auth.service.js';
import { CurrentCoach } from './current-coach.decorator.js';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private cookieOptions(): CookieOptions {
    const production = this.config.get('NODE_ENV') === 'production';
    return {
      httpOnly: true,
      // Web and API live on different domains in production (Railway), so the
      // cookie must be cross-site there; localhost ports are same-site in dev.
      sameSite: production ? 'none' : 'lax',
      secure: production,
      maxAge: THIRTY_DAYS_MS,
      path: '/',
    };
  }

  @Post('otp/request')
  @HttpCode(204)
  async requestOtp(@Body() body: { phone: string }): Promise<void> {
    await this.authService.requestOtp(body?.phone ?? '');
  }

  @Post('otp/verify')
  async verifyOtp(
    @Body() body: { phone: string; code: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ coach: CoachSession }> {
    const { token, coach } = await this.authService.verifyOtp(body?.phone ?? '', body?.code ?? '');
    res.cookie(AUTH_COOKIE, token, this.cookieOptions());
    return { coach };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async me(@CurrentCoach() coachId: string): Promise<{ coach: CoachSession | null }> {
    const coach = await this.prisma.withCoach(coachId, (tx) =>
      tx.coach.findFirst({ where: { id: coachId, deletedAt: null } }),
    );
    return { coach: coach ? this.authService.toSession(coach) : null };
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(AUTH_COOKIE, { ...this.cookieOptions(), maxAge: undefined });
  }
}
