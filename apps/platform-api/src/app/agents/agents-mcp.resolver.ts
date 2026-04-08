import { Resolver, Tool } from '@nestjs-mcp/server';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { z } from 'zod';
import { AgentsService } from './agents.service';
import { RegisterAgentDto } from './dto/register-agent.dto';
import { RequestHandlerExtra } from '@nestjs-mcp/server';
import { Logger } from '@nestjs/common';

// Zod schemas for tool parameters
const RegisterAgentParams = z.object({
  name: z.string().min(1).max(255).describe('Agent display name'),
  description: z.string().min(1).describe('Agent description'),
  offer: z.string().optional().describe('Service offer description'),
  userManual: z.string().optional().describe('Markdown user manual'),
  owner: z.string().min(1).describe('GitHub user or organization'),
  capabilities: z.array(z.object({
    skill: z.string().describe('Capability skill name'),
    level: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).describe('Skill level'),
    tags: z.array(z.string()).optional().describe('Skill tags')
  })).min(1).describe('Agent capabilities'),
  pricing: z.object({
    model: z.enum(['fixed', 'hourly', 'usage', 'outcome']).describe('Pricing model type'),
    amount: z.number().positive().describe('Price amount'),
    currency: z.string().default('USD').describe('Currency code')
  }).describe('Pricing configuration'),
  mcpEndpoint: z.string().url().optional().describe('MCP server endpoint URL'),
  githubApp: z.object({
    appId: z.string(),
    installationId: z.string()
  }).optional().describe('GitHub App configuration')
});

const SearchAgentsParams = z.object({
  capability: z.string().optional().describe('Filter by capability skill'),
  minReputation: z.number().min(0).max(100).optional().describe('Minimum reputation score'),
  status: z.enum(['active', 'inactive', 'busy']).optional().describe('Agent status filter'),
  limit: z.number().int().positive().max(100).default(10).describe('Maximum results to return')
});

const GetAgentParams = z.object({
  agentId: z.string().min(1).describe('Agent unique identifier')
});

const UpdateAgentStatusParams = z.object({
  agentId: z.string().min(1).describe('Agent unique identifier'),
  status: z.enum(['active', 'inactive', 'busy']).describe('New agent status'),
  apiKey: z.string().optional().describe('Agent API key for ownership verification'),
});

/**
 * MCP Resolver for Agent operations
 * Exposes agent registration, search, and management via Model Context Protocol
 */
@Resolver('agents')
export class AgentsMcpResolver {
  private readonly logger = new Logger(AgentsMcpResolver.name);

  constructor(private readonly agentsService: AgentsService) {}

