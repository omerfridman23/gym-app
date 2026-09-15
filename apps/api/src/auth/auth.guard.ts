import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AUTH_COOKIE } from './auth.constants.js';
import { AuthService } from './auth.service.js';

export interface AuthenticatedRequest extends Request {
  coachId: string;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  /**
   * Browsers send the httpOnly session cookie. The native iOS build cannot —
   * WKWebView runs on capacitor://localhost, so a SameSite=Lax cookie scoped to
   * the API origin is never attached — so it sends the same JWT as a bearer token.
   */
  private extractToken(request: AuthenticatedRequest): string | undefined {
    const header = request.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      const bearer = header.slice('Bearer '.length).trim();
      if (bearer) return bearer;
    }
    return request.cookies?.[AUTH_COOKIE];
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException();

    request.coachId = await this.authService.verifyToken(token);
    return true;
  }
}
