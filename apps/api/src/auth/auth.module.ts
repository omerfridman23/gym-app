import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AUTH_TOKEN_TTL } from './auth.constants.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthRepository } from './auth.repository.js';
import { AuthService } from './auth.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { createSmsProvider } from './sms/create-sms-provider.js';
import { SMS_PROVIDER } from './sms/sms-provider.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: AUTH_TOKEN_TTL },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthRepository,
    AuthGuard,
    SettingsService,
    {
      provide: SMS_PROVIDER,
      inject: [ConfigService, SettingsService],
      useFactory: createSmsProvider,
    },
  ],
  // SMS_PROVIDER is exported so the reminders worker sends through the same
  // configured gateway (and the same fail-fast config check) as login.
  exports: [AuthService, AuthGuard, SMS_PROVIDER],
})
export class AuthModule {}
