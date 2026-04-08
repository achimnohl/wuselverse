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
  statuses = [null, 'open', 'bidding', 'assigned', 'in_progress', 'pending_review', 'completed', 'disputed', 'failed'];
  
  // Pagination
  currentPage = 1;
  pageSize = 10;
  total = 0;
  totalPages = 0;
  currentUser: SessionUser | null = null;
  postingDemoTask = false;
  postTaskError: string | null = null;
  postTaskMessage: string | null = null;
  verificationBusyTaskId: string | null = null;
  showCreateForm = false;
  creatingCustomTask = false;
  expandedTaskId: string | null = null;
  customTaskForm = {
    title: '',
    description: '',
    capabilitiesText: 'security-scan, documentation',
    budgetAmount: 75,
    currency: 'USD',
    budgetType: 'fixed',
    acceptanceCriteriaText: 'Provide a concise summary of the work completed\nInclude at least one concrete artifact or evidence item',
    artifactInstructionsText: 'Attach a report, link, or structured evidence in the delivery payload',
  };

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
      acceptanceCriteria: [
        'Provide a short summary of the work completed',
        'Include at least one concrete artifact or evidence item',
      ],
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

  toggleCreateForm(): void {
    this.showCreateForm = !this.showCreateForm;
  }

  submitCustomTask(
    title: string,
    description: string,
    capabilitiesText: string,
    budgetAmount: number,
    currency: string,
    budgetType: string,
    acceptanceCriteriaText: string,
    artifactInstructionsText: string,
  ): void {
    if (!this.currentUser) {
      this.postTaskError = 'Sign in to create a custom task from the workspace.';
      this.postTaskMessage = null;
      return;
    }

    if (!title.trim() || !description.trim()) {
      this.postTaskError = 'Enter a title and description before creating the task.';
      this.postTaskMessage = null;
      return;
    }

    const capabilities = this.parseCapabilityList(capabilitiesText);
    if (capabilities.length === 0) {
      this.postTaskError = 'Add at least one required capability.';
      this.postTaskMessage = null;
      return;
    }

    this.creatingCustomTask = true;
    this.postTaskError = null;
    this.postTaskMessage = null;

    this.api.createTask({
      title: title.trim(),
      description: description.trim(),
      poster: this.currentUser.id,
      requirements: {
        capabilities,
      },
      budget: {
        amount: Number.isFinite(budgetAmount) && budgetAmount > 0 ? budgetAmount : 75,
        currency: currency.trim() || 'USD',
        type: budgetType,
      },
      acceptanceCriteria: this.parseMultilineList(acceptanceCriteriaText),
      metadata: {
        source: 'platform-web-custom-form',
        protectedWriteFlow: true,
        expectedArtifacts: this.parseMultilineList(artifactInstructionsText),
      },
    }).subscribe({
      next: (task) => {
        this.creatingCustomTask = false;
        this.showCreateForm = false;
        this.postTaskMessage = `Created "${task.title}" successfully.`;
        this.customTaskForm = {
          title: '',
          description: '',
          capabilitiesText: 'security-scan, documentation',
          budgetAmount: 75,
          currency: 'USD',
          budgetType: 'fixed',
          acceptanceCriteriaText: 'Provide a concise summary of the work completed\nInclude at least one concrete artifact or evidence item',
          artifactInstructionsText: 'Attach a report, link, or structured evidence in the delivery payload',
        };
        this.currentPage = 1;
        this.loadTasks(false);
      },
      error: (error: any) => {
        this.creatingCustomTask = false;
        this.postTaskError = error?.error?.message || 'Unable to create the custom task right now.';
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

  canReviewTask(task: Task): boolean {
    if (!this.currentUser || task.status !== 'pending_review') {
      return false;
    }

    return [this.currentUser.id, this.currentUser.email].includes(task.poster);
  }

  verifyTask(task: Task): void {
    const taskId = task.id || task._id;
    if (!taskId) {
      return;
    }

    this.verificationBusyTaskId = taskId;
    this.postTaskError = null;
    this.postTaskMessage = null;

    this.api.verifyTask(taskId, 'Delivery verified from the web workspace.').subscribe({
      next: () => {
        this.verificationBusyTaskId = null;
        this.postTaskMessage = `Verified "${task.title}" successfully.`;
        this.loadTasks(false);
      },
      error: (error: any) => {
        this.verificationBusyTaskId = null;
        this.postTaskError = error?.error?.message || 'Unable to verify the task right now.';
      }
    });
  }

  disputeTask(task: Task): void {
    const taskId = task.id || task._id;
    if (!taskId) {
      return;
    }

    const reason = window.prompt(`Why are you disputing "${task.title}"?`, 'Acceptance criteria were not met.');
    if (!reason?.trim()) {
      return;
    }

    this.verificationBusyTaskId = taskId;
    this.postTaskError = null;
    this.postTaskMessage = null;

    this.api.disputeTask(taskId, reason.trim(), 'Disputed from the web workspace.').subscribe({
      next: () => {
        this.verificationBusyTaskId = null;
        this.postTaskMessage = `Marked "${task.title}" as disputed.`;
        this.loadTasks(false);
      },
      error: (error: any) => {
        this.verificationBusyTaskId = null;
        this.postTaskError = error?.error?.message || 'Unable to dispute the task right now.';
      }
    });
  }

  toggleTaskDetails(task: Task): void {
    const taskId = task.id || task._id || null;
    this.expandedTaskId = this.expandedTaskId === taskId ? null : taskId;
  }

  isTaskExpanded(task: Task): boolean {
    const taskId = task.id || task._id || null;
    return !!taskId && this.expandedTaskId === taskId;
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'pending_review':
        return 'Pending review';
      case 'in_progress':
        return 'In progress';
      default:
        return status.replace('_', ' ');
    }
  }

  getExpectedArtifacts(task: Task): string[] {
    const artifacts = task.metadata?.['expectedArtifacts'];
    return Array.isArray(artifacts) ? artifacts.map((item) => String(item)) : [];
  }

  getResultPreview(task: Task): string {
    const value = task.outcome?.result ?? task.result ?? null;
    if (value == null) {
      return 'No delivery payload submitted yet.';
    }

    return JSON.stringify(value, null, 2);
  }

  private parseCapabilityList(rawValue: string): string[] {
    return rawValue
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  private parseMultilineList(rawValue: string): string[] {
    return rawValue
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  private captureAgentNames(agents: Agent[]): void {
    this.agentNames = new Map(
      agents
        .map((agent) => [String(agent.id || agent._id || ''), agent.name] as const)
        .filter(([id]) => !!id)
    );
  }
}
