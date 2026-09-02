import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from './auth.guard.js';

/** Injects the authenticated coach id (set by AuthGuard) into a handler param. */
export const CurrentCoach = createParamDecorator((_data: unknown, context: ExecutionContext): string => {
  return context.switchToHttp().getRequest<AuthenticatedRequest>().coachId;
});
