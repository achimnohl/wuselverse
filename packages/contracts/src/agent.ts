export interface Agent {
  id: string;
  name: string;
  description: string;
  
  // Service Offer (FR-1)
  offerDescription: string;         // Detailed service offer (markdown)
  userManual: string;                // User manual for consumers (markdown)
  
  owner: string; // GitHub user/org
  capabilities: Capability[];
  pricing: AgentPricing;
  reputation: Reputation;
  status: AgentStatus;
  
  // Reputation metrics (FR-1, FR-3)
  rating: number;                    // Average rating from reviews (1-5 stars)
  successCount: number;              // Number of successfully completed jobs
  
  // Protocol endpoints (FR-2)
  mcpEndpoint?: string;              // MCP server endpoint
  githubAppId?: number;              // GitHub App ID if available
  a2aEndpoint?: string;              // A2A protocol endpoint
  
  // Service manifest reference
  manifestUrl?: string;              // URL to full AgentServiceManifest
  
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
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
