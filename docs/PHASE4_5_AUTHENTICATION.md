# Phase 4.5 — authentication, users and Turnstile

## Implementation and boundaries

Authentication now uses a persistent SQLite application database, separate from OWL/Fuseki insurance data. Express enforces sessions and permissions; React guards are presentation controls. Public signup does not exist. No default administrator or password is created. No administrator bootstrap, actual authentication migration, email, Turnstile verification, server, browser or RDF mutation was executed during implementation. Automated migrations ran only in disposable test databases.

The original ontology, SPARQL templates, NLP processing and Fuseki configurations remain unchanged. `CLAIMS_MUTATIONS_ENABLED=false` remains the default and is also set in the existing ignored local backend environment. No active writer credentials were generated and no Fuseki runtime was modified. The sidebar assistant action was removed as requested; the floating chatbot remains inside the protected workspace. Its history survives navigation, but is cleared when the workspace unmounts at logout/session expiry.

## SQLite and migrations

Minimum Node version is **22.18.0**. The maintained driver is Node's built-in `node:sqlite` (`DatabaseSync`), available without a flag on the installed version. **Node 22 labels this API experimental**; this is a technical limitation, not a separate database server dependency. Transactions are synchronous and kept short; password hashing and CAPTCHA HTTP work occur outside SQLite transactions.

Default file: `.local/auth/auth.sqlite`, resolved from `AUTH_DATABASE_PATH` relative to `backend/`. `.local/`, SQLite/database files and their journal/WAL companions are ignored by Git. No static file route serves this directory. Restrict its Windows ACLs to the service account/authorized operators; Unix directory creation requests mode 0700. Backups must include consistent SQLite/WAL state and be protected as credential material. Do not place the file under `frontend/public`.

`backend/migrations/001_auth.sql` defines:

- `users`: UUID, name, normalized unique email, nullable Argon2id hash while pending, validated role/status, creation/update/last-login timestamps and creating-admin reference. Active accounts require a password hash. Email normalization trims and lowercases consistently; NOCASE uniqueness is additionally enforced.
- `sessions`: SHA-256 digest of a random 256-bit bearer token, user reference, created/last-seen/absolute-expiry timestamps. Raw session tokens are not stored.
- `account_tokens`: hashed 256-bit one-time token, user, activation/reset purpose and expiry.
- `rate_limits`, `captcha_uses`: hashed keys, bounded windows and challenge replay prevention.
- `audit_events`: event type, actor/subject IDs and timestamp, without passwords, token values or CAPTCHA secrets.

`schema_migrations` records applied versioned SQL filenames. Initialization applies missing migrations transactionally and idempotently with foreign keys, WAL and a busy timeout. The explicit CLI migration command uses the same path. Never use the test suite as a migration tool for the actual database.

## Roles and permissions

| Capability | ADMIN | AGENT | VIEWER |
| --- | --- | --- | --- |
| Dashboard, claims reads, NLP, ontology, approved SELECTs | Yes | Yes | Yes |
| Own profile/password | Yes | Yes | Yes |
| Claims create/edit/delete | Only if RDF writes are explicitly enabled | Only if RDF writes are explicitly enabled | No |
| Create users, roles, disable/reactivate, setup/reset links | Yes | No | No |

`PENDING` accounts must complete setup. `DISABLED` accounts cannot log in or use existing sessions. Roles are read from the database on each authenticated request. Role/status/email changes revoke that user's sessions. Last-active-admin checks execute inside `BEGIN IMMEDIATE`, preventing concurrent demotion/deactivation from removing the final active administrator. No user-deletion endpoint exists. Own profile updates accept only the name; changing one's role through profile/login/setup payloads is rejected.

## Endpoints

Every endpoint uses the existing success/error envelope. All API responses receive `Cache-Control: no-store`. All mutation/POST flows require the trusted Origin and a valid CSRF header, including login, activation and read-only NLP POST requests.

