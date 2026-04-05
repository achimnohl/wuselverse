import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsArray, IsEnum, IsNumber, IsOptional, IsObject, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { TaskStatus } from '@wuselverse/contracts';

class TaskRequirementsDto {
  @ApiProperty({ type: [String], description: 'Required capabilities', example: ['security-scan', 'pr-generation'] })
  @IsArray()
  @IsString({ each: true })
  capabilities: string[];

  @ApiPropertyOptional({ description: 'Minimum reputation score', minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minReputation?: number;

  @ApiPropertyOptional({ description: 'Maximum response time in milliseconds' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxResponseTime?: number;

  @ApiPropertyOptional({ type: [String], description: 'Whitelisted agent IDs' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specificAgents?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Blacklisted agent IDs' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludedAgents?: string[];
}

class BudgetDto {
  @ApiProperty({ description: 'Budget amount', example: 100.0 })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({ description: 'Currency code', example: 'USD' })
  @IsString()
  @IsNotEmpty()
  currency: string;

  @ApiProperty({ enum: ['fixed', 'hourly', 'outcome-based'], description: 'Budget type' })
  @IsEnum(['fixed', 'hourly', 'outcome-based'])
  type: 'fixed' | 'hourly' | 'outcome-based';
}

export class CreateTaskDto {
  @ApiProperty({ description: 'Task title', example: 'Fix security vulnerabilities in repository' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ description: 'Task description', example: 'Scan and fix all high-severity vulnerabilities' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ type: TaskRequirementsDto, description: 'Task requirements' })
  @ValidateNested()
  @Type(() => TaskRequirementsDto)
  requirements: TaskRequirementsDto;

  @ApiProperty({ description: 'Poster agent or user ID', example: 'agent_123' })
  @IsString()
  @IsNotEmpty()
  poster: string;

  @ApiProperty({ type: BudgetDto, description: 'Task budget' })
  @ValidateNested()
  @Type(() => BudgetDto)
  budget: BudgetDto;

  @ApiPropertyOptional({ description: 'Parent task ID for delegation' })
  @IsOptional()
  @IsString()
  parentTaskId?: string;

  @ApiPropertyOptional({ description: 'Task deadline (ISO 8601)', example: '2026-04-01T00:00:00Z' })
  @IsOptional()
  @IsString()
  deadline?: string;

  @ApiPropertyOptional({ description: 'Additional metadata', type: 'object', example: {} })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class SubmitBidDto {
  @ApiProperty({ description: 'Bidding agent ID', example: 'agent_security_updater_123' })
  @IsString()
  @IsNotEmpty()
  agentId: string;

  @ApiProperty({ description: 'Bid amount', example: 50.0 })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiPropertyOptional({ description: 'Estimated duration in milliseconds', example: 3600000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedDuration?: number;

  @ApiProperty({ description: 'Bid proposal text', example: 'I will scan and fix all vulnerabilities within 1 hour' })
  @IsString()
  @IsNotEmpty()
  proposal: string;
}
