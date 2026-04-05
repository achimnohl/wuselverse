import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService, Agent, Task, Review, Transaction } from '../services/api.service';
import { forkJoin } from 'rxjs';

@Component({
  standalone: true,
  imports: [CommonModule],
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit, OnDestroy {
  loading = true;
  stats = {
    activeAgents: 0,
    totalTasks: 0,
    completedTasks: 0,
    totalReviews: 0,
    totalTransactions: 0,
    paymentVolume: 0
  };
  topAgents: Agent[] = [];
  recentTasks: Task[] = [];
  recentTransactions: Transaction[] = [];

  private refreshHandle?: ReturnType<typeof setInterval>;

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.loadDashboard(true);
    this.refreshHandle = setInterval(() => this.loadDashboard(false), 4000);
  }

  ngOnDestroy(): void {
    if (this.refreshHandle) {
      clearInterval(this.refreshHandle);
    }
  }

  formatParty(party: string): string {
    if (!party) {
      return 'Unknown';
    }

    return party.startsWith('escrow:') ? `Escrow (${party.replace('escrow:', '')})` : party;
  }

  private loadDashboard(showLoading: boolean): void {
    if (showLoading) {
      this.loading = true;
    }

    forkJoin({
      agents: this.api.getAgents(1, 50),
      tasks: this.api.getTasks(1, 50),
      reviews: this.api.getReviews(1, 50),
      transactions: this.api.getTransactions(1, 20)
    }).subscribe({
      next: (data) => {
        const agents = data.agents.data;
        const tasks = data.tasks.data;
        const reviews = data.reviews.data;
        const transactions = [...data.transactions.data].sort(
          (a: Transaction, b: Transaction) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        this.stats = {
          activeAgents: agents.filter((a: Agent) => a.status === 'active').length,
          totalTasks: data.tasks.total,
          completedTasks: tasks.filter((t: Task) => t.status === 'completed').length,
          totalReviews: data.reviews.total,
          totalTransactions: data.transactions.total,
          paymentVolume: transactions
            .filter((tx: Transaction) => tx.type === 'payment' && tx.status === 'completed')
            .reduce((sum: number, tx: Transaction) => sum + Number(tx.amount || 0), 0)
        };

        this.topAgents = agents
          .filter((a: Agent) => a.rating !== null)
          .sort((a: Agent, b: Agent) => (b.rating || 0) - (a.rating || 0))
          .slice(0, 5);

        this.recentTasks = [...tasks]
          .sort((a: Task, b: Task) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 5);

        this.recentTransactions = transactions.slice(0, 5);

        this.loading = false;
      },
      error: (error: any) => {
        console.error('Error loading dashboard data:', error);
        this.loading = false;
      }
    });
  }
}
