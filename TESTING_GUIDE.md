# 🏘️ Society App — Complete Testing Guide

---

## 📋 Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Project Setup](#2-project-setup)
3. [Environment Configuration](#3-environment-configuration)
4. [Running the Seed Script](#4-running-the-seed-script)
5. [Test Credentials & Roles](#5-test-credentials--roles)
6. [Starting the App](#6-starting-the-app)
7. [Feature-by-Feature Testing Guide](#7-feature-by-feature-testing-guide)
8. [API Reference (Postman / curl)](#8-api-reference-postman--curl)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Prerequisites

Make sure the following are installed on your machine:

| Tool | Version | Check Command |
|---|---|---|
| Node.js | ≥ 18.x | `node -v` |
| npm | ≥ 9.x | `npm -v` |
| MongoDB | Local or Atlas | `mongod --version` |

> **MongoDB options:**
> - **Local:** Install from https://www.mongodb.com/try/download/community and start with `mongod`
> - **Atlas (cloud):** Create a free cluster at https://cloud.mongodb.com and use the connection string

---

## 2. Project Setup

### Backend
```bash
# Navigate to backend folder
cd society-backend

# Install dependencies
npm install
```

### Frontend
```bash
# Navigate to frontend folder
cd society-frontend

# Install dependencies
npm install
```

### Seed Script
```bash
# Copy seed.js into the backend folder (same level as package.json)
cp seed.js society-backend/seed.js
```

---

## 3. Environment Configuration

### Backend — create `.env` file inside `society-backend/`

```env
# ── Server ──────────────────────────────────────────
NODE_ENV=development
PORT=5000

# ── MongoDB ─────────────────────────────────────────
# Option A: Local MongoDB
MONGODB_URI=mongodb://127.0.0.1:27017/society_db

# Option B: MongoDB Atlas (replace with your connection string)
# MONGODB_URI=mongodb+srv://<user>:<pass>@cluster0.xxxxx.mongodb.net/society_db

# ── JWT Secrets (use any long random strings) ───────
JWT_ACCESS_SECRET=your_super_secret_access_key_minimum_32_chars_here
JWT_REFRESH_SECRET=your_super_secret_refresh_key_minimum_32_chars_here

# ── Token Expiry ─────────────────────────────────────
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# ── CORS (frontend URL) ──────────────────────────────
ALLOWED_ORIGINS=http://localhost:5173

# ── Security ─────────────────────────────────────────
BCRYPT_SALT_ROUNDS=10
ESCALATION_THRESHOLD_HOURS=72
```

> ⚠️ `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` must each be **at least 32 characters** or the backend will refuse to start.

---

## 4. Running the Seed Script

The seed script **wipes all existing data** and inserts fresh test data. Run it **once** before testing.

```bash
# From inside the society-backend folder
cd society-backend
node seed.js
```

### Expected output
```
╔══════════════════════════════════════════╗
║   Society App — Database Seeder          ║
╚══════════════════════════════════════════╝

▶ Connecting to MongoDB
  ✔  Connected → mongodb://127.0.0.1:27017/society_db

▶ Clearing existing collections
  ✔  All collections cleared

▶ Creating Users
  ✔  Admin created → admin@sunriseresidency.com

▶ Creating Society
  ✔  Society created → "Sunrise Residency"  JoinCode: A3F0B2C1

▶ Creating Users
  ✔  resident  created → rahul.mehta@resident.com
  ✔  resident  created → priya.patel@resident.com
  ✔  resident  created → kiran.joshi@resident.com
  ✔  vendor    created → vendor@quickfix.com

▶ Seeding Issues     ✔  5 issues created
▶ Seeding Notices    ✔  4 notices created
▶ Seeding Polls      ✔  3 polls created
▶ Seeding Help Posts ✔  3 help posts created
▶ Seeding Contacts   ✔  8 contacts created

╔══════════════════════════════════════════════════════════════════════╗
║                    ✅  SEED COMPLETE                                  ║
╚══════════════════════════════════════════════════════════════════════╝
```

> 💡 You can safely **re-run** the seed at any time to reset data to a clean state.

---

## 5. Test Credentials & Roles

### Society Info
| Field | Value |
|---|---|
| Society Name | Sunrise Residency |
| City | Ahmedabad, Gujarat |
| Join Mode | approval (admin approves new members) |
| Join Code | *(printed in seed output — e.g. `A3F0B2C1`)* |

### User Accounts

| Role | Email | Password | Flat | Notes |
|---|---|---|---|---|
| **admin** | `admin@sunriseresidency.com` | `Admin@1234` | A-101 | Society chairman. Can post notices, create polls, manage contacts, approve members, update issue status |
| **resident** | `rahul.mehta@resident.com` | `Resident@1234` | B-202 | Full member, approved |
| **resident** | `priya.patel@resident.com` | `Resident@5678` | C-303 | Full member, approved |
| **resident** | `kiran.joshi@resident.com` | `Resident@9012` | D-404 | Full member, approved |
| **vendor** | `vendor@quickfix.com` | `Vendor@1234` | — | Not part of any society. Login only, no community features |

### Role Permissions Summary

| Feature | Admin | Resident | Vendor |
|---|---|---|---|
| Login / Profile | ✅ | ✅ | ✅ |
| View Issues | ✅ | ✅ | ❌ |
| Create Issues | ✅ | ✅ | ❌ |
| Update Issue Status | ✅ | ❌ (own only) | ❌ |
| Comment on Issues | ✅ | ✅ | ❌ |
| View Notices | ✅ | ✅ | ❌ |
| **Post Notices** | ✅ | ❌ | ❌ |
| View Polls | ✅ | ✅ | ❌ |
| **Create Polls** | ✅ | ❌ | ❌ |
| Vote on Polls | ✅ | ✅ | ❌ |
| View Help Posts | ✅ | ✅ | ❌ |
| Create Help Posts | ✅ | ✅ | ❌ |
| Reply to Help Posts | ✅ | ✅ | ❌ |
| View Contacts | ✅ | ✅ | ❌ |
| **Add Contacts** | ✅ | ❌ | ❌ |

---

## 6. Starting the App

### Terminal 1 — Start Backend
```bash
cd society-backend
npm run dev
```
Backend runs at → **http://localhost:5000**

You should see:
```
[server] MongoDB connected successfully
[server] Server running on port 5000
```

### Terminal 2 — Start Frontend
```bash
cd society-frontend
npm run dev
```
Frontend runs at → **http://localhost:5173**

> The Vite dev server proxies all `/api` calls to `http://localhost:5000` automatically — no extra CORS config needed.

---

## 7. Feature-by-Feature Testing Guide

Open **http://localhost:5173** in your browser.

---

### 🔐 Feature 1: Authentication

#### Test: Login as Admin
1. Go to the login page
2. Enter: `admin@sunriseresidency.com` / `Admin@1234`
3. Click **Login**
4. ✅ Expected: Redirected to home/dashboard, name shown as "Admin Sharma"

#### Test: Login as Resident
1. Logout (if logged in)
2. Enter: `rahul.mehta@resident.com` / `Resident@1234`
3. ✅ Expected: Logged in as Rahul Mehta, resident of B-202

#### Test: Register a New Resident (with join code)
1. Go to the Register page
2. Fill in details for a new user
3. In the **Society Join Code** field, enter the code printed by the seed script (e.g. `A3F0B2C1`)
4. ✅ Expected: Registration succeeds. User sees "Pending Approval" state until admin approves

#### Test: Register without a Join Code
1. Register a new user without a join code
2. ✅ Expected: User is created but has no society assigned

#### Test: Wrong password lockout
1. Try logging in with a correct email but wrong password **5 times in a row**
2. ✅ Expected: Account is locked for 15 minutes with an appropriate error message

---

### 📢 Feature 2: Issues (Complaints)

#### Test: View all issues (Resident)
1. Login as `rahul.mehta@resident.com`
2. Navigate to **Issues** section
3. ✅ Expected: See 5 pre-seeded issues with different statuses (Open, In Progress, Resolved)

#### Test: Create a new issue (Resident)
1. Click **New Issue** or the "+" button
2. Fill in:
   - Title: `Broken bench in garden area`
   - Category: `Other`
   - Priority: `Low`
   - Description: `The wooden bench near the garden entrance is broken`
3. ✅ Expected: Issue created and appears in the list with status "Open"

#### Test: Create anonymous issue (Resident)
1. Create a new issue and toggle the **Anonymous** option on
2. ✅ Expected: Issue is created; other residents see it as anonymous

#### Test: Add a comment (Resident)
1. Click on any open issue
2. Type a comment in the comment box and submit
3. ✅ Expected: Comment appears under the issue

#### Test: Update issue status (Admin only)
1. Login as `admin@sunriseresidency.com`
2. Open any "Open" issue
3. Change status to **In Progress**, and optionally assign it to yourself
4. ✅ Expected: Status updates. Try the same as a resident — should be blocked or limited

#### Test: Resolve an issue (Admin)
1. Open an "In Progress" issue
2. Change status to **Resolved**
3. ✅ Expected: Issue shows as Resolved with a timestamp. Admin reply badge visible on comments

---

### 📋 Feature 3: Notices (Board)

#### Test: View notices (Any logged-in member)
1. Login as any resident
2. Navigate to **Notices**
3. ✅ Expected: See 4 pre-seeded notices with tags: Event, Urgent, Finance, Reminder

#### Test: Post a notice (Admin only)
1. Login as admin
2. Navigate to Notices → click **New Notice**
3. Fill in title, body, select tag (e.g. `Urgent`)
4. ✅ Expected: Notice posted and visible to all members

#### Test: Resident cannot post notice
1. Login as any resident
2. Navigate to Notices
3. ✅ Expected: No "New Notice" button visible, or API returns 403 Forbidden if attempted directly

---

### 🗳️ Feature 4: Polls

#### Test: View polls (Resident)
1. Login as a resident
2. Navigate to **Polls**
3. ✅ Expected: See 3 polls — one open with votes, one closed, one fresh

#### Test: Vote on a poll
1. Find the open poll: *"What time should the community gym be open?"* (0 votes)
2. Click your preferred option
3. ✅ Expected: Vote recorded, count updates

#### Test: Cannot vote twice
1. Try voting again on the same poll
2. ✅ Expected: Error — "You have already voted"

#### Test: View closed poll
1. Find the poll marked as **Closed**
2. ✅ Expected: Results are visible but voting is disabled

#### Test: Create a poll (Admin only)
1. Login as admin
2. Navigate to Polls → **New Poll**
3. Add a question and 3–4 options, set a closing date
4. ✅ Expected: Poll created and visible to residents

#### Test: Resident cannot create poll
1. Login as resident
2. ✅ Expected: No "New Poll" button, or 403 if attempted via API

---

### 🙏 Feature 5: Help Board (Neighbour Requests)

#### Test: View help posts
1. Login as any resident
2. Navigate to **Help**
3. ✅ Expected: See 3 posts (Plumber, Maid, Food)

#### Test: Create a help post (Resident)
1. Click **New Help Post**
2. Fill in:
   - Title: `Need a carpenter for wardrobe repair`
   - Category: `Carpenter`
   - Description: `Looking for a reliable carpenter to fix a broken wardrobe door`
3. ✅ Expected: Post created and listed

#### Test: Reply to a help post
1. Open any help post
2. Add a reply
3. ✅ Expected: Reply appears under the post

#### Test: Vendor contact reply
1. Login as admin
2. Reply to a help post and check the "Vendor Contact" option, add a phone number
3. ✅ Expected: Reply shows as a highlighted vendor recommendation with phone number

---

### 📞 Feature 6: Contacts

#### Test: View contacts (Resident)
1. Login as any resident
2. Navigate to **Contacts**
3. ✅ Expected: See 8 contacts grouped by Emergency, Committee, Vendor, Other

#### Test: Add a contact (Admin only)
1. Login as admin
2. Navigate to Contacts → **Add Contact**
3. Fill in name, phone, group
4. ✅ Expected: Contact added and visible to all members

#### Test: Resident cannot add contact
1. Login as resident
2. ✅ Expected: No "Add Contact" button visible, or 403 if attempted via API

---

### 👤 Feature 7: User Profile

#### Test: View profile
1. Login as any user
2. Navigate to **Profile** or **My Account**
3. ✅ Expected: Shows name, email, flat, role, society name

#### Test: Update profile
1. Change the name or phone number
2. ✅ Expected: Profile updates successfully

---

## 8. API Reference (Postman / curl)

Base URL: `http://localhost:5000/api`

### Auth

| Method | Endpoint | Body | Notes |
|---|---|---|---|
| POST | `/auth/register` | `{name, email, password, phone, societyJoinCode?, flat?}` | Register |
| POST | `/auth/login` | `{email, password}` | Login → returns accessToken |
| POST | `/auth/refresh-token` | `{refreshToken}` | Rotate tokens |
| POST | `/auth/logout` | — | Requires Bearer token |
| GET | `/auth/me` | — | Get current user |

### Issues

| Method | Endpoint | Auth | Notes |
|---|---|---|---|
| GET | `/issues` | ✅ | List all issues for society |
| POST | `/issues` | ✅ | Create issue |
| GET | `/issues/:id` | ✅ | Get single issue |
| PATCH | `/issues/:id` | ✅ | Update issue (admin: status/assign; resident: own fields) |
| POST | `/issues/:id/comments` | ✅ | Add comment |

### Notices

| Method | Endpoint | Auth | Role |
|---|---|---|---|
| GET | `/notices` | ✅ | Any member |
| POST | `/notices` | ✅ | Admin only |

### Polls

| Method | Endpoint | Auth | Role |
|---|---|---|---|
| GET | `/polls` | ✅ | Any member |
| POST | `/polls` | ✅ | Admin only |
| POST | `/polls/:id/vote` | ✅ | Any member (once per poll) |

### Help

| Method | Endpoint | Auth | Notes |
|---|---|---|---|
| GET | `/help` | ✅ | List help posts |
| POST | `/help` | ✅ | Create help post |
| POST | `/help/:id/replies` | ✅ | Reply to post |

### Contacts

| Method | Endpoint | Auth | Role |
|---|---|---|---|
| GET | `/contacts` | ✅ | Any member |
| POST | `/contacts` | ✅ | Admin only |

### Example curl — Login

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@sunriseresidency.com","password":"Admin@1234"}'
```

### Example curl — Create Issue (replace TOKEN)

```bash
curl -X POST http://localhost:5000/api/issues \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "title": "Broken bench in garden",
    "category": "Other",
    "priority": "Low",
    "description": "The bench near gate is broken"
  }'
```

---

## 9. Troubleshooting

### ❌ `Environment validation error: "MONGODB_URI" is required`
→ Make sure `.env` file exists inside `society-backend/` with `MONGODB_URI` set.

### ❌ `JWT_ACCESS_SECRET must be at least 32 characters`
→ Use a longer secret in your `.env` file.

### ❌ `MongoServerError: E11000 duplicate key error`
→ Run `node seed.js` again — it wipes and re-seeds cleanly.

### ❌ `CORS: origin http://localhost:5173 is not allowed`
→ Add `ALLOWED_ORIGINS=http://localhost:5173` to your `.env` file.

### ❌ Frontend API calls failing (Network Error)
→ Make sure backend is running on port 5000. Check `vite.config.js` — the proxy target should be `http://localhost:5000`.

### ❌ Vendor user gets 403 on community features
→ This is **expected behaviour**. Vendor users have no society assigned and cannot access society-scoped endpoints.

### ❌ New registered user can't see issues/notices
→ The user's `isApproved` might be false. Login as admin and approve the member, or use **open** join mode by changing `joinMode: "open"` in the seed script.

### Re-seed to reset all data
```bash
cd society-backend
node seed.js
```
This is safe to run any number of times — it clears everything and starts fresh.
