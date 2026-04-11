import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription, debounceTime, forkJoin } from 'rxjs';
import { ApiService, Agent, AgentRegistrationResult, AuditLog, Review, SessionUser } from '../services/api.service';
import { RealtimeService } from '../services/realtime.service';

@Component({
  standalone: true,
  imports: [CommonModule],
  selector: 'app-agents',
  templateUrl: './agents.component.html',
  styleUrls: ['./agents.component.scss']
})
export class AgentsComponent implements OnInit, OnDestroy {
  loading = true;
  agents: Agent[] = [];
  expandedAgentId: string | null = null;
  auditLogs: AuditLog[] = [];
  loadingAudit = false;
  auditError: string | null = null;
  currentUser: SessionUser | null = null;
  showRegistrationForm = false;
  registeringAgent = false;
  registrationError: string | null = null;
  registrationMessage: string | null = null;
  latestIssuedApiKey: string | null = null;
  deleteMessage: string | null = null;
  deleteError: string | null = null;
  pendingDeleteAgent: Agent | null = null;
  deletingAgentId: string | null = null;
  // For demo purposes - in production, this would come from auth service
  userApiKey: string | null = null;
  registrationForm = {
    name: '',
    slug: '',
    description: '',
    capabilitiesText: 'code-review, testing',
    pricingType: 'fixed',
    pricingAmount: 50,
    currency: 'USD',
    mcpEndpoint: '',
  };

  private slugEditedManually = false;

  // Pagination
  currentPage = 1;
  pageSize = 12;
  total = 0;
  totalPages = 0;

  private updatesSub?: Subscription;

  constructor(private api: ApiService, private realtime: RealtimeService) {}

  ngOnInit(): void {
    // Check for API key in localStorage (demo purposes)
    this.userApiKey = localStorage.getItem('wuselverse_api_key');
    this.api.getCurrentUser().subscribe({
      next: (user) => {
        this.currentUser = user;
      },
      error: () => {
        this.currentUser = null;
      },
    });
    this.loadAgents(true);
    this.updatesSub = this.realtime
      .watch(['agents.changed'])
      .pipe(debounceTime(150))
      .subscribe(() => this.loadAgents(false));
  }

  ngOnDestroy(): void {
    this.updatesSub?.unsubscribe();
  }

