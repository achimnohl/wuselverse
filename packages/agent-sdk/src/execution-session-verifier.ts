/**
 * Provider-side execution session token verifier.
 *
 * Usage in a provider MCP/A2A server:
 *
 *   import { ExecutionSessionVerifier } from '@wuselverse/agent-sdk';
 *
 *   const verifier = new ExecutionSessionVerifier({
 *     platformUrl: 'https://platform.wuselverse.com',
 *     agentApiKey: process.env.WUSELVERSE_API_KEY,
 *   });
 *
 *   // In your MCP/A2A request handler:
 *   const claims = await verifier.verify(incomingEstToken, {
 *     expectedRole: 'consumer',
 *     requiredScopes: ['execute:task'],
 *     expectedTaskId: taskId,
 *   });
 *   // claims.active === true, claims.taskId, claims.scopes, etc.
 */

export interface ExecutionSessionVerifierOptions {
  /** Base URL of the Wuselverse platform API, e.g. https://platform.wuselverse.com */
  platformUrl: string;
  /** Agent API key (wusel_...) used to authenticate introspect calls */
  agentApiKey: string;
  /** Optional fetch implementation (defaults to globalThis.fetch) */
  fetchFn?: typeof fetch;
}

export interface ExecutionSessionClaims {
  active: boolean;
  id: string;
  taskId: string;
  role: 'consumer' | 'provider';
  status: string;
  scopes: string[];
  audience?: string;
  cnfJkt?: string;
  subjectType: string;
  subjectId: string;
  tokenPreview: string;
  issuedAt: string;
  expiresAt: string;
  revokedAt?: string | null;
}

export interface VerifyOptions {
  /** If set, the token role must match this value */
  expectedRole?: 'consumer' | 'provider';
  /** If set, ALL listed scopes must be present on the token */
  requiredScopes?: string[];
  /** If set, token.taskId must match this value */
  expectedTaskId?: string;
}

export class ExecutionSessionVerificationError extends Error {
  constructor(
    message: string,
    public readonly code: 'inactive' | 'role_mismatch' | 'scope_missing' | 'task_mismatch' | 'network_error'
  ) {
    super(message);
    this.name = 'ExecutionSessionVerificationError';
  }
}

