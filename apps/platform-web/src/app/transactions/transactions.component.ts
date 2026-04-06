import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription, debounceTime } from 'rxjs';
import { ApiService, Transaction } from '../services/api.service';
import { RealtimeService } from '../services/realtime.service';

@Component({
  standalone: true,
  imports: [CommonModule],
  selector: 'app-transactions',
  templateUrl: './transactions.component.html',
  styleUrls: ['./transactions.component.scss']
})
export class TransactionsComponent implements OnInit, OnDestroy {
  loading = true;
  transactions: Transaction[] = [];
  summary = {
    totalCount: 0,
    escrowVolume: 0,
    payoutVolume: 0,
    pendingCount: 0
  };

  currentPage = 1;
  pageSize = 12;
  total = 0;
  totalPages = 0;

  private updatesSub?: Subscription;

  constructor(private api: ApiService, private realtime: RealtimeService) {}

  ngOnInit(): void {
    this.loadTransactions(true);
    this.updatesSub = this.realtime
      .watch(['transactions.changed'])
      .pipe(debounceTime(150))
      .subscribe(() => this.loadTransactions(false));
  }

  ngOnDestroy(): void {
    this.updatesSub?.unsubscribe();
  }

  loadTransactions(showLoading: boolean = true): void {
    if (showLoading) {
      this.loading = true;
    }

    this.api.getTransactions(this.currentPage, this.pageSize).subscribe({
      next: (response) => {
        const items = [...response.data].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        this.transactions = items;
        this.currentPage = response.page;
        this.pageSize = response.limit;
        this.total = response.total;
        this.totalPages = response.totalPages;
        this.summary = {
          totalCount: response.total,
          escrowVolume: this.sumAmount(items, 'escrow_lock'),
          payoutVolume: this.sumAmount(items, 'payment'),
          pendingCount: items.filter((tx) => tx.status === 'pending').length
        };
        this.loading = false;
      },
      error: (error: any) => {
        console.error('Error loading transactions:', error);
        this.loading = false;
      }
    });
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.loadTransactions();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  getTypeLabel(type: string): string {
    switch (type) {
      case 'escrow_lock':
        return 'Escrow locked';
      case 'payment':
        return 'Payment released';
      case 'refund':
        return 'Refund issued';
      case 'reward':
        return 'Reward';
      case 'penalty':
        return 'Penalty';
      default:
        return type.replace(/_/g, ' ');
    }
  }

  getTypeIcon(type: string): string {
    switch (type) {
      case 'escrow_lock':
        return '🔒';
      case 'payment':
        return '💸';
      case 'refund':
        return '↩️';
      case 'reward':
        return '🏆';
      case 'penalty':
        return '⚠️';
      default:
        return '💳';
    }
  }

  formatParty(party: string): string {
    if (!party) {
      return 'Unknown';
    }

    if (party.startsWith('escrow:')) {
      return `Escrow (${party.replace('escrow:', '')})`;
    }

    return party;
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    })}`;
  }

  private sumAmount(items: Transaction[], type: string): number {
    return items
      .filter((tx) => tx.type === type && tx.status === 'completed')
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  }
}
