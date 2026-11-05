# 📚 LibraryHub — Backend API

A production-style REST API for a **Library Management System** — a book-rental
platform with role-based access (readers & admins), a full-featured
authentication system, paid rentals, and a community-moderated catalog.

This service is the API half of a two-part app. The React SPA lives in
`../library-fronend`.

> **Highlight:** the authentication system is the centerpiece — email/password
> with OTP email verification, social login (Google / Facebook),
> account linking, and TOTP two-factor auth — all hardened against the usual
> pitfalls (enumeration, timing, 2FA bypass via a second login door).

---

## 🧰 Tech Stack

| Area | Technology |
|------|-----------|
| Runtime | **Node.js** (ESM, `"type": "module"`) |
| Framework | **Express 5** |
| Database | **MongoDB** + **Mongoose 9** |
| Auth | **JWT** (`jsonwebtoken`), **bcryptjs** |
| Social login | `google-auth-library`, Facebook Graph API |
| 2FA | `otpauth` (TOTP) + `qrcode` |
| Email | **Nodemailer** |
| Media | **Cloudinary** (image/file storage) |
| Caching & rate limiting | **Redis** (`ioredis`) with in-memory fallback (`node-cache`, `rate-limiter-flexible`) |
| Scheduling | `node-cron` |
| Real-time | **Socket.IO** (+ Redis adapter when `REDIS_URL` is set) |
| Validation | **zod** (request bodies and `.env` at startup) |
| Testing | **Vitest** + `mongodb-memory-server` + `socket.io-client` |
| Tooling | **ESLint 10** (flat config) + **Prettier** |

---

## 🏛️ Architecture

A strict **layered architecture** — one file per domain at each layer. To add or
change an endpoint you touch all four layers:

```
routes/X.Routes.js  →  controller/X.Controller.js  →  services/X.Service.js  →  models/X.Model.js
 (HTTP, auth, validate)    (shape the response)         (business + DB logic)        (schema)
```

- **Routes auto-mount by filename.** `routes/indexRoutes.js` scans for
  `*.Routes.js` files and mounts each at `/<basename-lowercased>`
  (e.g. `Auth.Routes.js` → `/auth`). No central registry — adding a correctly
  named file is enough.
- **Request bodies are validated with zod** before the handler runs:
  `validate(schema)` on the route, with schemas in `validators/*.Validator.js`
  and shared field rules in `validators/fields.js`. Unknown fields are dropped
  and strings trimmed, so services only see what they expect. Invalid input
  gets `400` with every problem listed, e.g.
  `"password: must be at least 8 characters; email: must be a valid email address"`.
  Validation runs after auth and rate limiting and before `inTransaction`, so
  bad input never opens a transaction.
- **Controllers are thin**: call the service and shape the
  `{ success, data | message }` JSON response. They never touch Mongoose
  directly.
- **Services hold all business logic and DB access** and accept an optional
  Mongoose `session` for transactions.
- Every async controller is wrapped in `asyncHandler` so errors bubble to a
  central `errorHandler` that translates Mongoose / Multer errors into clean
  responses. Throw `new ErrorResponse(message, statusCode)` anywhere.

