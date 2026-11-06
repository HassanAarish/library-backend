# Contributing to LibraryHub

Thanks for wanting to help! LibraryHub is three repositories that work together:

| Repo | What it is |
|------|------------|
| [`library-backend`](https://github.com/HassanAarish/library-backend) | The API (Express, MongoDB, Socket.IO) |
| [`library-frontend`](https://github.com/HassanAarish/library-frontend) | The website and admin console (React, Vite, Tailwind) |
| [`library-app`](https://github.com/HassanAarish/library-app) | The Android app (Expo, React Native) |

The code is **source-available, not open source** (see [`LICENSE`](LICENSE)).
You can read it, run it locally and send improvements, but not reuse it
elsewhere. Please read **Contributor terms** below before opening a pull request.

## Ways to help

- **Report a bug:** open an issue with what you did, what you expected, what
  happened instead, and the device/browser. For API errors, include the
  `requestId` from the error message (it lets us find the exact request).
- **Suggest a feature:** open an issue first, so we can agree on it before
  you spend time on code.
- **Fix something:** look for issues labelled `good first issue` or
  `help wanted`, and say you're taking one.
- **Security problems:** please **don't** open a public issue. Contact the
  maintainer privately through GitHub, and give us time to fix it first.

## Making a change

1. **Fork** the repo and create a branch from `main`, named after what it does:
   `fix/rental-countdown`, `feat/reader-zoom`, `docs/setup-steps`.
2. **Set it up** by following the README's *Getting started* section.
   Copy `.env.example` to `.env`; never commit real keys or passwords.
3. **Make the change**, following the project's rules (below).
4. **Check it** before you push:
   ```bash
   npm run lint          # must pass with no errors (the Tailwind class rules included)
   npm run format:check  # Prettier
   npm test              # all tests pass; add tests for what you changed
   ```
   For screens: check light and dark mode and small screens (the website at
   360, 768 and 1366px wide without sideways scrolling; the app on a phone).
5. **Commit** with clear messages in this style:
   ```
   fix(reader): keep the page when rotating the phone

   Signed-off-by: Your Name <you@example.com>
   ```
   Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`. The
   `Signed-off-by` line (`git commit -s` adds it) confirms you agree to the
   contributor terms below.
6. **Open a pull request** against `main`. Say what changed and why, link the
   issue, and add screenshots for anything visible. A maintainer reviews every
   pull request; changes may be requested before it's merged.

## Project rules

- **All UI text goes through `t()`** (strings in `src/i18n/locales/en.js`), so
  Urdu can be added later by translating, nothing else.
- **Use the design tokens** (`bg-canvas`, `text-fg`, `bg-brand`…), never raw
  colours, so both themes work. Use logical classes (`ms-`/`me-`, `ps-`/`pe-`,
  `start-`/`end-`) so layouts mirror for Urdu.
- **Books are view-only.** Nothing may help a user download, save or extract
  a book's pages. This is a core rule of the service.
- **Mobile app:** no prices, payment steps or "pay on the website" anywhere in
  the app (Google Play's payments policy). Renting and paying happen on the website.
- **Backend:** business logic lives in `services/`, request checks in
  `validators/`; every new endpoint needs tests and a line in the README.
- Keep pull requests focused: one fix or feature each.

## Versions and releases

Each repo uses [semantic versioning](https://semver.org): `MAJOR.MINOR.PATCH`.

- **PATCH** (0.1.0 → 0.1.1): bug fixes only.
- **MINOR** (0.1.0 → 0.2.0): new features that don't break existing ones.
- **MAJOR** (0.x → 1.0.0): the first public launch, or breaking changes.

Contributors don't bump versions; the maintainer does when releasing:

1. Move the *Unreleased* notes in `CHANGELOG.md` under the new version and date.
2. Set `"version"` in `package.json` (the app reads its version from there).
3. Tag the release `vX.Y.Z` and publish a GitHub release with the changelog notes.

## Contributor terms

By submitting a contribution (code, documentation, designs or anything else)
to any LibraryHub repository, you agree that:

1. **It's yours to give.** You wrote it yourself, or you have the right to
   submit it, and it doesn't include anyone else's code under terms that
   conflict with LibraryHub's license.
2. **You grant the maintainer the rights to it.** You grant Aarish
   (https://github.com/HassanAarish), the copyright holder of LibraryHub, a
   perpetual, worldwide, irrevocable, royalty-free, non-exclusive license to
   use, copy, modify, publish, distribute, sublicense and relicense your
   contribution as part of LibraryHub or otherwise, under any terms. You keep
   the copyright in your own work.
3. **No payment or obligation.** You're not owed payment for it, and the
   maintainer doesn't have to use it.
4. **Credit.** Your name stays in the project's git history, and you can be
   listed as a contributor.

Adding `Signed-off-by: Your Name <email>` to your commits confirms this.

## Code of conduct

Be respectful and constructive. Harassment, personal attacks and
discriminatory language aren't accepted in issues, pull requests or reviews;
the maintainer may remove such content and block those responsible.
