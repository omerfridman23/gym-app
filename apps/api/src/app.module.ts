import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { CoachesModule } from './coaches/coaches.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env', '../../.env.local'],
    }),
    DatabaseModule,
    HealthModule,
    AuthModule,
    CoachesModule,
  ],
})
export class AppModule {}