| Endpoint | Access and behavior |
| --- | --- |
| GET `/api/health` | Explicitly public health information |
| GET `/api/auth/csrf` | Public security initialization; returns CSRF token and public Turnstile site key |
| POST `/api/auth/login` | Email, password, CAPTCHA token; creates a fresh session cookie |
| GET `/api/auth/me` | Authenticated safe user DTO |
| POST `/api/auth/logout` | Authenticated session invalidation and cookie clearing |
| POST `/api/auth/activate` | One-time setup/reset token and new password; generic invalid/expired-link failure |
| POST `/api/auth/change-password` | Authenticated current password and new password; revokes all sessions |
| PATCH `/api/auth/profile` | Authenticated name update only |
| GET `/api/admin/users` | ADMIN; search/role/status filters, page size 20 |
| POST `/api/admin/users` | ADMIN; create pending user, default VIEWER, one-time link returned in protected confirmation |
| PATCH `/api/admin/users/:id` | ADMIN; validated name/email/role/status changes |
| POST `/api/admin/users/:id/password-setup` | ADMIN; replace prior setup/reset link, one-hour expiry |

All other application data routes require a valid active session, including ontology summaries/catalogue, claims reads, NLP and analytics. Unknown authentication routes do not register users. Unauthenticated access gives 401; insufficient permission gives 403. Existing data response shapes and business rules are retained.

## Passwords, sessions and CSRF

Passwords contain 12–128 characters. Argon2id uses 19 MiB memory, two iterations, one lane and a 32-byte output, with a new salt generated by `@node-rs/argon2`. Login verifies a dummy hash for unknown/unconfigured accounts, uses generic credential failures and rejects pending/disabled users. No password/hash is returned in a user DTO. Normal login rotates the opaque cookie token and revokes the previous cookie's session.

Sessions have a 30-minute idle timeout and an eight-hour absolute lifetime. Last-seen updates are throttled to once per minute, so idle expiry can happen slightly earlier than 30 minutes after the most recent request. Cookie options are HttpOnly, SameSite=Strict, Path=/, no Domain. HTTPS uses Secure and `__Host-` names; explicit development HTTP origins use non-Secure cookies. Production refuses HTTP configuration. Logout, password change/reset, disablement and permission changes revoke persistent sessions. Tokens never enter localStorage/sessionStorage.

CSRF tokens are derived with SHA-256 from an unguessable HttpOnly cookie token and a domain-separating prefix. Before login/setup, a separate random anonymous cookie provides the binding; authenticated requests bind to the session token. `/csrf` returns the derived value, never the bearer cookie value. Unsafe requests must supply `x-csrf-token` and an exact configured Origin. Cross-site Fetch Metadata is rejected. SameSite is an additional defense. Cookie duplication or malformed tokens fail closed. GET requests do not mutate accounts/RDF; session activity bookkeeping and security-cookie initialization are the documented exceptions.

The shared frontend client uses same-origin cookies and keeps CSRF state in memory, resetting it on login/logout/password changes or CSRF errors. It does not automatically retry writes. After cross-tab login/logout, an old tab may need to retry after its CSRF state refreshes. There is no permissive CORS policy or trust of arbitrary forwarded IP headers. Production HTTPS/static hosting should additionally serve a CSP compatible with `https://challenges.cloudflare.com` and the built frontend; API headers alone do not secure a separately hosted HTML document.

## Turnstile configuration

The login page explicitly loads Cloudflare's official `api.js?render=explicit` widget, sets action `login`, handles errors/expiry, and supports retry. After every login attempt it discards the submitted token and remounts the widget. No script/provider call occurs during builds or SSR tests. The backend posts to the fixed official Siteverify endpoint with a five-second total timeout, no redirects, and controlled failures. Real credentials require exact hostname/action and a fresh challenge timestamp; a short-lived digest rejects local token replay. Provider failure never bypasses verification.

Public key: `TURNSTILE_SITE_KEY`; private key: `TURNSTILE_SECRET_KEY`. The frontend receives only the public key through `/api/auth/csrf`; a second Vite site-key setting is unnecessary. Missing keys fail closed. Real secrets must never use `VITE_*` or be committed.

For explicitly configured **development/test only**, the official always-pass test pair is:

```dotenv
TURNSTILE_TEST_MODE=true
TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
```

