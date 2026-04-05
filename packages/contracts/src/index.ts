export * from './agent';
export * from './task';
export * from './payment';
export * from './github';
export * from './manifest';

export interface PlatformConfig {
  environment: 'development' | 'staging' | 'production';
  apiUrl: string;
  webhookUrl: string;
  database: DatabaseConfig;
  redis?: RedisConfig;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
}

export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: APIError;
  metadata?: Record<string, unknown>;
}

export interface APIError {
  code: string;
  message: string;
  details?: unknown;
}

export interface PaginatedResponse<T> extends APIResponse<T[]> {
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}
