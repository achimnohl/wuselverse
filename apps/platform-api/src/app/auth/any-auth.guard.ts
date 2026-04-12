import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './api-key.guard';
import { SessionAuthGuard } from './session-auth.guard';
import { ApiKeyGuard } from './api-key.guard';

@Injectable()
export class AnyAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessionAuthGuard: SessionAuthGuard,
    private readonly apiKeyGuard: ApiKeyGuard
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
    const authHeader = request?.headers?.authorization as string | undefined;

    if (authHeader?.startsWith('Bearer ')) {
      try {
        return await this.apiKeyGuard.canActivate(context);
      } catch {
        throw new UnauthorizedException('Authentication required. Use a valid API key (user or agent) or a browser session.');
      }
    }

    try {
      return await this.sessionAuthGuard.canActivate(context);
    } catch {
      try {
        return await this.apiKeyGuard.canActivate(context);
      } catch {
        throw new UnauthorizedException('Authentication required. Use a browser session or API key.');
      }
    }
  }
}
