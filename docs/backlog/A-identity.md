# Module A: Identity, membership and privacy

One account for audiences, members and committee alike; membership is a yearly dated state on the
account, not a different login. This backlog decomposes Prompt Book module A into independently
deliverable stories, carrying the proven behaviours of stage-door (enumeration safety, delete-as-claim
tokens, epoch-based session invalidation, the last-admin guard) into a single application where
erasure, export and merge are single-database operations. Binding constraints: Google sign-in is
restricted to @newtheatre.org.uk Workspace accounts, which are Google-only and may never hold a
password; there is one unified app, so the old cross-app session contract does not exist here; and
passkeys enrolled against the old relying-party id cannot cross to the new one (SP-4 found one
affected account, so no re-enrolment flow is built).

**Counts: 26 MVP, 4 V2, 2 Later, 2 resolved won't-build.**

Open questions for the committee:

- How long is the membership grace window at the year boundary (31 July), and does member pricing
  survive into it?
- Which roles exactly count as privileged for compulsory MFA? The proposed definition is any role
  touching money, personal data or safety records; the named list needs signing off in Phase 0.
- SP-2 answered that no direct or automatic roster access exists. What the SU can export on
  request, in what format and on what lawful basis, still needs settling; it shapes A-201's
  manual import.
- Do the retention periods carried from the old estate (two years for full accounts, three for
  guests) remain right for a system that also holds booking history, and who reviews the first
  armed run of the sweep?
- The old estate used 30-day sessions with a 10-minute freshness rule for sensitive actions. Should
  the unified app, which serves money and safety surfaces from the same session, keep those numbers?

## A-101: Register with email and password

- Role: Visitor
- Phase: MVP
- Story: As a visitor, I want to create an account with my email address and a password so that one login covers everything I do with the theatre.
- Depends on: none
- Acceptance criteria:
  1. Registration accepts a name of 1 to 200 characters, an email address (lowercased and format-validated) and a password meeting the configured policy (length and optional complexity, `shared/utils/config.ts`); any other input is a 400 naming the failing field. Amended 27 August 2026: the policy is configuration rather than a fixed rule, because a length floor with no composition rule is what NIST SP 800-63B now advises.
  2. The response is identical whether or not the address already has an account (enumeration-safe). An existing full account receives a "you already have an account" email; a claimable guest account receives a 24-hour set-password link instead (A-116).
  3. A @newtheatre.org.uk address is refused with a message naming Google as its credential: no account is created and no email is sent, because Workspace accounts are Google-only (A-104). Known undeliverable domains (.invalid, .test, example.com) are dropped silently, with the ordinary answer and no account. Amended 27 August 2026: the Workspace half was written as a silent drop, which leaves a committee member typing their work address into a form that appears to do nothing. The rule is about a domain and not about an account, so saying it plainly leaks nothing.
  4. Registration never creates a session; the user lands on a check-your-email page and must verify the address (A-102) before the account is usable. Amended 29 August 2026: "usable" is now enforced at the sign-in path rather than implied, and an account that stays unverified expires (0026).
  5. Rate limits of 10 registrations per hour per IP and 5 per hour per address are enforced.
  6. Passwords are hashed with a memory-hard algorithm and never appear in logs or responses.
- Source: Prompt Book A-1; audit SD-1 (limits, enumeration behaviour and silent-drop rules carry).

## A-102: Verify an email address

- Role: Visitor
- Phase: MVP
- Story: As a new account holder, I want to prove I own my email address so that the theatre only ever sends personal information to a mailbox I control.
- Depends on: A-101
- Acceptance criteria:
  1. Verification uses a single-use token valid for 24 hours; consuming it marks the address verified and invalidates any other outstanding verification token for that account.
  2. Nothing except verification, claim and password-reset messages is ever sent to an unverified address.
  3. An expired or already-used token offers a fresh send, not a dead end; the resend endpoint is enumeration-safe and rate limited.
  4. Sign-in paths that inherently prove the mailbox (consuming a magic link, Google sign-in with a matching address) also mark the address verified.
  5. Tokens are stored hashed; the plaintext exists only in the email.
- Source: Prompt Book A-1; audit SD-1, SD-3, SD-4.

## A-103: Sign in with a password

