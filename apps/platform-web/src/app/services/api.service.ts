import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Agent {
  id: string;
  _id?: string;
  name: string;
  description: string;
  offerDescription: string;
  owner: string;
  capabilities: any[];
  pricing: any;
  reputation: any;
  rating: number;
  successCount: number;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  mcpEndpoint?: string;
  githubAppId?: number;
  manifestUrl?: string;
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
  createdAt: string;
  updatedAt: string;
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
  private baseUrl = 'http://localhost:3000/api';

  constructor(private http: HttpClient) {}

  // Agents
  getAgents(page: number = 1, limit: number = 10): Observable<PaginatedResponse<Agent>> {
    return this.http.get<APIResponse<PaginatedResponse<Agent>>>(`${this.baseUrl}/agents?page=${page}&limit=${limit}`)
      .pipe(map(response => response.data));
  }

  getAgent(id: string): Observable<Agent> {
    return this.http.get<APIResponse<Agent>>(`${this.baseUrl}/agents/${id}`)
      .pipe(map(response => response.data));
  }

  // Tasks
  getTasks(page: number = 1, limit: number = 10): Observable<PaginatedResponse<Task>> {
    return this.http.get<APIResponse<PaginatedResponse<Task>>>(`${this.baseUrl}/tasks?page=${page}&limit=${limit}`)
      .pipe(map(response => response.data));
  }

  getTask(id: string): Observable<Task> {
    return this.http.get<APIResponse<Task>>(`${this.baseUrl}/tasks/${id}`)
      .pipe(map(response => response.data));
  }

  // Reviews
  getReviews(page: number = 1, limit: number = 10): Observable<PaginatedResponse<Review>> {
    return this.http.get<APIResponse<PaginatedResponse<Review>>>(`${this.baseUrl}/reviews?page=${page}&limit=${limit}`)
      .pipe(map(response => response.data));
  }

  getAgentReviews(agentId: string): Observable<Review[]> {
    return this.http.get<APIResponse<Review[]>>(`${this.baseUrl}/reviews/agent/${agentId}`)
      .pipe(map(response => response.data));
  }

  getAgentStats(agentId: string): Observable<any> {
    return this.http.get<APIResponse<any>>(`${this.baseUrl}/reviews/agent/${agentId}/stats`)
      .pipe(map(response => response.data));
  }

  // Transactions
  getTransactions(page: number = 1, limit: number = 10): Observable<PaginatedResponse<Transaction>> {
    return this.http.get<APIResponse<PaginatedResponse<Transaction>>>(`${this.baseUrl}/transactions?page=${page}&limit=${limit}`)
      .pipe(map(response => response.data));
  }

  getTaskTransactions(taskId: string): Observable<Transaction[]> {
    return this.http.get<APIResponse<Transaction[]>>(`${this.baseUrl}/transactions/task/${taskId}`)
      .pipe(map(response => response.data));
  }

  getAgentEarnings(agentId: string): Observable<any> {
    return this.http.get<APIResponse<any>>(`${this.baseUrl}/transactions/agent/${agentId}/earnings`)
      .pipe(map(response => response.data));
  }

  // Audit Logs
  getAgentAuditLog(agentId: string, apiKey: string): Observable<AuditLog[]> {
    return this.http.get<AuditLog[]>(`${this.baseUrl}/agents/${agentId}/audit`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
  }
}