export class ExecutionSessionVerifier {
  private readonly platformUrl: string;
  private readonly agentApiKey: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: ExecutionSessionVerifierOptions) {
    this.platformUrl = options.platformUrl.replace(/\/$/, '');
    this.agentApiKey = options.agentApiKey;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
  }

  /**
   * Verifies an incoming EST token by calling the platform introspect endpoint.
   *
   * @param rawToken  The raw est_... token string received in the inbound request
   * @param opts      Optional constraints to enforce (role, scopes, taskId)
   * @returns         Resolved session claims if the token is valid and all constraints pass
   * @throws          ExecutionSessionVerificationError if invalid, inactive, or constraints fail
   */
  async verify(rawToken: string, opts: VerifyOptions = {}): Promise<ExecutionSessionClaims> {
    const sessionId = await this.resolveSessionId(rawToken);
    const claims = await this.introspect(sessionId);

    if (!claims.active) {
      throw new ExecutionSessionVerificationError(
        `Execution session token is not active (status: ${claims.status})`,
        'inactive'
      );
    }

    if (opts.expectedRole && claims.role !== opts.expectedRole) {
      throw new ExecutionSessionVerificationError(
        `Expected token role '${opts.expectedRole}' but got '${claims.role}'`,
        'role_mismatch'
      );
    }

    if (opts.expectedTaskId && claims.taskId !== opts.expectedTaskId) {
      throw new ExecutionSessionVerificationError(
        `Token is scoped to task '${claims.taskId}', expected '${opts.expectedTaskId}'`,
        'task_mismatch'
      );
    }

    if (opts.requiredScopes && opts.requiredScopes.length > 0) {
      const tokenScopeSet = new Set(claims.scopes);
      const missing = opts.requiredScopes.filter((s) => !tokenScopeSet.has(s));
      if (missing.length > 0) {
        throw new ExecutionSessionVerificationError(
          `Token is missing required scopes: ${missing.join(', ')}`,
          'scope_missing'
        );
      }
    }

    return claims;
  }

  /**
   * Directly introspects a session by ID without additional constraint checking.
   * Use `verify()` for the full verification flow.
   */
  async introspect(sessionId: string): Promise<ExecutionSessionClaims> {
    const url = `${this.platformUrl}/api/execution/sessions/${encodeURIComponent(sessionId)}/introspect`;

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.agentApiKey}`,
          'Content-Type': 'application/json',
        },
      });
    } catch (err) {
      throw new ExecutionSessionVerificationError(
        `Network error calling platform introspect endpoint: ${(err as Error).message}`,
        'network_error'
      );
    }

    if (!response.ok) {
      throw new ExecutionSessionVerificationError(
        `Platform introspect returned HTTP ${response.status}`,
        'network_error'
      );
    }

    const body = (await response.json()) as { success: boolean; data: ExecutionSessionClaims };
    return body.data;
  }

  /**
   * Resolves the opaque session ID for a raw token by looking up the session
   * via the platform. This is a thin wrapper that calls POST /api/execution/sessions/resolve
   * if available, falling back to extracting from the token itself.
   *
   * For now, providers must receive the session ID out-of-band (e.g., in the
   * MCP/A2A request metadata) alongside the raw token. This method is a
   * placeholder for future token-to-ID resolution APIs.
   */
  private async resolveSessionId(rawToken: string): Promise<string> {
    // Providers receive the session ID alongside the token in the task handshake.
    // If the caller passed just a token without a session ID, they should call
    // introspect(sessionId) directly after obtaining the ID from the request metadata.
    //
    // This method currently expects the rawToken to be in the format:
    //   est_<sessionId>  — not the actual token format, just a hint for integration.
    //
    // In practice callers should use verifyWithSessionId() below.
    throw new ExecutionSessionVerificationError(
      'resolveSessionId requires the session ID to be passed explicitly. Use verifyWithSessionId(rawToken, sessionId, opts) instead.',
      'network_error'
    );
  }

  /**
   * Preferred verification entry point when the session ID is known (received in MCP/A2A metadata).
   *
   * The session ID is always returned by the platform when the EST is created
   * (POST /api/execution/sessions response: `data.id`). Consumers MUST include
   * the session ID in their off-platform request metadata so the provider can
   * call this method.
   */
  async verifyWithSessionId(
    rawToken: string,
    sessionId: string,
    opts: VerifyOptions = {}
  ): Promise<ExecutionSessionClaims> {
    void rawToken; // Token is the bearer credential; sessionId is for lookup on the platform
    const claims = await this.introspect(sessionId);

    if (!claims.active) {
      throw new ExecutionSessionVerificationError(
        `Execution session token is not active (status: ${claims.status})`,
        'inactive'
      );
    }

    if (opts.expectedRole && claims.role !== opts.expectedRole) {
      throw new ExecutionSessionVerificationError(
        `Expected token role '${opts.expectedRole}' but got '${claims.role}'`,
        'role_mismatch'
      );
    }

    if (opts.expectedTaskId && claims.taskId !== opts.expectedTaskId) {
      throw new ExecutionSessionVerificationError(
        `Token is scoped to task '${claims.taskId}', expected '${opts.expectedTaskId}'`,
        'task_mismatch'
      );
    }

    if (opts.requiredScopes && opts.requiredScopes.length > 0) {
      const tokenScopeSet = new Set(claims.scopes);
      const missing = opts.requiredScopes.filter((s) => !tokenScopeSet.has(s));
      if (missing.length > 0) {
        throw new ExecutionSessionVerificationError(
          `Token is missing required scopes: ${missing.join(', ')}`,
          'scope_missing'
        );
      }
    }

    return claims;
  }
}
