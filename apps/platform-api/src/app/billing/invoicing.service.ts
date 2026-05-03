import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BillingService, MonthlyBalance } from './billing.service';
import { BillingAccountsService } from './billing-accounts.service';
import { AccountLedgerService } from './account-ledger.service';
import { getCurrentSettlementPeriod, getPreviousSettlementPeriod } from './settlement-period.utils';
import { Invoice, InvoiceStatus, InvoiceLineItem } from '@wuselverse/contracts';

export interface GeneratedInvoice extends Invoice {
  // Extended with generation metadata
  generatedAt: Date;
  pdfUrl?: string;
}

@Injectable()
export class InvoicingService {
  private readonly logger = new Logger(InvoicingService.name);

  constructor(
    private billingService: BillingService,
    private billingAccountsService: BillingAccountsService,
    private accountLedgerService: AccountLedgerService
  ) {}

  /**
   * Generate invoice for a billing account for a specific period
   */
  async generateInvoice(accountId: string, period?: string): Promise<GeneratedInvoice> {
    const settlementPeriod = period || getPreviousSettlementPeriod(getCurrentSettlementPeriod());
    
    this.logger.log(`Generating invoice for account ${accountId}, period ${settlementPeriod}`);

    // Get account details
    const account = await this.billingAccountsService.findById(accountId);
    if (!account.success || !account.data) {
      throw new Error(`Billing account not found: ${accountId}`);
    }

    // Get monthly balance and transactions
    const balance = await this.billingService.calculateMonthlyBalance(accountId, settlementPeriod);
    const transactions = await this.billingService.getAccountTransactions(accountId, settlementPeriod);

    // Generate line items from transactions
    const lineItems: InvoiceLineItem[] = [];

    // Group earnings
    if (balance.totalEarnings > 0) {
      const earningTransactions = transactions.transactions.filter(t => t.type === 'payment' && t.to === accountId);
      lineItems.push({
        type: 'earning',
        description: 'Agent task earnings',
        amount: balance.totalEarnings,
        transactionIds: earningTransactions.map(t => t.id.toString()),
        count: earningTransactions.length
      });
    }

    // Group spending
    if (balance.totalSpending > 0) {
      const spendingTransactions = transactions.transactions.filter(t => t.type === 'escrow_lock' && t.from === accountId);
      lineItems.push({
        type: 'spending',
        description: 'Task posting costs',
        amount: -balance.totalSpending,
        transactionIds: spendingTransactions.map(t => t.id.toString()),
        count: spendingTransactions.length
      });
    }

    // Internal netting line item
    if (balance.nettedInternal !== 0) {
      const nettedInternalTransactions = transactions.transactions.filter(
        t => t.settlementStatus === 'netted_internal'
      );
      lineItems.push({
        type: 'netted_internal',
        description: 'Internal netting adjustment',
        amount: balance.nettedInternal,
        transactionIds: nettedInternalTransactions.map(t => t.id.toString()),
        count: nettedInternalTransactions.length
      });
    }

    // Bilateral netting line item
    if (balance.nettedBilateral !== 0) {
      const nettedBilateralTransactions = transactions.transactions.filter(
        t => t.settlementStatus === 'netted_bilateral'
      );
      lineItems.push({
        type: 'netted_bilateral',
        description: 'Bilateral netting adjustment',
        amount: balance.nettedBilateral,
        transactionIds: nettedBilateralTransactions.map(t => t.id.toString()),
        count: nettedBilateralTransactions.length
      });
    }

    const invoice: GeneratedInvoice = {
      id: `INV-${accountId.slice(-8)}-${settlementPeriod}`,
      accountId,
      period: settlementPeriod,
      lineItems,
      totalEarned: balance.totalEarnings,
      totalSpent: balance.totalSpending,
      nettedInternal: balance.nettedInternal,
      nettedBilateral: balance.nettedBilateral,
      netAmount: balance.netAmount,
      currency: 'USD',
      status: InvoiceStatus.DRAFT,
      issuedAt: new Date(),
      generatedAt: new Date()
    };

    this.logger.log(
      `Invoice generated: ${invoice.id}, net amount: ${invoice.netAmount}`
    );

    return invoice;
  }

