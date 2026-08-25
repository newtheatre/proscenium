# Show night screen: design

**Status: agreed, not yet built.** Drafted August 2026 by Matt Adcock (ITM 26/27); revised same
month after decisions on access needs, staffing, the end-of-night report, and backstage access
(the latter revised twice: see §5.1). Agreed 2026-08-21 and reconciled against the code the same
day: where a section states a decision, the reasoning now lives in a decision record and the
section cites it.

Read alongside [10-passes-design](./10-passes-design.md), which supplies the pass admission flow,
and the [access needs, staffing & end-of-night design](./12-access-and-staffing-design.md)
(referred to below as *12-access-and-staffing*), which supplies the access system, the rota and
the report. **The programme order across all three designs is 12-access-and-staffing §5**, not
this document's §6, which sequences this screen alone.

## 1. What this is

A single mobile-first screen for staff working a performance: door staff on their phones, and the
same page on the box office/bar computer. It is not a new app: it is a route in Proscenium
(suggested: `/foh`) behind the existing auth, laid out as **six large buttons** that open the six
things a person at the door actually needs mid-show, with no navigation deeper than one level.

Design principle: everything reachable in one tap, readable at arm's length in a dark foyer, and
usable by a volunteer who was handed a phone and thirty seconds of instruction.

Settled scope decision: **the door never sells tickets.** Unpaid and walk-up customers are
directed to the bar; there is no sell flow anywhere on this screen and none is planned.

The backstage half of the comms feature: its own page, its own access model, its own much
smaller set of abilities: is specified in §5.

## 2. The six buttons

| # | Button | One line |
|---|---|---|
| 1 | **Scan ticket** | QR scan (or type a ref / search a name) → collection state, role-aware detail |
| 2 | **Tonight at a glance** | Capacity, collection progress, pass pressure, show info, access needs |
| 3 | **Admit pass holder** | The door redemption flow from the passes design |
| 4 | **Backstage** | Two-way presets + free text between FOH and a backstage display |
| 5 | **Emergency** | Evacuation, first aid, the venue address to read to 999 |
| 6 | **Contacts & incidents** | Tap-to-call numbers and a timestamped incident log |

**The home is shift-scoped** (`docs/13` §2.3, §5). These six are what a `DOOR` shift sees. A `BAR`
shift sees **Till** and **Challenge 25** instead of *Scan ticket*, *Admit pass holder* and
*Backstage*, keeping *Tonight at a glance*, *Emergency* and *Contacts*. The duty manager and
`BOX_OFFICE`+ see all of them.

Hiding a tile is a convenience, never the control: every bar route refuses a `DOOR` shift
server-side, because the door never sells.

### 2.1 Scan ticket

Opens the camera and reads a QR encoding the six-character `bookingRef` (see §3 for where the QR
comes from). The same view carries the two fallbacks so nobody has to back out and find another
button: a large ref-entry field (six characters, unambiguous alphabet, so this is fast), and a
name/email search against tonight's reservations.

What the result shows depends on role:

- **Door mode** (FRONT_OF_HOUSE): a full-screen verdict, green **PAID / all collected**, or amber
  **UNPAID: send to the bar to pay**, with party size so the door knows how many people to expect
  through. Where the booking belongs to a consented access profile, the profile's symbols show too
  (12-access-and-staffing §2.6). Deliberately minimal otherwise: no prices, no email address, no
  booking history. The door's job is admit or redirect, and the screen should answer exactly that.
- **Box office / bar mode** (BOX_OFFICE and above): the full reservation, tickets, prices, what's
  owed: with the existing collect/pay actions. Scanning here replaces typing the ref into the
  current box office screen; it must drive the *same* collection state machine as
  [05-booking-and-box-office](./05-booking-and-box-office.md), not a parallel one.

"Paid/unpaid" must be derived from the reservation/ticket status lifecycle in
[03-domain-model](./03-domain-model.md) in one shared server-side function, for the same reason
`canRedeem` is one function in the passes design: the door and the bar disagreeing about whether a
booking is paid is the worst possible show-night bug.

### 2.2 Tonight at a glance

If more than one performance is on tonight (studio + auditorium), a performance picker first;
otherwise straight in. Four blocks, plus the night's one closing action:

1. **The numbers**: sold, collected so far, remaining capacity, expected walk-up headroom. Answers
   "can we take walk-ups?" without radioing the box office.
2. **Pass pressure**: the readout from the passes design §6: passes issued that cover this show
   against remaining capacity.
