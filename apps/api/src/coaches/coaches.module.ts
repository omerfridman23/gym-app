import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CoachesController } from './coaches.controller.js';
import { CoachesService } from './coaches.service.js';

@Module({
  imports: [AuthModule],
  controllers: [CoachesController],
  providers: [CoachesService],
})
export class CoachesModule {}