- Role: Member
- Phase: MVP
- Story: As a returning member, I want to sign in with my email and password so that I can reach my account without ceremony.
- Depends on: A-101
- Acceptance criteria:
  1. Every failure (unknown address, wrong password, password-less account, disabled account, unverified address) returns an identical 401, and a dummy password verification always runs so response timing is not an oracle. Amended 29 August 2026: an unverified address joined the list rather than gaining a message of its own, and the way back is a standing resend step on the sign-in screen (0026).
  2. A @newtheatre.org.uk address returns 403 directing the user to Google sign-in: the one deliberate enumeration exception.
  3. If the account has any confirmed second factor, no session is created; the response carries an MFA attempt with a 5-minute lifetime instead (A-111).
  4. Rate limits of 20 attempts per 15 minutes per IP and 10 per 15 minutes per account are enforced.
  5. A successful sign-in stamps the last-activity time that the retention sweep (A-126) reads.
- Source: Prompt Book A-1; audit SD-2 (behaviour carries verbatim); Get-In constraint 3.

## A-104: Sign in with a Workspace Google account

- Role: Officer
- Phase: MVP
- Story: As a committee member with a @newtheatre.org.uk address, I want to sign in with Google so that theatre addresses have one credential, managed centrally in Workspace.
- Depends on: none
- Acceptance criteria:
  1. The hosted-domain claim (newtheatre.org.uk) is verified server-side on the ID token; the OAuth hint is treated as cosmetic. Any other Google account lands on an explanation page and nothing is created or written.
  2. Account resolution runs in order: existing Google link, then an admin-set pending link (consumed and audited), then an email match (which claims a guest account and marks it verified), then creation of a new verified, password-less account.
  3. Nothing is ever written for a disabled account.
  4. A Google identity already linked to a different account is treated as a merge case (A-123) and refused with guidance, never silently re-linked.
  5. No password can ever be set on a Workspace account through any path (A-113); every password write boundary refuses.
- Source: Prompt Book A-1; audit SD-3; Get-In constraint 3 (rule carries verbatim).

## A-105: Sign in with a passkey

- Role: Member
- Phase: MVP
- Story: As a member, I want to sign in with a passkey so that I am not dependent on remembering a password.
- Depends on: A-113
- Acceptance criteria:
  1. Passkey sign-in is usernameless (discoverable credentials) and requires user verification on the authenticator.
  2. A passkey counts as a complete sign-in: it satisfies both the credential step and the second factor, so no MFA challenge follows.
  3. Enrolment happens from a signed-in session, requires a device PIN or biometric, and the credential is bound to the unified app's relying-party id.
  4. The authenticator signature counter is recorded on every use.
  5. Removing a passkey is refused if it would leave the account with no sign-in method (A-113).
- Source: Prompt Book A-1; audit SD-4, SD-5.

## A-106: Re-enrol passkeys carried from the old estate

- Role: Member
- Phase: Resolved, won't build (SP-4 outcome, 26 August 2026)
- Story: Withdrawn. SP-4 found exactly one account holding passkeys on the old estate.
- Resolution:
  1. Legacy passkey rows are not migrated at all; the user import drops them.
  2. The one affected holder re-enrols manually after cutover; no prompt, no legacy listing and no announcement copy are built.
  3. Passwords, Google sign-in and TOTP factors are unaffected; TOTP secrets and recovery-code hashes still port intact with the user import.
- Source: Get-In part 2 (stage-door MFA row); SP-4 outcome in `../spikes.md`.

## A-107: Sign in with a magic link

- Role: Member
- Phase: MVP
- Story: As a password-averse member, I want to sign in through an emailed link so that my mailbox is my credential.
- Depends on: A-101, A-102
- Acceptance criteria:
  1. Magic links are single-use, valid for 15 minutes, stored hashed, with at most one outstanding per user; requesting a new one invalidates the previous.
  2. The request endpoint is enumeration-safe: the response is identical whether or not the address has an account.
  3. Consuming a link proves the mailbox and marks the address verified.
  4. A magic link replaces the password step but never the second factor: an account with a confirmed factor still gets the MFA challenge (A-111).
  5. Requests for @newtheatre.org.uk addresses are silently ignored; Workspace accounts sign in with Google only.
  6. Unconsumed expired links are swept on a schedule.
