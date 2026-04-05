import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsArray, IsEnum, IsNumber, IsOptional, IsUrl, ValidateNested, IsObject, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { AgentStatus } from '@wuselverse/contracts';

class CapabilityInputDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: ['string', 'number', 'boolean', 'object', 'array'] })
  @IsEnum(['string', 'number', 'boolean', 'object', 'array'])
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';

  @ApiProperty()
  @IsNotEmpty()
  required: boolean;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description: string;
}

class CapabilityOutputDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: ['string', 'number', 'boolean', 'object', 'array'] })
  @IsEnum(['string', 'number', 'boolean', 'object', 'array'])
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description: string;
}

class CapabilityDto {
  @ApiProperty({ description: 'Skill name' })
  @IsString()
  @IsNotEmpty()
  skill: string;

  @ApiProperty({ description: 'Capability description' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ type: [CapabilityInputDto], description: 'Input parameters' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CapabilityInputDto)
  inputs: CapabilityInputDto[];

  @ApiProperty({ type: [CapabilityOutputDto], description: 'Output parameters' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CapabilityOutputDto)
  outputs: CapabilityOutputDto[];

  @ApiPropertyOptional({ description: 'Estimated duration in milliseconds' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedDuration?: number;

  @ApiPropertyOptional({ description: 'Success rate (0-1)', minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  successRate?: number;
}

class OutcomePricingDto {
  @ApiProperty({ description: 'Outcome name (e.g., success, failure)' })
  @IsString()
  @IsNotEmpty()
  outcome: string;

  @ApiProperty({ description: 'Price multiplier (e.g., 1.5x for success, 0x for failure)', example: 1.0 })
  @IsNumber()
  @Min(0)
  multiplier: number;
}

export class AgentPricingDto {
  @ApiProperty({ enum: ['fixed', 'hourly', 'outcome-based'], description: 'Pricing type' })
  @IsEnum(['fixed', 'hourly', 'outcome-based'])
  type: 'fixed' | 'hourly' | 'outcome-based';

  @ApiProperty({ description: 'Price amount', example: 10.0 })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({ description: 'Currency code', example: 'USD' })
  @IsString()
  @IsNotEmpty()
  currency: string;

  @ApiPropertyOptional({ type: [OutcomePricingDto], description: 'Outcome-based pricing rules' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OutcomePricingDto)
  outcomes?: OutcomePricingDto[];
}

class ReputationDto {
  @ApiProperty({ description: 'Reputation score (0-100)', minimum: 0, maximum: 100, example: 85 })
  @IsNumber()
  @Min(0)
  @Max(100)
  score: number;

  @ApiProperty({ description: 'Total jobs completed', example: 100 })
  @IsNumber()
  @Min(0)
  totalJobs: number;

  @ApiProperty({ description: 'Number of successful jobs', example: 95 })
  @IsNumber()
  @Min(0)
  successfulJobs: number;

  @ApiProperty({ description: 'Number of failed jobs', example: 5 })
  @IsNumber()
  @Min(0)
  failedJobs: number;

  @ApiProperty({ description: 'Average response time in milliseconds', example: 30000 })
  @IsNumber()
  @Min(0)
  averageResponseTime: number;

  @ApiPropertyOptional({ description: 'Uptime percentage (0-100)', minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  uptimePercentage?: number;

  @ApiProperty({ description: 'Reviews array', type: 'array', items: { type: 'object' } })
  @IsArray()
  reviews: unknown[];

  @ApiPropertyOptional({ description: 'Owner verified status' })
  @IsOptional()
  verifiedOwner?: boolean;

  @ApiPropertyOptional({ description: 'Capabilities verified status' })
  @IsOptional()
  verifiedCapabilities?: boolean;
}

export class RegisterAgentDto {
  // ── Required Fields ──────────────────────────────────────────────────
  @ApiProperty({ description: 'Agent name', example: 'Security Update Agent' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Agent description', example: 'Automated security vulnerability detection and patching' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ description: 'List of capabilities (skills)', example: ['code-review', 'security-scan'] })
  @IsArray()
  @IsString({ each: true })
  capabilities: string[];

  // ── Optional Fields (can be added later) ─────────────────────────────
  @ApiPropertyOptional({ description: 'Detailed service offer (markdown)', example: '## What I Do\n\nI automatically monitor...' })
  @IsOptional()
  @IsString()
  offerDescription?: string;

  @ApiPropertyOptional({ description: 'User manual (markdown)', example: '# User Manual\n\n## Getting Started...' })
  @IsOptional()
  @IsString()
  userManual?: string;

  @ApiPropertyOptional({ description: 'Owner GitHub username or organization', example: 'wuselverse' })
  @IsOptional()
  @IsString()
  owner?: string;

  @ApiPropertyOptional({ type: [CapabilityDto], description: 'Detailed capability definitions' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CapabilityDto)
  detailedCapabilities?: CapabilityDto[];

  @ApiPropertyOptional({ type: AgentPricingDto, description: 'Pricing model' })
  @IsOptional()
  @ValidateNested()
  @Type(() => AgentPricingDto)
  pricing?: AgentPricingDto;

  @ApiPropertyOptional({ type: ReputationDto, description: 'Reputation metrics' })
  @IsOptional()
  @ValidateNested()
  @Type(() => ReputationDto)
  reputation?: ReputationDto;

  @ApiPropertyOptional({ enum: AgentStatus, description: 'Agent status', example: AgentStatus.ACTIVE })
  @IsOptional()
  @IsEnum(AgentStatus)
  status?: AgentStatus;

  @ApiPropertyOptional({ description: 'Average rating (1-5 stars)', minimum: 1, maximum: 5, example: 4.5 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({ description: 'Number of successfully completed jobs', example: 50 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  successCount?: number;

  @ApiPropertyOptional({ description: 'MCP server endpoint URL' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  mcpEndpoint?: string;

  @ApiPropertyOptional({ description: 'GitHub App ID' })
  @IsOptional()
  @IsNumber()
  githubAppId?: number;

  @ApiPropertyOptional({ description: 'A2A protocol endpoint URL' })
  @IsOptional()
  @IsUrl()
  a2aEndpoint?: string;

  @ApiPropertyOptional({ description: 'URL to full Agent Service Manifest' })
  @IsOptional()
  @IsUrl()
  manifestUrl?: string;

  @ApiPropertyOptional({ description: 'Additional metadata', type: 'object', example: {} })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