  /**
   * Register a new agent in the marketplace
   * Allows agents to advertise their capabilities, pricing, and service offers
   */
  @Tool({
    name: 'register_agent',
    description: 'Register a new agent in the Wuselverse marketplace with capabilities, pricing, and service details',
    paramsSchema: RegisterAgentParams.shape,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false
    }
  })
  async registerAgent(
    params: z.infer<typeof RegisterAgentParams>,
    extra: RequestHandlerExtra
  ): Promise<CallToolResult> {
    try {
      this.logger.log(`MCP: Registering agent: ${params.name}`, { sessionId: extra.sessionId });

      // Create the agent DTO with proper structure
      const registerAgentDto: RegisterAgentDto = {
        name: params.name,
        description: params.description,
        // Map simplified capabilities to just skill names
        capabilities: params.capabilities.map(cap => cap.skill),
        mcpEndpoint: params.mcpEndpoint,
      };

      // Register the agent using the service
      const response = await this.agentsService.create(registerAgentDto as any);
      
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to create agent');
      }

      const agent = response.data;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Agent registered successfully',
              agent: {
                id: agent._id,
                name: agent.name,
                owner: agent.owner,
                capabilities: agent.capabilities.map((c: any) => c.skill),
                pricing: agent.pricing,
                status: agent.status,
                mcpEndpoint: agent.mcpEndpoint
              }
            }, null, 2)
          }
        ]
      };
    } catch (error: any) {
      console.error(`[MCP] Error registering agent:`, error);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error.message || 'Failed to register agent'
            }, null, 2)
          }
        ],
        isError: true
      };
    }
  }

  /**
   * Search for agents by capability, reputation, or status
   * Enables agent discovery for task delegation
   */
  @Tool({
    name: 'search_agents',
    description: 'Search for agents in the marketplace by capability, reputation score, or availability status',
    paramsSchema: SearchAgentsParams.shape,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true
    }
  })
  async searchAgents(
    params: z.infer<typeof SearchAgentsParams>,
    extra: RequestHandlerExtra
  ): Promise<CallToolResult> {
    try {
      this.logger.debug('MCP: Searching agents', { params, sessionId: extra.sessionId });

      let agentsData: any[] = [];

      // Search by capability if provided
      if (params.capability) {
        const result = await this.agentsService.findByCapability(
          params.capability,
          params.minReputation
        );
        agentsData = Array.isArray(result) ? result : [];
      } else {
        // General search with filters
        const filter: any = {};
        if (params.status) {
          filter.status = params.status;
        }
        if (params.minReputation !== undefined) {
          filter['reputation.score'] = { $gte: params.minReputation };
        }
        
        const result = await this.agentsService.findAll(filter, {
          limit: params.limit,
          sort: { rating: -1, 'reputation.score': -1 }
        });
        agentsData = result.success && result.data ? result.data.data : [];
      }

      // Format response
      const formattedAgents = agentsData.map((agent: any) => ({
        id: agent._id,
        name: agent.name,
        description: agent.description,
        owner: agent.owner,
        capabilities: agent.capabilities.map((c: any) => c.skill),
        pricing: agent.pricing,
        reputation: agent.reputation.score,
        rating: agent.rating,
        successCount: agent.successCount,
        totalJobs: agent.reputation.totalJobs,
        status: agent.status,
        mcpEndpoint: agent.mcpEndpoint
      }));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              count: formattedAgents.length,
              agents: formattedAgents
            }, null, 2)
          }
        ]
      };
    } catch (error: any) {
      console.error(`[MCP] Error searching agents:`, error);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error.message || 'Failed to search agents'
            }, null, 2)
          }
        ],
        isError: true
      };
    }
  }

  /**
   * Get detailed information about a specific agent
   */
  @Tool({
    name: 'get_agent',
    description: 'Retrieve detailed information about a specific agent by ID including capabilities, pricing, reputation, and user manual',
    paramsSchema: GetAgentParams.shape,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true
    }
  })
  async getAgent(
    params: z.infer<typeof GetAgentParams>,
    extra: RequestHandlerExtra
  ): Promise<CallToolResult> {
    try {
      this.logger.debug(`MCP: Getting agent: ${params.agentId}`, { sessionId: extra.sessionId });

      const response = await this.agentsService.findById(params.agentId);
      
      if (!response.success || !response.data) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: response.error || 'Agent not found'
              }, null, 2)
            }
          ],
          isError: true
        };
      }

      const agent = response.data;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              agent: {
                id: agent._id,
                name: agent.name,
                description: agent.description,
                offerDescription: agent.offerDescription,
                userManual: agent.userManual,
                owner: agent.owner,
                capabilities: agent.capabilities,
                pricing: agent.pricing,
                reputation: agent.reputation,
                rating: agent.rating,
                successCount: agent.successCount,
                totalJobs: agent.reputation.totalJobs,
                status: agent.status,
                mcpEndpoint: agent.mcpEndpoint,
                githubAppId: agent.githubAppId,
                createdAt: agent.createdAt,
                updatedAt: agent.updatedAt
              }
            }, null, 2)
          }
        ]
      };
    } catch (error: any) {
      console.error(`[MCP] Error getting agent:`, error);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error.message || 'Failed to get agent'
            }, null, 2)
          }
        ],
        isError: true
      };
    }
  }

  /**
   * Update agent availability status
   */
  @Tool({
    name: 'update_agent_status',
    description: 'Update the availability status of an agent (active, inactive, busy)',
    paramsSchema: UpdateAgentStatusParams.shape,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true
    }
  })
  async updateAgentStatus(
    params: z.infer<typeof UpdateAgentStatusParams>,
    extra: RequestHandlerExtra
  ): Promise<CallToolResult> {
    try {
      this.logger.log(`MCP: Updating agent status: ${params.agentId} -> ${params.status}`, { sessionId: extra.sessionId });

      // Verify ownership if apiKey is provided
      if (params.apiKey) {
        const principal = await this.agentsService.validateApiKey(params.apiKey);
        if (!principal) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Invalid or revoked API key' }, null, 2) }],
            isError: true,
          };
        }
        const agentResponse = await this.agentsService.findById(params.agentId);
        if (!agentResponse.success || !agentResponse.data) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Agent not found' }, null, 2) }],
            isError: true,
          };
        }
        if (agentResponse.data.owner !== principal.owner) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Forbidden: you do not own this agent' }, null, 2) }],
            isError: true,
          };
        }
      } else {
        console.warn(`[MCP] update_agent_status called without apiKey (session: ${extra.sessionId}) — ownership not verified`);
      }

      const response = await this.agentsService.updateById(params.agentId, {
        status: params.status
      });

      if (!response.success || !response.data) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: response.error || 'Agent not found'
              }, null, 2)
            }
          ],
          isError: true
        };
      }

      const agent = response.data;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Agent status updated successfully',
              agent: {
                id: agent._id,
                name: agent.name,
                status: agent.status
              }
            }, null, 2)
          }
        ]
      };
    } catch (error: any) {
      console.error(`[MCP] Error updating agent status:`, error);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error.message || 'Failed to update agent status'
            }, null, 2)
          }
        ],
        isError: true
      };
    }
  }
}
