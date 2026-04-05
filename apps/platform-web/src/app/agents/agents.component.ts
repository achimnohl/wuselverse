import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService, Agent, AuditLog } from '../services/api.service';

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
  // For demo purposes - in production, this would come from auth service
  userApiKey: string | null = null;

  // Pagination
  currentPage = 1;
  pageSize = 12;
  total = 0;
  totalPages = 0;

  private refreshHandle?: ReturnType<typeof setInterval>;

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    // Check for API key in localStorage (demo purposes)
    this.userApiKey = localStorage.getItem('wuselverse_api_key');
    this.loadAgents(true);
    this.refreshHandle = setInterval(() => this.loadAgents(false), 4000);
  }

  ngOnDestroy(): void {
    if (this.refreshHandle) {
      clearInterval(this.refreshHandle);
    }
  }

  loadAgents(showLoading: boolean = true): void {
    if (showLoading) {
      this.loading = true;
    }

    this.api.getAgents(this.currentPage, this.pageSize).subscribe({
      next: (response) => {
        this.agents = response.data;
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

  canViewAudit(agent: Agent): boolean {
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
}