- Source: Prompt Book A-1; audit SD-4, SD-13.

## A-108: Reset a forgotten password

- Role: Member
- Phase: MVP
- Story: As a member who has forgotten my password, I want a self-service reset so that recovering access does not need the committee.
- Depends on: A-103
- Acceptance criteria:
  1. The request endpoint is enumeration-safe; the self-service token is single-use and valid for 1 hour; admin-initiated and guest-claim tokens are valid for 24 hours.
  2. Every reset email states the correct lifetime for the token it carries (the old estate's emails always said one hour; that defect does not carry).
  3. Redemption is delete-as-claim: two racing redemptions of the same token cannot both succeed.
  4. A successful reset invalidates every other session on the account.
  5. Requests for @newtheatre.org.uk addresses send nothing and set nothing; Workspace accounts are directed to Google.
- Source: Prompt Book A-1; audit SD-4 (including the defect noted there, fixed here).

## A-109: Enrol a TOTP second factor

- Role: Member
- Phase: MVP
- Story: As a member, I want to add an authenticator-app second factor so that a stolen password alone cannot reach my account.
- Depends on: A-103
- Acceptance criteria:
  1. Enrolment issues a 20-byte secret as a QR code and manual key; codes are 6 digits on a 30-second step, accepted with a tolerance of one step either side, with replay of a used code blocked.
  2. The factor is inactive until confirmed with a valid code; confirming the first factor on an account mints 8 single-use recovery codes shown exactly once (A-110).
  3. Confirming a first factor invalidates every other session on the account.
  4. Enrolment requires a session fresher than 10 minutes.
  5. TOTP secrets imported from the old estate work unchanged; no re-enrolment is required for TOTP.
- Source: Prompt Book A-4; audit SD-5; Get-In part 3 (secrets port intact).

## A-110: Mint and redeem recovery codes

- Role: Member
- Phase: MVP
- Story: As a member with a second factor, I want single-use recovery codes so that losing my authenticator does not lock me out.
- Depends on: A-109
- Acceptance criteria:
  1. 8 recovery codes are minted when the first factor is confirmed, displayed exactly once, and stored only as hashes.
  2. Each code redeems at most once; a redemption satisfies the MFA challenge and is audited with the count of codes remaining.
  3. Regenerating codes invalidates the entire previous set, mints 8 new ones, and requires a session fresher than 10 minutes.
  4. Removing the last factor from an account also deletes its recovery codes.
  5. A recovery code is never accepted as a first credential: it only ever answers an MFA challenge.
- Source: Prompt Book A-4; audit SD-5.

## A-111: Answer the MFA challenge at sign-in

- Role: Member
- Phase: MVP
- Story: As a member with a second factor, I want the challenge flow to be forgiving of typos and hard on attackers so that security does not punish fat fingers.
- Depends on: A-103, A-109
- Acceptance criteria:
  1. A successful password or magic-link step on an account with a confirmed factor creates no session; it returns an MFA attempt with a 5-minute lifetime.
  2. A wrong code returns a fresh attempt id, so a typo does not cost the user the password step.
  3. A valid TOTP code or an unused recovery code completes the attempt and seals the session.
  4. An expired attempt returns the user to the first step with a clear message; expired attempts are swept on a schedule.
  5. Passkey sign-in bypasses the challenge entirely (A-105); nothing else does.
- Source: Prompt Book A-4; audit SD-2, SD-5, SD-13.

## A-112: Require MFA on privileged roles

- Role: Administrator
- Phase: MVP
- Story: As the IT Manager, I want MFA to be compulsory for privileged roles so that a stolen password cannot reach money, personal data or safety records.
- Depends on: A-109, A-111, A-118
- Acceptance criteria:
  1. Any password-holding account with a role touching money, personal data or safety records is refused (403) on privileged surfaces until a confirmed factor exists; enrolment is blocked-until-done, with the enrolment path offered in the refusal.
  2. Google-only Workspace accounts are exempt: Workspace 2-step verification covers them, and they hold no password to steal.
  3. Removing the last factor is refused while the account holds a role that requires one.
  4. Which roles count as privileged is configuration (J-3), and changing it is audited.
  5. Privileged accounts without a factor appear as a standing warning banner with a count on the admin directory (A-121).
- Source: Prompt Book A-4 and module 0 roles table; audit SD-5, SD-8.

## A-113: Manage sign-in methods on one account

- Role: Member
- Phase: MVP
- Story: As a member, I want to add and remove sign-in methods so that my account follows how I actually sign in, without ever locking me out.
- Depends on: A-103, A-104
- Acceptance criteria:
  1. Password, Google link and passkeys can each be added or removed; removing the last remaining method is refused server-side, on every path, including the admin clear-password action.
  2. Linking Google, removing a method and closing the account require a session fresher than 10 minutes; session re-seals never refresh that clock.
  3. A password can never be added to a @newtheatre.org.uk account; the refusal names Google as the credential.
  4. Each method is listed with when it was added and last used; removing one sends a notification to the account's email.
  5. Unlinking Google is refused if it would leave no sign-in method.
- Source: Prompt Book A-1; audit SD-6; Get-In constraint 3.

## A-114: Edit a profile with stated audiences

- Role: Member
- Phase: MVP
- Story: As a member, I want one profile with granular visibility so that the theatre knows what it needs and nothing more.
- Depends on: A-101
- Acceptance criteria:
  1. Profile fields: name, pronouns (optional, free text, never inferred and never required), contact details, emergency contact. Every field states who can see it before the member fills it in.
  2. The emergency contact is visible only to duty managers and safety officers, and only while the member holds a current shift or production role; it appears in no export except the member's own.
  3. Dietary and access needs are not profile fields: they are separate consents with separate audiences, owned by module D (D-6).
  4. Each person controls their credit name per production for programmes and the public archive; the default is the profile name.
  5. A name change propagates everywhere immediately, because every module references the same record (principle P1).
- Source: Prompt Book A-3, module 0 principle P1.

## A-115: Change an email address

- Role: Member
- Phase: MVP
- Story: As a member, I want to change my email address myself so that my account follows me when my address changes.
- Depends on: A-102, A-113
- Acceptance criteria:
  1. A change resets the address to unverified, invalidates every other session, re-seals the current one, and emails a 24-hour verification link to the new address.
  2. A clash with an existing account returns a generic success to the requester and warns the clashing address by email (enumeration-safe).
  3. Changing a password-holding account to a @newtheatre.org.uk address is refused: Workspace addresses are Google-only.
  4. An admin-made email change invalidates the target's other sessions exactly as the self-service path does (the old estate's omission does not carry).
  5. Until the new address is verified, nothing but verification mail is sent to it (A-102).