3. **Show info card**: the questions audiences ask the door, pulled from the show/performance
   record: running time, interval or straight through, content warnings, age guidance, latecomer
   policy. Zero effort per production because it is data the show record already holds (any field
   that doesn't exist yet gets added to the show admin form, not maintained separately).
4. **Access tonight**: each consented access booking for this performance: first name, party
   size, the profile's symbols and staff note, so the team knows before the person arrives. The
   data model, verification and visibility rules are 12-access-and-staffing §2; the strict
   consent-and-rota gate specified there is enforced server-side.
5. **Close the night**: visible to tonight's duty manager (and BOX_OFFICE+): the short close-down
   checklist that releases no-shows, generates the end-of-night report
   (12-access-and-staffing §4), and revokes all backstage code sessions (§5.1).

### 2.3 Admit pass holder

Exactly the door redemption flow specified in [10-passes-design](./10-passes-design.md) §4: look up
by reference, name or email; the pass card shows holder, status, coverage and tonight's redemption
state; **Admit** creates the £0 pass-admission ticket via `canRedeem`, with the volunteer-readable
rejection copy on failure. This button is a front door to that flow, not a reimplementation. If
passes later get their own QR codes, this merges into button 1 and the slot frees up.

### 2.4 Backstage

Two-way messaging between FOH devices and the backstage page (§5), which runs full-screen on
either a fixed tablet backstage or the tech desk Mac: whichever is used, a resident device, not
someone's phone.

- **Presets both ways.** FOH: *house open · clearance given · show start · hold · interval ending*.
  Backstage: *cleared for house open · standby · we need N more minutes · ready*. Presets are
  configurable in admin, not hard-coded: each society runs calls slightly differently.
- **Free text** in both directions for everything the presets don't cover.
- **Acknowledgements.** A preset sent from FOH shows as *unseen* until backstage taps it, and vice
  versa. The sender seeing "backstage has seen HOUSE OPEN" is the entire value over a group chat.
- The current state (last preset each way + its ack) is always visible at the top; the message
  history scrolls below.

The FOH side of this view also carries the night's housekeeping header: **tonight's backstage
code** as text and QR, the list of joined backstage devices (name, joined at, last seen), and the
**reset code** control (§5.1). Visible to rostered staff and `BOX_OFFICE`+ only.

Transport: Cloudflare Workers makes WebSockets a Durable Objects commitment. **Start with short
polling** (a couple of seconds) against a plain D1-backed endpoint: show-night message volume is
tiny, the latency is fine for "show start", and it keeps the architecture inside what
[02-architecture](./02-architecture.md) already established. The upgrade path to a Durable Object
per performance, and the conditions that would justify taking it, are
[ADR-0021](./decisions/0021-show-night-comms-poll-rather-than-hold-a-socket.md).

Scope honesty: with free text both ways this is a small chat app, and the alternative is "use the
society group chat". What justifies building it is the ack'd presets and the fact that it lives one
tap from the scanner on a device staff already hold. If it grows features beyond this section, stop
and reconsider.

### 2.5 Emergency

Static, admin-editable content: no cleverness:

- Evacuation procedure and assembly point.
- The venue's full address and what3words, in large text, **written to be read aloud to a 999
  call handler**.
- First aid kit and defibrillator locations; trained first aiders tonight if known.
- Isolation points (gas, electric, water) for the duty manager.
- Fire panel location and what to do on an alarm.

This page must load instantly and reliably: pre-fetch it when the FOH screen opens and cache it
(service worker or simply inlining it into the shell) so a flaky foyer connection cannot stand
between a volunteer and the assembly point. It is the one button that must work with no signal.

### 2.6 Contacts & incidents

- **Contacts:** tonight's duty manager and rostered team, read live from the staffing record
  (12-access-and-staffing §3): plus committee on-call, venue/security and taxi numbers from an
  admin-editable list. Each a `tel:` link so it is tap-to-call on mobile.
- **Incident log:** a timestamped free-text note-taker recording author, performance and time.
  Entries are append-only; corrections are new entries. The log lands in full in the end-of-night
  report (12-access-and-staffing §4.3): this is the theatre's first structured incident record,
  which the safety-minded successor will thank you for. The author column is a user reference, so
  it joins the estate merge and erasure hooks on the commit that creates it
  ([ADR-0025](./decisions/0025-every-user-reference-joins-the-estate-hooks.md)).

## 3. The QR code

Proscenium generates no QR anywhere today, and legacy never did (see the migration gap analysis
§3.7). Decision: **put a QR in the confirmation email** and on the customer's booking page.

Encode a URL, not a bare ref: `https://newtheatre.org.uk/t/<bookingRef>`. Reasons:

- The FOH scanner just pattern-matches the trailing ref, so it costs nothing.
- The ref alone stays typeable; the QR is an accelerator, not a gate.
- It is short enough to print, read aloud and scan reliably at arm's length.

`/t/<ref>` is a redirect, not a new page: it resolves the reference to its show and sends the
browser to the canonical booking page. **It performs no access check and grants nothing**, because
the reference is not a credential ([ADR-0009](./decisions/0009-signed-booking-access-tokens.md)).

### What the emailed QR carries

The first draft of this section claimed a customer could scan their own email with a normal camera
app and land on their booking. That is not true of the bare ref: a guest has no session, the ref
grants nothing, and they would land on a refusal. Guests are most of the box office, so the claim
mattered.

The emailed QR therefore encodes **`/t/<ref>?t=<token>`**, the same signed token the email's own
link already carries. Three consequences, none of which weaken ADR-0009:

- **Nothing new is exposed.** The token is already in that email, in a URL. A machine-readable copy
  of the same link beside it adds no exposure the email did not already have.
- **The reference still grants nothing.** Access comes from the token, exactly as before. `?ref=`
  remains unaccepted everywhere.
- **The scanner is unaffected.** It pattern-matches `/t/<REF>` and ignores the query, so both the
  bare and tokenised forms scan identically.

`/t/<ref>` moves a valid token into the booking cookie and drops it from the URL before redirecting,
so the destination address never carries it. The bare form is what goes on the customer's booking
page and anywhere printed.

Generation is server-side at email-send time (any small QR library that runs on Workers). No
personal data in the QR.

Scanner implementation: `getUserMedia` + the `BarcodeDetector` API where available, with a JS
decoder fallback (e.g. jsQR) for browsers without it. No native app, ever: the whole point is
that any phone with a browser is a door device.

## 4. Access (front of house)

Decision: **Proscenium accounts with a new role**, not shared codes or signed links.

- New role **`FRONT_OF_HOUSE`**, declared in `shared/utils/appManifest.ts` beside the existing
  three and synced to the auth service from there (stage-door ADR-0018 and ADR-0024: role
  definitions come only from manifests). It carries a narrower *permission set* than `BOX_OFFICE`
  rather than sitting on a tier below it: this app has no ability tiers, only dotted permission
  keys mapped to roles ([04-auth-and-permissions](./04-auth-and-permissions.md)). It may read
  tonight's collection states,
  party sizes, first names, pass redemption states; may write incident-log entries and backstage
  messages; may **not** see prices, emails, or take money. The role is *scoped by the rota*
  (12-access-and-staffing §3.4): a confirmed shift on tonight's performance is what lights the
  screen up: holding the role while not rostered shows nothing. Enforce this server-side, not in
  the UI. `BOX_OFFICE`+ bypasses the rota scope as now.
- The volunteer-account friction is real but the auth service plan already points at the answer:
  passwordless email-code login (auth backlog R3) makes "give the door volunteer an account" a
  two-minute job, and Workspace group → role sync could later make it zero. Named per-person
  accounts are the goal: the rota, incident log and redemption ledger are only as good as knowing
  who acted, and the rota's self-service claiming assumes them anyway.

The role is held; the rota scopes it. That split, and why the rota rather than the role is the
real boundary on a show night, is
[ADR-0019](./decisions/0019-the-rota-scopes-the-front-of-house-role.md).

Every write from this screen (collection, pass admission, incident entry, backstage message)
records the acting user: this screen must not become the anonymous back door into the box office.

The backstage page is the deliberate exception to accounts-everywhere: it authenticates by
per-night code (§5.1), which is acceptable precisely because its ability surface contains nothing
the account model exists to protect.

## 5. The backstage side

Backstage crew (stage manager, DSM, operators) changes per production and is deliberately
outside the FOH rota (12-access-and-staffing §3.3): productions staff themselves. So the
backstage page gets its own access model, sized to what it protects, which, by design, is
almost nothing (§5.2).

### 5.1 Access: a per-night code, and nothing else

**Decision (August 2026, second revision: supersedes the earlier device-account design):
backstage authentication is code-only**
([ADR-0020](./decisions/0020-backstage-joins-by-a-nightly-code.md)). No accounts, no device
account, no roles. Each
performance day the system auto-generates a backstage code; any device visiting `/backstage`
joins by typing it or scanning its QR. The reasons over a device account: there is no credential
to manage, rotate at handover, or lose; nothing is ever "signed out at the worst moment": any
browser in the building becomes the backstage board in ten seconds flat; and the crew, who by
design have no Proscenium accounts, need nothing they don't already have.

Mechanics:

- **Generation:** one code per performance day, created automatically with the day's first
  performance: no one has to remember to enable anything. Six digits, displayed grouped
  (`482 913`); digits rather than letters so it cannot be mistaken for a booking ref and is
  easy to read aloud over a headset.
- **Where it lives:** inside the FOH screen's Backstage view only (§2.4): visible to rostered
  staff and `BOX_OFFICE`+, shown as text and as a QR that encodes a join link. It is never
  emailed, never printed by the system, and should not be written on anything that leaves the
  building. The DM gives it to the SM at the half; that handover *is* the authentication.
- **Joining:** entering the code (or scanning the QR) prompts for a name ("Sam: DSM",
  skippable) and mints a session token scoped to this performance day and the §5.2–5.3 ability
  set. The code itself is never stored on the device; the QR join link dies with the nightly
  rotation, so a stale link in someone's browser history is inert.
- **Expiry:** all code sessions die when the night is closed (§2.2) or at a hard cut-off
  (02:00), whichever comes first. Tomorrow is a new code.

**Security model.** The threat here is not data theft: the page holds no personal data and no
money (§5.2). The real threat is **message integrity**: a spoofed *"cleared for house open"* or a
prank *"hold"* is an operational safety problem. Guarantees, in order of importance:

1. **Rotation is the foundation.** A new code every performance day means access is a perishable
   thing: yesterday's devices, yesterday's screenshots of the code, and yesterday's QR links are
   all dead. Nothing accumulates.
2. **Rate-limited joining.** Code entry is throttled per IP/device (a few attempts a minute, with
   backoff), and after a threshold of failed attempts across all devices the code regenerates
   itself and the FOH screen says so. A six-digit space against a single-digit attempt budget is
   not guessable; the regeneration rule means even a distributed guesser achieves only a code
   reset, never a join.
3. **Joined devices are visible.** The FOH Backstage view lists every joined device: name given,
   join time, last seen. The DM counting "two devices, desk and Sam" and seeing a third is the
   detection mechanism, and it needs no technology beyond showing the list. This is the control
   that makes a shared code honest.
4. **The kill switch.** One tap (**reset code**) bumps the performance's session epoch: every
   joined device is out instantly and a new code appears. Use it when a device is lost, a message
   looks wrong, or the count is off. A reset drops a line into the incident log and notifies
   `boxoffice@`, so it is audited and free to use liberally.
5. **Least ability, enforced server-side.** A code session can do exactly three things (§5.3) and
   read exactly four (§5.2), for today only. The server enforces this against the session type;
   the worst a hostile join achieves is a false message, which acks, visibility (3) and the kill
   switch (4) exist to catch: never data access.
6. **No secrets in transit or at rest beyond the night.** HTTPS throughout (Workers' default);
   code entry over POST, never in a URL except the QR join link, which rotation neuters.

   **The code is not stored at all**: not in the clear, and not hashed. An earlier draft of this
   section said "stored hashed server-side like any credential", which cannot work: the
   front-of-house screen has to *display* the code for the duty manager to read out, and a hash
   cannot be displayed. Storing it reversibly to solve that would put tonight's code in the
   database in recoverable form, which is what hashing was meant to avoid.

   Instead it is **derived**: six digits from an HMAC over the night and the epoch, keyed on a
   worker secret. The database holds the night and the epoch and nothing else, so a dump reveals
   nothing without the secret; the screen recomputes it to display; joining recomputes it to
   compare, in constant time. Resetting bumps the epoch, which changes the derived code and
   invalidates every session in the same write.
7. **Emergency information needs no code.** `/backstage` before joining shows one thing besides
   the code prompt: the Emergency button (§2.5, same cached content). Safety information is never
   behind a lock.

**Attribution** is social, not authenticated: the name typed at join rides on every message from
that device, alongside its device label. Good enough for "who called standby", which is all it
needs to answer. If a production abuses the free-text channel, that is a conversation with the
production, not a feature.

**Rejected designs**, so successors don't re-litigate: a *dedicated device account* (first
revision of this section): superseded because it is a standing credential to manage and hand
over, and a signed-out resident device is exactly the failure the code model cannot have; a
*standing code*: never rotates, so it becomes graffiti in the tech box within a term; *per-run
personal grants* to crew accounts: requires the accounts this decision exists to avoid.

### 5.2 What backstage can see

The page renders **zero personal data, ever**: it is a shared screen in a busy corridor-adjacent
room, and people who are not staff will see it. The full list:

- **The board:** current preset in each direction with its ack state, large; message history
  below; a clock and time to the advertised start.
- **House count:** admitted so far against expected: a single pair of numbers. No names, no
  money, no breakdown. This is the one piece of box office data that crosses the boundary,
  because "can we start" is backstage's decision and this number is that decision's input.
  **The pair is one performance's, never the day's.** On a double-bill day a matinee's hundred
  admissions added to the evening's would read as a house nearly in, and the DSM would start on
  five people. The performance the board is for is the last one whose doors have opened, falling
  back to the next one still to start, falling back to the day's last once all have started.
  Performances at somebody else's venue are excluded, like everywhere else on the show night
  screen ([ADR-0029](./decisions/0029-external-is-a-venue-not-a-strand.md)).
- **Show basics:** title, advertised time, interval structure: from the public show record, for
  the same performance the house count is for.
- **Emergency:** the same cached content as §2.5, one tap away, and available even before a
  code is entered (§5.1 point 7).

Not present, and enforced server-side against the code-session type rather than by the UI: the
scanner, reservations, names, takings, access needs, the incident log, the rota, and anything
belonging to a performance other than today's.

### 5.3 What backstage can do

Three verbs, and no more:

- **Acknowledge** an incoming FOH message (one tap on its banner).
- **Send a preset:** *cleared for house open · standby · we need N more minutes · ready*
  (admin-configurable, per §2.4).
- **Send free text.**

No admissions, no bookings, no edits to anything. If the backstage page ever needs a fourth verb,
that is a design conversation, not a ticket.

### 5.4 Display behaviour

- An incoming FOH message takes the full width with a chime, and stays prominent until acked.
- **Performance mode:** once *show start* is acknowledged, the display dims and silences:
  messages arrive visibly but without sound, because a chime during a quiet scene is worse than a
  missed message. Interval presets restore normal mode. Configurable, but this is the default.
- Polling per §2.4; if the connection is lost for more than ~30 seconds the board shows a clear
  *"stale since HH:MM"* banner. A comms board that is silently frozen is worse than no board.

### 5.5 The timing record

Preset transitions are timestamped, which yields the theatre's first curtain-up data for free:
clearance given, house open, show start, interval, restart, end. These milestones land in the
end-of-night report (12-access-and-staffing §4.3). Free-text messages are chatter, not record:
retained 30 days (long enough to settle "who called clearance" disputes), then deleted. The
Workspace & Data Retention Policy lives in stage-door (`docs/gdpr-retention.md`), so this line and
the access-profile entry (12-access-and-staffing §2.5) are a **cross-repo prerequisite**, tracked
as an issue there rather than assumed.

## 6. Build order

Each stage is independently shippable (the cross-system order lives in
12-access-and-staffing §5; this is the screen's own sequence):

1. **The shell + scanner**: `/foh` route, `FRONT_OF_HOUSE` role, QR in confirmation emails,
   `/t/<ref>` redirect, role-aware scan result. This is the core value and touches the most
   existing code; do it first and alone.
2. **Tonight at a glance**: the numbers and show info card first; pass pressure lands with the
   passes build; Access tonight and Close the night land with 12-access-and-staffing.
3. **Emergency + contacts/incidents**: static content plus one small append-only table. Could
   equally go first; it has no dependencies at all.
4. **Backstage comms**: the only genuinely new machinery: the polling endpoint, the backstage
   page (§5), the nightly code with its joining, rotation, device list and kill switch, and
   performance mode.
5. **Pass admit**: lands whenever the passes design is implemented; the button can ship disabled
   with "passes coming 26/27" before that.

## 7. Open questions

- Show info card fields (running time, warnings, latecomer policy): which already exist on the
  show record and which need adding to the admin form: audit against
  [03-domain-model](./03-domain-model.md) before build.
- Backstage preset list: agree the starting set with a stage manager or two before hard-coding
  the defaults.
- Whether the resident backstage device should re-join automatically on the same local network:
  convenience against the rotation principle; default to no and see whether nightly code entry
  actually grates.

Formerly open, now settled: the door never sells (v1 and beyond, direct to the bar); backstage
authentication is per-night code only (no accounts, no device account, no per-run grants) with
rotation, rate limiting, a visible device list and a kill switch as the security model (§5.1);
the backstage display is a resident device (tablet or tech desk Mac); the end-of-night report
exists and is specified, with the incident log and curtain timings feeding it; access needs are a
full account-level system, specified in 12-access-and-staffing.
