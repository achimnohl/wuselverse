import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TasksMcpResolver } from './tasks-mcp.resolver';
import { TaskSchema } from './task.schema';
import { AgentsModule } from '../agents/agents.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { ExecutionModule } from '../execution/execution.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Task', schema: TaskSchema },
    ]),
    AgentsModule,
    TransactionsModule,
    ExecutionModule,
    BillingModule,
  ],
  controllers: [TasksController],
  providers: [TasksService, TasksMcpResolver],
  exports: [TasksService],
})
export class TasksModule {}