- Source: Audit SD-6, SD-14 (defect fixed here); Get-In constraint 3.

## A-116: Create and claim guest accounts

- Role: Visitor
- Phase: MVP
- Story: As a guest who booked tickets by email, I want a later registration to claim my history so that becoming an account holder loses nothing.
- Depends on: A-101, A-102
- Acceptance criteria:
  1. Guest checkout (module D) creates a guest account: an account row with no password and no Google link, holding the booking history, with no sign-in ability.
  2. Registering with a guest account's email sends a 24-hour set-password claim link; completing it converts the guest to a full verified account with the entire booking history attached.
  3. Google sign-in with a matching email claims the guest account automatically and marks it verified (A-104).
  4. Guest accounts receive transactional mail only (tickets, receipts); never marketing, never digests.
  5. An anonymised guest is a tombstone: it can never be claimed, and no write path may reinstate personal data over it.
- Source: Prompt Book A-1; audit SD-1, SD-3, EW-2 (tombstone guard carries).

## A-117: Track membership as a dated yearly state

- Role: Member
- Phase: MVP
- Story: As a student, I want my membership recognised as a state on my account so that member pricing, room booking and participation unlock without paperwork.
- Depends on: A-101
- Acceptance criteria:
  1. Membership is a dated state on the account carrying year, source (roster sync, manual grant, purchase) and an evidence reference; it is never a separate login or account type. Amended 30 August 2026: not a year but a term of one or three years running from the purchase, so two people who joined a month apart lapse a month apart. There is no purchase source, because the SU sells it and we only record it (0005, 0031).
  2. Member-only writes (room booking, proposals, rota, tabs) check current membership at the write path, not at page load. Not yet applicable, 30 August 2026: every module named here is later work, so there is nothing to gate. `currentMembership` is the predicate they will call, and 0031 fixes the rule they must follow: money never checks confirmation, participation may.
  3. Membership lapses automatically at the year boundary with a configurable grace window; renewal prompts go out before and during the grace window. Amended 30 August 2026: it lapses on its own expiry rather than at a year boundary, and lapsing needs no sweep because current is read at query time (0009). The grace window is `MEMBERSHIP_GRACE_DAYS`; the reminder goes out `MEMBERSHIP_RENEWAL_NOTICE_DAYS` before each person's own date, once, recorded on the row.
  4. The committee can grant membership manually, recording who granted it, when, and the evidence; every grant is audited.
  5. The committee can view and export the membership register for SU returns; the export is column allow-listed and paginated.
  6. Past years' membership states remain queryable; lapse never deletes history.
