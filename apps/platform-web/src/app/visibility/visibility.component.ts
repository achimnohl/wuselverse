import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription, debounceTime, forkJoin } from 'rxjs';
import { Agent, ApiService, Task, TaskChain, Transaction } from '../services/api.service';
import { RealtimeService } from '../services/realtime.service';

type ChainFilter = 'all' | 'attention' | 'active' | 'settled';
type ChainState = 'active' | 'blocked' | 'at_risk' | 'settled';

interface ChainSummary {
  rootTaskId: string;
  rootTask: Task;
  lineage: Task[];
  childCount: number;
  reservedBudget: number;
  totalBudget: number;
  chainTransactions: Transaction[];
  unresolvedChildren: number;
  disputedChildren: number;
  state: ChainState;
}

interface SettlementAuditEntry {
  type: string;
  message: string;
  at?: string;
  actorId?: string;
  reason?: string;
  relatedTaskId?: string;
}

@Component({
  standalone: true,
  imports: [CommonModule],
  selector: 'app-visibility',
  templateUrl: './visibility.component.html',
  styleUrls: ['./visibility.component.scss']
})
export class VisibilityAuditComponent implements OnInit, OnDestroy {
  loading = true;
  loadError: string | null = null;
  chainSummaries: ChainSummary[] = [];
  selectedChain: TaskChain | null = null;
  selectedTransactions: Transaction[] = [];
  selectedRootTaskId: string | null = null;
  filter: ChainFilter = 'all';

  summary = {
    rootChains: 0,
    delegatedSubtasks: 0,
    chainTransactions: 0,
    blockedParents: 0,
  };

  private updatesSub?: Subscription;
  private agentNames = new Map<string, string>();
  private allTasks: Task[] = [];
  private allTransactions: Transaction[] = [];

  constructor(private api: ApiService, private realtime: RealtimeService) {}

  ngOnInit(): void {
    this.loadView(true);
    this.updatesSub = this.realtime
      .watch(['tasks.changed', 'transactions.changed'])
      .pipe(debounceTime(150))
      .subscribe(() => this.loadView(false));
  }

  ngOnDestroy(): void {
    this.updatesSub?.unsubscribe();
  }

  loadView(showLoading: boolean = true): void {
    if (showLoading) {
      this.loading = true;
    }

    this.loadError = null;

    forkJoin({
      tasks: this.api.getTasks(1, 200),
      transactions: this.api.getTransactions(1, 200),
      agents: this.api.getAgents(1, 200),
    }).subscribe({
      next: ({ tasks, transactions, agents }) => {
        this.captureAgentNames(agents.data ?? []);
        this.allTasks = [...(tasks.data ?? [])].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        this.allTransactions = [...(transactions.data ?? [])].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        this.chainSummaries = this.buildChainSummaries(this.allTasks, this.allTransactions);
        this.summary = {
          rootChains: this.chainSummaries.length,
          delegatedSubtasks: this.allTasks.filter((task) => !!task.parentTaskId).length,
          chainTransactions: this.allTransactions.filter((tx) => !!this.getRootTaskIdFromTransaction(tx)).length,
          blockedParents: this.chainSummaries.filter((chain) => chain.state === 'blocked' || chain.state === 'at_risk').length,
        };

        if (this.selectedRootTaskId && this.chainSummaries.some((chain) => chain.rootTaskId === this.selectedRootTaskId)) {
          this.selectChain(this.selectedRootTaskId);
        } else if (this.chainSummaries.length > 0) {
          this.selectChain(this.chainSummaries[0].rootTaskId);
        } else {
          this.selectedRootTaskId = null;
          this.selectedChain = null;
          this.selectedTransactions = [];
        }

        this.loading = false;
      },
      error: (error: any) => {
        console.error('Error loading visibility/audit view:', error);
        this.loadError = error?.error?.message || 'Unable to load delegation visibility right now.';
        this.loading = false;
      }
    });
  }

