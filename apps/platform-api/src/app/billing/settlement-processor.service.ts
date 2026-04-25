import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TransactionDocument } from '../transactions/transaction.schema';
import { NettingService, NettingResult } from './netting.service';
import { BillingService, MonthlyBalance } from './billing.service';
import { AccountLedgerService } from './account-ledger.service';
import { getCurrentSettlementPeriod, getPreviousSettlementPeriod } from './settlement-period.utils';

export interface SettlementResult {
  period: string;
  netting: NettingResult;
  settlements: AccountSettlement[];
  summary: {
    accountsSettled: number;
    totalAmountSettled: number;
    successfulSettlements: number;
    failedSettlements: number;
  };
  completedAt: Date;
}

export interface AccountSettlement {
  accountId: string;
  balance: MonthlyBalance;
  settlementAmount: number;
  settlementMethod: 'virtual' | 'netted';
  status: 'success' | 'failed' | 'skipped';
  error?: string;
}

@Injectable()
export class SettlementProcessorService {
  private readonly logger = new Logger(SettlementProcessorService.name);

  constructor(
    @InjectModel('Transaction') private transactionModel: Model<TransactionDocument>,
    private nettingService: NettingService,
    private billingService: BillingService,
    private accountLedgerService: AccountLedgerService
  ) {}

  /**
   * Process monthly settlement for a specific period
   * This is the main orchestrator for the settlement workflow
   */
  async processMonthlySettlement(period?: string): Promise<SettlementResult> {
    const settlementPeriod = period || getPreviousSettlementPeriod(getCurrentSettlementPeriod());
    
    this.logger.log(`Starting monthly settlement for period ${settlementPeriod}`);

    // Step 1: Run netting (internal + bilateral)
    const nettingResult = await this.nettingService.processMonthlyNetting(settlementPeriod);
    
    this.logger.log(
      `Netting complete: ${nettingResult.summary.totalTransactionsProcessed} transactions netted`
    );

    // Step 2: Get all accounts that need settlement
    const accountsToSettle = await this.getAccountsForSettlement(settlementPeriod);
    
    this.logger.log(`Found ${accountsToSettle.length} accounts for settlement`);

    // Step 3: Process settlement for each account
    const settlements: AccountSettlement[] = [];
    let successCount = 0;
    let failedCount = 0;
    let totalAmountSettled = 0;

    for (const accountId of accountsToSettle) {
      try {
        const settlement = await this.settleAccount(accountId, settlementPeriod);
        settlements.push(settlement);

        if (settlement.status === 'success') {
          successCount++;
          totalAmountSettled += Math.abs(settlement.settlementAmount);
        } else if (settlement.status === 'failed') {
          failedCount++;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to settle account ${accountId}: ${errorMessage}`);
        settlements.push({
          accountId,
          balance: null as any,
          settlementAmount: 0,
          settlementMethod: 'virtual',
          status: 'failed',
          error: errorMessage
        });
        failedCount++;
      }
    }

    // Step 4: Mark remaining pending transactions as settled
    await this.transactionModel.updateMany(
      {
        settlementPeriod,
        settlementStatus: 'pending'
      },
      {
        $set: {
          settlementStatus: 'settled',
          settledAt: new Date()
        }
      }
    );

    const result: SettlementResult = {
      period: settlementPeriod,
      netting: nettingResult,
      settlements,
      summary: {
        accountsSettled: settlements.length,
        totalAmountSettled,
        successfulSettlements: successCount,
        failedSettlements: failedCount
      },
      completedAt: new Date()
    };

    this.logger.log(
      `Monthly settlement complete for ${settlementPeriod}: ` +
      `${successCount} successful, ${failedCount} failed`
    );

    return result;
  }

  /**
   * Settle a single account for a period
   */
  private async settleAccount(
    accountId: string,
    period: string
  ): Promise<AccountSettlement> {
    // Calculate monthly balance
    const balance = await this.billingService.calculateMonthlyBalance(accountId, period);

    // Skip if no net amount
    if (balance.netAmount === 0) {
      return {
        accountId,
        balance,
        settlementAmount: 0,
        settlementMethod: 'netted',
        status: 'skipped'
      };
    }

    // For MVP: all settlements are virtual (update billing account balance)
    try {
      await this.accountLedgerService.recordSettlement(
        accountId,
        balance.netAmount,
        period
      );

      return {
        accountId,
        balance,
        settlementAmount: balance.netAmount,
        settlementMethod: 'virtual',
        status: 'success'
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Settlement failed for account ${accountId}: ${errorMessage}`);
      return {
        accountId,
        balance,
        settlementAmount: balance.netAmount,
        settlementMethod: 'virtual',
        status: 'failed',
        error: errorMessage
      };
    }
  }

  /**
   * Get list of accounts that need settlement for a period
   */
  private async getAccountsForSettlement(period: string): Promise<string[]> {
    // Get all unique billing accounts with transactions in this period
    const fromAccounts = await this.transactionModel.distinct('fromAccountId', {
      settlementPeriod: period,
      fromAccountId: { $exists: true, $ne: null }
    });

    const toAccounts = await this.transactionModel.distinct('toAccountId', {
      settlementPeriod: period,
      toAccountId: { $exists: true, $ne: null }
    });

    // Combine and deduplicate
    const allAccounts = [...new Set([...fromAccounts, ...toAccounts])];
    
    return allAccounts;
  }

  /**
   * Preview settlement without executing
   */
  async previewSettlement(period?: string): Promise<{
    period: string;
    nettingPreview: any;
    accountsToSettle: {
      accountId: string;
      currentBalance: MonthlyBalance;
      willSettle: boolean;
    }[];
  }> {
    const settlementPeriod = period || getPreviousSettlementPeriod(getCurrentSettlementPeriod());

    // Preview netting for all accounts
    const accountsToSettle = await this.getAccountsForSettlement(settlementPeriod);
    
    const accountPreviews = await Promise.all(
      accountsToSettle.map(async (accountId) => {
        const balance = await this.billingService.calculateMonthlyBalance(accountId, settlementPeriod);
        return {
          accountId,
          currentBalance: balance,
          willSettle: balance.netAmount !== 0
        };
      })
    );

    return {
      period: settlementPeriod,
      nettingPreview: {
        message: 'Netting preview not yet implemented - run processMonthlyNetting to see actual results'
      },
      accountsToSettle: accountPreviews
    };
  }

  /**
   * Check if settlement is needed for a period
   */
  async isSettlementNeeded(period?: string): Promise<boolean> {
    const settlementPeriod = period || getPreviousSettlementPeriod(getCurrentSettlementPeriod());

    const pendingCount = await this.transactionModel.countDocuments({
      settlementPeriod,
      settlementStatus: 'pending'
    });

    return pendingCount > 0;
  }
}
