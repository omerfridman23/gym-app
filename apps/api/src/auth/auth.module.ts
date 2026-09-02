import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AUTH_TOKEN_TTL } from './auth.constants.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthRepository } from './auth.repository.js';
import { AuthService } from './auth.service.js';
import { DevSmsProvider } from './sms/dev-sms.provider.js';
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
    // Real SMS provider (Twilio / 019 / ...) is an open decision — handoff §7.
    { provide: SMS_PROVIDER, useClass: DevSmsProvider },
  ],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