- Source: Prompt Book A-2; Get-In part 6 (manual grant exists regardless of roster sync).

## A-118: Grant roles with committee-year expiry

- Role: Administrator
- Phase: MVP
- Story: As the IT Manager, I want role grants that expire at handover by default so that access tracks the committee year, not people's memories.
- Depends on: A-101
- Acceptance criteria:
  1. Expiry options on a grant: end of committee year (the default; 31 July, last instant of the Europe/London day), a picked date, or permanent. Permanent grants are the exception and appear on a standing report.
  2. Every grant carries provenance: grantor, timestamp and a note of up to 500 characters.
  3. Expiry is enforced at read time: a lapsed grant fails permission checks immediately, with no cron needed to revoke it.
  4. A role removal or expiry takes effect on privileged surfaces within one minute.
  5. Every grant change is audited as a from/to diff.
  6. Old-estate grants and their provenance import via a written role-vocabulary mapping table agreed in Phase 0.
- Source: Prompt Book A-4, module 0 principle P3; audit SD-9; Get-In part 2 (roles row: carry).

## A-119: Warn holders before roles lapse

- Role: System
- Phase: MVP
- Story: As a role holder, I want two weeks' notice before my role lapses so that handover is planned, not discovered.
- Depends on: A-118
- Acceptance criteria:
  1. A nightly job warns each holder 14 days before their grant's expiry, once per grant-and-date; changing the expiry date re-arms the warning.
  2. The administrator receives a digest of upcoming and recent lapses.
  3. The standing report of permanent grants is included in the digest cycle, so exceptions stay visible.
  4. Grants expired more than 90 days ago are pruned as housekeeping; enforcement was already read-time, so pruning changes no behaviour.
  5. Every automated action is attributed to system in the audit trail.
- Source: Prompt Book A-4, module 0 principle P6; audit SD-13.

## A-120: Guard the last administrator

- Role: Administrator
- Phase: MVP
- Story: As the theatre, I want the last administrator to be irremovable so that the system can never lose the ability to administer itself.
- Depends on: A-118
- Acceptance criteria:
  1. Removing, expiring or adding an expiry date to the last usable Administrator grant is refused with a reason.
  2. Disabling, closing, erasing or merging away the account holding the last usable Administrator grant is refused on every path, self-service included.
  3. "Usable" excludes disabled and anonymised accounts: a disabled second admin does not satisfy the guard.
  4. The retention sweep (A-126) exempts administrator accounts entirely.
  5. The guard is enforced server-side in the same transaction as the mutation it blocks, so no race can slip past it.
- Source: Prompt Book A-4; audit SD-7, SD-9.

## A-121: Search and triage accounts from the admin directory

- Role: Administrator
- Phase: MVP
- Story: As the IT Manager, I want to search and triage every account so that the yearly handover starts from an accurate register.
- Depends on: A-118
- Acceptance criteria:
  1. Directory filters, designed for the questions the unified system actually raises: everyone; current members; lapsed members; guests who never signed in (claimable accounts); role holders, narrowable to one role; privileged accounts without a second factor; unverified addresses; disabled; anonymised placeholders; and accounts inside a retention warning window. Privileged-without-MFA and approaching-retention also surface as standing warning banners with counts. Workspace-with-password is deliberately not a filter: the user import wipes any password found on an @newtheatre.org.uk address (decision 0008), so the state cannot exist to be filtered for, and a test asserts the invariant instead.
  2. Search and listing are paginated server-side and column allow-listed; no filter fetches the whole table to the browser.
  3. Creating an account from the console never generates a password: a 24-hour set-password link is emailed instead, and roles can be granted in the same action.
  4. Anonymised rows are hidden unless explicitly requested.
  5. Every account view links to that person's grants, sign-in methods, membership state and audit history.
