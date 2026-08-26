# 0008: Google sign-in is Workspace-only; passkeys re-enrol at cutover

- Status: Accepted
- Date: 2026-08-26

## Context

Committee accounts live in the theatre's Google Workspace; the old estate's rule that a
Workspace address is Google-only (no password may ever exist on one) closed a real credential
sprawl problem and is retained by committee instruction. Separately, WebAuthn credentials are
bound to the relying-party id: passkeys enrolled against the old auth domain cannot be used by
the unified application on its own domain.

## Decision

Google sign-in accepts only `@newtheatre.org.uk` Workspace profiles, verified server-side;
every password write path refuses Workspace addresses; login answers a Workspace address with
an explicit use-Google response (the one deliberate enumeration exception). Passkeys use the
unified domain as relying-party id from day one. SP-4 found exactly one account holding
passkeys, so no legacy-passkey import and no re-enrolment flow are built: old passkey rows are
simply not migrated and the one holder re-enrols manually after cutover. Passwords, TOTP and
Google links migrate unchanged.

## Consequences

- Committee handover keeps the pending-link flow: an administrator can pre-link a Workspace
  address to an account, consumed on first Google sign-in.
- The user import enforces the rule retroactively: any password found on a Workspace address in
  the old data is wiped at import, so the Workspace-with-password state cannot exist in the
  unified system and needs no admin filter.
- Nobody is locked out by the passkey change because passkeys were never the only permitted
  method.
