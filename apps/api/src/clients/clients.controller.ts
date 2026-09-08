import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentCoach } from '../auth/current-coach.decorator.js';
import type { Client } from '../generated/prisma/client.js';
import {
  ClientsService,
  type CreateClientInput,
  type UpdateClientInput,
} from './clients.service.js';

@Controller('clients')
@UseGuards(AuthGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  async list(@CurrentCoach() coachId: string): Promise<{ clients: Client[] }> {
    return { clients: await this.clientsService.list(coachId) };
  }

  @Post()
  async create(
    @CurrentCoach() coachId: string,
    @Body() body: CreateClientInput,
  ): Promise<{ client: Client }> {
    return {
      client: await this.clientsService.create(
        coachId,
        body ?? ({} as CreateClientInput),
      ),
    };
  }

  @Patch(':id')
  async update(
    @CurrentCoach() coachId: string,
    @Param('id') id: string,
    @Body() body: UpdateClientInput,
  ): Promise<{ client: Client }> {
    return {
      client: await this.clientsService.update(coachId, id, body ?? {}),
    };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentCoach() coachId: string,
    @Param('id') id: string,
  ): Promise<void> {
    await this.clientsService.softDelete(coachId, id);
  }
}
