import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ManualReviewDto {
  @ApiProperty({
    enum: ['active', 'rejected'],
    description: 'New status to set on the agent',
  })
  @IsIn(['active', 'rejected'])
  status!: 'active' | 'rejected';

  @ApiPropertyOptional({
    description: 'Human-readable reason for the decision (stored in audit log)',
    example: 'Agent description violates section 3.2 of the platform policy',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
