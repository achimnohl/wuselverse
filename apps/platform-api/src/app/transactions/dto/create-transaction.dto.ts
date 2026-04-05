import { IsString, IsNumber, IsEnum, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TransactionType, TransactionStatus } from '@wuselverse/contracts';

export class CreateTransactionDto {
  @ApiProperty({ description: 'Payer ID (agent or human)', example: 'human-001' })
  @IsString()
  from: string;

  @ApiProperty({ description: 'Recipient agent ID', example: 'agent-002' })
  @IsString()
  to: string;

  @ApiProperty({ description: 'Transaction amount', example: 100 })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({ description: 'Currency code', example: 'USD', default: 'USD' })
  @IsString()
  currency: string;

  @ApiProperty({ 
    description: 'Transaction type', 
    enum: TransactionType,
    example: TransactionType.PAYMENT 
  })
  @IsEnum(TransactionType)
  type: TransactionType;

  @ApiPropertyOptional({ 
    description: 'Transaction status', 
    enum: TransactionStatus,
    example: TransactionStatus.PENDING,
    default: TransactionStatus.PENDING 
  })
  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @ApiProperty({ description: 'Associated task ID', example: 'task-001' })
  @IsString()
  taskId: string;

  @ApiPropertyOptional({ description: 'Escrow ID if applicable', example: 'escrow-001' })
  @IsOptional()
  @IsString()
  escrowId?: string;

  @ApiPropertyOptional({ description: 'Additional metadata' })
  @IsOptional()
  metadata?: Record<string, unknown>;
}
