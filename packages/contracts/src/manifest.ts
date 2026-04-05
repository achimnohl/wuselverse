/**
 * Agent Service Manifest Types
 * Specification version: 1.0
 * 
 * Standard format for agents to advertise their capabilities, pricing, 
 * documentation, and protocol integrations across MCP, GitHub Apps, and A2A.
 */

// ============================================================================
// Core Manifest
// ============================================================================

export interface AgentServiceManifest {
  manifestVersion: string;
  id: string;
  name: string;
  version: string;
  
  offer: ServiceOffer;
  capabilities: CapabilityDescriptor[];
  pricing: PricingDescriptor;
  documentation: ServiceDocumentation;
  protocols: ProtocolBindings;
  
  reputation?: ReputationData;
  sla?: ServiceLevelAgreements;
  extensions?: Record<string, unknown>;
}

// ============================================================================
// Service Offer
// ============================================================================

export interface ServiceOffer {
  summary: string;
  description: string;
  category: ServiceCategory;
  tags: string[];
  languages?: string[];
  useCases?: UseCase[];
  targetAudience?: string[];
  alternatives?: string[];
}

export enum ServiceCategory {
  CODE_GENERATION = 'code-generation',
  CODE_REVIEW = 'code-review',
  SECURITY = 'security',
  TESTING = 'testing',
  DOCUMENTATION = 'documentation',
  DEPLOYMENT = 'deployment',
  MONITORING = 'monitoring',
  ISSUE_RESOLUTION = 'issue-resolution',
  REPOSITORY_MAINTENANCE = 'repository-maintenance',
  TASK_ORCHESTRATION = 'task-orchestration',
  CUSTOM = 'custom'
}

export interface UseCase {
  title: string;
  description: string;
  example?: string;
}

// ============================================================================
// Capability Descriptors
// ============================================================================

export interface CapabilityDescriptor {
  id: string;
  name: string;
  description: string;
  schema: CapabilitySchema;
  metrics?: CapabilityMetrics;
  
  // Protocol-specific mappings
  mcpTool?: string;
  githubAction?: GitHubActionRef;
  a2aMethod?: string;
  
  requires?: string[];
  rateLimit?: RateLimit;
  quota?: Quota;
}

export interface CapabilitySchema {
  input: JSONSchema | MCPToolInput;
  output: JSONSchema | MCPToolOutput;
  errors?: ErrorSchema[];
}

export interface CapabilityMetrics {
  averageDuration?: number;
  successRate?: number;
  throughput?: number;
  lastUpdated?: string;
}

export interface RateLimit {
  requests: number;
  window: number;
  scope: 'per-user' | 'global';
}

export interface Quota {
  limit: number;
  period: 'hourly' | 'daily' | 'monthly';
  resetStrategy: 'fixed' | 'sliding';
}

export interface GitHubActionRef {
  owner: string;
  repo: string;
  version: string;
}

// ============================================================================
// Pricing
// ============================================================================

export interface PricingDescriptor {
  model: PricingModel;
  tiers?: PricingTier[];
  currency: string;
  outcomes?: OutcomePrice[];
  freeTier?: FreeTierDescriptor;
  trial?: TrialDescriptor;
}

export enum PricingModel {
  FREE = 'free',
  FIXED = 'fixed',
  HOURLY = 'hourly',
  USAGE = 'usage',
  OUTCOME = 'outcome',
  TIERED = 'tiered',
  HYBRID = 'hybrid'
}

export interface PricingTier {
  name: string;
  minVolume: number;
  maxVolume?: number;
  pricePerUnit: number;
}

export interface OutcomePrice {
  outcome: string;
  multiplier: number;
  condition?: string;
}

export interface FreeTierDescriptor {
  quota: number;
  period: 'daily' | 'monthly' | 'lifetime';
  limitations?: string[];
}

export interface TrialDescriptor {
  duration: number;
  quota: number;
  limitations?: string[];
}

// ============================================================================
// Documentation
// ============================================================================

export interface ServiceDocumentation {
  userManual: DocumentSource;
  apiReference?: DocumentSource;
  examples?: CodeExample[];
  faq?: FAQEntry[];
  support?: SupportChannels;
  changelog?: DocumentSource;
}

export interface DocumentSource {
  format: 'markdown' | 'html' | 'plaintext' | 'url';
  content?: string;
  url?: string;
  mcpResource?: string;
  githubRepo?: GitHubRepoRef;
}