  getFilteredChains(): ChainSummary[] {
    return this.getChainsForFilter(this.filter);
  }

  countChains(filter: ChainFilter): number {
    return this.getChainsForFilter(filter).length;
  }

  selectChain(rootTaskId: string): void {
    this.selectedRootTaskId = rootTaskId;
    this.selectedChain = this.toTaskChain(rootTaskId);
    this.selectedTransactions = this.allTransactions
      .filter((tx) => this.getRootTaskIdFromTransaction(tx) === rootTaskId || tx.taskId === rootTaskId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  getTaskId(task: Task | null | undefined): string {
    return String(task?.id || task?._id || '');
  }

  formatParty(idOrName: string | null | undefined): string {
    if (!idOrName) {
      return 'Unknown';
    }

    if (idOrName.startsWith('escrow:')) {
      return `Escrow (${idOrName.replace('escrow:', '')})`;
    }

    return this.agentNames.get(idOrName) || idOrName;
  }

  formatDate(dateString: string | null | undefined): string {
    if (!dateString) {
      return 'n/a';
    }

    const date = new Date(dateString);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    })}`;
  }

  formatMoney(amount: number | null | undefined, currency: string | null | undefined = 'USD'): string {
    return `${currency || 'USD'} ${Number(amount || 0).toFixed(2)}`;
  }

  getStateLabel(state: ChainState): string {
    switch (state) {
      case 'blocked':
        return 'Blocked';
      case 'at_risk':
        return 'Needs attention';
      case 'settled':
        return 'Settled';
      default:
        return 'Active';
    }
  }

  getSettlementStatusLabel(status: Task['settlementStatus'] | undefined): string {
    switch (status) {
      case 'blocked_by_dispute':
        return 'Blocked by dispute';
      case 'blocked':
        return 'Settlement blocked';
      case 'settled':
        return 'Settled';
      default:
        return 'Settlement clear';
    }
  }

  getSettlementHoldSummary(task: Task): string | null {
    if (task.settlementStatus === 'settled') {
      return 'Settlement cleared and the task is financially resolved.';
    }

    if (!task.settlementStatus || task.settlementStatus === 'clear') {
      return null;
    }

    const blockedTask = task.blockedByTaskId ? `Task ${this.getShortId(task.blockedByTaskId)}` : 'a related task';
    const blockedAgent = task.blockedByAgentId ? this.formatParty(task.blockedByAgentId) : null;

    switch (task.settlementHoldReason) {
      case 'child_task_disputed':
        return `${blockedTask} is disputed${blockedAgent ? ` by ${blockedAgent}` : ''}, so parent settlement remains frozen.`;
      case 'child_task_unsettled':
        return `${blockedTask} is still ${this.getStatusLabel(task.blockedByStatus || 'active')}${blockedAgent ? ` with ${blockedAgent}` : ''}, so the parent cannot settle yet.`;
      case 'task_disputed':
        return 'This task itself is disputed, so settlement is blocked until it is resolved.';
      case 'awaiting_verification':
        return 'Waiting for poster verification before payout can be released.';
      default:
        return 'Settlement is currently on hold.';
    }
  }

  getSettlementAuditEntries(task: Task): SettlementAuditEntry[] {
    const audit = task.metadata?.['settlementAudit'];
    if (!Array.isArray(audit)) {
      return [];
    }

    const entries: SettlementAuditEntry[] = [];

    for (const entry of audit) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }

      const raw = entry as Record<string, unknown>;
      entries.push({
        type: String(raw['type'] || 'event'),
        message: String(raw['message'] || 'Settlement update recorded.'),
        at: typeof raw['at'] === 'string' ? raw['at'] : undefined,
        actorId: typeof raw['actorId'] === 'string' ? raw['actorId'] : undefined,
        reason: typeof raw['reason'] === 'string' ? raw['reason'] : undefined,
        relatedTaskId: typeof raw['relatedTaskId'] === 'string' ? raw['relatedTaskId'] : undefined,
      });
    }

    return entries.reverse();
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'pending_review':
        return 'Pending review';
      case 'in_progress':
        return 'In progress';
      default:
        return status.replace(/_/g, ' ');
    }
  }

  getTransactionTypeLabel(type: string): string {
    switch (type) {
      case 'escrow_lock':
        return 'Escrow locked';
      case 'payment':
        return 'Payment released';
      case 'refund':
        return 'Refund issued';
      default:
        return type.replace(/_/g, ' ');
    }
  }

  getMaxDepth(lineage: Task[]): number {
    return lineage.reduce((max, task) => Math.max(max, Number(task.delegationDepth ?? 0)), 0);
  }

  getTaskAuditNotes(task: Task): string[] {
    const notes: string[] = [];
    const delegatedBy = typeof task.metadata?.['delegatedByAgentId'] === 'string'
      ? String(task.metadata['delegatedByAgentId'])
      : null;

    if (task.parentTaskId) {
      notes.push(
        delegatedBy
          ? `Delegated by ${this.formatParty(delegatedBy)} from task ${this.getShortId(task.parentTaskId)}.`
          : `Delegated from parent task ${this.getShortId(task.parentTaskId)}.`
      );
    }

    if ((task.childTaskIds?.length ?? 0) > 0) {
      notes.push(
        `Reserved ${this.formatMoney(task.reservedBudget, task.budget?.currency)} for ${task.childTaskIds?.length} downstream task(s).`
      );
    }

    const settlementNote = this.getSettlementHoldSummary(task);
    if (settlementNote) {
      notes.push(settlementNote);
    } else if (task.status === 'pending_review' && (task.childTaskIds?.length ?? 0) > 0 && task.outcome?.verificationStatus !== 'verified') {
      notes.push('Final settlement stays blocked until delegated child work is resolved.');
    }

    if (task.outcome?.verificationStatus === 'verified') {
      notes.push(`Verified${task.outcome.verifiedBy ? ` by ${this.formatParty(task.outcome.verifiedBy)}` : ''}.`);
    } else if (task.outcome?.verificationStatus === 'disputed') {
      notes.push(`Disputed${task.outcome.disputeReason ? `: ${task.outcome.disputeReason}` : '.'}`);
    } else if (task.status === 'pending_review') {
      notes.push('Awaiting review before payout can be released.');
    }

    if (notes.length === 0) {
      notes.push(`Budget: ${this.formatMoney(task.budget?.amount, task.budget?.currency)}.`);
    }

    return notes;
  }

  getCapabilities(task: Task): string[] {
    return Array.isArray(task.requirements?.capabilities)
      ? task.requirements.capabilities.map((cap: unknown) => String(cap))
      : [];
  }

  private getChainsForFilter(filter: ChainFilter): ChainSummary[] {
    switch (filter) {
      case 'attention':
        return this.chainSummaries.filter((chain) => chain.state === 'blocked' || chain.state === 'at_risk');
      case 'active':
        return this.chainSummaries.filter((chain) => chain.state === 'active');
      case 'settled':
        return this.chainSummaries.filter((chain) => chain.state === 'settled');
      default:
        return this.chainSummaries;
    }
  }

  private buildChainSummaries(tasks: Task[], transactions: Transaction[]): ChainSummary[] {
    const rootIds = new Set<string>();

    tasks.forEach((task) => {
      const taskId = this.getTaskId(task);
      if (!taskId) {
        return;
      }

      if ((task.childTaskIds?.length ?? 0) > 0 || task.parentTaskId) {
        rootIds.add(this.getResolvedRootTaskId(task));
      }
    });

    return Array.from(rootIds)
      .map((rootTaskId) => {
        const rootTask = tasks.find((task) => this.getTaskId(task) === rootTaskId);
        if (!rootTask) {
          return null;
        }

        const lineage = tasks
          .filter((task) => this.getResolvedRootTaskId(task) === rootTaskId || this.getTaskId(task) === rootTaskId)
          .sort((a, b) => {
            const depthDiff = Number(a.delegationDepth ?? 0) - Number(b.delegationDepth ?? 0);
            if (depthDiff !== 0) {
              return depthDiff;
            }
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          });

        const children = lineage.filter((task) => !!task.parentTaskId);
        const disputedChildren = children.filter((task) => task.status === 'disputed' || task.outcome?.verificationStatus === 'disputed').length;
        const unresolvedChildren = children.filter((task) => task.outcome?.verificationStatus !== 'verified').length;
        const chainTransactions = transactions.filter(
          (tx) => this.getRootTaskIdFromTransaction(tx) === rootTaskId || tx.taskId === rootTaskId
        );

        let state: ChainState = 'active';
        if (rootTask.settlementStatus === 'blocked_by_dispute' || disputedChildren > 0) {
          state = 'at_risk';
        } else if (rootTask.settlementStatus === 'blocked' || (rootTask.status === 'pending_review' && unresolvedChildren > 0)) {
          state = 'blocked';
        } else if (rootTask.settlementStatus === 'settled' || (children.length > 0 && unresolvedChildren === 0 && rootTask.outcome?.verificationStatus === 'verified')) {
          state = 'settled';
        }

        return {
          rootTaskId,
          rootTask,
          lineage,
          childCount: children.length,
          reservedBudget: Number(rootTask.reservedBudget ?? children.reduce((sum, task) => sum + Number(task.budget?.amount || 0), 0)),
          totalBudget: Number(rootTask.budget?.amount || 0),
          chainTransactions,
          unresolvedChildren,
          disputedChildren,
          state,
        } satisfies ChainSummary;
      })
      .filter((chain): chain is ChainSummary => !!chain)
      .sort((a, b) => new Date(b.rootTask.createdAt).getTime() - new Date(a.rootTask.createdAt).getTime());
  }

  private toTaskChain(rootTaskId: string): TaskChain | null {
    const rootTask = this.allTasks.find((task) => this.getTaskId(task) === rootTaskId);
    if (!rootTask) {
      return null;
    }

    const lineage = this.allTasks
      .filter((task) => this.getResolvedRootTaskId(task) === rootTaskId || this.getTaskId(task) === rootTaskId)
      .sort((a, b) => {
        const depthDiff = Number(a.delegationDepth ?? 0) - Number(b.delegationDepth ?? 0);
        if (depthDiff !== 0) {
          return depthDiff;
        }
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });

    return {
      task: rootTask,
      parent: null,
      children: lineage.filter((task) => task.parentTaskId === rootTaskId),
      lineage,
      rootTaskId,
      delegationDepth: 0,
      reservedBudget: Number(rootTask.reservedBudget ?? 0),
      settlementStatus: rootTask.settlementStatus,
      settlementHoldReason: rootTask.settlementHoldReason,
      blockedByTaskId: rootTask.blockedByTaskId,
      blockedByStatus: rootTask.blockedByStatus,
      blockedByAgentId: rootTask.blockedByAgentId,
    };
  }

  private getResolvedRootTaskId(task: Task): string {
    return String(task.rootTaskId || task.parentTaskId || this.getTaskId(task));
  }

  private getRootTaskIdFromTransaction(tx: Transaction): string {
    const metadataRoot = typeof tx.metadata?.['rootTaskId'] === 'string' ? String(tx.metadata['rootTaskId']) : null;
    return String(tx.rootTaskId || metadataRoot || tx.parentTaskId || tx.taskId || '');
  }

  private getShortId(value: string | null | undefined): string {
    if (!value) {
      return 'unknown';
    }

    return value.length > 10 ? `${value.slice(0, 8)}…` : value;
  }

  private captureAgentNames(agents: Agent[]): void {
    this.agentNames = new Map(
      agents
        .map((agent) => [String(agent.id || agent._id || ''), agent.name] as const)
        .filter(([id]) => !!id)
    );
  }
}
