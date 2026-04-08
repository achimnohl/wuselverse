/**
 * Example: How to use the CRUD Framework in platform-api
 * 
 * This example shows how to refactor the agents controller and service
 * to use the shared CRUD framework with Mongoose.
 */

// ============================================
// 1. Create Mongoose Schema (agent.schema.ts)
// ============================================

import { Schema, model, Document } from 'mongoose';
import { Agent } from '@wuselverse/contracts';

export interface AgentDocument extends Omit<Agent, 'id'>, Document {
  _id: string;
}

const CapabilitySchema = new Schema({
  skill: { type: String, required: true },
  description: { type: String, required: true },
  inputs: [
    {
      name: String,
      type: String,
      required: Boolean,
      description: String
    }
  ],
  outputs: [
    {
      name: String,
      type: String,
      description: String
    }
  ],
  estimatedDuration: Number,
  successRate: Number
});

const AgentSchema = new Schema(
  {
    name: { type: String, required: true, index: true },
    description: { type: String, required: true },
    offerDescription: { type: String, required: true },
    userManual: { type: String, required: true },
    owner: { type: String, required: true, index: true },
    capabilities: [CapabilitySchema],
    pricing: {
      type: { type: String, enum: ['fixed', 'hourly', 'outcome-based'], required: true },
      amount: { type: Number, required: true },
      currency: { type: String, required: true },
      outcomes: [
        {
          outcome: String,
          multiplier: Number
        }
      ]
    },
    reputation: {
      score: { type: Number, default: 0, min: 0, max: 100 },
      totalJobs: { type: Number, default: 0 },
      successfulJobs: { type: Number, default: 0 },
      failedJobs: { type: Number, default: 0 },
      averageResponseTime: { type: Number, default: 0 },
      reviews: [Schema.Types.Mixed]
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended', 'busy'],
      default: 'active'
    },
    rating: { type: Number, default: 0, min: 1, max: 5 },
    successCount: { type: Number, default: 0 },
    mcpEndpoint: String,
    githubAppId: Number,
    a2aEndpoint: String,
    manifestUrl: String,
    metadata: Schema.Types.Mixed
  },
  { timestamps: true }
);

export const AgentModel = model<AgentDocument>('Agent', AgentSchema);

// =============================================
// 2. Update AgentsService (agents.service.ts)
// =============================================

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseMongoService } from '@wuselverse/crud-framework';
import { AgentDocument } from './agent.schema';

@Injectable()
export class AgentsService extends BaseMongoService<AgentDocument> {
  constructor(
    @InjectModel('Agent') private agentModel: Model<AgentDocument>
  ) {
    super(agentModel);
  }

  // Keep existing custom methods
  async findByCapability(capability: string, minReputation?: number) {
    const filter: any = {
      'capabilities.skill': capability
    };

    if (minReputation !== undefined) {
      filter['reputation.score'] = { $gte: minReputation };
    }

    return this.findAll(filter);
  }
}

// ==============================================
// 3. Update AgentsController (agents.controller.ts)
// ==============================================

import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery } from '@nestjs/swagger';
import { createCRUDController } from '@wuselverse/crud-framework';
import { AgentsService } from './agents.service';
import { RegisterAgentDto } from './dto';

// Use UpdateAgentDto or create a separate DTO for updates
class UpdateAgentDto {
  // Define updateable fields
}

const AgentsCRUDBase = createCRUDController({
  resourceName: 'agents',
  createDto: RegisterAgentDto,
  updateDto: UpdateAgentDto,
  entityName: 'Agent'
});

@Controller('agents')
export class AgentsController extends AgentsCRUDBase {
  constructor(private readonly agentsService: AgentsService) {
    super(agentsService);
  }

  // Add custom endpoint - existing capability search
  @Get('search')
  @ApiOperation({ 
    summary: 'Search agents by capability', 
    description: 'Find agents with specific capability and minimum reputation' 
  })
  @ApiQuery({ name: 'capability', description: 'Capability to search for', required: true })
  @ApiQuery({ name: 'minReputation', description: 'Minimum reputation (0-100)', required: false })
  async searchByCapability(
    @Query('capability') capability: string,
    @Query('minReputation') minReputation?: number
  ) {
    return this.agentsService.findByCapability(capability, minReputation);
  }
}

// ====================================
// 4. Update AgentsModule (agents.module.ts)
// ====================================

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import { AgentSchema } from './agent.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'Agent', schema: AgentSchema }])
  ],
  controllers: [AgentsController],
  providers: [AgentsService],
  exports: [AgentsService]
})
export class AgentsModule {}

// ====================================
// 5. Update AppModule to configure MongoDB
// ====================================

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AgentsModule } from './agents/agents.module';
import { TasksModule } from './tasks/tasks.module';

@Module({
  imports: [
    // Configure MongoDB connection
    MongooseModule.forRoot(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/wuselverse',
      {
        // Connection options
      }
    ),
    AgentsModule,
    TasksModule
  ],
})
export class AppModule {}

// ====================================
// Generated API Endpoints
// ====================================

/*
Standard CRUD endpoints (automatically generated):
- POST   /api/agents          - Create new agent
- GET    /api/agents          - List all agents (with pagination: ?page=1&limit=10)
- GET    /api/agents/:id      - Get agent by ID
- PUT    /api/agents/:id      - Update agent
- DELETE /api/agents/:id      - Delete agent

Custom endpoints (manually added):
- GET    /api/agents/search   - Search by capability
*/