### Cross-cutting middleware
- **`requestLogger`** — first middleware: assigns an `X-Request-Id`, opens the
  per-request context used by `audit()`, and records every request (see
  [Activity logging](#-activity-logging)).
- **`verifyToken`** — validates the `Bearer` JWT, re-loads the user to enforce
  `isBlocked`, reads the **role from the DB** (not the token), rejects tokens
  issued before the last password change, and attaches `req.userID` /
  `req.role` / `req.userEmail`.
- **`verifyRole("admin", …)`** — role gate (runs after `verifyToken`).
- **`inTransaction`** — opens a Mongoose session and **commits before the
  response is sent** (a failed commit becomes a 500, never a false success);
  error responses abort and roll back orphaned Cloudinary uploads.
- **Rate limiting & caching** — Redis-backed when `REDIS_URL` is set, otherwise
  in-memory (the app runs with zero external infra).

---

## 🔐 Authentication — the complete flow

The API is **stateless** and issues a 30-day access-token JWT. There is a
**single signup** for everyone; an admin is simply a user whose `role` is set to
`"admin"` in the database. Role-based routing happens on the client.

### 1. Email / password registration → verification

```
POST /auth/register      { name, email, password, authType: "email" }
   → creates an unverified User + a Preferences doc
   → generates a 6-digit OTP (5-min expiry) and EMAILS it
   → the whole request rolls back if the email fails to send

POST /auth/verify-otp    { email, otp }        → marks the account verified
POST /auth/resend-otp    { email }             → re-issues a code (60s cooldown)

POST /auth/login         { email, password, authType: "email" }
   → checks password, enforces isVerified + isBlocked
   → returns a JWT  (or a 2FA challenge — see below)
```

### 2. Password reset

```
POST /auth/forgot-password  { email }   → emails a reset link to CLIENT_URL/reset-password/<token>
POST /auth/reset-password   { token, password }
```
`forgot-password` is **enumeration-resistant** (identical response whether or not
the email exists) and **timing-resistant** (the email is sent fire-and-forget so
the real-account path isn't measurably slower).

### 3. Social login (Google / Facebook)

One unified endpoint. The frontend obtains a provider token (Google
`id_token`, Facebook access token) and posts it here:

```
POST /auth/social   { provider: "google" | "facebook", token, name?, link? }
```

`utils/socialVerify.js` verifies the token **server-side** — Google via
JWT signature against the providers' public keys, Facebook via the Graph API
(`debug_token` confirms the token was minted for *this* app). It returns a
normalized identity, then `Auth.Service.socialLogin`:

1. **Finds the user by provider id** (`googleId` / `facebookId`) → log in.
2. **Else, if a same-email account exists** → an **ask-to-link handshake**:
   returns `{ linkRequired, email }`; the client confirms and re-sends with
   `link: true` to attach the provider (gated on `emailVerified`).
3. **Else, creates a new verified user** + Preferences, uploading the provider
   avatar to Cloudinary so it never expires.

> **Account linking:** an email account that links Google keeps
> `authType: "email"` and *gains* a `googleId` — so it can sign in **both** ways,
> always resolving to the same account.

### 4. Two-factor authentication (TOTP)

Enabled from the profile screen, available to **every** account type.

```
POST /twofactor/setup     (auth)  → stores a secret, returns a QR code to scan
POST /twofactor/enable    (auth)  { code }  → verifies the first code, turns 2FA on
POST /twofactor/disable   (auth)  { code }  → requires a valid code to turn off
POST /twofactor/verify            { pendingToken, code }  → the login challenge
```

**The key design rule:** 2FA is a property of the *account*, enforced at **every
login door**. When `twoFactor.enabled`, both `/auth/login` **and** `/auth/social`
return a short-lived (5-min) **pending token** instead of the real JWT — so a
social or linked account can't bypass 2FA by using a different sign-in method.
The `/twofactor/verify` challenge exchanges `pendingToken + code` for the access
token.

```
[ password OR social ] ── 2FA on? ──► { twoFactorRequired, pendingToken }
                                            │  user enters TOTP code
                                            ▼
                        POST /twofactor/verify ──► real access-token JWT
```

### 🛡️ Security hardening summary
- Passwords hashed with bcrypt; access-token-only JWT (no refresh token).
- **OTP & reset emails** roll the request back on send failure.
- `isVerified` **and** `isBlocked` enforced at login.
- Forgot-password is **enumeration- and timing-resistant**.
- Social tokens are **cryptographically verified** server-side (no trust in the client).
- `/auth/login` is email-only — the old "any social `authType` skips the password" **bypass is closed**.
- 2FA enforced across **all** login paths; the TOTP **secret never leaves the server** (`sanitizeUser` + the profile query strip it, along with OTP/reset tokens).
- **Rate limiting** on auth routes — `authLimiter` (10 / 15 min: login, verify, reset), `emailLimiter` (5 / 15 min: register, forgot, resend), plus a global 200/min safety net.
- Signup **cannot set `role`** — every new account is a `user`.
- OTPs use `crypto.randomInt` and **lock after 5 wrong guesses per code** (per account, on top of the per-IP limit).
- Changing or resetting a password **signs out every existing session**.
- Admin user endpoints never return passwords, OTPs, reset tokens or 2FA secrets.
- List endpoints only filter on whitelisted fields, escape search text, and cap `limit` at 100.

---

## 🕵️ Activity logging

Everything that happens on the API is recorded in MongoDB so suspicious
behaviour can be investigated later. Two complementary logs, linked by
`requestId`:

| | `RequestLog` | `AuditLog` |
|---|---|---|
| What | Every HTTP request | Named security & business events |
| Fields | method, path, query, body (writes only), uploaded file names, status, duration, user, role, IP, user agent, error | action, outcome, severity, actor, target, metadata, IP, user agent |
| Retention | `REQUEST_LOG_RETENTION_DAYS` (default 90), TTL index | Forever; **append-only** (update/delete are blocked in the model) |

**Audited events** include: `auth.register`, `auth.login` (success + every
failure reason: `unknown_email`, `wrong_password`, `blocked`, `unverified`,
`social_account`, 2FA `wrong_code`), `auth.otp.*`, `auth.password.*`,
`auth.2fa.*`, `auth.social.linked`, `auth.token.invalid`,
`auth.blocked_user_access`, `authz.denied`, `security.rate_limited`,
`user.profile.*`, `user.password.change`, `upload.*`, `book.*`, `category.*`,
`review.create`, `admin.*`, `system.user.delete_unverified`.

Rules:
- Secrets are **always redacted** (`password`, `token`, `otp`, `code`, `secret`,
  `authorization`, …) and payloads are size-capped (`utils/redact.js`).
- Logging is **fire-and-forget**: it never fails or slows a request. Audit
  writes run *outside* the request transaction, so failed attempts are kept even
  though their transaction rolls back. If Mongo is down, entries fall back to
  `config/logs/audit-fallback.log` / `request-fallback.log`.
- Call `audit("domain.action", { outcome, target, metadata })` from any service;
  actor, IP, user agent and request id are filled in from the request context.

Admin endpoints (read-only — there is no API to edit or delete logs):

```
GET /admin/audit-logs    ?action&outcome&severity&actor&ip&requestId&target.id&search&from&to&page&limit
GET /admin/request-logs  ?user&ip&method&status&requestId&search(path)&from&to&page&limit
```

Dashboard: `GET /admin/stats` returns, in one call, the to-do queues
(`paymentsToReview`, `refundsToSend`, `openRequests`, `pendingCategories`),
`rentals.readingNow`/`upcoming`, `catalogue.publishedBooks`,
`people.readers`/`activePackages` and `revenue30d` (approved payments, last
30 days). Refunds still to send are listed with
`GET /payment/admin?refund.status=requested`.

Every error response also returns its `requestId`, so a user's complaint can be
traced straight to the matching log entries.

---

## 📚 Books & the reader

Only the admin adds books. Users browse covers and details without logging in,
and can read a book **only on the platform, only while they hold an active
rental** — the file itself is never sent to any client.

**Adding a book (admin):**

```
1. POST /book/upload-file   multipart "file" (PDF, ≤100MB)
      → stored on Cloudinary as a PRIVATE ("authenticated") asset
      → { public_id, name, pages }               (no URL — there isn't a public one)
2. POST /common/upload      multipart "files" (cover image) → { public_id, url }
3. POST /book  { title, author, description, price, categoryId,
                 file: { public_id }, coverImage: { public_id },
                 language?, isbn?, publishedYear?, rentalDays? (default 14),
                 status?: "draft" | "published" }
```

Lifecycle: `draft → published → archived` via `PATCH /book/:bookId/status`.
Archived books stay in the database (rentals and reviews point at them).
`Category.bookCount` counts **published** books. Prices are whole rupees (PKR)
for one rental; package credits (coming with rentals) cover any book.

**Reading (`/reader`):**

```
GET /reader/:bookId               → { title, author, pageCount, accessUntil }
GET /reader/:bookId/pages/:page   → one page as a JPEG, watermarked for this reader
```

- Access is checked on **every page**: an active rental whose dates cover *now*
  (admins can open any book, including drafts, to proof it).
- The server fetches the page render from Cloudinary with a server-signed URL,
  stamps it with the reader's ID, masked email and time (`utils/watermark.js`,
  via `sharp`), and returns it with `Cache-Control: no-store`. Only one
  un-watermarked render per page is cached, so Cloudinary usage doesn't grow
  with the number of readers.
- **Anti-scraping** — flags are `critical` audit events (`reader.suspicious`) for
  the admin to review; nobody is blocked automatically:
  - more than 40 pages/min of one book → throttled (429) and flagged;
  - the same reader on more than 3 networks within 30 minutes → flagged.
- Every page view is in the request log; opening a book is `reader.open`.

> **Deployment notes:** (1) `sharp` renders the watermark text with system
> fonts — on a slim Linux image install one (e.g. `fonts-dejavu-core`).
> (2) If page requests fail with 401 from Cloudinary, enable PDF delivery in
> Cloudinary → Settings → Security ("Allow delivery of PDF and ZIP files").
> (3) Cloudinary's own max file size depends on your plan.

---

## 🗓️ Rentals, packages & payments

Each book has **one copy**: one reader at a time, everyone else books a later
slot. All rules live in `config/rentalPolicy.js`.

| Rule | Value |
|---|---|
| Rental length | the book's `rentalDays` (default 14) |
| Extension | one free +7 days, only if nobody is booked right after |
| Fair use | max **2 active** + **3 upcoming** rentals per user |
| Booking ahead | start at most 60 days ahead |
| Unpaid hold | slot held 30 min for payment proof (package: 24 h) |
| Cancel before start | package credit returned; paid booking → manual refund request |

**Availability** — `GET /rental/availability/:bookId` (public; logged-in users
also get their own booking and `placeInLine`):

```json
{ "availableNow": false, "isRentedNow": true, "currentRentalEndsAt": "…",
  "peopleAhead": 2, "queueLength": 1, "nextAvailableStart": "…",
  "bookedSlots": [{ "start": "…", "end": "…" }], "myBooking": null }
```

**Booking** — `POST /rental { bookId, startDate?, paymentMethod }`
- no `startDate` → the earliest free slot (now, if the book is free);
- `"single"` → `pending_payment`, slot held, returns Easypaisa instructions;
- `"credit"` → uses one package credit (soonest-expiring package first, must be
  valid on the start date) and is confirmed immediately.

Overlaps are impossible: every booking transaction bumps the book's
`bookingVersion`, so concurrent bookings of one book conflict and the loser gets
a 409 to retry.

**Packages** — the admin manages plans (`/package/admin/plans`: credits, price,
validity, active). Buying one creates a `UserPackage` + a payment; credits
activate (and the 1-year clock starts) when the admin approves the payment.
Each purchase keeps a **snapshot** of the plan, so later edits don't affect it.
Reminders are emailed 30 and 7 days before unused credits expire.

**Payments (Easypaisa, manual)** — behind a provider interface
(`services/payments/providers.js`) so a gateway or Stripe can be added later
without touching rentals.

```
1. booking/purchase   → Payment { reference: "LH-XXXXXXXX", amount, instructions }
2. user transfers to the Easypaisa account, then:
   POST /payment/proof-upload   multipart "file" (receipt screenshot, stored privately)
   POST /payment/:id/proof      { transactionId, senderNumber, senderName?, screenshot: { public_id } }
3. admin: GET /payment/admin?status=submitted   (signed screenshot links)
          PATCH /payment/admin/:id/approve | /reject { reason } | /refund { status, note }
```

A transaction ID can be used **once ever** (unique index); a re-used TID is
refused and raises a `critical` audit event. Approval/rejection emails go out
only after the change is committed (`afterCommit`).

**Lifecycle cron** (every minute): releases expired holds, moves
`scheduled → active → completed`, expires packages. Reading access never waits
on the cron — it's checked against the dates.

---

## 🔎 Book lookup (Open Library)

Book details come from [Open Library](https://openlibrary.org), which is free
and CC0 licensed. They auto-fill the admin's "Add book" form and suggest titles
when a reader requests a book. Only details and cover images come from there.
The readable PDF is always the admin's own upload, of a book they have rights to.

```
GET  /lookup/books?q=atomic habits | ?isbn=9780735211292   (signed in; 30/min)
     → [{ workKey, title, author, authors, publishedYear, isbn, language,
          pageCount, subjects, coverId, coverUrl }]
GET  /lookup/books/:workKey      description + subjects (e.g. OL17930368W)
POST /lookup/cover { coverId }   admin: copy the cover into Cloudinary as their
                                 upload → { public_id, url }, usable as coverImage
```

- Results are cached for 1 hour (works for 1 day). Requests send a
  `LibraryHub/1.0 (<contact>)` User-Agent, as Open Library asks. Set
  `OPENLIBRARY_CONTACT` to choose the address (defaults to `EMAIL`).
- The cover import only accepts a numeric cover id and builds the URL itself,
  so it can't be used to make the server fetch arbitrary addresses.

---

## 🔎 Sitemap

`GET /seo/sitemap.xml` (public, cached 1 hour) lists the frontend's public pages
(`/`, `/books`, `/plans`, `/requests`, `/contact`, `/privacy`, `/terms`) and every
**published** book (`/books/:id` with `lastmod`), as URLs on `CLIENT_URL`.
Account, admin and reader pages are never listed. The frontend's build writes a
`robots.txt` that points crawlers here.

---

## 🙋 Book requests

Users ask the admin to add a book; there is **one request per book**, and
everyone who wants it is a follower of that request.

- **Duplicates merge automatically.** Titles and authors are normalised (case,
  punctuation, accents, a leading "The/A/An"), so `"The Alchemist"`, `"alchemist!"`
  and `"Alchemist" by "paulo coelho."` are the same request. A matching ISBN
  wins over the title. Leaving the author blank joins the existing request for
  that title; a different author makes a separate request.
- **Already in the library?** Nothing is created; the response returns the book.
- **Statuses:** `open → reviewing → planned → fulfilled`, or `rejected` (a reason
  is required). `merged` (the admin folded a duplicate into another request) and
  `withdrawn` (every follower left) also close a request. A closed request can be
  asked for again.
- **Updates:** every admin change is emailed to all followers after it commits.
  Blocked users and anyone with `notifications.email: false` are skipped. Each
  request keeps a public `history` timeline and the latest `statusNote`.
- **Privacy:** lists and details show the follower *count* only, never who.
- **Fair use:** a user can follow up to 20 open requests, and create or join up
  to 20 per hour (`config/bookRequestPolicy.js`).

```
GET    /bookrequest                     public: open requests, most wanted first
                                        (?search, status, language, sort=popular|newest|oldest)
GET    /bookrequest/:id                 public detail (+ "following" when logged in)
POST   /bookrequest                     { title, author?, isbn?, language?, note? }
GET    /bookrequest/mine                requests I asked for or joined
POST   /bookrequest/:id/follow          { note? }   "I want this too"
DELETE /bookrequest/:id/follow          stop following

admin: GET   /bookrequest/admin              (?status, search, sort)
       GET   /bookrequest/admin/:id          followers with name/email + notes
       PATCH /bookrequest/admin/:id/status   { status: open|reviewing|planned|rejected, note? }
       POST  /bookrequest/admin/:id/fulfill  { bookId, note? }   book must be published
       POST  /bookrequest/admin/:id/merge    { intoId }
```

---

## 🔔 Notifications & real-time (Socket.IO)

Everything that happens to a user lands in their **inbox** (`Notification`
collection, kept 180 days), is **pushed live** to their open tabs, and is
**emailed** when it matters. Delivery runs only after the change commits
(`notify()` / `notifyAdmins()` in `services/Notification.Service.js`), and
blocked users get nothing.

| Who | When |
|---|---|
| Admin | payment proof submitted (also emailed), refund requested, new book request, new category suggestion |
| User | payment confirmed / not confirmed and refund outcome (always emailed); booked rental started; rental ended; unpaid hold released; **book freed early → "start now"**; credits expiring / expired; book-request updates; category suggestion approved / not added |

Email follows the user's `notifications.email` preference, except payment and
refund messages, which are always sent.

**Connecting**: same host and port as the API.

```js
const socket = io(API_URL, { auth: { token } }); // token optional
socket.on("notification:new", (n) => ...);         // { _id, type, title, message, data, createdAt }
socket.on("notification:read", ({ ids, unreadCount }) => ...); // read on another tab
socket.emit("book:watch", bookId, (ack) => ...);   // on a book page (max 20)
socket.on("book:availability", ({ bookId }) => refetch(`/rental/availability/${bookId}`));
socket.on("account:blocked", () => logout());
```

- Without a token the socket is anonymous and can only watch books, because
  availability is public. Bad, expired or blocked tokens are refused at connect,
  using the same checks as `verifyToken`.
- Events carry ids and short text only. Clients refetch details over HTTP, so
  access rules live in one place, and live "people ahead / your place in line"
  comes from refetching availability.
- Blocking a user disconnects their sockets at once; changing or resetting a
  password drops sockets opened with older tokens.
- A socket sending more than 60 events in 10 seconds is disconnected and flagged
  (`security.socket_flood`).
- With `REDIS_URL` set, the Redis adapter delivers events across several API
  instances.

```
GET    /notification              ?unread=true&type=…&page&limit  (+ unreadCount)
GET    /notification/unread-count
PATCH  /notification/read         { ids: [...] }
PATCH  /notification/read-all
DELETE /notification/:id
```

**Category suggestions**: any user can suggest a category with `POST /category`
(max 10 an hour). The admin is notified, then approves or rejects it with
`PATCH /category/:id { status, note? }`, and the reader is told the outcome.
Readers see their suggestions at `GET /category/mine`.

---

## ✨ Other features

- **Caching** (`utils/cache.js`) — `cache.wrap(key, ttl, fn)` cache-aside with
  `delByPrefix` invalidation; Redis or in-memory. Applied to the category list.
- **Uploads** — `POST /common/upload` (authenticated, multipart, JPEG/PNG/WebP
  only) streams to Cloudinary and records each file as an `Asset` owned by the
  uploader. File contents are checked by their magic bytes, not just the
  declared type. `POST /common/remove` deletes only the caller's own assets
  (admins: any). Profile pictures, covers and book files must reference an asset
  the user owns; their URLs come from the `Asset` record, never the request.
  `uploadFromUrl` imports a remote image (e.g. a social avatar) into Cloudinary
  for a durable copy.
- **Profile management** — update profile/preferences, change password, manage
  the profile picture.
- **Cron** — cleans up unverified users older than 10 minutes (and their
  orphaned Preferences), logging each deletion to `config/logs/deleted-users.log`.
- **Domain models** — `User`, `Book`, `Category`, `Rental`, `Payment`,
  `PackagePlan`, `UserPackage`, `BookRequest`, `Review`, `Notification`, `Preferences`,
  `Asset`, `AuditLog`, `RequestLog`. Categories use a pending →
  approved/rejected moderation workflow gated behind admin role. A book's `file`
  is `select: false` and is never returned to users.

---

## 📂 Project structure

```
library-backend/
├── config/          dotenv, env (startup check), db (Mongo), redis (optional), policies, morgan logger
├── controller/      thin request handlers (one per domain)
├── cron/            scheduled jobs (unverified-user cleanup, rental lifecycle, credit reminders)
├── middlewares/     requestLogger, verifyToken, verifyRole, validate, inTransaction, rateLimiter, asyncHandler, errorHandler
├── models/          Mongoose schemas
├── realtime/        Socket.IO server (rooms, auth, emitters)
├── routes/          *.Routes.js (auto-mounted by filename)
├── scripts/         maintenance: sync-indexes.js (make DB indexes match the models; dry run, then --apply)
├── services/        business logic + DB access
├── tests/           Vitest suites + tests/support (in-memory DB, test server, env)
├── utils/           audit, requestContext, redact, emailClient, socialVerify, twoFactor, cache, generateTokens, fileLogger, helper, errorResponse
├── validators/      zod request schemas (*.Validator.js) + shared field rules
├── app.js           the Express app (no DB, port or cron; tests import this)
└── server.js        entry: env check → DB → HTTP + Socket.IO → cron
```

---

## ⚙️ Environment variables

Create a `.env` in `library-backend/`. **The server checks it on startup**
(`config/env.js`). A missing or malformed required setting stops the server
with a list of exactly what's wrong (names only, never values). Optional
features that are switched off (Easypaisa, Google/Facebook sign-in, Redis) show
a warning. In production it also requires `CLIENT_URL` and a `SECRET_KEY` of at
least 32 characters.

```bash
# Core
NODE_ENV=development
PORT=5001                 # the frontend hardcodes localhost:5001 in dev
MONGO_URI=mongodb+srv://...
SECRET_KEY=<long-random-string>
ACCESS_TOKEN_EXPIRATION=30d
CLIENT_URL=http://localhost:5173   # used to build the password-reset link
# CORS_ORIGINS=https://a.pk,https://b.pk   # optional; allowed origins, defaults to CLIENT_URL

# Activity logging (optional)
# REQUEST_LOG_RETENTION_DAYS=90   # how long per-request logs are kept
# NOTIFICATION_RETENTION_DAYS=180 # how long in-app notifications are kept

# Email (SMTP) — used for OTP + password-reset
EMAIL=<smtp-account>
PASSWORD=<app-specific-password>
# EMAIL_HOST=smtp.gmail.com    # optional; defaults to iCloud (smtp.mail.me.com)
# EMAIL_PORT=465               # optional; defaults to 587

# Cloudinary (image/file storage)
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...

# Social login
GOOGLE_CLIENT_ID=...
FACEBOOK_APP_ID=...
FACEBOOK_APP_SECRET=...

# 2FA (optional)
TWO_FA_ISSUER=LibraryHub       # name shown in the authenticator app

# Redis (optional) — enables Redis-backed rate limiting + caching
REDIS_URL=rediss://default:<pwd>@<host>:6379   # e.g. a free Upstash DB

# Payments — Easypaisa (manual verification). Until both are set, paid
# bookings and package purchases return 503 "payments aren't available yet".
EASYPAISA_ACCOUNT_TITLE=<name on the Easypaisa account>
EASYPAISA_ACCOUNT_NUMBER=03XXXXXXXXX
```

> Payments: the first launch is Pakistan-only, so there is no Stripe
> integration. `STRIPE_*` keys are unused for now.

> Without `REDIS_URL`, rate limiting & caching fall back to in-memory — fine for
> a single instance. The `PG_ADMIN_*` keys are unused legacy (the app is
> MongoDB-only) and can be removed from `.env`.

---

## 🚀 Getting started

```bash
cd library-backend
npm install
# create .env (see above)
npm run dev        # nodemon, hot reload
```

The API runs on `http://localhost:5001`. Health check: `GET /health`.


### Scripts
| Command | Description |
|---------|-------------|
| `npm run dev` | Start with nodemon (hot reload) |
| `npm start` | Start with plain node |
| `npm test` / `test:watch` | Vitest (once / watch mode) |
| `npm run lint` / `lint:fix` | ESLint |
| `npm run format` / `format:check` | Prettier write / check |

### Tests

`npm test` runs every suite in `tests/` against the real app (Express +
Socket.IO, started in-process) and an **in-memory MongoDB replica set**. No
real database, email, Cloudinary or payment account is ever touched:
`tests/support/env.js` sets a test-only environment, and `config/dotenv.js`
never loads `.env` when `NODE_ENV=test`. The first run downloads a MongoDB
binary (~100 MB, cached afterwards).

- `tests/support/testServer.js`: `startTestServer(dbName)` gives each file a
  fresh database plus helpers: `api()`, `mkUser()`, `mkBook()`, `connect()`
  (socket client) and `mailFailures(title)`. SMTP points at a dead port, so
  every email a flow sends shows up as a logged failure the test can count.
- CI (`.github/workflows/verify.yml`) runs lint and the tests on every push.

---

## 📡 Auth endpoint reference

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/auth/register` | — | Create account, email an OTP |
| POST | `/auth/verify-otp` | — | Verify the email OTP |
| POST | `/auth/resend-otp` | — | Re-issue an OTP (60s cooldown) |
| POST | `/auth/login` | — | Email/password login |
| POST | `/auth/social` | — | Google / Facebook sign-in + linking |
| POST | `/auth/forgot-password` | — | Email a reset link |
| POST | `/auth/reset-password` | — | Reset password by token |
| POST | `/twofactor/setup` | ✅ | Begin 2FA setup (returns QR) |
| POST | `/twofactor/enable` | ✅ | Confirm + enable 2FA |
| POST | `/twofactor/disable` | ✅ | Disable 2FA (requires a code) |
| POST | `/twofactor/verify` | pending token | Complete the 2FA login challenge |
| GET | `/user/profile` | ✅ | Fetch user + preferences |
| PUT | `/user/profile-update` | ✅ | Update name + preferences |
| PATCH | `/user/password-update` | ✅ | Change password |
| PATCH | `/user/profile-picture` | ✅ | Set/replace avatar |
| DELETE | `/user/remove-profile-picture` | ✅ | Remove avatar |
| POST | `/common/upload` | ✅ | Image upload to Cloudinary (records ownership) |
| POST | `/common/remove` | ✅ | Delete your own Cloudinary assets (admin: any) |
| GET | `/book` | — | Catalogue: `search`, `category`, `language`, `sort`, `page`, `limit` |
| GET | `/book/:bookId` | — | Published book details (cover + metadata) |
| POST | `/book/upload-file` | admin | Upload a book PDF privately |
| POST | `/book` | admin | Create a book (draft or published) |
| PATCH | `/book/:bookId` | admin | Edit metadata, category, cover or file |
| PATCH | `/book/:bookId/status` | admin | `draft` / `published` / `archived` |
| GET | `/book/admin`, `/book/admin/:bookId` | admin | All books, any status |
| GET | `/reader/:bookId` | ✅ renter | Open a rented book |
| GET | `/reader/:bookId/pages/:page` | ✅ renter | One watermarked page (JPEG) |
| GET | `/rental/availability/:bookId` | optional | Free now? next start, people ahead, my place |
| POST | `/rental` | ✅ | Book a slot (`single` or `credit`) |
| GET | `/rental/mine`, `/rental/:rentalId` | ✅ | My rentals (+ payment instructions if unpaid) |
| POST | `/rental/:rentalId/cancel` · `/extend` · `/return` · `/start-now` | ✅ | Manage a rental |
| GET | `/rental/admin` | admin | All rentals |
| GET | `/package/plans` | — | Packages on sale |
| POST | `/package/purchase` · `/package/:id/cancel` | ✅ | Buy / cancel an unpaid package |
| GET | `/package/mine` | ✅ | My credits and packages |
| GET/POST/PATCH | `/package/admin/plans[/:planId]` | admin | Manage plans |
| GET | `/package/admin/purchases` | admin | All package purchases |
| GET | `/payment/methods` | — | Available payment methods |
| POST | `/payment/proof-upload` · `/payment/:id/proof` | ✅ | Send payment proof |
| GET | `/payment/mine`, `/payment/:paymentId` | ✅ | My payments |
| GET | `/payment/admin` | admin | Review payments |
| PATCH | `/payment/admin/:id/approve` · `/reject` · `/refund` | admin | Decide a payment / refund |
| POST | `/review/:bookId` | ✅ | Review a book you have rented |
| GET | `/admin/audit-logs` | admin | Query the audit trail |
| GET | `/admin/request-logs` | admin | Query the per-request log |

Other domain routes (`/category`, `/admin`) follow the same layered pattern;
categories use the admin moderation workflow.

---

_Built by Aarish · MIT License_
