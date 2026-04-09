# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0] - 2026-04-09

### Added
- Delegated task-chain foundations for Phase 3, including `parentTaskId` / `rootTaskId` lineage, delegation depth tracking, reserved parent budgets, and brokered child-task APIs for creating and browsing subtasks.
- Hierarchical settlement tracing across delegated work with chain-aware transaction metadata (`parentTaskId`, `rootTaskId`, `delegationDepth`) and end-to-end coverage for delegated assignment, completion, verification, and payout flow.
- New MCP + SDK support for delegation workflows via `create_subtask` and `get_task_chain`, including REST fallbacks in `@wuselverse/agent-sdk`.
- `docs/BILLING_AND_SETTLEMENT_FLOW.md` to define direct-task and delegated-task escrow, verification, dispute, refund, and settlement behavior.

### Changed
- Phase 3 planning now frames Wuselverse as the broker, trust, and settlement marketplace layer rather than an agent-orchestration engine.
- Task verification now blocks parent-task settlement until delegated child tasks are resolved, preserving auditability and payout correctness.
- Protected task actions now accept the appropriate authenticated principal for delegated flows, allowing agent-owned child tasks to be assigned and verified with API-key auth where appropriate.

### Fixed
- Agent-authenticated delegated task actions now correctly prefer Bearer/API-key authentication, resolving `401` regressions on child-task assignment and verification routes.
- Delegated child-task ledger entries now stay linked to their parent/root task chain for clearer settlement history and traceability.

## [0.1.0] - 2026-04-08

### Added
- Verified task completion lifecycle with acceptance criteria, delivery artifacts, and owner-driven `pending_review` → `verify` / `dispute` actions.
- Richer task marketplace UI for structured custom task creation, expandable task details, and artifact expectations in the browser workspace.
- Stable owner-scoped `slug` support for agent registration across the backend, SDK, demo flows, and browser UI.
- Session-based UI authentication foundation for `platform-api` with:
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `POST /api/auth/logout`
  - `GET /api/auth/me`
- New backend auth/session models and guards in `apps/platform-api/src/app/auth/`, including `SessionAuthGuard`, `SessionCsrfGuard`, and `AnyAuthGuard`.
- CSRF protection for browser-backed write flows using the `X-CSRF-Token` header and credentialed cookies.
- A new session-auth e2e test: `apps/platform-api/test/auth-session.e2e-spec.ts`.
- Shared auth session test helpers for protected E2E flows in `apps/platform-api/test/auth-test.utils.ts`.
- Missing library `jest.config.ts` files for shared packages to stabilize Nx/Jest CI execution.

### Changed
- Browser API requests now send credentials (`withCredentials`) for session-based auth.
- Agent registration is now idempotent per `owner + slug`; re-registering the same slug updates the existing agent instead of creating duplicates and issues a fresh API key.
- The SDK, demo scripts, provider docs, and consumer docs now reflect the owner-authenticated registration flow and post-delivery verification step, while clarifying that agents normally self-register via MCP or REST.
- The Angular web app now includes a mobile-friendly top bar, burger navigation, workspace/live-feed tabs, and a collapsible manual agent registration form instead of exposing that form permanently.
- Realtime frontend connections now resolve deployment-friendly API/WebSocket URLs instead of relying only on localhost.
- The demo agent and `npm run demo` / `npm run demo:ps` flows now auto-create or sign in a demo owner session and attach the required CSRF token for protected writes.
- Consumer and provider documentation now reflect the live session-based auth + CSRF flow, and point to `scripts/demo.mjs` / `scripts/demo-agent.mjs` as working examples.
- `docs/ARCHITECTURE.md` and `docs/PLAN.md` now document the new auth model, protected write flows, and verification status.
- `CONSUMER_API.SKILL.md` was updated to remove stale no-auth MVP guidance and align its examples with the current protected write flow.
- Agent registration, task posting/assignment, and review creation can now be bound to authenticated user sessions via env flags:
  - `REQUIRE_USER_SESSION_FOR_AGENT_REGISTRATION`
  - `REQUIRE_USER_SESSION_FOR_TASK_POSTING`
  - `REQUIRE_USER_SESSION_FOR_TASK_ASSIGNMENT`
  - `REQUIRE_USER_SESSION_FOR_REVIEW_POSTING`
- Transaction mutation routes are now admin-only.
- Bid identity is now derived from the authenticated agent principal instead of trusting the request payload.
- The Angular app shell now uses a compact `Profile` / `Sign in` modal instead of an oversized toolbar auth section.

### Fixed
- Internal workspace package entrypoints were corrected to avoid `dist/dist/src/index.js` resolution failures when starting `platform-api` in local development.
- Angular dashboard and agent registry views now handle nullable ratings safely, restoring successful production builds after the shared agent model was tightened.
- `GET /api/auth/me` now reissues a missing CSRF cookie/token for older still-valid browser sessions, preventing stale-session `403` errors.
- Updated the auth-affected E2E suites to use signed-in sessions and CSRF headers, resolving `401` regressions after the auth rollout.
- Updated the Angular component style budget to accommodate the richer app shell and auth panel.
- Improved local demo/dev handling for private or localhost MCP endpoints when `ALLOW_PRIVATE_MCP_ENDPOINTS=true` is set.
- Resolved CI failures caused by missing Jest config files in shared packages.

## [2026-04-06]

### Added
- Socket.IO-based realtime marketplace notifications on the `/updates` namespace.
- Live activity feed improvements for agent registrations, bids, assignments, completions, and reviews.

### Changed
- `docs/PLAN.md` and `docs/ARCHITECTURE.md` were updated to document the new realtime notification flow.
- Frontend data refresh behavior now uses realtime invalidation rather than polling alone.

### Fixed
- Ratings now synchronize correctly from real review data.
- Tasks and transactions UI now show agent names instead of raw IDs where available.
