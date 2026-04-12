import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createHash } from 'crypto';
import { AgentApiKeyDocument } from '../agents/agent-api-key.schema';
import { AuthService } from './auth.service';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectModel('AgentApiKey')
    private readonly apiKeyModel: Model<AgentApiKeyDocument>,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'] as string | undefined;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'API key required. Use: Authorization: Bearer <api-key>'
      );
    }

    const rawKey = authHeader.substring(7);

    // Check if it's a user API key (starts with "wusu_") or agent API key (starts with "wusel_")
    if (rawKey.startsWith('wusu_')) {
      // User API key
      const user = await this.authService.validateUserApiKey(rawKey);
      if (!user) {
        throw new UnauthorizedException('Invalid, expired, or revoked user API key');
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

    // Agent API key (existing logic)
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    const apiKey = await this.apiKeyModel
      .findOne({ keyHash, revokedAt: null })
      .exec();
    if (!apiKey) {
      throw new UnauthorizedException('Invalid or revoked agent API key');
    }

    // Update lastUsedAt without blocking the request
    this.apiKeyModel
      .updateOne({ _id: apiKey._id }, { lastUsedAt: new Date() })
      .exec()
      .catch(() => null);

    request.principal = {
      type: 'agent',
      agentId: apiKey.agentId,
      owner: apiKey.owner,
    };
    return true;
  }
}
