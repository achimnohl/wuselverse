import { Injectable, Logger } from '@nestjs/common';
import { SettlementProcessorService } from './settlement-processor.service';
import { InvoicingService } from './invoicing.service';
import { getPreviousSettlementPeriod, getCurrentSettlementPeriod } from './settlement-period.utils';

/**
 * Service for scheduling and running monthly settlement jobs
 * 
 * In production, this would use @nestjs/schedule with @Cron decorators
 * For MVP, provides manual trigger methods that can be called via API or CLI
 */
@Injectable()
export class SettlementSchedulerService {
  private readonly logger = new Logger(SettlementSchedulerService.name);
  private isRunning = false;

  constructor(
    private settlementProcessor: SettlementProcessorService,
    private invoicingService: InvoicingService
  ) {}

  /**
   * Run monthly settlement for the previous month
   * This would normally be triggered by a cron job on the 1st of each month
   */
  async runMonthlySettlement(): Promise<{
    success: boolean;
    period: string;
    settlementResult?: any;
    invoices?: any[];
    error?: string;
  }> {
    if (this.isRunning) {
      this.logger.warn('Settlement job already running, skipping...');
      return {
        success: false,
        period: '',
        error: 'Settlement job already running'
      };
    }

    this.isRunning = true;
    const settlementPeriod = getPreviousSettlementPeriod(getCurrentSettlementPeriod());

    try {
      this.logger.log(`Starting monthly settlement job for period ${settlementPeriod}`);

      // Step 1: Check if settlement is needed
      const needed = await this.settlementProcessor.isSettlementNeeded(settlementPeriod);
      
      if (!needed) {
        this.logger.log(`No settlement needed for period ${settlementPeriod}`);
        return {
          success: true,
          period: settlementPeriod,
          error: 'No pending transactions to settle'
        };
      }

      // Step 2: Process settlement (netting + balance updates)
      const settlementResult = await this.settlementProcessor.processMonthlySettlement(settlementPeriod);

      this.logger.log(
        `Settlement complete for ${settlementPeriod}: ` +
        `${settlementResult.summary.successfulSettlements} successful, ` +
        `${settlementResult.summary.failedSettlements} failed`
      );

      // Step 3: Generate invoices for all settled accounts
      const invoices = await this.invoicingService.generateMonthlyInvoices(settlementPeriod);

      this.logger.log(`Generated ${invoices.length} invoices for period ${settlementPeriod}`);

      // Step 4: (Future) Send invoice emails
      // await this.sendInvoiceEmails(invoices);

      this.logger.log(`Monthly settlement job completed successfully for ${settlementPeriod}`);

      return {
        success: true,
        period: settlementPeriod,
        settlementResult,
        invoices
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Monthly settlement job failed: ${errorMessage}`, errorStack);
      return {
        success: false,
        period: settlementPeriod,
        error: errorMessage
      };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Preview what the next settlement run would do
   */
  async previewNextSettlement(): Promise<any> {
    const settlementPeriod = getPreviousSettlementPeriod(getCurrentSettlementPeriod());
    
    this.logger.log(`Previewing settlement for period ${settlementPeriod}`);

    const preview = await this.settlementProcessor.previewSettlement(settlementPeriod);
    const needed = await this.settlementProcessor.isSettlementNeeded(settlementPeriod);

    return {
      period: settlementPeriod,
      settlementNeeded: needed,
      preview
    };
  }

  /**
   * Get current settlement job status
   */
  getJobStatus(): { isRunning: boolean; currentPeriod?: string } {
    return {
      isRunning: this.isRunning,
      currentPeriod: this.isRunning ? getPreviousSettlementPeriod(getCurrentSettlementPeriod()) : undefined
    };
  }
}
