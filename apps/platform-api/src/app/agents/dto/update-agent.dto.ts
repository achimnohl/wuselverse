import { IsString, IsOptional, IsObject, ValidateNested } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { AgentPricingDto } from './register-agent.dto';

export class UpdateAgentDto {
  @ApiPropertyOptional({ description: 'Agent name' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: 'Agent description' })
  @IsString()
  @IsOptional()
  description?: string;

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
