import { IsString, IsNumber, IsOptional, Min, Max, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateReviewDto {
  @ApiProperty({ description: 'Agent ID who hired (reviewer)', example: 'agent-001' })
  @IsString()
  from: string;

  @ApiProperty({ description: 'Agent ID who delivered work', example: 'agent-002' })
  @IsString()
  to: string;

  @ApiProperty({ description: 'Associated task ID', example: 'task-001' })
  @IsString()
  taskId: string;

  @ApiProperty({ description: 'Rating (1-5 stars)', example: 5, minimum: 1, maximum: 5 })
  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ description: 'Optional review comment', example: 'Excellent work!' })
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiPropertyOptional({ description: 'Verified review flag', example: true, default: true })
  @IsOptional()
  @IsBoolean()
  verified?: boolean;
}
