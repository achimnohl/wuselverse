import { Controller, Get, Post, Param, Query, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { ApiOperation, ApiQuery } from '@nestjs/swagger';
import { SettlementProcessorService } from './settlement-processor.service';
import { NettingService } from './netting.service';
import { BillingService } from './billing.service';
import { AccountLedgerService } from './account-ledger.service';
import { InvoicingService } from './invoicing.service';
import { SettlementSchedulerService } from './settlement-scheduler.service';
import { AnyAuthGuard } from '../auth/any-auth.guard';
import { AuthService } from '../auth/auth.service';
import { getCurrentSettlementPeriod } from './settlement-period.utils';

@Controller('settlement')
@UseGuards(AnyAuthGuard)
export class SettlementController {
  constructor(
    private readonly settlementProcessor: SettlementProcessorService,
    private readonly nettingService: NettingService,
    private readonly billingService: BillingService,
    private readonly accountLedgerService: AccountLedgerService,
    private readonly invoicingService: InvoicingService,
    private readonly settlementScheduler: SettlementSchedulerService,
    private readonly authService: AuthService
  ) {}

  /**
   * Get monthly statement for current user
   */
  @Get('my-statement')
  @ApiOperation({ summary: 'Get monthly usage statement for current user' })
  @ApiQuery({ name: 'period', required: false, description: 'Settlement period (YYYY-MM format)' })
  async getMyStatement(
    @Request() req: any,
    @Query('period') period?: string
  ) {
    const user = await this.authService.getUserFromRequest(req);
    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Get user's billing account ID
    // For now, we'll need to query the user to get their billingAccountId
    // In a real implementation, this would be in the session
    const settlementPeriod = period || getCurrentSettlementPeriod();

    // Get account transactions and balance
    const transactions = await this.billingService.getAccountTransactions(
      user.id, // Using userId as placeholder - would need actual billingAccountId
      settlementPeriod
    );

    const balance = await this.billingService.calculateMonthlyBalance(
      user.id,
      settlementPeriod
    );

    const ledgerBalance = await this.accountLedgerService.getTotalBalance(user.id);

    return {
      success: true,
      data: {
        period: settlementPeriod,
        transactions: transactions.transactions,
        summary: transactions.summary,
        balance: {
          ...balance,
          currentSettled: ledgerBalance.settled,
          currentPending: ledgerBalance.pending,
          currentTotal: ledgerBalance.total
        }
      }
    };
  }

  /**
   * Get balance history for current user
   */
  @Get('my-history')
  @ApiOperation({ summary: 'Get balance history for current user' })
  @ApiQuery({ name: 'months', required: false, description: 'Number of months to retrieve', type: Number })
  async getMyHistory(
    @Request() req: any,
    @Query('months') months?: number
  ) {
    const user = await this.authService.getUserFromRequest(req);
    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    const monthsToRetrieve = months ? parseInt(String(months), 10) : 6;
    const history = await this.accountLedgerService.getBalanceHistory(
      user.id,
      monthsToRetrieve
    );

    return {
      success: true,
      data: history
    };
  }

  /**
   * Get invoice for current user
   */
  @Get('my-invoice')
  @ApiOperation({ summary: 'Get invoice for current user' })
  @ApiQuery({ name: 'period', required: false, description: 'Settlement period (YYYY-MM format)' })
  async getMyInvoice(
    @Request() req: any,
    @Query('period') period?: string
  ) {
    const user = await this.authService.getUserFromRequest(req);
    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    const settlementPeriod = period || getCurrentSettlementPeriod();
    const invoice = await this.invoicingService.generateInvoice(user.id, settlementPeriod);

    return {
      success: true,
      data: invoice
    };
  }

  /**
   * Get usage report for current user
   */
  @Get('my-usage')
  @ApiOperation({ summary: 'Get usage report for current user' })
  @ApiQuery({ name: 'period', required: false, description: 'Settlement period (YYYY-MM format)' })
  async getMyUsage(
    @Request() req: any,
    @Query('period') period?: string
  ) {
    const user = await this.authService.getUserFromRequest(req);
    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    const settlementPeriod = period || getCurrentSettlementPeriod();
    
    // Get transactions and balance for usage report
    const transactions = await this.billingService.getAccountTransactions(user.id, settlementPeriod);
    const balance = await this.billingService.calculateMonthlyBalance(user.id, settlementPeriod);

    // Build usage report
    const usageReport = {
      accountId: user.id,
      period: settlementPeriod,
      tasksPosted: transactions.transactions.filter(t => t.type === 'escrow_lock').length,
      tasksCompleted: transactions.transactions.filter(t => t.type === 'payment').length,
      totalEarnings: balance.totalEarnings,
      totalSpending: balance.totalSpending,
      netAmount: balance.netAmount,
      nettingEfficiency: balance.totalEarnings + balance.totalSpending > 0
        ? ((balance.nettedInternal + balance.nettedBilateral) / (balance.totalEarnings + balance.totalSpending)) * 100
        : 0,
      balanceTrend: 'stable' as const,
      transactionCount: transactions.transactions.length,
      summary: transactions.summary
    };

    return {
      success: true,
      data: usageReport
    };
  }

  /**
   * Preview netting for current user's account
   */
  @Get('my-netting-preview')
  @ApiOperation({ summary: 'Preview netting results for current user without applying' })
  @ApiQuery({ name: 'period', required: false, description: 'Settlement period (YYYY-MM format)' })
  async getMyNettingPreview(
    @Request() req: any,
    @Query('period') period?: string
  ) {
    const user = await this.authService.getUserFromRequest(req);
    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    const settlementPeriod = period || getCurrentSettlementPeriod();
    const preview = await this.nettingService.previewNetting(user.id, settlementPeriod);

    return {
      success: true,
      data: {
        period: settlementPeriod,
        preview
      }
    };
  }

  /**
   * Admin: Process monthly settlement
   */
  @Post('process/:period')
  @ApiOperation({ summary: 'Process monthly settlement (admin only)' })
  async processSettlement(
    @Param('period') period: string,
    @Request() req: any
  ) {
    const user = await this.authService.getUserFromRequest(req);
    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // TODO: Add admin role check
    // For now, any authenticated user can trigger settlement (for MVP/testing)
    
    const result = await this.settlementProcessor.processMonthlySettlement(period);

    return {
      success: true,
      data: result
    };
  }

  /**
   * Admin: Preview settlement
   */
  @Get('preview/:period')
  @ApiOperation({ summary: 'Preview settlement without executing (admin only)' })
  async previewSettlement(
    @Param('period') period: string,
    @Request() req: any
  ) {
    const user = await this.authService.getUserFromRequest(req);
    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // TODO: Add admin role check

    const preview = await this.settlementProcessor.previewSettlement(period);

    return {
      success: true,
      data: preview
    };
  }

  /**
   * Admin: Check if settlement is needed
   */
  @Get('needed/:period')
  @ApiOperation({ summary: 'Check if settlement is needed for a period' })
  async isSettlementNeeded(
    @Param('period') period: string,
    @Request() req: any
  ) {
    const user = await this.authService.getUserFromRequest(req);
    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    const needed = await this.settlementProcessor.isSettlementNeeded(period);

    return {
      success: true,
      data: {
        period,
        settlementNeeded: needed
      }
    };
  }

  /**
   * Admin: Trigger monthly settlement job
   */
  @Post('run-monthly-job')
  @ApiOperation({ summary: 'Trigger monthly settlement job (admin only)' })
  async runMonthlyJob(@Request() req: any) {
    const user = await this.authService.getUserFromRequest(req);
    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // TODO: Add admin role check

    const result = await this.settlementScheduler.runMonthlySettlement();

    return {
      success: result.success,
      data: result
    };
  }

  /**
   * Admin: Preview next settlement job
   */
  @Get('preview-monthly-job')
  @ApiOperation({ summary: 'Preview what the next monthly settlement would do' })
  async previewMonthlyJob(@Request() req: any) {
    const user = await this.authService.getUserFromRequest(req);
    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // TODO: Add admin role check

    const preview = await this.settlementScheduler.previewNextSettlement();

    return {
      success: true,
      data: preview
    };
  }

  /**
   * Admin: Get settlement job status
   */
  @Get('job-status')
  @ApiOperation({ summary: 'Get current settlement job status' })
  async getJobStatus(@Request() req: any) {
    const user = await this.authService.getUserFromRequest(req);
    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    const status = this.settlementScheduler.getJobStatus();

    return {
      success: true,
      data: status
    };
  }
}
