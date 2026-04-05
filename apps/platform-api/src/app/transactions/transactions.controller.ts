import { Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { createCRUDController } from '@wuselverse/crud-framework';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';

const TransactionsCRUDBase = createCRUDController({
  resourceName: 'transactions',
  createDto: CreateTransactionDto,
  updateDto: CreateTransactionDto,
  entityName: 'Transaction'
});

@ApiTags('transactions')
@Controller('transactions')
export class TransactionsController extends TransactionsCRUDBase {
  constructor(private readonly transactionsService: TransactionsService) {
    super(transactionsService);
  }

  @Get('task/:taskId')
  @ApiOperation({ summary: 'Get all transactions for a task' })
  @ApiParam({ name: 'taskId', description: 'Task ID' })
  @ApiResponse({ status: 200, description: 'Transactions retrieved successfully' })
  async getTaskTransactions(@Param('taskId') taskId: string) {
    const transactions = await this.transactionsService.findByTask(taskId);
    return {
      success: true,
      data: transactions,
      message: `Found ${transactions.length} transactions for task ${taskId}`
    };
  }

  @Get('payer/:payerId')
  @ApiOperation({ summary: 'Get all transactions by payer' })
  @ApiParam({ name: 'payerId', description: 'Payer ID (agent or human)' })
  @ApiResponse({ status: 200, description: 'Transactions retrieved successfully' })
  async getPayerTransactions(@Param('payerId') payerId: string) {
    const transactions = await this.transactionsService.findByPayer(payerId);
    return {
      success: true,
      data: transactions,
      message: `Found ${transactions.length} transactions for payer ${payerId}`
    };
  }

  @Get('recipient/:recipientId')
  @ApiOperation({ summary: 'Get all transactions by recipient' })
  @ApiParam({ name: 'recipientId', description: 'Recipient agent ID' })
  @ApiResponse({ status: 200, description: 'Transactions retrieved successfully' })
  async getRecipientTransactions(@Param('recipientId') recipientId: string) {
    const transactions = await this.transactionsService.findByRecipient(recipientId);
    return {
      success: true,
      data: transactions,
      message: `Found ${transactions.length} transactions for recipient ${recipientId}`
    };
  }

  @Get('pending')
  @ApiOperation({ summary: 'Get all pending transactions' })
  @ApiResponse({ status: 200, description: 'Pending transactions retrieved successfully' })
  async getPendingTransactions() {
    const transactions = await this.transactionsService.findPending();
    return {
      success: true,
      data: transactions,
      message: `Found ${transactions.length} pending transactions`
    };
  }

  @Patch(':id/complete')
  @ApiOperation({ summary: 'Mark transaction as completed' })
  @ApiParam({ name: 'id', description: 'Transaction ID' })
  @ApiResponse({ status: 200, description: 'Transaction completed successfully' })
  async completeTransaction(@Param('id') id: string) {
    const transaction = await this.transactionsService.completeTransaction(id);
    return {
      success: true,
      data: transaction,
      message: 'Transaction completed successfully'
    };
  }

  @Patch(':id/fail')
  @ApiOperation({ summary: 'Mark transaction as failed' })
  @ApiParam({ name: 'id', description: 'Transaction ID' })
  @ApiResponse({ status: 200, description: 'Transaction failed successfully' })
  async failTransaction(@Param('id') id: string) {
    const transaction = await this.transactionsService.failTransaction(id);
    return {
      success: true,
      data: transaction,
      message: 'Transaction marked as failed'
    };
  }

  @Get('agent/:agentId/earnings')
  @ApiOperation({ summary: 'Get total earnings for an agent' })
  @ApiParam({ name: 'agentId', description: 'Agent ID' })
  @ApiResponse({ status: 200, description: 'Earnings retrieved successfully' })
  async getAgentEarnings(@Param('agentId') agentId: string) {
    const earnings = await this.transactionsService.getTotalEarnings(agentId);
    return {
      success: true,
      data: { agentId, totalEarnings: earnings, currency: 'USD' },
      message: `Total earnings: $${earnings}`
    };
  }

  @Get('entity/:entityId/spending')
  @ApiOperation({ summary: 'Get total spending for an agent or human' })
  @ApiParam({ name: 'entityId', description: 'Entity ID (agent or human)' })
  @ApiResponse({ status: 200, description: 'Spending retrieved successfully' })
  async getEntitySpending(@Param('entityId') entityId: string) {
    const spending = await this.transactionsService.getTotalSpending(entityId);
    return {
      success: true,
      data: { entityId, totalSpending: spending, currency: 'USD' },
      message: `Total spending: $${spending}`
    };
  }
}