These are public provider test credentials, not active production secrets. They still call Siteverify; a token is never accepted locally. Only explicit `NODE_ENV=development` or `test`, `TURNSTILE_TEST_MODE=true`, the exact passing test site/secret pair, and `success: true` enable the test metadata exception. Under that combination, hostname/action metadata may be absent or test-specific, and freshness/local-digest replay checks are skipped to accommodate deterministic dummy tokens and test timestamps. Siteverify must still succeed for every attempt. All other configurations require an exact hostname, action `login`, a fresh challenge timestamp, and one-use local replay protection. Provider failures are diagnosed separately and fail closed. Production rejects test mode and recognized official test-key prefixes, requires HTTPS and genuine keys, and validates real hostname/action. Development diagnostics distinguish `siteverify_failure`, `metadata_mismatch`, `token_expired`, `token_replayed`, and `invalid_challenge_timestamp` without including tokens or secrets. The browser hostname should match `APP_ORIGIN`; for example, if the page is opened as `http://localhost:5173`, use that exact origin rather than `127.0.0.1`.

References for later setup: [official Turnstile client rendering](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/), [server verification](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/), [official testing keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/), [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). No documentation/provider HTTP request was made in this no-live session.

## Windows setup and initial administrator

The following commands are for the operator to run later. **They were not executed against the real environment.** Keep existing `.env` values; copy samples only when the destination does not exist.

```powershell
npm ci
if (!(Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
if (!(Test-Path frontend/.env)) { Copy-Item frontend/.env.example frontend/.env }
# Edit backend/.env: APP_ORIGIN and Turnstile keys/test mode as appropriate.
# Keep CLAIMS_MUTATIONS_ENABLED=false; leave Fuseki update credentials inactive.
npm run auth:migrate
npm run auth:bootstrap-admin
```

Use Node 22.18 or later and the same runtime to install/build/run. `auth:bootstrap-admin` requires a private interactive terminal, prompts for name/email and a hidden password twice, hashes before insertion and refuses if an administrator already exists. Passwords must not be supplied on the command line or printed. Normal startup never bootstraps users. After separately authorized normal startup, visit `/login`, complete Turnstile and sign in. Logout is in the sidebar user menu; it invalidates the session. The app restores only a safe local return path after login.

For initial-admin recovery, an authorized operator with private OS/database access can explicitly run `npm run auth:recover-admin`. It prompts for the existing admin email and a new hidden password, changes no other account's role, revokes all sessions/setup links, and audits recovery. Do not delete the authentication database to recover an account. Other users should use administrator-issued reset links.

## Activation and password reset

An administrator opens `/admin/users` and creates a pending account without knowing its permanent password. The protected confirmation displays a setup link once, with a copy action and expiry. Copy it before closing and share via a trusted private channel. Raw tokens are stored only in that transient confirmation state; the server stores a digest. There is no email provider or pretend email delivery.

The link uses `/activate#token=...` so the raw token is not sent as a page URL query/referrer. The activation page removes the fragment from browser history and posts the token only with the chosen password and CSRF protection. Atomic consumption prevents replay/races. Setup activates pending accounts; reset replaces the password and revokes sessions. New links invalidate older ones. Disabled accounts cannot complete setup/reset. An administrator can reactivate an account; one without a password remains pending. Users change their own passwords from `/profile`, with current-password verification and session revocation. Self-reset through the admin table is disabled in favor of the profile flow.

## Fuseki integration and demo-token retirement

The frontend demo password field and `x-demo-write-token` header are removed. The backend no longer recognizes that header as authorization; supplying an old token without a session grants no access. A mutation must pass session authentication, ADMIN/AGENT permission, CSRF/Origin validation, the independent write switch, configured backend-only update credentials and all existing claims provenance/revision/reference rules. VIEWER can never mutate. `S2026_014` and other original resources remain protected by unchanged business logic.

Phase 4.5 **does not enable writes**. Optional future authenticated Fuseki templates remain in `config/fuseki/` and the Phase 2 guide; do not activate them as part of authentication setup. Future deployment must configure and verify updates separately. The legacy Phase 2 demo-token instructions are superseded by this document.

## File manifest

