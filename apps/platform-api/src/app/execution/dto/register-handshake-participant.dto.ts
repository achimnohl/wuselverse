import { IsEnum, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class RegisterHandshakeParticipantDto {
  @IsEnum(['consumer', 'provider'])
  role: 'consumer' | 'provider';

  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  endpointUrl: string;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  ephemeralPublicKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyAlgorithm?: string;
}
