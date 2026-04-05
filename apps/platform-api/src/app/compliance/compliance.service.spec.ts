import { Test, TestingModule } from '@nestjs/testing';
import { ComplianceService, AgentRegistrationPayload } from './compliance.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const validPayload = (): AgentRegistrationPayload => ({
  name: 'Security Scanner',
  description: 'Scans repositories for common security vulnerabilities and OWASP issues.',
  offerDescription: 'I run SAST and dependency audits on your codebase and return a structured report.',
  capabilities: [{ skill: 'security-scan', description: 'Static analysis and dependency audit' }],
  pricing: { type: 'fixed', amount: 10, currency: 'USD' },
});

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('ComplianceService', () => {
  let service: ComplianceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ComplianceService],
    }).compile();

    service = module.get<ComplianceService>(ComplianceService);

    // Ensure LLM path is disabled by default so tests are deterministic
    delete process.env['COMPLIANCE_LLM_API_KEY'];
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env['COMPLIANCE_LLM_API_KEY'];
  });

  // ── Structural checks ─────────────────────────────────────────────────────

  describe('structural checks (no LLM key)', () => {
    it('approves a well-formed payload', async () => {
      const result = await service.evaluate(validPayload());
      expect(result.decision).toBe('approved');
      expect(result.violations).toHaveLength(0);
    });

    it('rejects a payload with a blocklist term in the name', async () => {
      const payload = validPayload();
      payload.name = 'My Ransomware Tool';
      const result = await service.evaluate(payload);
      expect(result.decision).toBe('rejected');
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0]).toMatch(/ransomware/i);
    });

    it('rejects a payload with a blocklist term in the description', async () => {
      const payload = validPayload();
      payload.description = 'This agent distributes a botnet across target servers.';
      const result = await service.evaluate(payload);
      expect(result.decision).toBe('rejected');
      expect(result.violations.some((v) => /botnet/i.test(v))).toBe(true);
    });

    it('rejects a payload with a blocklist term in offerDescription', async () => {
      const payload = validPayload();
      payload.offerDescription = 'I can help you craft a phishing campaign.';
      const result = await service.evaluate(payload);
      expect(result.decision).toBe('rejected');
    });

    it('rejects a localhost mcpEndpoint', async () => {
      const payload = validPayload();
      payload.mcpEndpoint = 'http://localhost:3001/mcp';
      const result = await service.evaluate(payload);
      expect(result.decision).toBe('rejected');
      expect(result.violations.some((v) => /private/i.test(v))).toBe(true);
    });

    it('rejects a private-range mcpEndpoint (192.168.x.x)', async () => {
      const payload = validPayload();
      payload.mcpEndpoint = 'http://192.168.1.10/mcp';
      const result = await service.evaluate(payload);
      expect(result.decision).toBe('rejected');
    });

    it('rejects a private-range mcpEndpoint (10.x.x.x)', async () => {
      const payload = validPayload();
      payload.mcpEndpoint = 'http://10.0.0.5:8080/mcp';
      const result = await service.evaluate(payload);
      expect(result.decision).toBe('rejected');
    });

    it('accepts a public mcpEndpoint', async () => {
      const payload = validPayload();
      payload.mcpEndpoint = 'https://agents.example.com/mcp';
      const result = await service.evaluate(payload);
      expect(result.decision).toBe('approved');
    });

    it('rejects an agent name shorter than 3 characters', async () => {
      const payload = validPayload();
      payload.name = 'AB';
      const result = await service.evaluate(payload);
      expect(result.decision).toBe('rejected');
      expect(result.violations.some((v) => /name.*short/i.test(v))).toBe(true);
    });

    it('rejects a description shorter than 20 characters', async () => {
      const payload = validPayload();
      payload.description = 'Too short.';
      const result = await service.evaluate(payload);
      expect(result.decision).toBe('rejected');
      expect(result.violations.some((v) => /description.*short/i.test(v))).toBe(true);
    });

    it('rejects an agent with no capabilities', async () => {
      const payload = validPayload();
      payload.capabilities = [];
      const result = await service.evaluate(payload);
      expect(result.decision).toBe('rejected');
      expect(result.violations.some((v) => /capability/i.test(v))).toBe(true);
    });

    it('accumulates multiple violations', async () => {
      const payload = validPayload();
      payload.name = 'AB';
      payload.description = 'Short.';
      payload.capabilities = [];
      const result = await service.evaluate(payload);
      expect(result.decision).toBe('rejected');
      expect(result.violations.length).toBeGreaterThanOrEqual(3);
    });

    it('returns confidence=1 on structural rejection', async () => {
      const payload = validPayload();
      payload.name = 'x';
      const result = await service.evaluate(payload);
      expect(result.confidence).toBe(1.0);
    });
  });

  // ── LLM path ──────────────────────────────────────────────────────────────

  describe('LLM evaluation (COMPLIANCE_LLM_API_KEY set)', () => {
    const FAKE_API_KEY = 'test-llm-key-abc123';

    beforeEach(() => {
      process.env['COMPLIANCE_LLM_API_KEY'] = FAKE_API_KEY;
    });

    function mockFetch(decision: string, violations: string[] = [], confidence = 0.9, reason = 'test') {
      const body = JSON.stringify({ decision, violations, confidence, reason });
      const llmResponse = {
        choices: [{ message: { content: body } }],
      };
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(llmResponse),
        text: () => Promise.resolve(''),
      } as any);
    }

    it('returns approved when LLM says approved', async () => {
      mockFetch('approved');
      const result = await service.evaluate(validPayload());
      expect(result.decision).toBe('approved');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('returns rejected when LLM says rejected', async () => {
      mockFetch('rejected', ['Agent offers illegal gambling services'], 0.95, 'Policy violation');
      const result = await service.evaluate(validPayload());
      expect(result.decision).toBe('rejected');
      expect(result.violations).toContain('Agent offers illegal gambling services');
    });

    it('returns needs_review when LLM says needs_review', async () => {
      mockFetch('needs_review', [], 0.5, 'Ambiguous scope');
      const result = await service.evaluate(validPayload());
      expect(result.decision).toBe('needs_review');
    });

    it('skips LLM entirely when structural check fails', async () => {
      global.fetch = jest.fn();
      const payload = validPayload();
      payload.name = 'x'; // structural failure
      await service.evaluate(payload);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('falls back to needs_review when the LLM API returns a non-OK status', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: () => Promise.resolve('Service Unavailable'),
      } as any);
      const result = await service.evaluate(validPayload());
      expect(result.decision).toBe('needs_review');
    });

    it('falls back to needs_review when fetch throws a network error', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network timeout'));
      const result = await service.evaluate(validPayload());
      expect(result.decision).toBe('needs_review');
    });

    it('falls back to needs_review when LLM returns an unexpected decision value', async () => {
      const badBody = JSON.stringify({ decision: 'maybe', violations: [], confidence: 0.5, reason: '' });
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ choices: [{ message: { content: badBody } }] }),
        text: () => Promise.resolve(''),
      } as any);
      const result = await service.evaluate(validPayload());
      expect(result.decision).toBe('needs_review');
    });

    it('clamps confidence to [0, 1] if LLM returns out-of-range value', async () => {
      mockFetch('approved', [], 5.0);
      const result = await service.evaluate(validPayload());
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('sends the payload to the correct endpoint with Bearer auth', async () => {
      mockFetch('approved');
      await service.evaluate(validPayload());

      const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toContain('openai.com');
      const headers = (init as RequestInit).headers as Record<string, string>;
      expect(headers['Authorization']).toBe(`Bearer ${FAKE_API_KEY}`);
    });

    it('uses COMPLIANCE_LLM_ENDPOINT when set', async () => {
      process.env['COMPLIANCE_LLM_ENDPOINT'] = 'https://custom.llm.example.com/v1/chat/completions';
      mockFetch('approved');
      await service.evaluate(validPayload());

      const [url] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe('https://custom.llm.example.com/v1/chat/completions');
      delete process.env['COMPLIANCE_LLM_ENDPOINT'];
    });
  });
});
