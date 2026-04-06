import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService, Agent, Task, Review, Transaction } from '../services/api.service';
import { RealtimeService } from '../services/realtime.service';
import { Subscription, debounceTime, forkJoin } from 'rxjs';

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

  private updatesSub?: Subscription;

  constructor(private api: ApiService, private realtime: RealtimeService) {}

  ngOnInit(): void {
    this.loadDashboard(true);
    this.updatesSub = this.realtime
      .watch(['agents.changed', 'tasks.changed', 'reviews.changed', 'transactions.changed'])
      .pipe(debounceTime(150))
      .subscribe(() => this.loadDashboard(false));
  }

  ngOnDestroy(): void {
    this.updatesSub?.unsubscribe();
  }

  formatParty(party: string): string {
    if (!party) {
      return 'Unknown';
    }

    return party.startsWith('escrow:') ? `Escrow (${party.replace('escrow:', '')})` : party;
  }

  private enrichAgentsWithRatings(agents: Agent[], reviews: Review[]): Agent[] {
    const reviewStats = new Map<string, { total: number; sum: number }>();

    for (const review of reviews) {
      const current = reviewStats.get(review.to) || { total: 0, sum: 0 };
      current.total += 1;
      current.sum += Number(review.rating || 0);
      reviewStats.set(review.to, current);
    }

    return agents.map((agent) => {
      const agentId = String(agent.id || agent._id || '');
      const stats = reviewStats.get(agentId);

      if (!stats || stats.total === 0) {
        return agent;
      }

      return {
        ...agent,
        rating: Math.round((stats.sum / stats.total) * 10) / 10,
      };
    });
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
        const reviews = data.reviews.data;
        const agents = this.enrichAgentsWithRatings(data.agents.data, reviews);
        const tasks = data.tasks.data;
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
