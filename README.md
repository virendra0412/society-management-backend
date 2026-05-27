# Society Management App — Backend

Production-grade Node.js + MongoDB REST API for the Society Management App.

---

## Tech Stack

| Concern | Library |
|---|---|
| Framework | Express 4 |
| Database | MongoDB via Mongoose 8 |
| Auth | JWT (access + refresh tokens) |
| Validation | Joi |
| Security | Helmet, cors, express-mongo-sanitize, xss-clean |
| Rate Limiting | express-rate-limit |
| Logging | Winston + Morgan |
| Scheduled Jobs | node-cron |
| Password Hashing | bcryptjs (12 salt rounds) |

---

## Quick Start

```bash
# 1. Clone & install
git clone <repo>
cd society-backend
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your values (MongoDB URI, JWT secrets, etc.)

# 3. Generate strong JWT secrets
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# 4. Start
npm run dev       # development (nodemon)
npm start         # production
```

---

## Folder Structure

```
src/
├── config/         # DB connection, env validation
├── controllers/    # Thin — parse req, call service, send response
├── services/       # Business logic, authorization checks
├── repositories/   # All MongoDB queries (data access layer)
├── models/         # Mongoose schemas + instance methods
├── validators/     # Joi schemas per resource
├── middlewares/    # auth, role, validate, rateLimiter, error
├── routes/         # Route definitions — wire validators → controllers
├── utils/          # AppError, logger, response helpers, token, pagination
└── jobs/           # Cron jobs (escalation)
```

---

## Architecture Decisions

### Layered Architecture
```
Request → Route → Middleware → Controller → Service → Repository → MongoDB
```
- **Controller**: Only handles HTTP — reads req, calls service, sends response.
- **Service**: All business logic and authorization lives here.
- **Repository**: All Mongoose queries are here. No queries in services/controllers.

### Error Handling
- `AppError` class for operational errors (sent to client).
- `express-async-errors` patches all async handlers — no try/catch needed in routes.
- Global error middleware translates Mongoose errors (CastError, duplicate key, ValidationError) into `AppError`.
- Programmer errors (uncaught exceptions, unhandled rejections) trigger graceful shutdown.

### Auth Flow
1. **Register** → creates user, issues access + refresh token pair.
2. **Login** → verifies password (with brute-force lockout after 5 attempts), issues tokens.
3. **Access token** (15m TTL) — sent in `Authorization: Bearer <token>` header.
4. **Refresh token** (7d TTL) — stored client-side, SHA256 hash stored in DB. Used at `/auth/refresh-token`.
5. **Rotation** — every refresh issues a new pair. If old token is reused, ALL sessions are invalidated (reuse detection).
6. **Logout** — clears server-side token hash, invalidating all sessions.

### Security Measures
- Passwords: bcrypt with 12 salt rounds.
- JWT secrets: minimum 32 chars enforced at startup.
- Account lockout: 5 failed logins → 15-minute lock.
- MongoDB injection: `express-mongo-sanitize` strips `$` and `.` from inputs.
- Rate limiting: 100 req/15min general; 10 req/15min on auth routes.
- Helmet: sets 14 security-related HTTP headers.
- CORS: strict allowlist of origins.
- JSON body limit: 10kb to prevent large payload attacks.
- Field whitelisting in repositories (no arbitrary sort/filter injection).
- Soft deletes on notices (never hard delete user data).
- `select: false` on password, refreshTokenHash — never returned in queries.

### MongoDB Best Practices
- Compound indexes on frequently queried field combinations.
- Transactions on poll voting to prevent double-vote race conditions.
- Lean queries (`.select()`) on list endpoints — exclude heavy fields.
- Connection pool (min: 2, max: 10) with heartbeat.
- Exponential backoff retry on initial connection.
- Graceful disconnect on SIGTERM/SIGINT.

---

## API Reference

### Base URL
```
/api/v1
```

### Auth Headers
All protected routes require:
```
Authorization: Bearer <accessToken>
```

---

### Auth

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/register` | — | Register new user |
| POST | `/auth/login` | — | Login |
| POST | `/auth/refresh-token` | — | Rotate tokens |
| POST | `/auth/logout` | ✅ | Invalidate session |
| GET | `/auth/me` | ✅ | Current user |

#### POST `/auth/register`
```json
{
  "name": "Rajesh Mehta",
  "email": "rajesh@email.com",
  "phone": "9876543210",
  "password": "SecurePass1",
  "societyJoinCode": "A3F0B2C1",
  "flat": "B-204"
}
```

#### POST `/auth/login`
```json
{ "email": "rajesh@email.com", "password": "SecurePass1" }
```

---

### Users

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/users/profile` | ✅ | Get own profile |
| PATCH | `/users/profile` | ✅ | Update name/phone/flat |

---

### Issues

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| POST | `/issues` | ✅ | Any | Report issue |
| GET | `/issues` | ✅ | Any | List issues |
| GET | `/issues/:id` | ✅ | Any | Issue detail |
| PATCH | `/issues/:id` | ✅ | Admin/Owner | Update issue |
| POST | `/issues/:id/comments` | ✅ | Any | Add comment |

**Query params for `GET /issues`:**
- `status` — Open | In Progress | Resolved
- `category` — Water | Lift | Security | Garbage | Electricity | Noise | Parking | Other
- `priority` — Low | Medium | High
- `isEscalated` — true | false
- `sort` — createdAt | -createdAt | priority
- `page`, `limit`

---

### Help

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/help` | ✅ | Post help request |
| GET | `/help` | ✅ | List help posts |
| POST | `/help/:id/replies` | ✅ | Add reply |

---

### Notices

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| POST | `/notices` | ✅ | Admin | Post notice |
| GET | `/notices` | ✅ | Any | List notices |

---

### Polls

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| POST | `/polls` | ✅ | Admin | Create poll |
| GET | `/polls` | ✅ | Any | List polls |
| POST | `/polls/:id/vote` | ✅ | Any | Cast vote |

---

### Contacts

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| GET | `/contacts` | ✅ | Any | Get directory |
| POST | `/contacts` | ✅ | Admin | Add contact |

---

## Response Format

### Success
```json
{
  "success": true,
  "message": "Operation successful.",
  "data": { ... },
  "meta": { "total": 45, "page": 1, "limit": 20, "totalPages": 3 }
}
```

### Error
```json
{
  "success": false,
  "status": "fail",
  "code": "VALIDATION_ERROR",
  "message": "Validation failed",
  "errors": [
    { "field": "email", "message": "email must be a valid email" }
  ]
}
```

---

## Background Jobs

### Issue Escalation (Hourly)
- Finds all `Open` / `In Progress` issues older than `ESCALATION_THRESHOLD_HOURS` (default: 72h).
- Marks them `isEscalated: true`, sets `escalatedAt`.
- Logs grouped digest per society admin (hook in `runEscalation()` for push/email/SMS).

---

## Environment Variables

See `.env.example` for full list with descriptions.

---

## Phase 2 Additions (Suggested)

- `POST /auth/send-otp` + `POST /auth/verify-otp` — OTP-based login
- `POST /issues/:id/photos` — S3 file upload
- `GET /admin/members` — Society member management
- `PATCH /admin/members/:id/approve` — Approve pending members
- `POST /visitors` — Visitor pre-approval
- WebSocket layer for real-time issue updates
- Firebase Cloud Messaging integration in escalation job
