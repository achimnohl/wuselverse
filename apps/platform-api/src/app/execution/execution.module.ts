import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ExecutionSessionsController } from './execution-sessions.controller';
import { ExecutionSessionsService } from './execution-sessions.service';
import { ExecutionSessionSchema } from './execution-session.schema';
import { ExecutionHandshakeSchema } from './execution-handshake.schema';
import { TaskSchema } from '../tasks/task.schema';
import { AgentSchema } from '../agents/agent.schema';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: 'ExecutionSession', schema: ExecutionSessionSchema },
      { name: 'ExecutionHandshake', schema: ExecutionHandshakeSchema },
      { name: 'Task', schema: TaskSchema },
      { name: 'Agent', schema: AgentSchema },
    ]),
  ],
  controllers: [ExecutionSessionsController],
  providers: [ExecutionSessionsService],
  exports: [ExecutionSessionsService],
})
export class ExecutionModule {}
