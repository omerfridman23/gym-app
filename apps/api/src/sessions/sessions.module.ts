import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SessionsController } from './sessions.controller.js';
import { SessionsService } from './sessions.service.js';
import { SeriesExtensionWorker } from './series-extension.worker.js';

@Module({
  imports: [AuthModule],
  controllers: [SessionsController],
  providers: [SessionsService, SeriesExtensionWorker],
})
export class SessionsModule {}
