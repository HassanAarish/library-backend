# Changelog

All notable changes to the LibraryHub API. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[semantic versioning](https://semver.org) (see CONTRIBUTING.md › Versions and releases).

## [Unreleased]

### Added
- Push notifications to the mobile app: `POST`/`DELETE /notification/devices` save
  and remove a phone's Expo push token, and every reader notification is also pushed
  (through Expo's push service) unless the reader turned push off. Push text never
  mentions payments or renting (Google Play rule). Optional `EXPO_ACCESS_TOKEN`.

### Changed
- Reader anti-scraping limits now come from private environment variables, which
  are required in production.

## [0.1.0] - not yet released

The first version of the rebuilt API.

### Added
- **Security and activity logging:** request IDs, an audit log of admin and
  security actions, per-request logs (kept 90 days), rate limits, helmet, and
  environment checks at start-up.
- **Accounts:** email sign-up with one-time code, sign-in, Google and Facebook
  sign-in, two-step verification, password reset, profile and preferences,
  admin blocking (signs the user out everywhere at once).
- **Catalogue:** books with categories, draft/published/archived states, PDF
  upload with page count, Open Library lookup and cover import.
- **Reader:** page-by-page JPEGs watermarked with the reader's ID, access
  checked on every page, scraping detection flagged for admin review.
- **Rentals:** one copy per book with a queue, book now or up to 60 days
  ahead, one free 7-day extension, return early, unpaid holds released
  automatically.
- **Plans:** 3/5/10-book packages valid for a year, credit reminders.
- **Payments:** Easypaisa transfers with proof upload and admin review,
  refund requests and resolution, behind a provider interface for future
  gateways.
- **Book requests and category suggestions** with follow, admin status
  notes, fulfil and merge.
- **Notifications:** in-app inbox and live Socket.IO events (availability,
  notifications, account blocked), plus emails.
- **Admin:** dashboard stats (`GET /admin/stats`), user, payment, rental,
  request and log management.
- **SEO:** public sitemap of pages and published books (`GET /seo/sitemap.xml`).
- Validation on every endpoint (zod) and a Vitest suite against an in-memory
  MongoDB.

[Unreleased]: https://github.com/HassanAarish/library-backend/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/HassanAarish/library-backend/releases/tag/v0.1.0
