import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './api-key.guard';
import { AuthService } from './auth.service';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const sessionToken = this.authService.getSessionTokenFromRequest(request);

    if (!sessionToken) {
      throw new UnauthorizedException('User session required. Please sign in first.');
    }

    const user = await this.authService.validateSession(sessionToken);
    if (!user) {
      throw new UnauthorizedException('Session is invalid or has expired. Please sign in again.');
    }

    request.user = user;
    request.principal = {
      type: 'user',
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      roles: user.roles,
    };

    return true;
  }
}
