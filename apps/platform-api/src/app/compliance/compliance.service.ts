import { Injectable, Logger } from '@nestjs/common';
import { COMPLIANCE_POLICY } from './compliance-policy';

export type ComplianceDecision = 'approved' | 'rejected' | 'needs_review';

export interface ComplianceResult {
  decision: ComplianceDecision;
  violations: string[];
  confidence: number;
  reason: string;
}

export interface AgentRegistrationPayload {
  name: string;
  description: string;
  offerDescription: string;
  capabilities: Array<{ skill: string; description: string }>;
  pricing: { type: string; amount: number; currency: string };
  mcpEndpoint?: string;
}

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  constructor() {
    const apiKey = process.env.COMPLIANCE_LLM_API_KEY;
    const endpoint = process.env.COMPLIANCE_LLM_ENDPOINT || 'https://api.openai.com/v1/chat/completions';
    const model = process.env.COMPLIANCE_LLM_MODEL || 'gpt-4o-mini';
    
    if (apiKey) {
      this.logger.log(`✓ Compliance LLM configured - Model: ${model}`);
      this.logger.log(`  Endpoint: ${endpoint}`);
    } else {
      this.logger.warn('✗ COMPLIANCE_LLM_API_KEY not set - will auto-approve agents after structural checks');
    }
  }

  /**
   * Evaluate an agent registration payload against the platform policy.
   *
   * Uses an LLM when COMPLIANCE_LLM_API_KEY is set; falls back to the
   * structural fast-path checker when no key is configured so development
   * still works without external credentials.
   */
  async evaluate(payload: AgentRegistrationPayload): Promise<ComplianceResult> {
    // Always run the structural checks first — these are cheap and instant.
    const structural = this.structuralCheck(payload);
    if (structural.decision === 'rejected') return structural;

    const isPrivateEndpoint = !!payload.mcpEndpoint &&
      /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(payload.mcpEndpoint);
    const allowPrivateEndpoints = process.env.ALLOW_PRIVATE_MCP_ENDPOINTS === 'true';

    if (isPrivateEndpoint && allowPrivateEndpoints) {
      this.logger.warn(
        'Private/localhost MCP endpoint detected in development mode — auto-approving demo agent without LLM review'
      );
      return {
        decision: 'approved',
        violations: [],
        confidence: 0.95,
        reason: 'Development-mode localhost MCP endpoint allowed for local demos',
      };
    }

    const apiKey = process.env.COMPLIANCE_LLM_API_KEY;
    if (!apiKey) {
      this.logger.warn(
        'COMPLIANCE_LLM_API_KEY not set — skipping LLM evaluation, auto-approving after structural check'
      );
      return { decision: 'approved', violations: [], confidence: 0.6, reason: 'Structural checks passed; LLM evaluation skipped (no API key configured)' };
    }

    const endpoint = process.env.COMPLIANCE_LLM_ENDPOINT || 'https://api.openai.com/v1/chat/completions';
    const model = process.env.COMPLIANCE_LLM_MODEL || 'gpt-4o-mini';
    this.logger.log(`Using LLM for compliance evaluation - Model: ${model}, Endpoint: ${endpoint}`);

    try {
      return await this.llmEvaluate(payload, apiKey);
    } catch (err: any) {
      this.logger.error(`LLM compliance evaluation failed: ${err.message}. Falling back to needs_review.`);
      return {
        decision: 'needs_review',
        violations: [],
        confidence: 0,
        reason: `LLM evaluation failed: ${err.message}. Queued for manual review.`,
      };
    }
  }

  // ── Structural fast-path ────────────────────────────────────────────────

  private structuralCheck(payload: AgentRegistrationPayload): ComplianceResult {
    const violations: string[] = [];

    // Blocklist patterns — keep this list minimal; the LLM handles nuance.
    const BLOCKLIST = [
      /\b(malware|ransomware|exploit kit|ddos|denial.of.service|botnet|keylogger|rootkit|trojan)\b/i,
      /\b(csam|child porn|child sexual)\b/i,
      /\b(bypass.auth|crack password|brute.?force login|credential.stuffing)\b/i,
      /\b(phishing|fake invoice|scam)\b/i,
    ];

    const text = `${payload.name} ${payload.description} ${payload.offerDescription}`;
    for (const pattern of BLOCKLIST) {
      if (pattern.test(text)) {
        violations.push(`Description contains prohibited term matching pattern: ${pattern.source}`);
      }
    }

    // Private/localhost MCP endpoints are fine for local demos and development,
    // but should still be blocked in production because they are not externally reachable.
    if (payload.mcpEndpoint) {
      const isPrivateEndpoint = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(payload.mcpEndpoint);
      const allowPrivateEndpoints = process.env.ALLOW_PRIVATE_MCP_ENDPOINTS === 'true';

      if (isPrivateEndpoint && !allowPrivateEndpoints) {
        violations.push('mcpEndpoint resolves to a private/localhost address and is not externally reachable');
      }
    }

    // Name/description minimum quality.
    if (payload.name.trim().length < 3) {
      violations.push('Agent name is too short to be meaningful');
    }
    if (payload.description.trim().length < 20) {
      violations.push('Agent description is too short to be meaningful');
    }
    if (payload.capabilities.length === 0) {
      violations.push('Agent must declare at least one capability');
    }

    if (violations.length > 0) {
      return {
        decision: 'rejected',
        violations,
        confidence: 1.0,
        reason: `Failed ${violations.length} structural compliance check(s).`,
      };
    }

    return { decision: 'approved', violations: [], confidence: 1.0, reason: 'Structural checks passed' };
  }

  // ── LLM evaluation ──────────────────────────────────────────────────────

  private async llmEvaluate(
    payload: AgentRegistrationPayload,
    apiKey: string  
  ): Promise<ComplianceResult> {
    const prompt = this.buildPrompt(payload);
    const endpoint = process.env.COMPLIANCE_LLM_ENDPOINT || 'https://api.openai.com/v1/chat/completions';
    const model = process.env.COMPLIANCE_LLM_MODEL || 'gpt-4o-mini';

    this.logger.debug(`Sending compliance request to ${endpoint} with model ${model}`);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: COMPLIANCE_POLICY },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      this.logger.error(`LLM API error (${response.status}): ${body}`);
      throw new Error(`LLM API returned ${response.status}: ${body}`);
    }

    const data = await response.json() as any;
    this.logger.debug(`LLM response received: ${JSON.stringify(data).substring(0, 200)}...`);
    
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) throw new Error('LLM returned empty content');

    const parsed = JSON.parse(raw);
    this.logger.log(`Compliance decision: ${parsed.decision} (confidence: ${parsed.confidence})`);
    
    return this.validateLlmResponse(parsed);
  }

  private buildPrompt(payload: AgentRegistrationPayload): string {
    return `Evaluate the following agent registration against the platform compliance policy.

IMPORTANT: You must respond with ONLY a valid JSON object. Do not include any other text or explanation.

Return a JSON object with exactly these fields:
{
  "decision": "approved" | "rejected" | "needs_review",
  "violations": string[],
  "confidence": number (0.0–1.0),
  "reason": string
}

Agent registration:
${JSON.stringify(payload, null, 2)}`;
  }

  private validateLlmResponse(raw: any): ComplianceResult {
    const decision = raw?.decision;
    if (!['approved', 'rejected', 'needs_review'].includes(decision)) {
      throw new Error(`LLM returned unexpected decision: ${decision}`);
    }
    return {
      decision,
      violations: Array.isArray(raw.violations) ? raw.violations : [],
      confidence: typeof raw.confidence === 'number' ? Math.min(1, Math.max(0, raw.confidence)) : 0.5,
      reason: typeof raw.reason === 'string' ? raw.reason : '',
    };
  }
}
