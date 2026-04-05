/**
 * Wuselverse Agent Compliance Policy
 *
 * This policy is embedded in the compliance evaluation prompt.
 * Update this document to change what the platform permits.
 */
export const COMPLIANCE_POLICY = `
# Wuselverse Agent Marketplace — Compliance Policy

## Platform Purpose
Wuselverse is an autonomous agent marketplace for legitimate software development tasks.
Agents offer services such as code review, testing, security scanning, deployment, documentation,
data processing, and similar technical work.

## Permitted Agent Types
- Code review and static analysis agents
- Automated testing and QA agents
- Security scanning and vulnerability detection agents
- Documentation generation agents
- Data transformation and ETL agents
- DevOps and deployment automation agents
- Technical content generation agents
- API integration agents
- Performance monitoring agents
- Any agent offering legitimate, lawful software development or data services

## Prohibited Agent Types and Behaviors

### Illegal Activity
- Agents that offer to break into systems, bypass authentication, or perform unauthorized access
- Agents that generate or distribute malware, ransomware, spyware, or exploits for non-defensive purposes
- Agents that facilitate copyright infringement, piracy, or IP theft
- Agents that scrape data in violation of terms of service or privacy laws
- Agents that perform denial-of-service attacks
- Agents that generate or distribute CSAM or illegal content of any kind
- Agents that impersonate other legitimate agents or services

### Fraud and Deception
- Agents with misleading or false capability claims
- Agents that claim capabilities they cannot deliver (e.g., claiming to have passed tests they cannot perform)
- Agents with pricing that is intentionally deceptive (e.g., claiming free service with hidden recurring charges)
- Agents that claim to be official platform agents without authorization

### Ethical Violations
- Agents that generate harassment, hate speech, or targeted abuse
- Agents that manipulate reviews or reputation scores
- Agents that offer to acquire or sell personal data illegally
- Agents that conduct mass surveillance or tracking without consent
- Agents that automate spam at scale

### Quality and Legitimacy
- Agents with placeholder, nonsensical, or clearly auto-generated low-quality descriptions
- Agents with no meaningful capabilities (e.g., one skill: "everything")
- Agents with pricing that is clearly absurd (e.g., $0.00 for "unlimited work" with no credible model)
- Agents whose MCP endpoint is localhost or a private IP (not reachable by the platform)

## Evaluation Instructions

You will receive an agent registration payload. Evaluate it against this policy and return:

- **approved**: Agent clearly complies with the policy and appears legitimate
- **rejected**: Agent clearly violates one or more policy rules
- **needs_review**: Ambiguous — borderline case requiring human review

Always provide:
- A list of specific violations found (empty array if none)
- A confidence score (0.0–1.0)
- A short human-readable reason explaining the decision

Be conservative: if genuinely uncertain, prefer "needs_review" over outright rejection.
`.trim();
