export interface Agent {
  id: string;
  name: string;
  slug?: string;
  description: string;
  
  // Service Offer (FR-1)
  offerDescription: string;         // Detailed service offer (markdown)
  userManual: string;                // User manual for consumers (markdown)
  
  owner: string; // GitHub user/org
  billingAccountId?: string; // Billing account for payments/earnings
  capabilities: Capability[];
  pricing: AgentPricing;
  reputation: Reputation;
  status: AgentStatus;
  
  // Reputation metrics (FR-1, FR-3)
  rating: number | null;             // Average rating from reviews (1-5 stars)
  successCount: number;              // Number of successfully completed jobs
  
  // Protocol endpoints (FR-2)
  mcpEndpoint?: string;              // MCP server endpoint
  githubAppId?: number;              // GitHub App ID if available
  a2aEndpoint?: string;              // A2A protocol endpoint

  // Optional off-platform execution auth requirements
  executionAuth?: AgentExecutionAuth;

  // Claude Managed Agents runtime (optional — set when the agent is hosted on Anthropic's managed infrastructure)
  claudeManaged?: AgentClaudeManagedRuntime;

  // Generic chat endpoint runtime (optional — set when the agent exposes an OpenAI-compatible chat API)
  chatEndpoint?: AgentChatEndpointRuntime;

  // Auto-bidding configuration (optional — enables platform-managed bidding)
  autoBidding?: AgentAutoBiddingConfig;

  // Service manifest reference
  manifestUrl?: string;              // URL to full AgentServiceManifest
  
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export type AgentExecutionAuthMode = 'none' | 'platform_token' | 'external_oauth' | 'mtls';

export interface AgentExecutionAuth {
  required: boolean;
  mode: AgentExecutionAuthMode;
  requiredScopes?: string[];
  tokenTtlSeconds?: number;
  dpopRequired?: boolean;
  discoveryUrl?: string;
}

export interface AgentClaudeManagedRuntime {
  /** Anthropic Managed Agents agent ID (e.g. ant_agent_...) */
  agentId: string;
  /** Anthropic environment ID to provision the session in */
  environmentId: string;
  /** Optional Anthropic model override (e.g. claude-opus-4-7) */
  anthropicModel?: string;
  /** Permission policy for CMA tool calls */
  permissionPolicy?: 'always_allow' | 'always_ask';
  /** Anthropic pre-built or custom skill IDs (max 20 per session) */
  skillIds?: string[];
}

/**
 * Chat endpoint runtime configuration for agents exposing OpenAI-compatible APIs.
 * Supports OpenAI, Ollama, LM Studio, and custom chat endpoints.
 */
export interface AgentChatEndpointRuntime {
  /** Chat completion endpoint URL (OpenAI-compatible format) */
  url: string;
  /** Authentication method */
  authType: 'bearer' | 'api-key' | 'none';
  /** Encrypted credentials (API key or bearer token) */
  credentialsEncrypted?: string;
  /** Model identifier to send in request (e.g., 'gpt-4', 'llama-3.1-70b') */
  model?: string;
  /** Optional system prompt override */
  systemPrompt?: string;
  /** Optional request parameters (temperature, max_tokens, etc.) */
  parameters?: Record<string, unknown>;
  /** Custom headers to send with requests */
  customHeaders?: Record<string, string>;
}

/**
 * Auto-bidding configuration for platform-managed bidding.
 * When enabled, the platform automatically submits bids on behalf of the agent
 * when tasks with matching capabilities are posted.
 * 
 * Default behavior:
 * - CMA agents: Auto-bidding enabled by default
 * - MCP/A2A/ChatEndpoint agents: Opt-in (disabled by default)
 */
export interface AgentAutoBiddingConfig {
  /** Enable platform-managed auto-bidding */
  enabled: boolean;
  /** Capabilities that trigger auto-bids (subset of agent.capabilities) */
  matchCapabilities: string[];
  /** Optional budget constraints for auto-bidding */
  minBudget?: number;
  maxBudget?: number;
  /** Optional pricing override for auto-bids (uses agent.pricing if not set) */
  bidPricing?: AgentPricing;
}

export interface Capability {
  skill: string;
  description: string;
  inputs: CapabilityInput[];
  outputs: CapabilityOutput[];
  estimatedDuration?: number; // milliseconds
  successRate?: number; // 0-1
}

export interface CapabilityInput {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  description: string;
}

export interface CapabilityOutput {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
}

export enum AgentStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  BUSY = 'busy',
  PENDING = 'pending',
  REJECTED = 'rejected'
}

/**
 * Simple pricing model for Agent entity.
 * For comprehensive pricing with tiers, free trials, and SLA,
 * see PricingDescriptor in manifest.ts
 */
export interface AgentPricing {
  type: 'fixed' | 'hourly' | 'outcome-based';
  amount: number;
  currency: string;
  outcomes?: OutcomePricing[];
}

export interface OutcomePricing {
  outcome: string;
  multiplier: number; // e.g., 1.5x for success, 0x for failure
}

export interface Reputation {
  score: number; // 0-100 aggregate score
  totalJobs: number;
  successfulJobs: number;
  failedJobs: number;
  averageResponseTime: number; // milliseconds
  uptimePercentage?: number; // 0-100
  reviews: Review[];
  verifiedOwner?: boolean;
  verifiedCapabilities?: boolean;
}

export interface Review {
  id: string;                        // Unique review ID
  from: string;                      // Agent ID who hired
  to: string;                        // Agent ID who delivered work
  taskId: string;                    // Associated task
  rating: number;                    // 1-5 stars
  comment?: string;                  // Optional written review
  timestamp: Date;
  verified: boolean;                 // Only agents who hired can review (FR-3)
}
