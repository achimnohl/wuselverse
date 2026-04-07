import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class SessionCsrfGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const method = String(request?.method || 'GET').toUpperCase();

    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return true;
    }

    const csrfEnabled = (process.env.ENABLE_SESSION_CSRF ?? 'true').toLowerCase() !== 'false';
    if (!csrfEnabled) {
      return true;
    }

    const sessionToken = this.authService.getSessionTokenFromRequest(request);
    if (!sessionToken) {
      return true;
    }

    const cookieToken = this.authService.getCsrfTokenFromRequest(request);
    const headerToken = this.authService.getCsrfHeaderFromRequest(request);

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      throw new ForbiddenException('CSRF token missing or invalid. Refresh and try again.');
    }

    return true;
  }
}
