import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BillingAccountSchema } from './billing-account.schema';
import { BillingAccountsService } from './billing-accounts.service';
import { BillingAccountsController } from './billing-accounts.controller';
import { BillingService } from './billing.service';
import { AccountLedgerService } from './account-ledger.service';
import { NettingService } from './netting.service';
import { SettlementProcessorService } from './settlement-processor.service';
import { InvoicingService } from './invoicing.service';
import { SettlementSchedulerService } from './settlement-scheduler.service';
import { SettlementController } from './settlement.controller';
import { TransactionSchema } from '../transactions/transaction.schema';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'BillingAccount', schema: BillingAccountSchema },
      { name: 'Transaction', schema: TransactionSchema }
    ]),
    AuthModule
  ],
  controllers: [BillingAccountsController, SettlementController],
  providers: [
    BillingAccountsService,
    BillingService,
    AccountLedgerService,
    NettingService,
    SettlementProcessorService,
    InvoicingService,
    SettlementSchedulerService
  ],
  exports: [
    BillingAccountsService,
    BillingService,
    AccountLedgerService,
    NettingService,
    SettlementProcessorService,
    InvoicingService,
    SettlementSchedulerService
  ]
})
export class BillingModule {}
