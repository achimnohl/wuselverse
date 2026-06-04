import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString, Max, Min, IsInt, IsNumber, ValidateNested, IsObject } from 'class-validator';
import { Type } from 'class-transformer';

export class ActorChainEntryDto {
  @ApiProperty({ enum: ['user', 'agent'], description: 'Actor type' })
  @IsEnum(['user', 'agent'])
  type: 'user' | 'agent';

  @ApiProperty({ description: 'Actor ID (userId or agentId)' })
  @IsString()
  id: string;

  @ApiProperty({ description: 'Timestamp when this actor joined the chain (Unix milliseconds)' })
  @IsNumber()
  timestamp: number;

  @ApiPropertyOptional({ description: 'Email address for user actors' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ description: 'Agent name for agent actors' })
  @IsOptional()
  @IsString()
  agentName?: string;
}

export class CreateExecutionSessionDto {
  @ApiProperty({ description: 'Task ID for which execution auth session is being created' })
  @IsString()
  taskId: string;

  @ApiProperty({ enum: ['consumer', 'provider'], description: 'Role for token issuance' })
  @IsEnum(['consumer', 'provider'])
  role: 'consumer' | 'provider';

  @ApiPropertyOptional({ type: [String], description: 'Requested execution scopes' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];

  @ApiPropertyOptional({ description: 'Optional token audience' })
  @IsOptional()
  @IsString()
  audience?: string;

  @ApiPropertyOptional({ description: 'Optional key thumbprint for proof-of-possession binding (cnf.jkt)' })
  @IsOptional()
  @IsString()
  cnfJkt?: string;

  @ApiPropertyOptional({ description: 'Token TTL in seconds (default: 600)', minimum: 60, maximum: 3600 })
  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(3600)
  ttlSeconds?: number;

  @ApiPropertyOptional({ type: [ActorChainEntryDto], description: 'Actor chain showing delegation lineage' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActorChainEntryDto)
  actorChain?: ActorChainEntryDto[];

  @ApiPropertyOptional({ description: 'Task intent/purpose (e.g., "text-summarization")' })
  @IsOptional()
  @IsString()
  intent?: string;

  @ApiPropertyOptional({ description: 'Maximum budget allocated for this execution scope' })
  @IsOptional()
  @IsNumber()
  maxBudget?: number;

  @ApiPropertyOptional({ type: [String], description: 'Required capabilities for this execution' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredCapabilities?: string[];
}
