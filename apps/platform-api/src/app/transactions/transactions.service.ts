import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseMongoService } from '@wuselverse/crud-framework';
import { TransactionDocument } from './transaction.schema';
import { Transaction, TransactionType, TransactionStatus } from '@wuselverse/contracts';

@Injectable()
export class TransactionsService extends BaseMongoService<TransactionDocument> {
  constructor(@InjectModel('Transaction') private transactionModel: Model<TransactionDocument>) {
    super(transactionModel);
  }

  /**
   * Get all transactions for a specific task
   */
  async findByTask(taskId: string): Promise<Transaction[]> {
    const transactions = await this.transactionModel
      .find({ taskId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    
    return transactions.map(tx => this.toResponseObject(tx));
  }

  /**
   * Get transactions by payer
   */
  async findByPayer(payerId: string): Promise<Transaction[]> {
    const transactions = await this.transactionModel
      .find({ from: payerId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    
    return transactions.map(tx => this.toResponseObject(tx));
  }

  /**
   * Get transactions by recipient
   */
  async findByRecipient(recipientId: string): Promise<Transaction[]> {
    const transactions = await this.transactionModel
      .find({ to: recipientId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    
    return transactions.map(tx => this.toResponseObject(tx));
  }

  /**
   * Get transactions by type
   */
  async findByType(type: TransactionType): Promise<Transaction[]> {
    const transactions = await this.transactionModel
      .find({ type })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    
    return transactions.map(tx => this.toResponseObject(tx));
  }

  /**
   * Get pending transactions
   */
  async findPending(): Promise<Transaction[]> {
    const transactions = await this.transactionModel
      .find({ status: TransactionStatus.PENDING })
      .sort({ createdAt: 1 })
      .lean()
      .exec();
    
    return transactions.map(tx => this.toResponseObject(tx));
  }

  /**
   * Complete a transaction
   */
  async completeTransaction(transactionId: string): Promise<Transaction> {
    const updated = await this.transactionModel.findByIdAndUpdate(
      transactionId,
      { 
        status: TransactionStatus.COMPLETED,
        completedAt: new Date()
      },
      { new: true }
    ).lean().exec();

    if (!updated) {
      throw new Error('Transaction not found');
    }

    return this.toResponseObject(updated);
  }

  /**
   * Fail a transaction
   */
  async failTransaction(transactionId: string, reason?: string): Promise<Transaction> {
    const updated = await this.transactionModel.findByIdAndUpdate(
      transactionId,
      { 
        status: TransactionStatus.FAILED,
        'metadata.failureReason': reason
      },
      { new: true }
    ).lean().exec();

    if (!updated) {
      throw new Error('Transaction not found');
    }

    return this.toResponseObject(updated);
  }

  /**
   * Calculate total earnings for an agent
   */
  async getTotalEarnings(agentId: string): Promise<number> {
    const result = await this.transactionModel.aggregate([
      { 
        $match: { 
          to: agentId,
          status: TransactionStatus.COMPLETED,
          type: { $in: [TransactionType.PAYMENT, TransactionType.REWARD] }
        } 
      },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    return result.length > 0 ? result[0].total : 0;
  }

  /**
   * Calculate total spending for an agent/human
   */
  async getTotalSpending(entityId: string): Promise<number> {
    const result = await this.transactionModel.aggregate([
      { 
        $match: { 
          from: entityId,
          status: TransactionStatus.COMPLETED,
          type: { $in: [TransactionType.ESCROW_LOCK, TransactionType.PAYMENT] }
        } 
      },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    return result.length > 0 ? result[0].total : 0;
  }

  private toResponseObject(doc: any): Transaction {
    return {
      id: doc._id.toString(),
      from: doc.from,
      to: doc.to,
      amount: doc.amount,
      currency: doc.currency,
      type: doc.type,
      status: doc.status,
      taskId: doc.taskId,
      escrowId: doc.escrowId,
      createdAt: doc.createdAt,
      completedAt: doc.completedAt,
      metadata: doc.metadata || {}
    };
  }
}
