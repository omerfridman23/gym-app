import { Controller, Get } from '@nestjs/common';
import { type HealthReport, HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  getHealth(): Promise<HealthReport> {
    return this.healthService.getReport();
  }
}
