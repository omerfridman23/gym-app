import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RemindersController } from './reminders.controller.js';
import { RemindersService } from './reminders.service.js';
import { RemindersWorker } from './reminders.worker.js';

@Module({
  imports: [AuthModule],
  controllers: [RemindersController],
  providers: [RemindersService, RemindersWorker],
})
export class RemindersModule {}
