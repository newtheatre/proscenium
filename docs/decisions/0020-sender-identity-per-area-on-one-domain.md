# 0020: Mail carries one of five sender identities on a single sending domain

- Status: Accepted (IT Manager decision, 26 August 2026)
- Date: 2026-08-26

## Context

The scaffold shipped a single configured from-address, which decision 0002 assumed when it moved
email onto Cloudflare Email Service. One address is wrong for this system. The four old
applications each sent as themselves (`auth@`, `training@`, `no-reply@tickets.` and rooms'
`"Room Bookings"`), and a recipient used that identity to tell a ticket from a room approval
before opening either. Unifying the applications should not unify their voices.

The apex domain is not a blank slate. `newtheatre.org.uk` takes delivery through Google
Workspace, publishes one SPF record covering Workspace and Amazon SES, carries DKIM selectors
for Resend, Mandrill and Mailchimp, and already has `alumni.newtheatre.org.uk` onboarded to
Email Sending. Anything done here shares a domain with every mailbox the society owns.

## Decision

Outbound mail carries one of five sender identities, each a display name and a replyable address
on `newtheatre.org.uk`: box office, room bookings, training, accounts, and the theatre itself for
announcements. The set lives in `shared/senders.ts`, and the worker's `send_email` binding pins
`allowed_sender_addresses` to that same list, so the application cannot send as anything else and
the two cannot drift.

**No address may be a `no-reply`.** A member who replies to a message from the theatre is doing
the reasonable thing, and an address that discards their reply is worse than one that never
invited it. This makes a working mailbox behind each of the five a condition of shipping, not a
nicety: because the apex takes delivery through Workspace, that is a Workspace alias or group,
not a Cloudflare routing rule.

One sending domain, not one per area. Per-area subdomains would isolate reputations, but each is
a separate onboarding with its own SPF, DKIM and DMARC to keep healthy, and a society whose
committee turns over yearly is better served by one set of records that stays correct than by
five that rot.

**The apex DMARC policy stays `p=none`.** Onboarding offers to write `p=reject`. Email Sending
authenticates against the `cf-bounce` return path and aligns by DKIM, so it does not need the
change, and `p=reject` on a domain that also sends through Workspace, SES, Mandrill and Mailchimp
would reject any unaligned stream outright.

## Consequences

- Adding a sender is a code change with a test, reviewed, and a binding change in the same pull
  request; it cannot be done by editing a setting.
- The five addresses need mailboxes before the first send. Until they exist the system is
  friendlier in appearance and worse in fact.
- One reputation pool: heavy audience mail and member transactional mail share it. If that ever
  bites, splitting the box office onto its own subdomain is the remedy, and it needs a record.
- Tightening the apex DMARC is a separate deliberate act, taken after `rua` reporting shows every
  stream aligned, and it gets its own record.
- Rota messages have no identity of their own and use the announcements one until the message
  catalogue in H-101 assigns senders properly.
