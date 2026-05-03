import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { 
  ApiService, 
  BillingAccount, 
  MonthlyStatement, 
  BalanceHistory, 
  Invoice, 
  UsageReport 
} from '../services/api.service';

@Component({
  standalone: true,
  imports: [CommonModule],
  selector: 'app-billing',
  templateUrl: './billing.component.html',
  styleUrls: ['./billing.component.scss']
})
export class BillingComponent implements OnInit {
  loading = true;
  selectedPeriod: string = this.getCurrentPeriod();
  selectedTab: 'overview' | 'statement' | 'history' | 'invoice' | 'usage' = 'overview';

  account: BillingAccount | null = null;
  statement: MonthlyStatement | null = null;
  history: BalanceHistory | null = null;
  invoice: Invoice | null = null;
  usageReport: UsageReport | null = null;

  // Available periods for selection
  availablePeriods: string[] = [];

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.generateAvailablePeriods();
    this.loadBillingData();
  }

  loadBillingData(): void {
    this.loading = true;
    
    // Load all data in parallel
    this.api.getMyBillingAccount().subscribe({
      next: (account) => {
        this.account = account;
        this.loadStatementData();
      },
      error: (err) => {
        console.error('Failed to load billing account:', err);
        this.loading = false;
      }
    });
  }

  loadStatementData(): void {
    this.api.getMyStatement(this.selectedPeriod).subscribe({
      next: (statement) => {
        this.statement = statement;
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load statement:', err);
        this.loading = false;
      }
    });
  }

  loadHistory(): void {
    if (this.history) return; // Already loaded
    
    this.api.getMyBalanceHistory(6).subscribe({
      next: (history) => {
        this.history = history;
      },
      error: (err) => {
        console.error('Failed to load history:', err);
      }
    });
  }

  loadInvoice(): void {
    this.api.getMyInvoice(this.selectedPeriod).subscribe({
      next: (invoice) => {
        this.invoice = invoice;
      },
      error: (err) => {
        console.error('Failed to load invoice:', err);
      }
    });
  }

  loadUsageReport(): void {
    this.api.getMyUsageReport(this.selectedPeriod).subscribe({
      next: (report) => {
        this.usageReport = report;
      },
      error: (err) => {
        console.error('Failed to load usage report:', err);
      }
    });
  }

  selectTab(tab: 'overview' | 'statement' | 'history' | 'invoice' | 'usage'): void {
    this.selectedTab = tab;
    
    // Lazy load data for each tab
    if (tab === 'history' && !this.history) {
      this.loadHistory();
    } else if (tab === 'invoice' && !this.invoice) {
      this.loadInvoice();
    } else if (tab === 'usage' && !this.usageReport) {
      this.loadUsageReport();
    }
  }

  onPeriodChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.selectedPeriod = target.value;
    this.statement = null;
    this.invoice = null;
    this.usageReport = null;
    this.loadStatementData();
  }

  getCurrentPeriod(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  generateAvailablePeriods(): void {
    const periods: string[] = [];
    const now = new Date();
    
    // Generate last 12 months
    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      periods.push(`${year}-${month}`);
    }
    
    this.availablePeriods = periods;
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  formatPeriod(period: string): string {
    const [year, month] = period.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long'
    });
  }

  getTrendIcon(trend: string): string {
    if (trend === 'increasing') return '📈';
    if (trend === 'decreasing') return '📉';
    return '➡️';
  }

  getTrendClass(trend: string): string {
    if (trend === 'increasing') return 'trend-up';
    if (trend === 'decreasing') return 'trend-down';
    return 'trend-stable';
  }

  getBalanceClass(amount: number): string {
    if (amount > 0) return 'balance-positive';
    if (amount < 0) return 'balance-negative';
    return 'balance-zero';
  }

  getBarHeight(balance: number): number {
    if (!this.history) return 0;
    
    const maxBalance = Math.max(...this.history.snapshots.map(s => Math.abs(s.balance)));
    if (maxBalance === 0) return 0;
    
    return (Math.abs(balance) / maxBalance) * 100;
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'pending': return 'badge-pending';
      case 'netted_internal': return 'badge-netted';
      case 'netted_bilateral': return 'badge-netted';
      case 'settled': return 'badge-settled';
      default: return 'badge-default';
    }
  }

  downloadInvoice(): void {
    if (!this.invoice) return;
    
    // Create a simple text representation
    const text = this.formatInvoiceText(this.invoice);
    const blob = new Blob([text], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoice-${this.invoice.id}.txt`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  private formatInvoiceText(invoice: Invoice): string {
    const lines = [
      '='.repeat(60),
      `INVOICE ${invoice.id}`,
      `Period: ${this.formatPeriod(invoice.period)}`,
      `Account ID: ${invoice.accountId}`,
      `Generated: ${this.formatDate(invoice.generatedAt)}`,
      `Due Date: ${this.formatDate(invoice.dueDate)}`,
      '='.repeat(60),
      '',
      'LINE ITEMS:',
      '-'.repeat(60)
    ];

    for (const item of invoice.lineItems) {
      lines.push(
        `${item.description.padEnd(35)} ${String(item.quantity).padStart(5)} x ` +
        `${this.formatCurrency(item.unitPrice).padStart(10)} = ${this.formatCurrency(item.amount).padStart(10)}`
      );
    }

    lines.push(
      '-'.repeat(60),
      '',
      `Total Earned:              ${this.formatCurrency(invoice.totalEarned).padStart(10)}`,
      `Total Spent:               ${this.formatCurrency(invoice.totalSpent).padStart(10)}`,
      `Internal Netting:          ${this.formatCurrency(invoice.nettedInternal).padStart(10)}`,
      `Bilateral Netting:         ${this.formatCurrency(invoice.nettedBilateral).padStart(10)}`,
      '='.repeat(60),
      `NET AMOUNT:                ${this.formatCurrency(invoice.netAmount).padStart(10)}`,
      '='.repeat(60),
      '',
      `Status: ${invoice.status}`,
      `Currency: ${invoice.currency}`,
      ''
    );

    return lines.join('\n');
  }
}