- Source: Audit SD-8 (filters and banners carry); Prompt Book A-4.

## A-122: Force logout, disable and reset MFA

- Role: Administrator
- Phase: MVP
- Story: As the IT Manager, I want immediate security operations on any account so that I can respond to a compromise in minutes, not sessions.
- Depends on: A-109, A-118
- Acceptance criteria:
  1. Force logout and disable invalidate every session on the account immediately; re-enabling does not resurrect old sessions, which stay dead until the person signs in again.
  2. A disabled account fails every sign-in path with the same response as any other failure; disabling leaks nothing to an attacker holding the credentials.
  3. MFA reset clears all factors, all recovery codes and all sessions in one atomic batch.
  4. Destructive operations refuse to target the operator's own account.
  5. Every operation is audited with actor, action, target and diff.
- Source: Prompt Book A-4; audit SD-10.

## A-123: Merge duplicate accounts

- Role: Administrator
- Phase: MVP
- Story: As the IT Manager, I want to merge duplicate accounts with a dry-run first so that one person ends up with one record and nothing is lost on the way.
- Depends on: A-121
- Acceptance criteria:
  1. Every merge dry-runs first, listing exactly what will move from the losing account (bookings, records, shifts, membership, grants) before anything changes.
  2. Executing requires typing the losing account's email address as confirmation.
  3. The merge is a single database transaction across all modules; a failure changes nothing.
  4. The losing account is left as a tombstone, so anything inside the system that referenced it still resolves; no legacy-id columns exist (decision 0015, amended).
  5. The winning account keeps its own sign-in methods and factors; the loser's are retired, never silently combined.
  6. The last-admin guard applies (A-120), and the merge is audited with the full moved-item summary.
- Source: Prompt Book A-4; audit SD-10; Get-In part 2 (GDPR machinery becomes single-database operations).

## A-124: Export my data in one action

- Role: Audience account
- Phase: MVP
- Story: As anyone with an account, I want to export everything the theatre holds on me so that my rights don't depend on knowing the system's architecture.
- Depends on: A-101
- Acceptance criteria:
  1. One self-service action produces a single bundle (JSON, with CSV for tabular sections) covering every module: bookings, payments, training records, shifts, room bookings, and message metadata.
  2. The export contains only the requesting person's data; special-category data (the access profile) appears in no export except the person's own.
  3. The export is generated from an authenticated session and downloaded directly; it is never emailed as an attachment.
  4. Every export is audited with who, when and what scope.
  5. The bundle is complete in one pass because everything lives in one database; no per-module fan-out exists to partially fail.
- Source: Prompt Book A-5; audit SD-7, EW-2; Get-In part 2 (hooks retire).

## A-125: Erase my account

- Role: Audience account
- Phase: MVP
- Story: As anyone with an account, I want erasure to be one action so that leaving the theatre is one decision, not an architecture lesson.
- Depends on: A-120, A-124
- Acceptance criteria:
  1. Self-service closure requires typing the account email, the password where one exists, and a session fresher than 10 minutes.
  2. Erasure is a single-transaction anonymisation across every module: sales, attendance and safety statistics survive as anonymous rows; free text about the person (notes, rejection reasons, revoke reasons) is scrubbed; consent-based data (access profile, marketing consent) is deleted outright.
  3. Anonymised rows are tombstoned and guarded: no later write path may reinstate personal data over them.
  4. Identifying values are redacted from historical audit entries; this is the audit trail's only sanctioned edit.
  5. The last-admin guard applies: the account holding the last usable Administrator grant cannot be erased (A-120).
  6. Admin-initiated erasure mirrors self-service exactly and is audited with the acting administrator.
- Source: Prompt Book A-5; audit SD-7, SD-10, EW-2 (semantics carry; the retry machinery retires).

