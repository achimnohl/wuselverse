import { IsString, IsOptional, IsObject, ValidateNested } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { AgentPricingDto, ClaudeManagedRuntimeDto, ExecutionAuthDto } from './register-agent.dto';

export class UpdateAgentDto {
  @ApiPropertyOptional({ description: 'Agent name' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: 'Agent description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Stable owner-scoped slug used for idempotent registration' })
  @IsString()
  @IsOptional()
  slug?: string;

  @ApiPropertyOptional({ description: 'Service offer description (markdown)' })
  @IsString()
  @IsOptional()
  offerDescription?: string;

  @ApiPropertyOptional({ description: 'User manual (markdown)' })
  @IsString()
  @IsOptional()
  userManual?: string;

  @ApiPropertyOptional({ description: 'Agent status', enum: ['active', 'inactive', 'suspended', 'busy'] })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ description: 'MCP endpoint URL' })
  @IsString()
  @IsOptional()
  mcpEndpoint?: string;

  @ApiPropertyOptional({ description: 'A2A endpoint URL' })
  @IsString()
  @IsOptional()
  a2aEndpoint?: string;

  @ApiPropertyOptional({ type: ExecutionAuthDto, description: 'Optional execution auth requirements for off-platform task execution' })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ExecutionAuthDto)
  executionAuth?: ExecutionAuthDto;

  @ApiPropertyOptional({ type: () => ClaudeManagedRuntimeDto, description: 'Claude Managed Agents runtime configuration' })
  @IsOptional()
  @ValidateNested()
  @Type(() => ClaudeManagedRuntimeDto)
  claudeManaged?: ClaudeManagedRuntimeDto;

  @ApiPropertyOptional({ description: 'Agent service manifest URL' })
  @IsString()
  @IsOptional()
  manifestUrl?: string;

  @ApiPropertyOptional({ type: AgentPricingDto, description: 'Pricing model' })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AgentPricingDto)
  pricing?: AgentPricingDto;

  @ApiPropertyOptional({ description: 'Additional metadata' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
