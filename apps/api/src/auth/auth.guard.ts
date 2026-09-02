import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AUTH_COOKIE } from './auth.constants.js';
import { AuthService } from './auth.service.js';

export interface AuthenticatedRequest extends Request {
  coachId: string;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.cookies?.[AUTH_COOKIE];
    if (!token) throw new UnauthorizedException();

    request.coachId = await this.authService.verifyToken(token);
    return true;
  }
}