## A-126: Ship the retention sweep dry-run first

- Role: System
- Phase: MVP
- Story: As the theatre, I want dormant accounts warned and then anonymised automatically so that we do not hold personal data forever, and I want the automation to prove itself before it acts.
- Depends on: A-125
- Acceptance criteria:
  1. A nightly sweep finds full accounts inactive for 2 years, sends a 60-day warning, then a 30-day warning, then anonymises; guest accounts anonymise after 3 years of no activity, without warning. All periods are configuration. Amended 29 August 2026: the sweep never warns an unverified or unclaimed account. An unverified one expires on its own rule long before this reaches it, and a warning is a message A-102 criterion 2 forbids to an unverified address (0026).
  2. Exempt: current members, current role holders, administrators, and anyone with unsettled money.
  3. Any sign-in clears the account's warning trail and restarts the clock.
  4. Each run caps at 100 warnings and 200 anonymisations.
  5. The sweep ships in dry-run: it computes, reports and emails a digest but changes nothing. Arming it is an explicit configuration change with a preview of who is affected, a typed confirmation, and an audit entry (J-3).
  6. Every automated anonymisation is attributed to system in the audit trail and uses the same code path as A-125.
- Source: Prompt Book A-5; audit SD-12 (periods, caps and dry-run discipline carry); Get-In part 2 (retention row: carry, dry-run-first).

## A-127: Award, record and revoke a fellowship

- Role: Administrator
- Phase: MVP
- Story: As the committee, I want to record a fellowship awarded to an alumna or alumnus so that
  the theatre keeps its own roll of the people it has honoured, and their lifetime entitlement
  follows from it.
- Depends on: A-116
- Acceptance criteria:
  1. An administrator records an award against an account with the date, the meeting that
     resolved it and the citation; the citation is public wording and is displayed as written.
  2. A person can hold at most one fellowship, enforced by a unique constraint rather than by the
     form.
  3. Awarding issues the lifetime entitlement in the same batch as the record, so a Fellow can
     never exist without one or an entitlement without an award (0023). Amended 30 August 2026: the
     roll is recorded first and the entitlement issues when the pass model exists, because passes
     need pass types, prices and the ledger behind them and the committee assembles the roll for
     30 September. The batch invariant applies from the moment there is a pass to issue, which is
     before the door opens on 12 October.
  4. A fellowship can be revoked with a reason; revocation stops future admissions and rewrites
     nothing, so the award, the revocation and every admission already taken all stand.
  5. Awarding and revoking are audited, and the audit detail carries the fellowship id and never
     the citation or the reason.
  6. Deleting a user cannot remove an award: the reference restricts, and an erasure anonymises
     the person while the award stands as part of the theatre's record.
  7. The roll of existing Fellows is entered through this same path, because no database holds
     it.
- Open questions: whether an erasure should also redact the citation, which names the person it
  honours. It ships unredacted, because the roll is a public record the theatre published at the
  time, and the committee is asked to confirm. Shipped that way on 30 August 2026 and recorded in
  known issues, so the question has somewhere to be answered rather than being lost in a story.
- Source: Committee direction, 26 August 2026; decision 0023.

## A-201: Import an SU membership list by hand

- Role: Administrator
- Phase: V2
- Story: As the membership secretary, I want to upload a membership list the SU exported for us so that most memberships appear without anyone typing them one at a time.
- Depends on: A-117
- Acceptance criteria:
  1. SP-2 established there is no direct or automatic roster access, so this is a manual upload: an administrator submits an SU-provided export file and previews the parsed result before anything is written.
  2. The import creates or extends membership states with source roster and an evidence reference to the upload; it never revokes a manual grant and never lapses a membership by itself. Discrepancies land on a reconciliation report for a human to decide (principle P6).
  3. Matching is by the agreed key (email or student number); ambiguous matches are queued for review, never guessed.
  4. Applying the same file twice changes nothing the second time.
  5. Every run is audited with counts of created, extended, skipped and queued rows.
- Source: Prompt Book A-2; SP-2 outcome in `../spikes.md` (manual grant remains the base flow).

## A-202: Sell membership at the desk