  loadAgents(showLoading: boolean = true): void {
    if (showLoading) {
      this.loading = true;
    }

    forkJoin({
      agents: this.api.getAgents(this.currentPage, this.pageSize),
      reviews: this.api.getReviews(1, 500),
    }).subscribe({
      next: ({ agents: response, reviews }) => {
        this.agents = this.enrichAgentsWithRatings(response.data, reviews.data ?? []);
        this.currentPage = response.page;
        this.pageSize = response.limit;
        this.total = response.total;
        this.totalPages = response.totalPages;
        this.loading = false;
      },
      error: (error: any) => {
        console.error('Error loading agents:', error);
        this.loading = false;
      }
    });
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.loadAgents();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  setRegistrationField(
    field: 'name' | 'slug' | 'description' | 'capabilitiesText' | 'pricingType' | 'pricingAmount' | 'currency' | 'mcpEndpoint',
    value: string
  ): void {
    if (field === 'name') {
      const nextSlug = !this.slugEditedManually || !this.registrationForm.slug.trim()
        ? this.slugify(value)
        : this.registrationForm.slug;
      this.registrationForm = { ...this.registrationForm, name: value, slug: nextSlug };
      return;
    }

    if (field === 'slug') {
      this.slugEditedManually = value.trim().length > 0;
      this.registrationForm = { ...this.registrationForm, slug: value };
      return;
    }

    this.registrationForm = {
      ...this.registrationForm,
      [field]: field === 'pricingAmount' ? Number(value) || 0 : value,
    };
  }

  toggleRegistrationForm(): void {
    this.showRegistrationForm = !this.showRegistrationForm;
  }

  submitAgentRegistration(): void {
    if (!this.currentUser) {
      this.registrationError = 'Sign in first to register or update an agent from the browser.';
      this.registrationMessage = null;
      return;
    }

    const name = this.registrationForm.name.trim();
    const description = this.registrationForm.description.trim();
    const capabilities = this.parseCapabilities(this.registrationForm.capabilitiesText);

    if (!name || !description) {
      this.registrationError = 'Enter an agent name and description.';
      this.registrationMessage = null;
      return;
    }

    if (capabilities.length === 0) {
      this.registrationError = 'Add at least one capability.';
      this.registrationMessage = null;
      return;
    }

    this.registeringAgent = true;
    this.registrationError = null;
    this.registrationMessage = null;
    this.latestIssuedApiKey = null;

    const slug = this.registrationForm.slug.trim();

    this.api.registerAgent({
      name,
      slug: slug || undefined,
      description,
      owner: this.currentUser.email,
      capabilities,
      pricing: {
        type: this.registrationForm.pricingType,
        amount: this.registrationForm.pricingAmount || 0,
        currency: this.registrationForm.currency.trim() || 'USD',
      },
      ...(this.registrationForm.mcpEndpoint.trim() ? { mcpEndpoint: this.registrationForm.mcpEndpoint.trim() } : {}),
    }).subscribe({
      next: (result: AgentRegistrationResult) => {
        this.registeringAgent = false;
        this.latestIssuedApiKey = result.apiKey || null;
        if (result.apiKey) {
          localStorage.setItem('wuselverse_api_key', result.apiKey);
          this.userApiKey = result.apiKey;
        }

        const resolvedSlug = result.agent.slug || slug || this.slugify(name);
        this.registrationMessage = result.wasUpdated
          ? `Updated "${result.agent.name}" using slug "${resolvedSlug}". A fresh API key is ready below.`
          : `Registered "${result.agent.name}" successfully with slug "${resolvedSlug}".`;
        this.showRegistrationForm = false;

        this.registrationForm = {
          name: '',
          slug: '',
          description: '',
          capabilitiesText: 'code-review, testing',
          pricingType: 'fixed',
          pricingAmount: 50,
          currency: 'USD',
          mcpEndpoint: '',
        };
        this.slugEditedManually = false;
        this.loadAgents(false);
      },
      error: (error: any) => {
        this.registeringAgent = false;
        this.registrationError = error?.error?.message || 'Unable to register the agent right now.';
      }
    });
  }

  isOwnedByCurrentUser(agent: Agent): boolean {
    if (!this.currentUser?.email || !agent.owner) {
      return false;
    }

    return agent.owner.trim().toLowerCase() === this.currentUser.email.trim().toLowerCase();
  }

  canDeleteAgent(agent: Agent): boolean {
    return this.isOwnedByCurrentUser(agent);
  }

  requestDeleteAgent(agent: Agent): void {
    this.deleteMessage = null;
    this.deleteError = null;
    this.pendingDeleteAgent = agent;
  }

  cancelDeleteAgent(): void {
    if (this.deletingAgentId) {
      return;
    }

    this.pendingDeleteAgent = null;
  }

  confirmDeleteAgent(): void {
    const agent = this.pendingDeleteAgent;
    if (!agent) {
      return;
    }

    const agentId = String(agent.id || agent._id || '');
    if (!agentId) {
      this.deleteError = 'Unable to resolve the selected agent ID.';
      return;
    }

    this.deletingAgentId = agentId;
    this.deleteMessage = null;
    this.deleteError = null;

    this.api.deleteAgent(agentId).subscribe({
      next: () => {
        this.deletingAgentId = null;
        this.pendingDeleteAgent = null;
        this.deleteMessage = `Deleted "${agent.name}" successfully.`;

        if (this.expandedAgentId === agentId) {
          this.expandedAgentId = null;
          this.auditLogs = [];
        }

        if (this.agents.length === 1 && this.currentPage > 1) {
          this.currentPage -= 1;
        }

        this.loadAgents(false);
      },
      error: (error: any) => {
        console.error('Error deleting agent:', error);
        this.deletingAgentId = null;
        this.deleteError = error?.status === 403
          ? 'Access denied. You can only delete agents you own while signed in.'
          : error?.error?.message || 'Failed to delete the agent. Please try again.';
      }
    });
  }

  canViewAudit(_agent: Agent): boolean {
    // Can view audit log if user has an API key (owns the agent)
    return !!this.userApiKey;
  }

  toggleAuditLog(agentId: string): void {
    if (this.expandedAgentId === agentId) {
      // Collapse
      this.expandedAgentId = null;
      this.auditLogs = [];
      return;
    }

    // Expand and load audit log
    this.expandedAgentId = agentId;
    this.loadAuditLog(agentId);
  }

  loadAuditLog(agentId: string): void {
    if (!this.userApiKey) {
      this.auditError = 'Authentication required. Store your API key to view audit logs.';
      return;
    }

    this.loadingAudit = true;
    this.auditError = null;
    this.auditLogs = [];

    this.api.getAgentAuditLog(agentId, this.userApiKey).subscribe({
      next: (logs: AuditLog[]) => {
        this.auditLogs = logs;
        this.loadingAudit = false;
      },
      error: (error: any) => {
        console.error('Error loading audit log:', error);
        this.auditError = error.status === 403 
          ? 'Access denied. You can only view audit logs for agents you own.'
          : 'Failed to load audit log. Please try again.';
        this.loadingAudit = false;
      }
    });
  }

  formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  }

  private parseCapabilities(rawValue: string): string[] {
    return rawValue
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  private slugify(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-');
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
}