export interface CodeExample {
  title: string;
  description?: string;
  language: string;
  code: string;
  runnable?: boolean;
  setupInstructions?: string;
}

export interface FAQEntry {
  question: string;
  answer: string;
  category?: string;
}

export interface SupportChannels {
  email?: string;
  github?: string;
  discord?: string;
  slack?: string;
  documentation?: string;
  other?: Record<string, string>;
}

export interface GitHubRepoRef {
  owner: string;
  repo: string;
  path?: string;
  ref?: string;
}

// ============================================================================
// Protocol Bindings
// ============================================================================

export interface ProtocolBindings {
  mcp?: MCPBinding;
  githubApp?: GitHubAppBinding;
  a2a?: A2ABinding;
  custom?: Record<string, unknown>;
}

// MCP Protocol Binding
export interface MCPBinding {
  serverUrl: string;
  protocol: 'stdio' | 'http' | 'https';
  tools?: MCPToolDefinition[];
  resources?: MCPResourceDefinition[];
  prompts?: MCPPromptDefinition[];
  auth?: MCPAuthConfig;
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: JSONSchema;
}

export interface MCPResourceDefinition {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPPromptDefinition {
  name: string;
  description?: string;
  arguments?: MCPPromptArgument[];
}

export interface MCPPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface MCPAuthConfig {
  type: 'bearer' | 'api-key' | 'oauth2' | 'none';
  endpoint?: string;
  credentials?: string;
}

// GitHub App Binding
export interface GitHubAppBinding {
  appId: number;
  slug: string;
  permissions: GitHubAppPermissions;
  events?: string[];
  installationUrl: string;
  homepage?: string;
  repositoryUrl?: string;
}

export interface GitHubAppPermissions {
  contents?: 'read' | 'write';
  issues?: 'read' | 'write';
  pull_requests?: 'read' | 'write';
  metadata?: 'read';
  security_events?: 'read' | 'write';
  [key: string]: 'read' | 'write' | undefined;
}

// A2A Protocol Binding
export interface A2ABinding {
  endpoint: string;
  version: string;
  methods?: A2AMethodDefinition[];
  auth?: A2AAuthConfig;
}

export interface A2AMethodDefinition {
  name: string;
  description: string;
  parameters: JSONSchema;
  returns: JSONSchema;
}

export interface A2AAuthConfig {
  type: 'jwt' | 'api-key' | 'mutual-tls';
  endpoint?: string;
}

// ============================================================================
// Reputation Data
// ============================================================================

export interface ReputationData {
  score: number;
  rating: number;
  totalJobs: number;
  successfulJobs: number;
  failedJobs: number;
  successRate: number;
  averageResponseTime: number;
  uptimePercentage: number;
  verifiedOwner: boolean;
  verifiedCapabilities: boolean;
  testimonials?: Testimonial[];
  lastJobCompleted?: string;
  serviceStartDate: string;
  externalRatings?: ExternalRating[];
}

export interface Testimonial {
  from: string;
  rating: number;
  comment: string;
  taskId?: string;
  timestamp: string;
  verified: boolean;
}

export interface ExternalRating {
  platform: string;
  url: string;
  score: number;
  maxScore: number;
  lastUpdated: string;
}

// ============================================================================
// Service Level Agreements
// ============================================================================

export interface ServiceLevelAgreements {
  availability: number;
  responseTime: number;
  throughput?: number;
  support: SupportLevel;
  dataRetention?: number;
  backupFrequency?: string;
  penalties?: SLAPenalty[];
  terms?: string;
}

export enum SupportLevel {
  COMMUNITY = 'community',
  BUSINESS_HOURS = 'business-hours',
  ALWAYS_ON = '24x7'
}

export interface SLAPenalty {
  condition: string;
  remedy: string;
}

// ============================================================================
// Supporting Types
// ============================================================================

export interface JSONSchema {
  type?: string;
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  required?: string[];
  enum?: unknown[];
  description?: string;
  [key: string]: unknown;
}

export interface MCPToolInput {
  type: 'object';
  properties: Record<string, JSONSchema>;
  required?: string[];
}

export interface MCPToolOutput {
  type: 'object';
  properties: Record<string, JSONSchema>;
}

export interface ErrorSchema {
  code: string;
  message: string;
  description?: string;
}
