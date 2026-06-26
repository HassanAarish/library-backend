# 📚 LibraryHub — Backend API

A production-style REST API for a **Library Management System** — a book-rental
platform with role-based access (readers & admins), a full-featured
authentication system, paid rentals, and a community-moderated catalog.

This service is the API half of a two-part app. The React SPA lives in
`../library-fronend`.

> **Highlight:** the authentication system is the centerpiece — email/password
> with OTP email verification, social login (Google / Facebook / Apple),
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
| Social login | `google-auth-library`, `apple-signin-auth`, Facebook Graph API |
| 2FA | `otpauth` (TOTP) + `qrcode` |
| Email | **Nodemailer** |
| Media | **Cloudinary** (image/file storage) |
| Caching & rate limiting | **Redis** (`ioredis`) with in-memory fallback (`node-cache`, `rate-limiter-flexible`) |
| Scheduling | `node-cron` |
| Tooling | **ESLint 10** (flat config) + **Prettier** |

---

## 🏛️ Architecture

A strict **layered architecture** — one file per domain at each layer. To add or
change an endpoint you touch all four layers:

```
routes/X.Routes.js  →  controller/X.Controller.js  →  services/X.Service.js  →  models/X.Model.js
   (HTTP + auth)          (validate + shape)            (business + DB logic)        (schema)
```

- **Routes auto-mount by filename.** `routes/indexRoutes.js` scans for
  `*.Routes.js` files and mounts each at `/<basename-lowercased>`
  (e.g. `Auth.Routes.js` → `/auth`). No central registry — adding a correctly
  named file is enough.
- **Controllers are thin** — validate input (`helper.checkMandatoryFields`),
  call the service, shape the `{ success, data | message }` JSON response. They
  never touch Mongoose directly.
- **Services hold all business logic and DB access** and accept an optional
  Mongoose `session` for transactions.
- Every async controller is wrapped in `asyncHandler` so errors bubble to a
  central `errorHandler` that translates Mongoose / Multer errors into clean
  responses. Throw `new ErrorResponse(message, statusCode)` anywhere.

### Cross-cutting middleware
- **`verifyToken`** — validates the `Bearer` JWT, re-loads the user to enforce
  `isBlocked`, and attaches `req.userID` / `req.role` / `req.userEmail`.
- **`verifyRole("admin", …)`** — role gate (runs after `verifyToken`).
- **`inTransaction`** — opens a Mongoose session, commits/aborts automatically
  based on the response status, and rolls back orphaned Cloudinary uploads.
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

### 3. Social login (Google / Facebook / Apple)

One unified endpoint. The frontend obtains a provider token (Google/Apple
`id_token`, Facebook access token) and posts it here:

```
POST /auth/social   { provider: "google" | "apple" | "facebook", token, name?, link? }
```

`utils/socialVerify.js` verifies the token **server-side** — Google & Apple via
JWT signature against the providers' public keys, Facebook via the Graph API
(`debug_token` confirms the token was minted for *this* app). It returns a
normalized identity, then `Auth.Service.socialLogin`:

1. **Finds the user by provider id** (`googleId` / `facebookId` / `appleId`) → log in.
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

---

## ✨ Other features

- **Caching** (`utils/cache.js`) — `cache.wrap(key, ttl, fn)` cache-aside with
  `delByPrefix` invalidation; Redis or in-memory. Applied to the category list.
- **Uploads** — `POST /common/upload` (multipart) streams to Cloudinary;
  `POST /common/remove` deletes by `public_id`. `uploadFromUrl` imports a remote
  image (e.g. a social avatar) into Cloudinary for a durable copy.
- **Profile management** — update profile/preferences, change password, manage
  the profile picture.
- **Cron** — cleans up unverified users older than 10 minutes (and their
  orphaned Preferences), logging each deletion to `config/logs/deleted-users.log`.
- **Domain models** — `User`, `Book`, `Category`, `Rental` (Stripe-backed),
  `Review`, `Subscription`, `Notification`, `Preferences`. Books & categories use
  a pending → approved/rejected moderation workflow gated behind admin role.

---

## 📂 Project structure

```
library-backend/
├── config/          dotenv, db (Mongo), redis (optional), morgan logger
├── controller/      thin request handlers (one per domain)
├── cron/            scheduled jobs (unverified-user cleanup)
├── middlewares/     verifyToken, verifyRole, inTransaction, rateLimiter, asyncHandler, errorHandler
├── models/          Mongoose schemas
├── routes/          *.Routes.js (auto-mounted by filename)
├── scripts/         one-off maintenance (e.g. sync-indexes.js)
├── services/        business logic + DB access
├── utils/           emailClient, socialVerify, twoFactor, cache, generateTokens, fileLogger, helper, errorResponse
└── server.js        app entry
```

---

## ⚙️ Environment variables

Create a `.env` in `library-backend/`:

```bash
# Core
NODE_ENV=development
PORT=5001                 # the frontend hardcodes localhost:5001 in dev
MONGO_URI=mongodb+srv://...
SECRET_KEY=<long-random-string>
ACCESS_TOKEN_EXPIRATION=30d
CLIENT_URL=http://localhost:5173   # used to build the password-reset link

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
APPLE_CLIENT_ID=...            # (Apple deferred — needs a paid Apple Developer account)
FACEBOOK_APP_ID=...
FACEBOOK_APP_SECRET=...

# 2FA (optional)
TWO_FA_ISSUER=LibraryHub       # name shown in the authenticator app

# Redis (optional) — enables Redis-backed rate limiting + caching
REDIS_URL=rediss://default:<pwd>@<host>:6379   # e.g. a free Upstash DB

# Stripe (rentals)
STRIPE_PUBLISH_KEY=...
STRIPE_SECRET_KEY=...
```

> Without `REDIS_URL`, rate limiting & caching fall back to in-memory — fine for
> a single instance. The `PG_ADMIN_*` keys are unused legacy (the app is
> MongoDB-only).

---

## 🚀 Getting started

```bash
cd library-backend
npm install
# create .env (see above)
npm run dev        # nodemon, hot reload
```

The API runs on `http://localhost:5001`. Health check: `GET /health`.

If you change a `unique`/`sparse` index on a model, run the one-off
`node scripts/sync-indexes.js` to reconcile the database indexes.

### Scripts
| Command | Description |
|---------|-------------|
| `npm run dev` | Start with nodemon (hot reload) |
| `npm start` | Start with plain node |
| `npm run lint` / `lint:fix` | ESLint |
| `npm run format` / `format:check` | Prettier write / check |

---

## 📡 Auth endpoint reference

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/auth/register` | — | Create account, email an OTP |
| POST | `/auth/verify-otp` | — | Verify the email OTP |
| POST | `/auth/resend-otp` | — | Re-issue an OTP (60s cooldown) |
| POST | `/auth/login` | — | Email/password login |
| POST | `/auth/social` | — | Google / Facebook / Apple sign-in + linking |
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
| POST | `/common/upload` | — | Multipart upload to Cloudinary |
| POST | `/common/remove` | ✅ | Delete Cloudinary assets |

Other domain routes (`/book`, `/category`, `/review`, `/rental`, `/admin`)
follow the same layered pattern; books & categories use the admin moderation
workflow.

---

_Built by Aarish · MIT License_