  /**
   * Generate invoices for all accounts with activity in a period
   */
  async generateMonthlyInvoices(period?: string): Promise<GeneratedInvoice[]> {
    const settlementPeriod = period || getPreviousSettlementPeriod(getCurrentSettlementPeriod());
    
    this.logger.log(`Generating invoices for all accounts, period ${settlementPeriod}`);

    // Get all accounts with activity
    const accountsWithActivity = await this.getAccountsWithActivity(settlementPeriod);
    
    const invoices: GeneratedInvoice[] = [];

    for (const accountId of accountsWithActivity) {
      try {
        const invoice = await this.generateInvoice(accountId, settlementPeriod);
        invoices.push(invoice);
      } catch (error) {
        this.logger.error(`Failed to generate invoice for account ${accountId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    this.logger.log(`Generated ${invoices.length} invoices for period ${settlementPeriod}`);

    return invoices;
  }

  /**
   * Preview invoice without saving
   */
  async previewInvoice(accountId: string, period?: string): Promise<GeneratedInvoice> {
    return this.generateInvoice(accountId, period);
  }

  /**
   * Generate usage report for an account
   */
  async generateUsageReport(accountId: string, period?: string) {
    const settlementPeriod = period || getCurrentSettlementPeriod();

    this.logger.log(`Generating usage report for account ${accountId}, period ${settlementPeriod}`);

    const transactions = await this.billingService.getAccountTransactions(accountId, settlementPeriod);
    const balance = await this.billingService.calculateMonthlyBalance(accountId, settlementPeriod);
    const history = await this.accountLedgerService.getBalanceHistory(accountId, 6);

    // Calculate statistics
    const tasksPosted = transactions.transactions.filter(t => t.type === 'escrow_lock').length;
    const tasksCompleted = transactions.transactions.filter(t => t.type === 'payment').length;

    // Calculate netting efficiency (how much was netted vs gross amount)
    const grossAmount = balance.totalEarnings + balance.totalSpending;
    const nettedAmount = Math.abs(balance.nettedInternal) + Math.abs(balance.nettedBilateral);
    const nettingEfficiency = grossAmount > 0 ? (nettedAmount / grossAmount) * 100 : 0;

    return {
      accountId,
      period: settlementPeriod,
      tasksPosted,
      tasksCompleted,
      totalEarnings: balance.totalEarnings,
      totalSpending: balance.totalSpending,
      netAmount: balance.netAmount,
      nettingEfficiency: Math.round(nettingEfficiency * 100) / 100, // Round to 2 decimals
      balanceTrend: history.trend,
      transactionCount: transactions.transactions.length,
      summary: transactions.summary
    };
  }

  /**
   * Get accounts with activity in a period
   */
  private async getAccountsWithActivity(period: string): Promise<string[]> {
    const balance = await this.billingService.calculateMonthlyBalance;
    // This would need to query transactions to find unique account IDs
    // For now, returning empty array as placeholder
    // In real implementation, would query TransactionModel for distinct account IDs
    return [];
  }

  /**
   * Calculate due date (end of next month after settlement period)
   */
  private calculateDueDate(period: string): Date {
    const [year, month] = period.split('-').map(Number);
    // Due date is end of the month following the settlement period
    const dueDate = new Date(year, month + 1, 0); // Last day of next month
    return dueDate;
  }

  /**
   * Format invoice as text (for email or console display)
   */
  formatInvoiceAsText(invoice: GeneratedInvoice): string {
    const lines = [
      '='.repeat(60),
      `INVOICE ${invoice.id}`,
      `Period: ${invoice.period}`,
      `Account ID: ${invoice.accountId}`,
      `Generated: ${invoice.generatedAt.toISOString()}`,
      `Issued: ${invoice.issuedAt.toISOString().split('T')[0]}`,
      '='.repeat(60),
      '',
      'LINE ITEMS:',
      '-'.repeat(60)
    ];

    for (const item of invoice.lineItems) {
      lines.push(
        `${item.description.padEnd(45)} (${String(item.count).padStart(3)} txns) ` +
        `$${item.amount.toFixed(2).padStart(10)}`
      );
    }

    lines.push(
      '-'.repeat(60),
      '',
      `Total Earned:              $${invoice.totalEarned.toFixed(2).padStart(10)}`,
      `Total Spent:               $${invoice.totalSpent.toFixed(2).padStart(10)}`,
      `Internal Netting:          $${invoice.nettedInternal.toFixed(2).padStart(10)}`,
      `Bilateral Netting:         $${invoice.nettedBilateral.toFixed(2).padStart(10)}`,
      '='.repeat(60),
      `NET AMOUNT:                $${invoice.netAmount.toFixed(2).padStart(10)}`,
      '='.repeat(60),
      '',
      `Status: ${invoice.status}`,
      `Currency: ${invoice.currency}`,
      ''
    );

    return lines.join('\n');
  }
}
