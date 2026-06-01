# Team Task Tracker API

Backend for a team task tracker — JWT auth with refresh-token rotation, role-based access control, Redis-cached task listings, PostgreSQL via Prisma. Node 20 LTS, Express 4, Docker.

## Running it

```bash
cp .env.example .env
docker compose up --build
```

That's it. Postgres, Redis, and the API come up together; migrations run on container start. The API is at `http://localhost:3000`, Swagger UI at `/api-docs`. Liveness probe at `/health`, readiness probe (DB + Redis) at `/ready`.

A seed script is included:

```bash
docker compose exec api node prisma/seed.js
# logs in as admin@acme.test / Password123! (also manager@... and member@...)
```

Tests run without Docker (the repository layer is mocked):

```bash
npm install
npm test
```

## Project layout

```
src/
  app.js, server.js
  config/        env, prisma, redis singletons
  middleware/    authenticate, authorize, validate, requestLogger, errorHandler
  modules/       auth/  users/  projects/  tasks/  analytics/   (routes + controller + service)
  repositories/  Prisma data access (no business rules)
  services/      cacheService (the one cross-module service)
  routes/        mounts every module under /api
  validations/   Zod schemas
  utils/         AppError, asyncHandler, jwt, statusTransitions, parseDuration, logger
  docs/          Swagger spec
  tests/         Jest suites
prisma/
  schema.prisma, migrations/, seed.js
```

Each request goes `router → validate → authenticate → authorize → controller → service → repository → Prisma`. Controllers do not contain business logic or permission checks; they just hand `req` to the service and return whatever comes back.

## Domain model

```
Organization ─┬─< User ─< RefreshToken
              └─< Project ─< Task >─ User (assignee)
```

| Model         | Notable fields                                                                                |
| ------------- | --------------------------------------------------------------------------------------------- |
| Organization  | id, name, createdAt                                                                           |
| User          | organizationId, name, email (unique), passwordHash, role (ADMIN/MANAGER/MEMBER)               |
| RefreshToken  | userId, tokenHash (SHA-256, unique), expiresAt, revokedAt, replacedById                       |
| Project       | organizationId, name, description                                                             |
| Task          | projectId, title, description, priority, status, assigneeId, dueDate, completedAt, timestamps |

Enums: `Role`, `Priority (LOW|MEDIUM|HIGH)`, `TaskStatus (TODO|IN_PROGRESS|IN_REVIEW|DONE|BLOCKED)`.

### Design notes

**Tasks belong to a Project, which belongs to an Organization** — org scoping is transitive (`Task → Project → Organization`). Every task query filters via `where: { project: { organizationId } }`, which makes cross-org reads impossible at the data layer. The cost is an extra join in every task list; the composite indexes `(projectId, status)` and `(assigneeId, status)` cover the dominant list shapes so this stays cheap. I considered denormalising `organizationId` onto `Task` for speed, but the duplication risk (a Task whose org doesn't match its Project's org) felt worse than the join cost.

**Tasks set `assigneeId` to NULL when their assignee is deleted** (`onDelete: SetNull`). Project deletion cascades to tasks — a task without a project has no meaning, but a task without an assignee just becomes unassigned.

### Indexes

| Index                                                           | Used by                                                  |
| --------------------------------------------------------------- | -------------------------------------------------------- |
| `Task(status)`, `(priority)`, `(dueDate)`, `(assigneeId)`, `(projectId)` | Single-field filters and sort-by-due-date              |
| `Task(projectId, status)`                                       | Project board view                                       |
| `Task(assigneeId, status)`                                      | "My open tasks"                                          |
| `User(organizationId)`, `Project(organizationId)`               | Every authenticated query                                |
| `User(email)` unique                                            | Login                                                    |
| `RefreshToken(tokenHash)` unique, `(userId)`, `(expiresAt)`     | Refresh lookup, revoke-all, expiry sweeps                |

## Authentication

Two tokens. Access token is a short-lived JWT (15m) sent on every API call. Refresh token (7d) is only replayed to `/api/auth/refresh` and `/logout`. The DB stores the **SHA-256 hash** of every refresh token — never the raw token.

**Rotation.** `/refresh` mints a fresh pair, marks the old refresh row revoked with `replacedById` pointing at the new row. Replay detection: if a token presented to `/refresh` is already revoked, the chain is treated as compromised and *every* active refresh token for that user is revoked.

