import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { ClientsModule } from './clients/clients.module.js';
import { CoachesModule } from './coaches/coaches.module.js';
import { validateEnv } from './config/required-env.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { PackagesModule } from './packages/packages.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { PublicModule } from './public/public.module.js';
import { RemindersModule } from './reminders/reminders.module.js';
import { SessionsModule } from './sessions/sessions.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env', '../../.env.local'],
      // Names every missing variable at once, before the modules that would
      // otherwise die one `getOrThrow` at a time with no usable message.
      validate: validateEnv,
    }),
    DatabaseModule,
    HealthModule,
    AuthModule,
    CoachesModule,
    ClientsModule,
    SessionsModule,
    PaymentsModule,
    PackagesModule,
    PublicModule,
    RemindersModule,
  ],
})
export class AppModule {}
