import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TransactionDocument } from '../transactions/transaction.schema';
import { BillingAccountsService } from './billing-accounts.service';
import { getCurrentSettlementPeriod, getSettlementPeriodRange } from './settlement-period.utils';

export interface MonthlyBalance {
  accountId: string;
  period: string;
  totalEarnings: number;
  totalSpending: number;
  nettedInternal: number;
  nettedBilateral: number;
  netAmount: number;
  transactionCount: number;
}

export interface AccountTransactionsSummary {
  accountId: string;
  period: string;
  transactions: {
    id: string;
    type: string;
    from: string;
    to: string;
    amount: number;
    taskId: string;
    settlementStatus: string;
    createdAt: Date;
  }[];
  summary: {
    totalEarnings: number;
    totalSpending: number;
    pendingCount: number;
    nettedCount: number;
  };
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @InjectModel('Transaction') private transactionModel: Model<TransactionDocument>,
    private billingAccountsService: BillingAccountsService
  ) {}

  /**
   * Calculate monthly balance for a billing account
   */
  async calculateMonthlyBalance(accountId: string, period?: string): Promise<MonthlyBalance> {
    const settlementPeriod = period || getCurrentSettlementPeriod();
    const { start, end } = getSettlementPeriodRange(settlementPeriod);

    this.logger.log(`Calculating monthly balance for account ${accountId}, period ${settlementPeriod}`);

    // Get all transactions for this account in the period
    const transactions = await this.transactionModel
      .find({
        $or: [
          { fromAccountId: accountId },
          { toAccountId: accountId }
        ],
        createdAt: { $gte: start, $lte: end }
      })
      .lean()
      .exec();

    // Calculate totals
    let totalEarnings = 0;
    let totalSpending = 0;
    let nettedInternal = 0;
    let nettedBilateral = 0;

    for (const tx of transactions) {
      const amount = tx.amount || 0;

      // Earnings: transactions where this account receives money
      if (tx.toAccountId === accountId && tx.type === 'payment') {
        if (tx.settlementStatus === 'netted_internal') {
          nettedInternal += amount;
        } else if (tx.settlementStatus === 'netted_bilateral') {
          nettedBilateral += amount;
        } else {
          totalEarnings += amount;
        }
      }

      // Spending: transactions where this account pays money
      if (tx.fromAccountId === accountId && tx.type === 'escrow_lock') {
        if (tx.settlementStatus === 'netted_internal') {
          nettedInternal -= amount; // Netted spending reduces the netted amount
        } else if (tx.settlementStatus === 'netted_bilateral') {
          nettedBilateral -= amount;
        } else {
          totalSpending += amount;
        }
      }
    }

    const netAmount = totalEarnings - totalSpending + nettedInternal + nettedBilateral;

    return {
      accountId,
      period: settlementPeriod,
      totalEarnings,
      totalSpending,
      nettedInternal,
      nettedBilateral,
      netAmount,
      transactionCount: transactions.length
    };
  }

  /**
   * Get all transactions for a billing account in a period
   */
  async getAccountTransactions(accountId: string, period?: string): Promise<AccountTransactionsSummary> {
    const settlementPeriod = period || getCurrentSettlementPeriod();
    const { start, end } = getSettlementPeriodRange(settlementPeriod);

    const transactions = await this.transactionModel
      .find({
        $or: [
          { fromAccountId: accountId },
          { toAccountId: accountId }
        ],
        createdAt: { $gte: start, $lte: end }
      })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    // Calculate summary
    let totalEarnings = 0;
    let totalSpending = 0;
    let pendingCount = 0;
    let nettedCount = 0;

    for (const tx of transactions) {
      const amount = tx.amount || 0;

      if (tx.toAccountId === accountId && tx.type === 'payment') {
        totalEarnings += amount;
      }
      if (tx.fromAccountId === accountId && tx.type === 'escrow_lock') {
        totalSpending += amount;
      }

      if (tx.settlementStatus === 'pending') {
        pendingCount++;
      } else if (tx.settlementStatus === 'netted_internal' || tx.settlementStatus === 'netted_bilateral') {
        nettedCount++;
      }
    }

    return {
      accountId,
      period: settlementPeriod,
      transactions: transactions.map(tx => ({
        id: tx._id.toString(),
        type: tx.type,
        from: tx.from,
        to: tx.to,
        amount: tx.amount,
        taskId: tx.taskId,
        settlementStatus: tx.settlementStatus || 'pending',
        createdAt: tx.createdAt
      })),
      summary: {
        totalEarnings,
        totalSpending,
        pendingCount,
        nettedCount
      }
    };
  }

  /**
   * Preview what will be settled for an account
   */
  async previewSettlement(accountId: string, period?: string): Promise<{
    balance: MonthlyBalance;
    willSettle: boolean;
    settlementAmount: number;
    settlementMethod: 'virtual' | 'pending_payment';
  }> {
    const balance = await this.calculateMonthlyBalance(accountId, period);
    
    // For MVP, all settlements are virtual (no real money movement)
    const willSettle = Math.abs(balance.netAmount) > 0;
    const settlementMethod = 'virtual';

    return {
      balance,
      willSettle,
      settlementAmount: balance.netAmount,
      settlementMethod
    };
  }
}