**Registration is restricted to creating a new org.** The registering user becomes its ADMIN. To add a MANAGER or MEMBER to an existing org, an ADMIN of that org calls `POST /api/users` (which writes the row scoped to the caller's `organizationId`). Without this restriction, anyone who learned an org UUID could register themselves into it with `role: "ADMIN"`.

Passwords use `bcryptjs` at 10 rounds. I went with the pure-JS implementation over native `bcrypt` to keep the Alpine container build clean (no `python3 / make / g++` toolchain needed) — slightly slower than the native binding, fine for a take-home where boot reliability matters.

## RBAC

Three roles. The matrix:

| Role    | Users    | Projects                 | Tasks                                    | Analytics |
| ------- | -------- | ------------------------ | ---------------------------------------- | --------- |
| ADMIN   | full     | full                     | full                                     | yes       |
| MANAGER | list     | full                     | full                                     | yes       |
| MEMBER  | —        | list / read              | list (own only) / read (own) / status (own) | —      |

RBAC is enforced by `authorize(...roles)` middleware on the route. Controllers and services never branch on `role` for endpoint-level decisions. Two services *do* look at `req.user.role`, both for legitimately row-level rules that middleware can't express:

- The `/api/tasks` listing silently rewrites a MEMBER's `assignee` filter to their own user id (so MEMBERs can't enumerate other users' tasks via query string).
- `PATCH /api/tasks/:id/status` allows the assignee OR a MANAGER/ADMIN. Whether you're "the assignee" depends on the row, not the route.

## Status state machine

```
TODO ──► IN_PROGRESS ──► IN_REVIEW ──► DONE        (DONE is terminal)
  └──────────┴──────────────┴───────► BLOCKED ──► TODO
```

The server is the source of truth. `validateTransition(from, to)` lives in `utils/statusTransitions.js` and is called from `taskService.updateStatus`. Invalid transitions return 400 with `code: VALIDATION_ERROR`. The service also stamps `completedAt` when transitioning into DONE.

## Caching

Only the hot read endpoint is cached: `GET /api/tasks`. Read-through, TTL 300s.

**Key:** `tasks:{organizationId}:{assigneeId|"all"}:{sha1(filters)}`. The hash is over the normalised JSON of the filter+pagination object, so different filter combos are different cache entries.

The bucket partitioning is the interesting bit. MEMBERs always read from their own bucket. ADMIN/MANAGER without an assignee filter land in the `all` bucket; with an assignee filter, they reuse that assignee's bucket. The payoff: when a MEMBER's task changes status and we invalidate their bucket, manager-side queries filtered by that same MEMBER are invalidated automatically.

**Invalidation.** Each `SET` also `SADD`s its key into a per-bucket index set (`idx:tasks:{org}:{assignee}`). To invalidate a bucket we `SMEMBERS` the index, `DEL` everything in one call, then `DEL` the index. This avoids `SCAN tasks:*`, which would block at scale.

Invalidation is triggered after task create, update, delete, reassign (both old and new buckets), and status change. The org-wide `all` bucket is invalidated on every mutation.

If Redis is unavailable, `cacheService` returns null for reads and silently skips writes — the API stays up, performance degrades.

## Listing endpoint

```
GET /api/tasks?status=TODO&priority=HIGH&assignee=<uuid>&projectId=<uuid>&page=1&limit=20&sortBy=dueDate&sortOrder=asc
```

Sortable fields: `createdAt`, `updatedAt`, `dueDate`, `priority`, `status`.

```json
{
  "data": [/* Task[] */],
  "pagination": { "page": 1, "limit": 20, "total": 120, "pages": 6 }
}
```

## Error format

Every non-2xx response uses the same envelope.

```json
{ "status": 400, "code": "VALIDATION_ERROR", "message": "dueDate must be a future date" }
```

Codes: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `SERVER_ERROR`. Zod errors come back with a `details` field listing field-level messages. Prisma `P2002` is mapped to `CONFLICT`, `P2025` to `NOT_FOUND`. Stack traces are logged, never sent to clients.

## Logging

Winston, JSON output to `logs/error.log` and `logs/combined.log`, plus a coloured console transport in development. What gets logged:

- **Requests** — method, path, status, duration, userId. Error level on 5xx, warn on 4xx, info on 2xx/3xx.
- **Auth** — `auth.register`, `auth.login`, `auth.login_failed`, `auth.refresh`, `auth.refresh_replay`, `auth.logout`.
- **Cache** — `cache.hit`, `cache.miss`, `cache.invalidated`. All at `info` so they show up at the default log level.
- **Errors** — full stack on 5xx.

## Endpoints

| Method | Path                          | Allowed roles               | Notes                                              |
| ------ | ----------------------------- | --------------------------- | -------------------------------------------------- |
| POST   | `/api/auth/register`          | public                      | Creates a new org; registering user becomes ADMIN. |
| POST   | `/api/auth/login`             | public                      |                                                    |
| POST   | `/api/auth/refresh`           | public                      | Rotates the refresh token.                         |
| POST   | `/api/auth/logout`            | public                      | Revokes a refresh token. Idempotent.               |
| GET    | `/api/users`                  | ADMIN, MANAGER              |                                                    |
| POST   | `/api/users`                  | ADMIN                       | Add a user to the caller's org.                    |
| PATCH  | `/api/users/:id/role`         | ADMIN                       |                                                    |
| DELETE | `/api/users/:id`              | ADMIN                       |                                                    |
| GET    | `/api/projects`               | any role                    |                                                    |
| POST   | `/api/projects`               | ADMIN, MANAGER              |                                                    |
| GET    | `/api/projects/:id`           | any role                    |                                                    |
| PATCH  | `/api/projects/:id`           | ADMIN, MANAGER              |                                                    |
| DELETE | `/api/projects/:id`           | ADMIN, MANAGER              |                                                    |
| GET    | `/api/tasks`                  | any role                    | MEMBERs see only their own. Redis-cached.          |
| POST   | `/api/tasks`                  | ADMIN, MANAGER              |                                                    |
| GET    | `/api/tasks/:id`              | any role (MEMBER: own only) |                                                    |
| PATCH  | `/api/tasks/:id`              | ADMIN, MANAGER              |                                                    |
| DELETE | `/api/tasks/:id`              | ADMIN, MANAGER              |                                                    |
| PATCH  | `/api/tasks/:id/status`       | assignee or MANAGER / ADMIN | Server-validated transition.                       |
| GET    | `/api/analytics/tasks`        | ADMIN, MANAGER              |                                                    |

Full spec at `/api-docs` (Swagger UI) or `/api-docs.json` (raw OpenAPI).

## Tests

54 tests, 5 suites, runs in ~4s. The repository layer is mocked so unit tests stay fast and dependency-free; the service layer (token signing, rotation, transition validation, RBAC enforcement) runs for real through Supertest.

| Suite                       | What it covers                                                             |
| --------------------------- | -------------------------------------------------------------------------- |
| `statusTransitions.test.js` | Every legal and illegal transition (17 cases).                             |
| `rbac.test.js`              | `authorize()` middleware: missing user, wrong role, allowed role.          |
| `auth.test.js`              | Register, weak-password rejection, login, refresh rotation, replay detection, privilege-escalation guard. |
| `projects.test.js`          | Full CRUD with RBAC and cross-org tenant isolation.                        |
| `tasks.test.js`             | Listing filters, pagination, sort, MEMBER scoping, status-update permissions, status transition enforcement, RBAC on create. |

The natural next step is to add a parallel integration suite using testcontainers (real Postgres + Redis) — same scenarios, but with the data layer engaged. Out of scope for the take-home.

## Docker

Three services with healthchecks:

- `postgres:16-alpine`, persisted to the named volume `postgres_data`.
- `redis:7-alpine`.
- `api`, built from the `Dockerfile`. Depends on both; runs `prisma migrate deploy` before booting.

```bash
docker compose up --build      # full stack
docker compose logs -f api     # tail
docker compose exec api npm test
docker compose exec api node prisma/seed.js
docker compose down -v         # wipe DB
```

## Environment variables

| Var                       | Default                                            |
| ------------------------- | -------------------------------------------------- |
| `NODE_ENV`                | `development`                                      |
| `PORT`                    | `3000`                                             |
| `DATABASE_URL`            | `postgresql://postgres:postgres@postgres:5432/...` |
| `REDIS_URL`               | `redis://redis:6379`                               |
| `JWT_ACCESS_SECRET`       | set to a random string                             |
| `JWT_REFRESH_SECRET`      | set to a random string                             |
| `JWT_ACCESS_EXPIRES_IN`   | `15m`                                              |
| `JWT_REFRESH_EXPIRES_IN`  | `7d`                                               |
| `TASK_CACHE_TTL_SECONDS`  | `300`                                              |
| `LOG_LEVEL`               | `info`                                             |
| `CORS_ORIGIN`             | unset → `*`; otherwise a comma-separated allowlist |

## Trade-offs

- **MEMBERs can't create tasks.** The spec says they "view and update only tasks assigned to them," so I read create/delete as not theirs. A different reading is fine; it's a one-line change.
- **Refresh tokens aren't bound to a device.** A stolen refresh works from anywhere until rotated. Replay detection helps; the obvious next step is per-device refresh rows with UA + IP.
- **Offset pagination, not cursor.** Fine at this scale and matches the response shape the spec asked for. For very large boards (>100k tasks) keyset pagination is the upgrade.
- **Each filter combination is a distinct cache entry.** With heavy write rates the index-set approach still does the right thing, but I'd cache fewer broader buckets and filter in-process before scaling further.
- **Tests mock the repository.** Keeps `npm test` < 5s with zero setup. Testcontainers-based integration tests are the natural extension.

## What I'd add with more time

- WebSocket/SSE notifications when an assigned task changes status (the bonus I skipped).
- Audit log table — who changed what, with a diff.
- Soft delete on Tasks and Projects so analytics can keep historical data after deletion.
- A tighter rate limit specifically on `/api/auth/login` (with lockout after N failures), separate from the global limit.
- Per-device refresh tokens with metadata (user-agent, IP, last seen).
- A React board so you can drag cards between status columns instead of poking PATCHes.

## Postman

`postman_collection.json` is in the repo root. Set the `baseUrl` variable and run the requests top-to-bottom — they auto-capture the access/refresh tokens and the created project/task IDs into collection variables.
#   n x t w a v e _ a s s i g n m e n t  
 