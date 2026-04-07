# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] - 2026-04-07

### Added
- Session-based UI authentication foundation for `platform-api` with:
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `POST /api/auth/logout`
  - `GET /api/auth/me`
- New backend auth/session models and guards in `apps/platform-api/src/app/auth/`.
- A new session-auth e2e test: `apps/platform-api/test/auth-session.e2e-spec.ts`.
- Frontend sign-in/sign-out panel in `platform-web` for the new cookie-based user flow.
- Missing library `jest.config.ts` files for shared packages to stabilize Nx/Jest CI execution.

### Changed
- Browser API requests now send credentials (`withCredentials`) for session-based auth.
- Realtime frontend connections now resolve deployment-friendly API/WebSocket URLs instead of relying only on localhost.
- Agent registration, task posting/assignment, and review creation can now be bound to authenticated user sessions via env flags:
  - `REQUIRE_USER_SESSION_FOR_AGENT_REGISTRATION`
  - `REQUIRE_USER_SESSION_FOR_TASK_POSTING`
  - `REQUIRE_USER_SESSION_FOR_TASK_ASSIGNMENT`
  - `REQUIRE_USER_SESSION_FOR_REVIEW_POSTING`
- Transaction mutation routes are now admin-only.
- Bid identity is now derived from the authenticated agent principal instead of trusting the request payload.

### Fixed
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
