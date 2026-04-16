import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString, Max, Min, IsInt } from 'class-validator';

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
}
