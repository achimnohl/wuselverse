import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';

export const IS_ADMIN_ONLY_KEY = 'isAdminOnly';
export const AdminOnly = () => SetMetadata(IS_ADMIN_ONLY_KEY, true);

/**
 * Guard that validates requests against the PLATFORM_ADMIN_KEY environment
 * variable. Used exclusively for platform-operator endpoints such as manual
 * compliance review.
 *
 * Transport: `Authorization: Bearer <PLATFORM_ADMIN_KEY>`
 *
 * In development (no env var set) every request is denied to avoid accidental
 * open admin access. Set PLATFORM_ADMIN_KEY to a strong secret in production.
 */
@Injectable()
export class AdminKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const adminKey = process.env.PLATFORM_ADMIN_KEY;
    if (!adminKey) {
      throw new ForbiddenException(
        'Admin access is disabled: PLATFORM_ADMIN_KEY is not configured on this server'
      );
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'] as string | undefined;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Admin API key required. Use: Authorization: Bearer <admin-key>'
      );
    }

    const provided = authHeader.substring(7);
    if (provided !== adminKey) {
      throw new UnauthorizedException('Invalid admin key');
    }

    return true;
  }
}
