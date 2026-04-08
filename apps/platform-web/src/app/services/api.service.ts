import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Agent {
  id: string;
  _id?: string;
  name: string;
  slug?: string;
  description: string;
  offerDescription: string;
  owner: string;
  capabilities: any[];
  pricing: any;
  reputation: any;
  rating: number | null;
  successCount: number;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  mcpEndpoint?: string;
  githubAppId?: number;
  manifestUrl?: string;
}

export interface TaskOutcome {
  success: boolean;
  result: unknown;
  artifacts?: string[];
  verificationStatus: 'unverified' | 'verified' | 'disputed';
  completedAt: string;
  verifiedAt?: string;
  verifiedBy?: string;
  feedback?: string;
  disputeReason?: string;
}

export interface Task {
  id: string;
  _id?: string;
  title: string;
  description: string;
  requirements: any;
  poster: string;
  budget: any;
  status: string;
  assignedAgent?: string;
  bids: any[];
  acceptanceCriteria?: string[];
  outcome?: TaskOutcome;
  result?: unknown;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface Review {
  id: string;
  _id?: string;
  from: string;
  to: string;
  taskId: string;
  rating: number;
  comment?: string;
  timestamp: string;
  verified: boolean;
}

export interface Transaction {
  id: string;
  _id?: string;
  from: string;
  to: string;
  amount: number;
  currency: string;
  type: string;
  status: string;
  taskId: string;
  escrowId?: string;
  createdAt: string;
  completedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditLog {
  _id: string;
  agentId: string;
  action: 'created' | 'updated' | 'deleted' | 'key_rotated';
  changedFields: string[];
  previousValues: Record<string, any>;
  newValues: Record<string, any>;
  actorId: string;
  sessionId: string | null;
  timestamp: string;
}

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
}

export interface AuthSessionData {
  user: SessionUser;
  expiresAt: string;
  csrfToken: string | null;
}

export interface AgentRegistrationResult {
  agent: Agent;
  apiKey?: string;
  complianceStatus?: string;
  wasUpdated?: boolean;
  message?: string;
}

interface APIResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private readonly baseUrl = this.resolveBaseUrl();
  private csrfToken: string | null = null;

  constructor(private http: HttpClient) {}

  private resolveBaseUrl(): string {
    const globalBaseUrl = (globalThis as any).__WUSELVERSE_API_URL__;
    if (typeof globalBaseUrl === 'string' && globalBaseUrl.trim()) {
      return globalBaseUrl.replace(/\/$/, '');
    }

    if (typeof window !== 'undefined' && window.location?.origin) {
      const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
      return isLocalhost ? 'http://localhost:3000/api' : `${window.location.origin}/api`;
    }

    return 'http://localhost:3000/api';
  }

  private withSession(options: { headers?: Record<string, string> } = {}) {
    return { withCredentials: true, ...options };
  }

  private syncCsrfToken(token?: string | null): string | null {
    if (typeof token === 'string' && token) {
      this.csrfToken = token;
    }

    if (typeof document !== 'undefined') {
      const cookie = document.cookie
        .split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith('wuselverse_csrf='));

      if (cookie) {
        this.csrfToken = decodeURIComponent(cookie.substring('wuselverse_csrf='.length));
      }
    }

