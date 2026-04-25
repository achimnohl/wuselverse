import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TransactionDocument } from '../transactions/transaction.schema';
import { BillingAccountsService } from './billing-accounts.service';
import { BillingService, MonthlyBalance } from './billing.service';
import { getCurrentSettlementPeriod, getPreviousSettlementPeriod } from './settlement-period.utils';

export interface BalanceSnapshot {
  accountId: string;
  period: string;
  balance: number;
  pending: number;
  settled: number;
  timestamp: Date;
}

export interface BalanceHistory {
  accountId: string;
  snapshots: BalanceSnapshot[];
  currentBalance: number;
  trend: 'increasing' | 'decreasing' | 'stable';
}

@Injectable()
export class AccountLedgerService {
  private readonly logger = new Logger(AccountLedgerService.name);

  constructor(
    @InjectModel('Transaction') private transactionModel: Model<TransactionDocument>,
    private billingAccountsService: BillingAccountsService,
    private billingService: BillingService
  ) {}

  /**
   * Get current pending balance for an account (not yet settled)
   */
  async getPendingBalance(accountId: string): Promise<number> {
    const currentPeriod = getCurrentSettlementPeriod();
    const balance = await this.billingService.calculateMonthlyBalance(accountId, currentPeriod);
    return balance.netAmount;
  }

  /**
   * Get settled balance from the billing account
   */
  async getSettledBalance(accountId: string): Promise<number> {
    return await this.billingAccountsService.getBalance(accountId);
  }

  /**
   * Get total balance (settled + pending)
   */
  async getTotalBalance(accountId: string): Promise<{
    total: number;
    settled: number;
    pending: number;
  }> {
    const [settled, pending] = await Promise.all([
      this.getSettledBalance(accountId),
      this.getPendingBalance(accountId)
    ]);

    return {
      total: settled + pending,
      settled,
      pending
    };
  }

  /**
   * Get balance history for the last N months
   */
  async getBalanceHistory(accountId: string, months: number = 6): Promise<BalanceHistory> {
    const snapshots: BalanceSnapshot[] = [];
    let period = getCurrentSettlementPeriod();

    // Generate snapshots for each month
    for (let i = 0; i < months; i++) {
      const monthlyBalance = await this.billingService.calculateMonthlyBalance(accountId, period);
      
      snapshots.push({
        accountId,
        period,
        balance: monthlyBalance.netAmount,
        pending: monthlyBalance.totalEarnings - monthlyBalance.totalSpending,
        settled: monthlyBalance.nettedInternal + monthlyBalance.nettedBilateral,
        timestamp: new Date()
      });

      period = getPreviousSettlementPeriod(period);
    }

    // Calculate trend
    const currentBalance = await this.getTotalBalance(accountId);
    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    
    if (snapshots.length >= 2) {
      const recent = snapshots[0].balance;
      const previous = snapshots[1].balance;
      if (recent > previous * 1.1) {
        trend = 'increasing';
      } else if (recent < previous * 0.9) {
        trend = 'decreasing';
      }
    }

    return {
      accountId,
      snapshots: snapshots.reverse(), // Oldest first
      currentBalance: currentBalance.total,
      trend
    };
  }

  /**
   * Get account balance as of a specific date
   */
  async getBalanceAsOf(accountId: string, date: Date): Promise<number> {
    // Calculate settled balance from billing account
    const settledBalance = await this.billingAccountsService.getBalance(accountId);

    // Calculate pending balance up to the specified date
    const transactions = await this.transactionModel
      .find({
        $or: [
          { fromAccountId: accountId },
          { toAccountId: accountId }
        ],
        createdAt: { $lte: date },
        settlementStatus: 'pending'
      })
      .lean()
      .exec();

    let pendingBalance = 0;
    for (const tx of transactions) {
      const amount = tx.amount || 0;
      if (tx.toAccountId === accountId && tx.type === 'payment') {
        pendingBalance += amount;
      }
      if (tx.fromAccountId === accountId && tx.type === 'escrow_lock') {
        pendingBalance -= amount;
      }
    }

    return settledBalance + pendingBalance;
  }

  /**
   * Check if account has sufficient funds for a transaction
   * (Used for pre-flight validation before creating escrows)
   */
  async hasSufficientFunds(accountId: string, amount: number): Promise<boolean> {
    const { total } = await this.getTotalBalance(accountId);
    return total >= amount;
  }

  /**
   * Record a settlement transaction (called by NettingService after monthly settlement)
   */
  async recordSettlement(accountId: string, amount: number, period: string): Promise<void> {
    this.logger.log(`Recording settlement for account ${accountId}: ${amount} (period: ${period})`);
    
    // Update the settled balance in the billing account
    await this.billingAccountsService.updateBalance(accountId, amount);
  }
}
