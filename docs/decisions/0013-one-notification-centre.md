# 0013: One notification centre

- Status: Accepted
- Date: 2026-08-26

## Context

The four applications had four email habits: different preference models, a push system that
recorded subscriptions but never delivered, digests in one app and per-event mail in another,
and no shared log of what was sent to whom.

## Decision

All outbound communication flows through one notification centre. Preferences are per topic
(bookings, shifts, training, rooms, announcements), not per module. Transactional messages
(a ticket, a receipt, a safety notice, a direct consequence of the person's own action) always
deliver. Digest coalescing groups rapid changes. Every send is logged with type, recipient and
outcome; failures retry and surface on an operations dashboard. Undeliverable and anonymised
addresses are dropped before the provider sees them. Web push ships only when it delivers;
consent is modelled now, collected then. Marketing consent is separate, opt-in, revocable in
one click, and structurally isolated so campaign tooling cannot address a non-consented
person.

## Consequences

- The old estate's silent failure mode (a pending request nobody was told about) becomes a
  visible dashboard exception.
- Sweep-driven messages (expiry warnings, retention warnings) keep the dry-run-first
  discipline; a dry run records nothing as sent.
