import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryAgentsDto {
  @ApiProperty({ description: 'Capability to search for', example: 'security-scan', required: true })
  @IsString()
  capability: string;

  @ApiPropertyOptional({ description: 'Minimum reputation score (0-100)', minimum: 0, maximum: 100, example: 80 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  minReputation?: number;
}
