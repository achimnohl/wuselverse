import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Subscription, debounceTime, forkJoin } from 'rxjs';
import { ApiService, Agent, Review, SessionUser, Task } from './services/api.service';
import { RealtimeService } from './services/realtime.service';

type ActivityKind =
  | 'agent_registered'
  | 'task_posted'
  | 'bid_received'
  | 'bid_accepted'
  | 'task_assigned'
  | 'task_completed'
  | 'review_received'
  | 'system';

type ActivityTone = 'blue' | 'green' | 'orange' | 'purple';

interface ActivityItem {
  id: string;
  kind: ActivityKind;
  icon: string;
  title: string;
  description: string;
  timestamp: string;
  tone: ActivityTone;
  isNew?: boolean;
}

@Component({
  standalone: true,
  imports: [RouterModule, CommonModule],
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'platform-web';
  activityItems: ActivityItem[] = [];
  activeAgents = 0;
  openTasks = 0;
  totalBids = 0;
  completedTasks = 0;
  lastUpdated: string | null = null;
  currentUser: SessionUser | null = null;
  authMode: 'login' | 'register' = 'login';
  authBusy = false;
  authError: string | null = null;
  authMessage = 'Sign in to preview the new session-based UI flow for protected marketplace actions.';
  authForm = {
    email: 'demo.user@example.com',
    password: 'demodemo',
    displayName: 'Demo User',
  };
  authDialogOpen = false;

  private updatesSub?: Subscription;
  private animationTimeouts: ReturnType<typeof setTimeout>[] = [];
  private initialized = false;
  private knownAgents = new Map<string, { name: string; status?: string }>();
  private knownTasks = new Map<string, {
    title: string;
    status?: string;
    assignedAgent?: string;
    bidCount: number;
    acceptedBidId?: string;
  }>();
  private knownReviews = new Set<string>();

  constructor(private api: ApiService, private realtime: RealtimeService) {}

  ngOnInit(): void {
    this.loadCurrentUser();
    this.refreshActivity();
    this.updatesSub = this.realtime
      .watch(['agents.changed', 'tasks.changed', 'reviews.changed', 'transactions.changed'])
      .pipe(debounceTime(150))
      .subscribe(() => this.refreshActivity());
  }

  ngOnDestroy(): void {
    this.updatesSub?.unsubscribe();

    this.animationTimeouts.forEach((handle) => clearTimeout(handle));
    this.animationTimeouts = [];
  }

  formatRelativeTime(timestamp: string | null): string {
    if (!timestamp) return 'just now';

    const diffMs = Date.now() - new Date(timestamp).getTime();
    const diffSeconds = Math.max(1, Math.floor(diffMs / 1000));

    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }

  getProfileInitial(): string {
    const name = this.currentUser?.displayName?.trim();
    return name ? name.charAt(0).toUpperCase() : '👤';
  }

  toggleAuthDialog(): void {
    this.authDialogOpen = !this.authDialogOpen;
  }

  closeAuthDialog(): void {
    if (this.authBusy) {
      return;
    }

    this.authDialogOpen = false;
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.authDialogOpen) {
      this.closeAuthDialog();
    }
  }

  toggleAuthMode(): void {
    this.authMode = this.authMode === 'login' ? 'register' : 'login';
    this.authError = null;
  }

  useDemoUser(): void {
    this.authForm = {
      email: 'demo.user@example.com',
      password: 'demodemo',
      displayName: 'Demo User',
    };
    this.authError = null;
    this.authMessage = 'Demo credentials loaded. Create the account once, then sign in on later visits.';
  }

  setAuthField(field: 'email' | 'password' | 'displayName', value: string): void {
    this.authForm = {
      ...this.authForm,
      [field]: value,
    };
  }

  submitAuth(): void {
    if (!this.authForm.email || !this.authForm.password) {
      this.authError = 'Enter an email and password to continue.';
      return;
    }

    if (this.authMode === 'register' && !this.authForm.displayName.trim()) {
      this.authError = 'Enter a display name to create the account.';
      return;
    }

    this.authBusy = true;
    this.authError = null;

    const request$ = this.authMode === 'register'
      ? this.api.registerUser({
          email: this.authForm.email,
          password: this.authForm.password,
          displayName: this.authForm.displayName,
        })
      : this.api.loginUser({
          email: this.authForm.email,
          password: this.authForm.password,
        });

    request$.subscribe({
      next: (session) => {
        this.currentUser = session.user;
        this.authBusy = false;
        this.authDialogOpen = false;
        this.authMessage = this.authMode === 'register'
          ? 'Account created and signed in successfully.'
          : 'Signed in successfully.';
      },
      error: (error: any) => {
        this.authBusy = false;
        this.authError = error?.error?.message || 'Unable to complete the authentication request.';

        if (this.authMode === 'register' && error?.status === 409) {
          this.authMode = 'login';
          this.authError = 'That account already exists. Switch to sign in with the same credentials.';
        }
      },
    });
  }

  signOut(): void {
    this.authBusy = true;
    this.authError = null;

    this.api.logoutUser().subscribe({
      next: () => {
        this.currentUser = null;
        this.authBusy = false;
        this.authDialogOpen = false;
        this.authMessage = 'Signed out. Sign in again to use protected write actions.';
      },
      error: (error: any) => {
        this.authBusy = false;
        this.authError = error?.error?.message || 'Unable to sign out right now.';
      },
    });
  }

  private loadCurrentUser(): void {
    this.api.getCurrentUser().subscribe({
      next: (user) => {
        this.currentUser = user;
        this.authError = null;
        this.authMessage = `Signed in as ${user.displayName}.`;
      },
      error: () => {
        this.currentUser = null;
      },
    });
  }

  private refreshActivity(): void {
    forkJoin({
      agents: this.api.getAgents(1, 100),
      tasks: this.api.getTasks(1, 100),
      reviews: this.api.getReviews(1, 100),
    }).subscribe({
      next: ({ agents, tasks, reviews }) => {
        const agentList = agents.data ?? [];
        const taskList = tasks.data ?? [];
        const reviewList = reviews.data ?? [];

        this.activeAgents = agentList.filter((agent) => agent.status === 'active').length;
        this.openTasks = taskList.filter((task) => ['open', 'bidding', 'assigned', 'in_progress'].includes(task.status)).length;
        this.totalBids = taskList.reduce((sum, task) => sum + (task.bids?.length || 0), 0);
        this.completedTasks = taskList.filter((task) => task.status === 'completed').length;

        if (!this.initialized) {
          this.activityItems = this.buildInitialFeed(agentList, taskList, reviewList);
          this.initialized = true;
        } else {
          const newItems = this.buildDeltaFeed(agentList, taskList, reviewList);
          if (newItems.length) {
            const animatedItems = newItems.map((item) => ({ ...item, isNew: true }));
            this.activityItems = [...animatedItems, ...this.activityItems].slice(0, 18);
            this.scheduleAnimationCleanup(animatedItems.map((item) => item.id));
          }
        }

        this.captureSnapshot(agentList, taskList, reviewList);
        this.lastUpdated = new Date().toISOString();
      },
      error: () => {
        this.lastUpdated = new Date().toISOString();
        if (!this.activityItems.length) {
          this.activityItems = [
            {
              id: 'system-waiting',
              kind: 'system',
              icon: '⏳',
              title: 'Waiting for platform data',
              description: 'Start the backend and create a task to see registrations, bids, assignments, and completions appear here.',
              timestamp: new Date().toISOString(),
              tone: 'blue',
            },
          ];
        }
      },
    });
  }

  private buildInitialFeed(agents: Agent[], tasks: Task[], reviews: Review[]): ActivityItem[] {
    const items: ActivityItem[] = [
      {
        id: 'system-live-feed',
        kind: 'system',
        icon: '✨',
        title: 'Live demo feed ready',
        description: 'This sidebar highlights agent registrations, incoming tasks, bids, assignments, completions, and reviews.',
        timestamp: new Date().toISOString(),
        tone: 'blue',
      },
    ];

    items.push(
      ...agents
        .slice()
        .sort((a, b) => this.getTime(b.createdAt || b.updatedAt) - this.getTime(a.createdAt || a.updatedAt))
        .slice(0, 3)
        .map((agent) => this.createActivity(
          'agent_registered',
          '🧩',
          `Agent registered: ${agent.name}`,
          `${agent.owner || 'Unknown owner'} published ${this.getCapabilityCount(agent)} capabilities to the marketplace.`,
          agent.createdAt || agent.updatedAt,
          'green'
        ))
    );

    items.push(
      ...tasks
        .slice()
        .sort((a, b) => this.getTime(b.updatedAt || b.createdAt) - this.getTime(a.updatedAt || a.createdAt))
        .slice(0, 6)
        .map((task) => this.createTaskSnapshotActivity(task, agents))
    );

    items.push(
      ...reviews
        .slice()
        .sort((a, b) => this.getTime(b.timestamp) - this.getTime(a.timestamp))
        .slice(0, 2)
        .map((review) => this.createActivity(
          'review_received',
          '⭐',
          `Review submitted for task ${review.taskId}`,
          `${review.rating}★ feedback recorded${review.comment ? `: ${review.comment}` : '.'}`,
          review.timestamp,
          'purple'
        ))
    );

    return items
      .sort((a, b) => this.getTime(b.timestamp) - this.getTime(a.timestamp))
      .slice(0, 18);
  }

  private buildDeltaFeed(agents: Agent[], tasks: Task[], reviews: Review[]): ActivityItem[] {
    const items: ActivityItem[] = [];

    for (const agent of agents) {
      const id = this.getEntityId(agent);
      if (!id || this.knownAgents.has(id)) {
        continue;
      }

      items.push(this.createActivity(
        'agent_registered',
        '🧩',
        `Agent registered: ${agent.name}`,
        `${agent.owner || 'Unknown owner'} joined the marketplace with ${this.getCapabilityCount(agent)} capabilities.`,
        agent.createdAt || agent.updatedAt,
        'green'
      ));
    }

    for (const task of tasks) {
      const id = this.getEntityId(task);
      if (!id) {
        continue;
      }

      const bidCount = task.bids?.length || 0;
      const previous = this.knownTasks.get(id);
      const baseline = previous ?? {
        title: task.title,
        status: undefined,
        assignedAgent: undefined,
        bidCount: 0,
        acceptedBidId: undefined,
      };

      if (!previous) {
        items.push(this.createActivity(
          'task_posted',
          '📥',
          `New task posted: ${task.title}`,
          `${task.poster} opened a ${task.budget?.currency || 'USD'} ${task.budget?.amount ?? '?'} opportunity for ${this.getCapabilityPreview(task)}.`,
          task.createdAt,
          'blue'
        ));
      }

      if (bidCount > baseline.bidCount) {
        const latestBid = task.bids?.[task.bids.length - 1];
        items.push(this.createActivity(
          'bid_received',
          '💸',
          `New bid on ${task.title}`,
          latestBid
            ? `${latestBid.agentId} offered ${task.budget?.currency || 'USD'} ${latestBid.amount}. Total bids: ${bidCount}.`
            : `Total bids increased to ${bidCount}.`,
          task.updatedAt || new Date().toISOString(),
          'orange'
        ));
      }

      const acceptedBid = task.bids?.find((bid) => bid.status === 'accepted');
      if (acceptedBid && acceptedBid.id !== baseline.acceptedBidId) {
        items.push(this.createActivity(
          'bid_accepted',
          '🏁',
          `Bid accepted: ${task.title}`,
          `${this.lookupAgentName(acceptedBid.agentId, agents)} won the task with a ${task.budget?.currency || 'USD'} ${acceptedBid.amount} bid.`,
          task.updatedAt || new Date().toISOString(),
          'purple'
        ));
      }

      if (task.status !== baseline.status) {
        if (task.status === 'assigned' && !acceptedBid) {
          items.push(this.createActivity(
            'task_assigned',
            '🤝',
            `Task assigned: ${task.title}`,
            `${this.lookupAgentName(task.assignedAgent, agents)} is now working on it.`,
            task.updatedAt || new Date().toISOString(),
            'purple'
          ));
        }

        if (task.status === 'completed') {
          items.push(this.createActivity(
            'task_completed',
            '✅',
            `Task completed: ${task.title}`,
            `${this.lookupAgentName(task.assignedAgent, agents)} delivered the work successfully.`,
            task.updatedAt || new Date().toISOString(),
            'green'
          ));
        }
      }
    }

    for (const review of reviews) {
      const id = this.getEntityId(review);
      if (!id || this.knownReviews.has(id)) {
        continue;
      }

      items.push(this.createActivity(
        'review_received',
        '⭐',
        `New ${review.rating}★ review received`,
        `Feedback was added for task ${review.taskId}.`,
        review.timestamp,
        'purple'
      ));
    }

    return items
      .sort((a, b) => this.getTime(b.timestamp) - this.getTime(a.timestamp))
      .slice(0, 8);
  }

  private captureSnapshot(agents: Agent[], tasks: Task[], reviews: Review[]): void {
    this.knownAgents = new Map(
      agents
        .map((agent) => [this.getEntityId(agent), { name: agent.name, status: agent.status }] as const)
        .filter(([id]) => !!id)
    );

    this.knownTasks = new Map(
      tasks
        .map((task) => [
          this.getEntityId(task),
          {
            title: task.title,
            status: task.status,
            assignedAgent: task.assignedAgent,
            bidCount: task.bids?.length || 0,
            acceptedBidId: task.bids?.find((bid) => bid.status === 'accepted')?.id,
          },
        ] as const)
        .filter(([id]) => !!id)
    );

    this.knownReviews = new Set(reviews.map((review) => this.getEntityId(review)).filter(Boolean));
  }

  private createTaskSnapshotActivity(task: Task, agents: Agent[]): ActivityItem {
    if (task.status === 'completed') {
      return this.createActivity(
        'task_completed',
        '✅',
        `Task completed: ${task.title}`,
        `${this.lookupAgentName(task.assignedAgent, agents)} finished the work.`,
        task.updatedAt || task.createdAt,
        'green'
      );
    }

    if (task.status === 'assigned') {
      const acceptedBid = task.bids?.find((bid) => bid.status === 'accepted');
      return this.createActivity(
        acceptedBid ? 'bid_accepted' : 'task_assigned',
        acceptedBid ? '🏁' : '🤝',
        acceptedBid ? `Bid accepted: ${task.title}` : `Task assigned: ${task.title}`,
        acceptedBid
          ? `${this.lookupAgentName(acceptedBid.agentId, agents)} won with a ${task.budget?.currency || 'USD'} ${acceptedBid.amount} bid.`
          : `${this.lookupAgentName(task.assignedAgent, agents)} accepted the winning bid.`,
        task.updatedAt || task.createdAt,
        'purple'
      );
    }

    if ((task.bids?.length || 0) > 0) {
      return this.createActivity(
        'bid_received',
        '💸',
        `Bids incoming for ${task.title}`,
        `${task.bids.length} agent bid(s) are competing for this task.`,
        task.updatedAt || task.createdAt,
        'orange'
      );
    }

    return this.createActivity(
      'task_posted',
      '📥',
      `Task posted: ${task.title}`,
      `${task.poster} requested help with ${this.getCapabilityPreview(task)}.`,
      task.createdAt,
      'blue'
    );
  }

  private createActivity(
    kind: ActivityKind,
    icon: string,
    title: string,
    description: string,
    timestamp: string | undefined,
    tone: ActivityTone
  ): ActivityItem {
    return {
      id: `${kind}-${title}-${timestamp || Date.now()}`,
      kind,
      icon,
      title,
      description,
      timestamp: timestamp || new Date().toISOString(),
      tone,
      isNew: false,
    };
  }

  private scheduleAnimationCleanup(itemIds: string[]): void {
    const timeout = setTimeout(() => {
      this.activityItems = this.activityItems.map((item) =>
        itemIds.includes(item.id) ? { ...item, isNew: false } : item
      );
      this.animationTimeouts = this.animationTimeouts.filter((handle) => handle !== timeout);
    }, 2200);

    this.animationTimeouts.push(timeout);
  }

  private getEntityId(item: { id?: string; _id?: string } | null | undefined): string {
    return item?._id || item?.id || '';
  }

  private getTime(value?: string | null): number {
    return value ? new Date(value).getTime() : 0;
  }

  private getCapabilityCount(agent: Agent): number {
    return Array.isArray(agent.capabilities) ? agent.capabilities.length : 0;
  }

  private getCapabilityPreview(task: Task): string {
    const capabilities = task.requirements?.capabilities || task.requirements?.skills || [];
    return capabilities.length ? capabilities.slice(0, 2).join(', ') : 'specialist work';
  }

  private lookupAgentName(agentId: string | undefined, agents: Agent[]): string {
    if (!agentId) {
      return 'An agent';
    }

    const current = agents.find((agent) => this.getEntityId(agent) === agentId || agent.id === agentId);
    if (current?.name) {
      return current.name;
    }

    return this.knownAgents.get(agentId)?.name || agentId;
  }
}

