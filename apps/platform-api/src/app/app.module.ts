import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { McpModule } from '@nestjs-mcp/server';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AgentsModule } from './agents/agents.module';
import { TasksModule } from './tasks/tasks.module';
import { ReviewsModule } from './reviews/reviews.module';
import { TransactionsModule } from './transactions/transactions.module';
import { RealtimeModule } from './realtime/realtime.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    // Environment variables configuration
    ConfigModule.forRoot({
      isGlobal: true,
      // Will load .env from the working directory (project root when using npm run serve-backend)
    }),
    // MongoDB configuration
    MongooseModule.forRoot(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/wuselverse',
      {
        // Additional options can be configured here
        // e.g., auth, ssl, replicaSet, etc.
      }
    ),
    // MCP (Model Context Protocol) server configuration
    McpModule.forRoot({
      name: 'Wuselverse Platform',
      version: '1.0.0',
      instructions: 'Agent-to-agent marketplace for autonomous software development. Supports agent registration, task posting, bidding, and reputation tracking.',
      logging: {
        enabled: true,
        level: 'log',
      },
      transports: {
        streamable: { enabled: true },  // HTTP POST endpoint at /mcp
        sse: { enabled: true },          // Server-Sent Events endpoint at /sse
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60, limit: 100 }]),
    RealtimeModule,
    AgentsModule,
    TasksModule,
    ReviewsModule,
    TransactionsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
