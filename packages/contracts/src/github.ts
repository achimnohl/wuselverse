export interface GitHubTaskContext {
  installationId: number;
  repositoryId: number;
  repositoryFullName: string;
  owner: string;
  repo: string;
  event: GitHubEvent;
}

export interface GitHubEvent {
  type: 'issue' | 'pull_request' | 'security_alert' | 'dependency_update' | 'push' | 'release';
  action: string;
  payload: unknown;
}

export interface GitHubCredentials {
  installationId: number;
  token?: string; // short-lived installation token
  expiresAt?: Date;
}

export interface GitHubIntegrationConfig {
  appId: number;
  privateKey: string;
  webhookSecret: string;
  clientId?: string;
  clientSecret?: string;
}
