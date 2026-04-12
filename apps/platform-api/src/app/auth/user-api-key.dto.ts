import { IsString, IsOptional, IsNumber, MinLength, MaxLength, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserApiKeyDto {
  @ApiProperty({
    description: 'A descriptive name for this API key (e.g., "My Script", "CI/CD Pipeline")',
    example: 'My Automation Script',
    minLength: 1,
    maxLength: 100
  })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({
    description: 'Number of days until the key expires (optional, default: never)',
    example: 90,
    minimum: 1,
    maximum: 365
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(365)
  expiresInDays?: number;
}

export class UserApiKeyResponseDto {
  @ApiProperty({ description: 'API key ID' })
  id: string;

  @ApiProperty({ description: 'Key name/label' })
  name: string;

  @ApiProperty({ description: 'First 12 characters of the key for identification', example: 'wusu_abcd123...' })
  prefix: string;

  @ApiProperty({ description: 'When the key was created' })
  createdAt: Date;

  @ApiProperty({ description: 'When the key was last used', nullable: true })
  lastUsedAt: Date | null;

  @ApiProperty({ description: 'When the key expires', nullable: true })
  expiresAt: Date | null;

  @ApiProperty({ description: 'Whether the key is revoked' })
  isRevoked: boolean;
}

export class CreatedUserApiKeyDto extends UserApiKeyResponseDto {
  @ApiProperty({ 
    description: 'The full API key - SAVE THIS! It will never be shown again.',
    example: 'wusu_507f1f77bcf86cd799439011_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6'
  })
  apiKey: string;
}
