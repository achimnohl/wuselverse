import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TransactionDocument } from '../transactions/transaction.schema';
import { getCurrentSettlementPeriod } from './settlement-period.utils';

export interface NettingResult {
  period: string;
  processedAccounts: number;
  internalNetting: {
    accountsProcessed: number;
    transactionsNetted: number;
    totalAmountNetted: number;
  };
  bilateralNetting: {
    pairsProcessed: number;
    transactionsNetted: number;
    totalAmountNetted: number;
  };
  summary: {
    totalTransactionsProcessed: number;
    totalAmountNetted: number;
    remainingForSettlement: number;
  };
}

export interface AccountNetting {
  accountId: string;
  internalTransactions: {
    netted: number;
    count: number;
  };
  bilateralTransactions: {
    netted: number;
    count: number;
    counterparties: string[];
  };
}

@Injectable()
export class NettingService {
  private readonly logger = new Logger(NettingService.name);

  constructor(
    @InjectModel('Transaction') private transactionModel: Model<TransactionDocument>
  ) {}

  /**
   * Process internal netting for a billing account
   * Nets transactions within the same billing account (e.g., user A's agent pays user B's agent, both in same org)
   */
  async processInternalNetting(accountId: string, period?: string): Promise<AccountNetting> {
    const settlementPeriod = period || getCurrentSettlementPeriod();
    
    this.logger.log(`Processing internal netting for account ${accountId}, period ${settlementPeriod}`);

    // Find all pending transactions where both parties are in the same billing account
    const transactions = await this.transactionModel
      .find({
        fromAccountId: accountId,
        toAccountId: accountId,
        settlementPeriod,
        settlementStatus: 'pending'
      })
      .exec();

    if (transactions.length === 0) {
      return {
        accountId,
        internalTransactions: { netted: 0, count: 0 },
        bilateralTransactions: { netted: 0, count: 0, counterparties: [] }
      };
    }

    // Mark all as netted_internal
    const updateResult = await this.transactionModel.updateMany(
      {
        _id: { $in: transactions.map(t => t._id) }
      },
      {
        $set: {
          settlementStatus: 'netted_internal',
          nettedAt: new Date()
        }
      }
    );

    const totalNetted = transactions.reduce((sum, tx) => sum + (tx.amount || 0), 0);

    this.logger.log(
      `Internal netting complete: ${updateResult.modifiedCount} transactions, ${totalNetted} total amount`
    );

    return {
      accountId,
      internalTransactions: {
        netted: totalNetted,
        count: updateResult.modifiedCount
      },
      bilateralTransactions: {
        netted: 0,
        count: 0,
        counterparties: []
      }
    };
  }

  /**
   * Process bilateral netting between two billing accounts
   * Offsets A→B and B→A transactions, leaving only net amount
   */
  async processBilateralNetting(
    accountId1: string,
    accountId2: string,
    period?: string
  ): Promise<{
    netAmount: number;
    netDirection: 'from1to2' | 'from2to1' | 'balanced';
    transactionsNetted: number;
  }> {
    const settlementPeriod = period || getCurrentSettlementPeriod();

    this.logger.log(
      `Processing bilateral netting between ${accountId1} and ${accountId2}, period ${settlementPeriod}`
    );

    // Get A→B transactions
    const aToB = await this.transactionModel
      .find({
        fromAccountId: accountId1,
        toAccountId: accountId2,
        settlementPeriod,
        settlementStatus: 'pending'
      })
      .exec();

    // Get B→A transactions
    const bToA = await this.transactionModel
      .find({
        fromAccountId: accountId2,
        toAccountId: accountId1,
        settlementPeriod,
        settlementStatus: 'pending'
      })
      .exec();

    if (aToB.length === 0 && bToA.length === 0) {
      return {
        netAmount: 0,
        netDirection: 'balanced',
        transactionsNetted: 0
      };
    }

    // Calculate totals
    const aToBTotal = aToB.reduce((sum, tx) => sum + (tx.amount || 0), 0);
    const bToATotal = bToA.reduce((sum, tx) => sum + (tx.amount || 0), 0);
    const netAmount = Math.abs(aToBTotal - bToATotal);
    
    let netDirection: 'from1to2' | 'from2to1' | 'balanced';
    if (aToBTotal > bToATotal) {
      netDirection = 'from1to2';
    } else if (bToATotal > aToBTotal) {
      netDirection = 'from2to1';
    } else {
      netDirection = 'balanced';
    }

    // Mark all transactions as netted_bilateral
    const allTransactionIds = [
      ...aToB.map(t => t._id),
      ...bToA.map(t => t._id)
    ];

    const updateResult = await this.transactionModel.updateMany(
      {
        _id: { $in: allTransactionIds }
      },
      {
        $set: {
          settlementStatus: 'netted_bilateral',
          nettedAt: new Date()
        }
      }
    );

    this.logger.log(
      `Bilateral netting complete: ${updateResult.modifiedCount} transactions netted, ` +
      `net amount: ${netAmount} (${netDirection})`
    );

    return {
      netAmount,
      netDirection,
      transactionsNetted: updateResult.modifiedCount
    };
  }

