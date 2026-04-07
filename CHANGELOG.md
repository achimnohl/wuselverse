# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] - 2026-04-07

### Added
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
