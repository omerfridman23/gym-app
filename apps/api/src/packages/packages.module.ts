import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PackagesController } from './packages.controller.js';
import { PackagesService } from './packages.service.js';

@Module({
  imports: [AuthModule],
  controllers: [PackagesController],
  providers: [PackagesService],
})
export class PackagesModule {}