- `backend/migrations/001_auth.sql`; `backend/src/auth/{config,database,types,validation,password,service,middleware,turnstile,routes,cli}.ts`.
- Backend integration: `src/app.ts`, `src/server.ts`, `src/config/env.ts`, `src/middleware/claims-auth.ts`, `src/middleware/error-handler.ts`; `backend/.env.example`, package manifests/lockfile, root scripts/Node minimum and `.gitignore`. Existing ignored `backend/.env` was changed only to set the RDF write flag false.
- Frontend: `src/features/auth/{AuthProvider,RequireAuth,Turnstile}.tsx`, `src/pages/{AuthPages,ProfilePage,UsersPage}.tsx`, `src/components/UserMenu.tsx`, `src/types/auth.ts`, `src/services/auth.ts`; integration in `App.tsx`, `layouts/AppLayout.tsx`, `pages/ClaimsPage.tsx`, `services/{api,claims}.ts`, `styles.css`.
- Tests: `backend/test/auth.test.ts`, updated legacy-authorization regression in `claims.test.ts`, isolated-database/session expectations in the deferred `system.test.ts`; `frontend/test/auth.test.ts`, `auth-fixture.ts`, updated shell/chatbot source expectations.
- The carried-over RDF presentation work is recorded in `UI_UX_REFINEMENT.md`: readable values/cards/table, exact-value disclosures and isolated formatting tests. It changes no backend NLP/SPARQL contract.
- README, architecture and this document describe the new boundaries.

## Verification and limitations

Final offline results: root `npm run typecheck` passes both workspaces; root production builds pass; **114 isolated tests pass, 0 fail (75 backend + 39 frontend)**. The frontend's initial JS chunk still triggers Vite's size warning at approximately 572 kB minified / 189 kB gzip; routes and chatbot content remain lazy. No warning limit was raised. Hash comparison confirms 19 original ontology/Fuseki/NLP/SPARQL source/configuration files remain unchanged. Original OWL SHA-256: `1DA702515E9D96177C49C2A9721203275B6E41C553B23EBFEF3F2AAD3D9BE9A0`.

Permitted verification covers TypeScript, production builds and isolated tests only. Auth tests use disposable SQLite files, fake hashing for most business scenarios, one real Argon2id regression, direct middleware/route calls and mocked Turnstile responses. They do not open HTTP listeners. Frontend tests use SSR, pure logic and injected fetch responses; they do not establish browser interaction correctness. The full listener-based `npm test` remains excluded.

Known limits: Node 22 SQLite is experimental; this is a single-host application, not a multi-region session service. SQLite calls block briefly and Argon2 resources need capacity planning. Rate limits use bounded windows and are shared by observed connection IP (15 login attempts/IP/15 minutes plus 10/email); behind a proxy, users can share that IP limit because forwarded headers are deliberately untrusted. Password changes allow five attempts/15 minutes, activation ten/IP/15 minutes, and administrative operations have separate limits. No permanent account lockout exists. There is no MFA, email delivery, automated public password recovery or breached-password service. Audit retention/rotation and protected backups require operator policy. Session/token tables need periodic operational cleanup as usage grows. Authentication code is implemented and offline-tested, not an independent security audit or proof of production readiness.

## Deferred manual verification

Only after authorization for live testing:

1. Apply migrations to a backed-up local auth database; bootstrap exactly one administrator through a private terminal and restart normally with correct configuration.
2. Verify Turnstile success/failure/expiry/retry with official test keys, then real keys and hostname/action checks over HTTPS. Verify blocked/misconfigured provider failures remain closed.
3. Confirm no protected-content flash, safe route restoration, session cookie flags, expiry, logout, CSRF/origin rejection and no permissive CORS.
4. Exercise ADMIN user search/filters/pagination, pending setup links, duplicate email, role/status changes, last-admin protections and audit events.
5. Share an expiring activation link privately; verify fragment removal, password confirmation, single use, reset link replacement and session revocation.
6. Exercise AGENT/VIEWER restrictions directly at API routes and through UI; old demo tokens must not bypass sessions. Keep real RDF writes disabled.
7. Check 375/768/1024/1440px layouts, keyboard/focus, password visibility, reduced motion, user-menu/logout, Turnstile sizing and chatbot RDF overflow/copy.
8. Confirm original ontology hash, read-only Fuseki queries, protected original claims and safe database backup/restore. Any RDF-write verification requires separate scope/approval.

Phase 5 has not been started.
