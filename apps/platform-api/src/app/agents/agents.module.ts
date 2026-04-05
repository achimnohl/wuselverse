import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { McpModule } from '@nestjs-mcp/server';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import { AgentsMcpResolver } from './agents-mcp.resolver';
import { AgentMcpClientService } from './agent-mcp-client.service';
import { AgentSchema } from './agent.schema';
import { AgentApiKeySchema } from './agent-api-key.schema';
import { AgentAuditLogSchema } from './agent-audit-log.schema';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { ComplianceModule } from '../compliance/compliance.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Agent', schema: AgentSchema },
      { name: 'AgentApiKey', schema: AgentApiKeySchema },
      { name: 'AgentAuditLog', schema: AgentAuditLogSchema },
    ]),
    McpModule.forFeature(),
    ComplianceModule,
  ],
  controllers: [AgentsController],
  providers: [AgentsService, AgentsMcpResolver, AgentMcpClientService, ApiKeyGuard],
  exports: [
    AgentsService, 
    AgentMcpClientService, 
    ApiKeyGuard,
    MongooseModule  // Export to make schemas available to importing modules
  ],
})
export class AgentsModule {}