- Role: Officer
- Phase: Resolved, won't build (committee constraint, 26 August 2026)
- Story: Withdrawn. Membership can only be purchased through the SU, so it syncs correctly with SUMS; the society cannot sell membership itself, even on the SumUp reader.
- Resolution:
  1. The system never takes membership money and holds no purchase source for membership state; joining instructions on the site point at the SU's own purchase flow.
  2. Membership state arrives by manual grant (A-117) and the hand-uploaded SU export (A-201); SUMS remains the system of record for who has paid.
- Source: Committee direction, 26 August; Prompt Book A-2.

## A-203: List and revoke sessions per device

- Role: Member
- Phase: V2
- Story: As a member, I want to see where I am signed in and end any session so that a forgotten library computer is a click, not a compromise.
- Depends on: A-103
- Acceptance criteria:
  1. The security page lists active sessions with device description, sign-in method, created and last-used times; times are shown in Europe/London.
  2. Any single session can be revoked; revoking one does not disturb the others.
  3. "Log out everywhere" remains available and invalidates every session including, optionally, the current one.
  4. A revoked session fails its next request; there is no grace period.
- Source: Prompt Book A-1 (methods self-service); audit SD-14 (per-device session list, explicitly deferred on the old roadmap).

## A-204: Notify on a new sign-in

- Role: Member
- Phase: V2
- Story: As a member, I want an email when my account is used from somewhere new so that a compromise is noticed by me, not just by luck.
- Depends on: A-203
- Acceptance criteria:
  1. A sign-in from a previously unseen device or browser sends a notification naming the method and the time in Europe/London.
  2. The message is transactional: it always delivers regardless of notification preferences (H-1).
  3. It carries a "this wasn't me" path that leads to log-out-everywhere and a password reset in two taps.
  4. Routine sign-ins from known devices send nothing; the feature must not train people to ignore it.
- Source: Audit SD-14 (new-login notifications, explicitly deferred on the old roadmap); Prompt Book H-1.

## A-205: Gate role grants on live training records

- Role: Administrator
- Phase: V2
- Story: As the Training Manager, I want roles that require a current training record so that authority and competence cannot drift apart.
- Depends on: A-118
- Acceptance criteria:
  1. A role definition may require a current training record (module G); granting it to someone without the record is refused, naming the missing module.
  2. When the underlying record expires or is revoked, the role fails permission checks at read time, exactly as date expiry does.
  3. An eligibility override lets a named person hold the role without the record for at most 90 days; overrides self-lapse and are audited with a reason.
  4. Because training and roles share one database, eligibility is a join, not an API call: there is no fail-open seam and no cache window.
  5. Unlike the old estate, rules ship declared and active, or the machinery is not built at all (it was fully plumbed and inert there).
- Source: Prompt Book module 0 principle P3; audit SD-9, SD-14 (inert plumbing), PR-13 (the fail-open seam this replaces).

## A-301: Act as an identity provider for external tools

- Role: Administrator
- Phase: Later
- Story: As the IT Manager, I want the system to offer "Sign in with NNT" to external tools so that the production-management and other tools the theatre adopts can reuse our accounts and roles.
- Depends on: A-118
- Acceptance criteria:
  1. Epic stub, to be decomposed when a concrete external consumer exists. Scope sketch: standard OIDC provider surface, per-client consent, role claims mapped per client, and client registration in the admin console.
  2. Nothing in the MVP identity model may preclude this; in particular, account ids are stable and never recycled.
- Source: Audit SD-14 (deferred on the old roadmap); Get-In part 2 (keep one outbound surface only if an external consumer appears).

## A-302: Give alumni a lasting identity in the archive

- Role: Visitor
- Phase: Later
- Story: As an alumna, I want my account and credit names to outlive my membership so that my part in the theatre's history stays mine to control.
- Depends on: A-114
- Acceptance criteria:
  1. Epic stub, to be decomposed with the archive module (B-5). Scope sketch: accounts persist beyond membership lapse; credit-name control keeps applying to archived productions; a later erasure updates archive entries; an alumni contact consent is separate from member communications.
  2. Retention policy (A-126) must distinguish an alumna who wants to be remembered from a dormant account; that distinction is consent, recorded on the account.
- Source: Prompt Book B-5, A-3; suggested phasing (alumni programme, Later).
