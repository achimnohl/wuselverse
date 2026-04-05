import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createHash } from 'crypto';
import { AgentApiKeyDocument } from '../agents/agent-api-key.schema';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectModel('AgentApiKey')
    private readonly apiKeyModel: Model<AgentApiKeyDocument>
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
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    const apiKey = await this.apiKeyModel
      .findOne({ keyHash, revokedAt: null })
      .exec();
    if (!apiKey) {
      throw new UnauthorizedException('Invalid or revoked API key');
    }

    // Update lastUsedAt without blocking the request
    this.apiKeyModel
      .updateOne({ _id: apiKey._id }, { lastUsedAt: new Date() })
      .exec()
      .catch(() => null);

    request.principal = { agentId: apiKey.agentId, owner: apiKey.owner };
    return true;
  }
}
