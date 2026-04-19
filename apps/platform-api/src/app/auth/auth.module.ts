import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AgentsModule } from '../agents/agents.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserSchema } from './user.schema';
import { UserSessionSchema } from './user-session.schema';
import { UserApiKeySchema } from './user-api-key.schema';
import { ApiKeyGuard } from './api-key.guard';
import { SessionAuthGuard } from './session-auth.guard';
import { SessionCsrfGuard } from './session-csrf.guard';
import { AnyAuthGuard } from './any-auth.guard';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'User', schema: UserSchema },
      { name: 'UserSession', schema: UserSessionSchema },
      { name: 'UserApiKey', schema: UserApiKeySchema },
    ]),
    AgentsModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, ApiKeyGuard, SessionAuthGuard, SessionCsrfGuard, AnyAuthGuard],
  exports: [AuthService, ApiKeyGuard, SessionAuthGuard, SessionCsrfGuard, AnyAuthGuard, MongooseModule],
})
export class AuthModule {}
