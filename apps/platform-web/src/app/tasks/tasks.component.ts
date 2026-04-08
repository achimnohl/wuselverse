import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription, debounceTime, forkJoin } from 'rxjs';
import { ApiService, Agent, SessionUser, Task } from '../services/api.service';
import { RealtimeService } from '../services/realtime.service';

@Component({
  standalone: true,
  imports: [CommonModule],
  selector: 'app-tasks',
  templateUrl: './tasks.component.html',
  styleUrls: ['./tasks.component.scss']
})
export class TasksComponent implements OnInit, OnDestroy {
  loading = true;
  tasks: Task[] = [];
  filterStatus: string | null = null;
  statuses = [null, 'open', 'bidding', 'assigned', 'in_progress', 'completed', 'failed'];
  
  // Pagination
  currentPage = 1;
  pageSize = 10;
  total = 0;
  totalPages = 0;
  currentUser: SessionUser | null = null;
  postingDemoTask = false;
  postTaskError: string | null = null;
  postTaskMessage: string | null = null;

  private updatesSub?: Subscription;
  private agentNames = new Map<string, string>();

  constructor(private api: ApiService, private realtime: RealtimeService) {}

  ngOnInit(): void {
    this.api.getCurrentUser().subscribe({
      next: (user) => {
        this.currentUser = user;
      },
      error: () => {
        this.currentUser = null;
      }
    });

    this.loadTasks(true);
    this.updatesSub = this.realtime
      .watch(['tasks.changed'])
      .pipe(debounceTime(150))
      .subscribe(() => this.loadTasks(false));
  }

  ngOnDestroy(): void {
    this.updatesSub?.unsubscribe();
  }

  loadTasks(showLoading: boolean = true): void {
    if (showLoading) {
      this.loading = true;
    }
    forkJoin({
      tasks: this.api.getTasks(this.currentPage, this.pageSize),
      agents: this.api.getAgents(1, 200),
    }).subscribe({
      next: ({ tasks: response, agents }) => {
        this.captureAgentNames(agents.data ?? []);
        this.tasks = response.data;
        this.currentPage = response.page;
        this.pageSize = response.limit;
        this.total = response.total;
        this.totalPages = response.totalPages;
        this.loading = false;
      },
      error: (error: any) => {
        console.error('Error loading tasks:', error);
        this.loading = false;
      }
    });
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.loadTasks();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  postDemoTask(): void {
    if (!this.currentUser) {
      this.postTaskError = 'Sign in to create tasks from the web workspace.';
      this.postTaskMessage = null;
      return;
    }

    this.postingDemoTask = true;
    this.postTaskError = null;
    this.postTaskMessage = null;

    this.api.createTask({
      title: `Quick task request ${new Date().toLocaleTimeString()}`,
      description: 'Created from the signed-in workspace using the secure session-based browser flow.',
      poster: this.currentUser.id,
      requirements: {
        capabilities: ['security-scan', 'documentation'],
      },
      budget: {
        amount: 40,
        currency: 'USD',
        type: 'fixed',
      },
      metadata: {
        source: 'platform-web-ui',
        protectedWriteFlow: true,
      },
    }).subscribe({
      next: (task) => {
        this.postingDemoTask = false;
        this.postTaskMessage = `Created "${task.title}" successfully.`;
        this.currentPage = 1;
        this.loadTasks(false);
      },
      error: (error: any) => {
        this.postingDemoTask = false;
        this.postTaskError = error?.error?.message || 'Unable to create the task right now. Sign in first and try again.';
      }
    });
  }

  getTasksByStatus(status: string | null): Task[] {
    if (!status) {
      return this.tasks;
    }
    return this.tasks.filter(task => task.status === status);
  }

  getActorName(idOrName: string | null | undefined): string {
    if (!idOrName) {
      return 'Unknown';
    }

    return this.agentNames.get(idOrName) || idOrName;
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) {
      return `${diffMins} minutes ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hours ago`;
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  private captureAgentNames(agents: Agent[]): void {
    this.agentNames = new Map(
      agents
        .map((agent) => [String(agent.id || agent._id || ''), agent.name] as const)
        .filter(([id]) => !!id)
    );
  }
}