    return this.csrfToken;
  }

  private withProtectedWrite(options: { headers?: Record<string, string> } = {}) {
    const csrfToken = this.syncCsrfToken();
    return this.withSession({
      ...options,
      headers: {
        ...(options.headers || {}),
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      },
    });
  }

  getCurrentUser(): Observable<SessionUser> {
    return this.http.get<APIResponse<{ user: SessionUser; csrfToken?: string | null }>>(`${this.baseUrl}/auth/me`, this.withSession())
      .pipe(map(response => {
        this.syncCsrfToken(response.data.csrfToken || null);
        return response.data.user;
      }));
  }

  registerUser(payload: { email: string; password: string; displayName: string }): Observable<AuthSessionData> {
    return this.http.post<APIResponse<AuthSessionData>>(`${this.baseUrl}/auth/register`, payload, this.withSession())
      .pipe(map(response => {
        this.syncCsrfToken(response.data.csrfToken);
        return response.data;
      }));
  }

  loginUser(payload: { email: string; password: string }): Observable<AuthSessionData> {
    return this.http.post<APIResponse<AuthSessionData>>(`${this.baseUrl}/auth/login`, payload, this.withSession())
      .pipe(map(response => {
        this.syncCsrfToken(response.data.csrfToken);
        return response.data;
      }));
  }

  logoutUser(): Observable<void> {
    return this.http.post<APIResponse<null>>(`${this.baseUrl}/auth/logout`, {}, this.withProtectedWrite())
      .pipe(map(() => {
        this.csrfToken = null;
        return undefined;
      }));
  }

  // Agents
  getAgents(page: number = 1, limit: number = 10): Observable<PaginatedResponse<Agent>> {
    return this.http.get<APIResponse<PaginatedResponse<Agent>>>(`${this.baseUrl}/agents?page=${page}&limit=${limit}`, this.withSession())
      .pipe(map(response => response.data));
  }

  getAgent(id: string): Observable<Agent> {
    return this.http.get<APIResponse<Agent>>(`${this.baseUrl}/agents/${id}`, this.withSession())
      .pipe(map(response => response.data));
  }

  // Tasks
  getTasks(page: number = 1, limit: number = 10): Observable<PaginatedResponse<Task>> {
    return this.http.get<APIResponse<PaginatedResponse<Task>>>(`${this.baseUrl}/tasks?page=${page}&limit=${limit}`, this.withSession())
      .pipe(map(response => response.data));
  }

  getTask(id: string): Observable<Task> {
    return this.http.get<APIResponse<Task>>(`${this.baseUrl}/tasks/${id}`, this.withSession())
      .pipe(map(response => response.data));
  }

  createTask(payload: Record<string, unknown>): Observable<Task> {
    return this.http.post<APIResponse<Task>>(`${this.baseUrl}/tasks`, payload, this.withProtectedWrite())
      .pipe(map(response => response.data));
  }

  assignTask(taskId: string, bidId: string): Observable<Task> {
    return this.http.post<APIResponse<Task>>(`${this.baseUrl}/tasks/${taskId}/assign`, { bidId }, this.withProtectedWrite())
      .pipe(map(response => response.data));
  }

  verifyTask(taskId: string, feedback?: string): Observable<Task> {
    return this.http.post<APIResponse<Task>>(`${this.baseUrl}/tasks/${taskId}/verify`, { feedback }, this.withProtectedWrite())
      .pipe(map(response => response.data));
  }

  disputeTask(taskId: string, reason: string, feedback?: string): Observable<Task> {
    return this.http.post<APIResponse<Task>>(`${this.baseUrl}/tasks/${taskId}/dispute`, { reason, feedback }, this.withProtectedWrite())
      .pipe(map(response => response.data));
  }

  // Reviews
  getReviews(page: number = 1, limit: number = 10): Observable<PaginatedResponse<Review>> {
    return this.http.get<APIResponse<PaginatedResponse<Review>>>(`${this.baseUrl}/reviews?page=${page}&limit=${limit}`, this.withSession())
      .pipe(map(response => response.data));
  }

  getAgentReviews(agentId: string): Observable<Review[]> {
    return this.http.get<APIResponse<Review[]>>(`${this.baseUrl}/reviews/agent/${agentId}`, this.withSession())
      .pipe(map(response => response.data));
  }

  getAgentStats(agentId: string): Observable<any> {
    return this.http.get<APIResponse<any>>(`${this.baseUrl}/reviews/agent/${agentId}/stats`, this.withSession())
      .pipe(map(response => response.data));
  }

  createReview(payload: Partial<Review>): Observable<Review> {
    return this.http.post<APIResponse<Review>>(`${this.baseUrl}/reviews`, payload, this.withProtectedWrite())
      .pipe(map(response => response.data));
  }

  registerAgent(payload: Record<string, unknown>): Observable<AgentRegistrationResult> {
    return this.http
      .post<APIResponse<Agent> & { apiKey?: string; complianceStatus?: string; wasUpdated?: boolean }>(
        `${this.baseUrl}/agents`,
        payload,
        this.withProtectedWrite()
      )
      .pipe(
        map((response) => ({
          agent: response.data,
          apiKey: response.apiKey,
          complianceStatus: response.complianceStatus,
          wasUpdated: response.wasUpdated,
          message: response.message,
        }))
      );
  }

  // Transactions
  getTransactions(page: number = 1, limit: number = 10): Observable<PaginatedResponse<Transaction>> {
    return this.http.get<APIResponse<PaginatedResponse<Transaction>>>(`${this.baseUrl}/transactions?page=${page}&limit=${limit}`, this.withSession())
      .pipe(map(response => response.data));
  }

  getTaskTransactions(taskId: string): Observable<Transaction[]> {
    return this.http.get<APIResponse<Transaction[]>>(`${this.baseUrl}/transactions/task/${taskId}`, this.withSession())
      .pipe(map(response => response.data));
  }

  getAgentEarnings(agentId: string): Observable<any> {
    return this.http.get<APIResponse<any>>(`${this.baseUrl}/transactions/agent/${agentId}/earnings`, this.withSession())
      .pipe(map(response => response.data));
  }

  // Audit Logs
  getAgentAuditLog(agentId: string, apiKey: string): Observable<AuditLog[]> {
    return this.http.get<AuditLog[]>(`${this.baseUrl}/agents/${agentId}/audit`, this.withSession({
      headers: { 'Authorization': `Bearer ${apiKey}` }
    }));
  }
}
