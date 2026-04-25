import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseMongoService } from '@wuselverse/crud-framework';
import { BillingAccountDocument } from './billing-account.schema';
import { BillingAccount } from '@wuselverse/contracts';

@Injectable()
export class BillingAccountsService extends BaseMongoService<BillingAccountDocument> {
  constructor(
    @InjectModel('BillingAccount') private billingAccountModel: Model<BillingAccountDocument>
  ) {
    super(billingAccountModel);
  }

  /**
   * Find billing account by owner ID
   */
  async findByOwner(ownerId: string): Promise<BillingAccount | null> {
    const account = await this.billingAccountModel
      .findOne({ ownerId })
      .lean()
      .exec();
    
    return account ? this.toResponseObject(account) : null;
  }

  /**
   * Create personal billing account for a user
   */
  async createPersonalAccount(ownerId: string, ownerName: string): Promise<BillingAccount> {
    const account = await this.billingAccountModel.create({
      name: `${ownerName}'s Account`,
      type: 'individual',
      ownerId,
      balance: 0,
      settings: {
        settlementSchedule: 'monthly',
        currency: 'USD'
      }
    });

    return this.toResponseObject(account);
  }

  /**
   * Get balance for a billing account
   */
  async getBalance(accountId: string): Promise<number> {
    const account = await this.billingAccountModel
      .findById(accountId)
      .select('balance')
      .lean()
      .exec();
    
    return account?.balance ?? 0;
  }

  /**
   * Update balance (internal use only, not exposed via API)
   */
  async updateBalance(accountId: string, delta: number): Promise<void> {
    await this.billingAccountModel
      .findByIdAndUpdate(
        accountId,
        { $inc: { balance: delta } },
        { new: true }
      )
      .exec();
  }

  private toResponseObject(doc: any): BillingAccount {
    return {
      id: doc._id.toString(),
      name: doc.name,
      type: doc.type,
      ownerId: doc.ownerId,
      balance: doc.balance,
      settings: doc.settings,
      taxInfo: doc.taxInfo,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    };
  }
}