  /**
   * Process netting for all accounts in a settlement period
   */
  async processMonthlyNetting(period?: string): Promise<NettingResult> {
    const settlementPeriod = period || getCurrentSettlementPeriod();
    
    this.logger.log(`Starting monthly netting for period ${settlementPeriod}`);

    // Get all unique billing accounts with pending transactions
    const accountsWithPendingTx = await this.transactionModel.distinct('fromAccountId', {
      settlementPeriod,
      settlementStatus: 'pending',
      fromAccountId: { $exists: true, $ne: null }
    });

    let internalNettingCount = 0;
    let internalAmountNetted = 0;
    let internalTransactionsNetted = 0;

    let bilateralPairsProcessed = 0;
    let bilateralAmountNetted = 0;
    let bilateralTransactionsNetted = 0;

    // Step 1: Process internal netting for each account
    for (const accountId of accountsWithPendingTx) {
      const result = await this.processInternalNetting(accountId, settlementPeriod);
      
      if (result.internalTransactions.count > 0) {
        internalNettingCount++;
        internalAmountNetted += result.internalTransactions.netted;
        internalTransactionsNetted += result.internalTransactions.count;
      }
    }

    // Step 2: Process bilateral netting between account pairs
    const processedPairs = new Set<string>();
    
    for (let i = 0; i < accountsWithPendingTx.length; i++) {
      for (let j = i + 1; j < accountsWithPendingTx.length; j++) {
        const account1 = accountsWithPendingTx[i];
        const account2 = accountsWithPendingTx[j];
        const pairKey = [account1, account2].sort().join('|');

        if (processedPairs.has(pairKey)) {
          continue;
        }

        const result = await this.processBilateralNetting(account1, account2, settlementPeriod);
        
        if (result.transactionsNetted > 0) {
          bilateralPairsProcessed++;
          bilateralAmountNetted += result.netAmount;
          bilateralTransactionsNetted += result.transactionsNetted;
        }

        processedPairs.add(pairKey);
      }
    }

    // Calculate remaining transactions still pending
    const remainingTx = await this.transactionModel.countDocuments({
      settlementPeriod,
      settlementStatus: 'pending'
    });

    const totalTransactionsProcessed = internalTransactionsNetted + bilateralTransactionsNetted;

    this.logger.log(
      `Monthly netting complete for ${settlementPeriod}: ` +
      `${totalTransactionsProcessed} transactions netted, ` +
      `${remainingTx} transactions remaining for settlement`
    );

    return {
      period: settlementPeriod,
      processedAccounts: accountsWithPendingTx.length,
      internalNetting: {
        accountsProcessed: internalNettingCount,
        transactionsNetted: internalTransactionsNetted,
        totalAmountNetted: internalAmountNetted
      },
      bilateralNetting: {
        pairsProcessed: bilateralPairsProcessed,
        transactionsNetted: bilateralTransactionsNetted,
        totalAmountNetted: bilateralAmountNetted
      },
      summary: {
        totalTransactionsProcessed,
        totalAmountNetted: internalAmountNetted + bilateralAmountNetted,
        remainingForSettlement: remainingTx
      }
    };
  }

  /**
   * Preview netting results without actually updating transactions
   */
  async previewNetting(accountId: string, period?: string): Promise<AccountNetting> {
    const settlementPeriod = period || getCurrentSettlementPeriod();

    // Count internal transactions
    const internalTx = await this.transactionModel
      .find({
        fromAccountId: accountId,
        toAccountId: accountId,
        settlementPeriod,
        settlementStatus: 'pending'
      })
      .exec();

    const internalNetted = internalTx.reduce((sum, tx) => sum + (tx.amount || 0), 0);

    // Find all counterparties for bilateral netting
    const outgoingCounterparties = await this.transactionModel.distinct('toAccountId', {
      fromAccountId: accountId,
      settlementPeriod,
      settlementStatus: 'pending',
      toAccountId: { $ne: accountId }
    });

    const incomingCounterparties = await this.transactionModel.distinct('fromAccountId', {
      toAccountId: accountId,
      settlementPeriod,
      settlementStatus: 'pending',
      fromAccountId: { $ne: accountId }
    });

    const allCounterparties = [...new Set([...outgoingCounterparties, ...incomingCounterparties])];

    // Calculate potential bilateral netting with each counterparty
    let bilateralNetted = 0;
    let bilateralCount = 0;

    for (const counterparty of allCounterparties) {
      const outgoing = await this.transactionModel
        .find({
          fromAccountId: accountId,
          toAccountId: counterparty,
          settlementPeriod,
          settlementStatus: 'pending'
        })
        .exec();

      const incoming = await this.transactionModel
        .find({
          fromAccountId: counterparty,
          toAccountId: accountId,
          settlementPeriod,
          settlementStatus: 'pending'
        })
        .exec();

      if (outgoing.length > 0 && incoming.length > 0) {
        const outgoingTotal = outgoing.reduce((sum, tx) => sum + (tx.amount || 0), 0);
        const incomingTotal = incoming.reduce((sum, tx) => sum + (tx.amount || 0), 0);
        bilateralNetted += Math.abs(outgoingTotal - incomingTotal);
        bilateralCount += outgoing.length + incoming.length;
      }
    }

    return {
      accountId,
      internalTransactions: {
        netted: internalNetted,
        count: internalTx.length
      },
      bilateralTransactions: {
        netted: bilateralNetted,
        count: bilateralCount,
        counterparties: allCounterparties
      }
    };
  }
}
