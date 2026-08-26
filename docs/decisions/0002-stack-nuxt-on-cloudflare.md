# 0002: Application stack stays Nuxt on Cloudflare Workers

- Status: Proposed
- Date: 2026-08-26

## Context

The team knows Nuxt 4, Vue, Nuxt UI and the Cloudflare Workers deployment model well; four
production applications run on it today, hosting cost is effectively zero, and the committee
turns over yearly, which puts a premium on a stack the documentation already teaches.

## Decision

The unified application is Nuxt 4 on Cloudflare Workers, with Nuxt UI, Zod validation and Bun
as the package manager. Transactional email is sent through **Cloudflare Email Service**
(amended 26 August at committee direction, replacing Resend): the Worker sends through a
`send_email` binding rather than a third-party API key, keeping email inside the platform the
system already runs on. The database choice is decided separately (0003).

## Options considered

- A different framework (Rails, Laravel, Next): stronger batteries in places, but discards all
  accumulated team knowledge and documentation for no capability the theatre needs.
- Resend (the old estate's provider): works, but is a second vendor, a second secret to manage
  in the committee password manager, and a second failure domain for no capability Email
  Service lacks.
- Staying put on the framework was chosen for continuity, cost and successor familiarity.

## Consequences

- Existing conventions (validation, route-per-file, error shapes) carry with minimal
  translation.
- Worker platform limits (bundle size, no raw sockets) constrain database drivers; 0003 takes
  this into account.
- The sending domain must be onboarded to Email Service before the first send
  (`wrangler email sending enable`), a Phase 1 setup task; every message carries both HTML and
  plain-text bodies.
- Email Service is transactional-only by its terms. The V2 marketing campaigns (module H)
  therefore send through a dedicated marketing platform, as the old estate already did with
  its mailing list; the notification centre's structural separation of marketing consent
  (0013) is unchanged.
- One fewer external secret: no mail API key exists to leak or rotate.
