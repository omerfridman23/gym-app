import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentCoach } from '../auth/current-coach.decorator.js';
import {
  PackagesService,
  type CreatePackageInput,
  type PackageWithRemaining,
} from './packages.service.js';

@Controller('packages')
@UseGuards(AuthGuard)
export class PackagesController {
  constructor(private readonly packagesService: PackagesService) {}

  @Get()
  async list(
    @CurrentCoach() coachId: string,
  ): Promise<{ packages: PackageWithRemaining[] }> {
    return { packages: await this.packagesService.list(coachId) };
  }

  @Post()
  async create(
    @CurrentCoach() coachId: string,
    @Body() body: CreatePackageInput,
  ): Promise<{ package: PackageWithRemaining }> {
    return {
      package: await this.packagesService.create(
        coachId,
        body ?? ({} as CreatePackageInput),
      ),
    };
  }
}
