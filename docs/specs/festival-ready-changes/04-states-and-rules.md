# 3. States and rules

Each rule is a predicate on the write that it guards, never a read made first, as Foundations requires. Rule ids are local to this amendment and become the amended spec's numbering when merged.

## Collections

| From | To | Action | Guard |
| --- | --- | --- | --- |
| (none) | draft | Create | `core.collection.manage`. Name unique ignoring case; colour passes contrast |
| draft | published | Publish | Has at least one production. Its public page appears; its chip appears on member productions that are themselves published |
| published | draft | Unpublish | Allowed while no member production is published; otherwise archive |
| draft, published | archived | Archive | Page answers "This collection has ended" with its past productions if past shows are public, else not found |
| archived | published | Restore | As publish |
| draft | (gone) | Delete | Only a draft. Memberships go with it |

[Diagram in the Claude Doc: Collection lifecycle · 4 states]

The chart shows the moves in the table above; the guards on each move are in the table.

- **CL1.** A production joins a season-bound collection only if it is in that season (statement predicate). Moving a production to another season is refused while it is in a season-bound collection of the old season, with the remedy "Remove it from StageFest first".
- **CL2.** A production may be in any number of collections; a collection page lists members in `sort` order, current first, past after.
- **CL3.** Only published productions show on a collection's public page; the count shown to staff includes drafts.
- **CL4.** Duplicating a production copies its standing (season-free) collections, not season-bound ones.

## Drop-in performances

- **DI1.** `shape` is chosen when a performance is made and can be changed only while it is a draft.
- **DI2.** A drop-in performance has `doors_at` null and no intervals; its open-until is after its open-from, and it lies within one operating day (04:00 to 04:00, ruling 0014). A festival day's exhibition is one drop-in per day; a run makes one per day.
- **DI3.** The exclusive-space guard treats a drop-in like any performance for its whole opening hours. A gallery that shares a room with a performance is modelled as a non-exclusive space, as today.
- **DI4.** Everything keyed to a performance works unchanged: Box office may sell or reserve timed-entry tickets for it, Front of house may rota it, the door counts it. What changes is wording: public pages say "Open 10:00 to 17:00", never "Starts 10:00"; booking emails say "Come any time between".
- **DI5.** The calendar feed (C-44) writes a drop-in as an event spanning its hours, marked transparent so it does not block a subscriber's diary.
- **DI6.** `listing-grace` does not apply to a drop-in: it stays on what's on until it closes.

## Line-ups and credits for one performance

- **LU1.** An item's `starts_at`, when set, lies within its performance's start and end (predicate on the write). Moving the performance moves every item's time by the same amount in the same unit.
- **LU2.** A production appears at most once in one performance's line-up. A production may appear in many line-ups.
- **LU3.** An item linked to a production shows on that production's page as "Also appearing in: Dance Showcase, Saturday 14:00", once both are published. An item not `announced` shows nowhere public, and its linked production's page does not mention it.
- **LU4.** A per-performance credit belongs to a performance of the credit's own production (predicate). A credit with `line_up_id` has the item's performance (predicate). A person may hide their own credit, as today; the rule covers both new kinds.
- **LU5.** Cancelling a performance keeps its line-up and credits for the record. Deleting a draft deletes them.
- **LU6.** `core.production-team` is held through any credit, production-wide or for one performance, for the existing period after the production's last performance.

## Video link

- **VL1.** `video_kind` is required with `video_url`; the address is `https://` and at most 500 characters, and it must parse to a video on a host switched on in core.video.player-hosts: YouTube (played from youtube-nocookie.com), Vimeo (played with do-not-track) or Cloudflare Stream. Any other address is refused with "Use a YouTube, Vimeo or Cloudflare Stream address". The player address is built from the parsed id, never from the stored text. The player also accepts { host: 'stream', signedToken } from a module that mints a per-viewer token (Training's private videos); such tokens are never stored or parsed. While a Stream account is configured, Stream counts as switched on, so its player origin joins the frame list under VL5.
- **VL2.** A live link is shown from doors (or open-from) until the end; a recording from the end onwards. Before then, staff see it and the public does not.
- **VL3.** The page shows an embedded player (Matt's answer to question 4, 24 November 2026), in a sandboxed frame (scripts, same origin, presentation, pop-ups only) with a strict-origin referrer policy, titled "Video: \<production>, \<date>". It never autoplays. A "Watch on \<host>" link sits beneath it always, so the video is reachable without the frame. A cancelled performance shows neither.
- **VL4.** Nothing is requested from the host until the person presses Play on a notice naming the host and saying it may set cookies. The notice is a keyboard-reachable button over a plain poster served by us. Ticking "Remember for \<host>" keeps the choice in that browser only; it is the person's own setting, not consent the theatre stores.
- **VL5.** A page that shows a player adds only the switched-on hosts' player origins to its content-security frame list; pages without a player add none. No script is ever loaded from a host into the page itself.

## Programme import

| From | To | Action | Guard |
| --- | --- | --- | --- |
| (none) | previewed | Upload a file or give a pretalx address | `core.programme.import`. File at most 2 MB, at most 2,000 rows or sessions |
| previewed | previewed | Change the mapping | Every source room must map to an active, performable space, or to "skip" |
| previewed | applying | Apply | Nothing refused that is not marked skip; the person confirms the counts |
| applying | applied | Last chunk done | Each chunk is one unit; a repeated chunk does nothing (`external_ref` unique) |
| applying | failed | A chunk refused | Chunks already applied stay; the import page shows where it stopped and offers Undo |
| applied, failed | undoing | Undo | Only while no performance it made has a ticket sold, a shift taken or a scan; otherwise the refusal lists them |
| undoing | undone | Last chunk done | Deletes the draft performances and productions it made; restores nothing it updated (an update is shown, not undone) |

[Diagram in the Claude Doc: Programme import lifecycle · 6 states]

A failed import keeps the chunks already applied and can still be undone under the same guard.

- **IM1.** Everything imported arrives as draft. Publishing is a separate act, by the people who publish today.
- **IM2.** A row whose `external_ref` already exists updates that record's title, times, space and description, and nothing else; a person's later edits to other fields stand.
- **IM3.** The exclusive-space and closure guards apply to drafts only when they are scheduled, as everywhere else; the preview warns of clashes it can see so the person can fix the file first.
- **IM4.** Times in the file are read in the theatre's time zone; a pretalx time with an offset is converted. A time that does not exist (the spring clock change) is refused by row.
- **IM5.** A pretalx address is fetched once, by the server, over HTTPS, with no credentials; private or local addresses are refused, as webhooks' are.

## Marking and automatic transitions (forms)

- **MK1.** Marking happens on the server at submission, from the stored answers and the answered version's key, in the same unit as the response. The browser never decides a score.
- **MK2.** A question with `answer` is marked right only if the answer matches exactly: every correct option and no other (choice, multiple), the value (yes or no), within the range inclusive (number), or one of the accepted texts (short text). There is no part credit.
- **MK3.** A question hidden by a condition is not marked and its points leave `out_of` for that response.
- **MK4.** What the person is shown after sending follows `marking.show`. Correct answers are shown only with `score-feedback-and-answers`.
- **MK5.** Editing a sent response (where the placement allows) marks it again and records the new score; the earlier score is in the revision history.
- **AT1.** A transition with `who: 'system'` has a `when` condition and no mover can take it by hand.
- **AT2.** After a response arrives in a stage (on submission, or after any move), the system takes the first system transition from that stage, in definition order, whose condition holds. It runs in the same unit as the move that caused it, writes a stage history row with no actor, and runs the transition's actions as any move does.
- **AT3.** A chain of system moves stops after five in one unit; the fifth is recorded and the form's health check warns of a loop. The builder refuses to publish a version where system transitions form a cycle it can see.
- **AT4.** A system move to an approved or declined stage needs no reason; the stage history records that the system made it.

[Diagram in the Claude Doc: System transitions (AT2, AT3) · 2 decisions]

Every move in the chart runs in the same unit of work as the move that caused it (AT2).

## Crew calls, sign-up questions and handouts

| From | To | Action | Guard |
| --- | --- | --- | --- |
| (none) | draft | Create | `front-of-house.crew-call.manage` |
| draft | open | Open | The form, if any, is published |
| open | closed | Close | Sign-up to the call's shifts follows the shifts' own rules; the questions stop taking answers |
| closed | archived | Archive | After `ends_on` |

[Diagram in the Claude Doc: Crew call lifecycle · 4 states]

The chart shows the moves in the table above; sign-up and perks rules follow.

- **CC1.** When a call has questions, signing up to any of its shifts is refused until the person has sent their answers, with the remedy "Answer the crew questions first" and a link. A manager assigning someone is warned, not refused.
- **CC2.** One response per person per call (the placement is one each). A person may change their answers until the call closes.
- **CC3.** A T-shirt is earned at `tshirt_min_shifts` completed or confirmed assignments in the call; a meal on a day when the person's assignments that day total `meal_min_minutes` and, with `meals_on_request`, they asked for that day.
- **CC4.** Counts are worked out when asked, from assignments and answers, never stored. A handout is a fact stored; an earned perk is not.
- **HO1.** A handout is recorded once per call, person, item and day; a second is refused with "Already handed out by Sam at 14:02". Undo writes a reversing row.
- **HO2.** A handout may be recorded for someone who has not yet earned it, with a warning; the count shows them separately.

## Shadowed shifts

- **SH1.** An assignment is marked `shadowing` at sign-up, when the duty has requirements the person does not yet meet and a shadow place is free (shadow places are extra to the shift's places, at most one per shift by default), or by a manager.
- **SH2.** Only the shift's lead, or a manager, confirms shadowing, after the person is checked in and before the night report is signed. Nobody confirms their own.
- **SH3.** A confirmation announces `front-of-house.shadow.confirmed`; Training decides what it is worth.

[Diagram in the Claude Doc: Shadowed shift (SH1 to SH3) · 4 steps]

## Door headcount

- **HC1.** The counter is offered on the door screen for any performance; for one with nothing on sale it is the whole door.
- **HC2.** A tap's id is made on the device; a tap received twice is stored once. Taps made offline are sent when the device reconnects, in order.
- **HC3.** `out` taps are offered only for drop-in performances, or when the setting `box-office.door.count-out` is on.
- **HC4.** Inside is shown against the performance's capacity (core's `capacityOf`). At or over capacity the counter turns to a warning colour and says "Full: 120 of 120"; it never refuses a tap, because people are physically there.
- **HC5.** Undo reverses the device's most recent tap that is not already reversed, within `box-office.door.undo-within`. Older corrections are a supervisor's, with a reason.

## Microsoft and general OpenID Connect sign-in

- **MS1.** A Microsoft identity is keyed by provider `microsoft` and subject `<tid>:<oid>`: the tenant and object ids, which Microsoft documents as immutable, so the key never changes if the app registration does.
- **MS2.** The token's issuer must be `https://login.microsoftonline.com/<tid>/v2.0` for the `tid` in the token, and the `tid` must be in `core.sign-in.microsoft-tenants` when that list is not empty. A personal Microsoft account (the consumer tenant) is refused unless the theatre allows it.
- **MS3.** Microsoft's `email` claim is not proof of an address. A Microsoft sign-in links to an existing account by address only when the optional claim `xms_edov` is true and the address's domain is in `core.sign-in.microsoft-domains`; otherwise the person proves the address by email code first, as an unverified address does today.
- **MS4.** Managed domains: each managed domain names one provider, and an address in it signs in only through that provider. A domain named for two providers is refused by the settings rule.
- **MS5.** A general OpenID Connect provider is configured by its issuer's discovery address; core fetches the discovery document when the administrator saves it, shows the issuer and endpoints found, and refuses an issuer that is not HTTPS or lacks `openid` and `email` scopes. Its identities are keyed by issuer and `sub`.

[Diagram in the Claude Doc: Microsoft sign-in (MS1 to MS3) · 3 decisions]

A general OpenID Connect provider follows the same path, keyed by issuer and subject (MS5).

## Calendar feed

- **CF1.** Each account has one feed token. Only a keyed hash of it is stored; Reset raises the generation, so the old address stops working at once. The address shows only the holder's own events.
- **CF2.** The feed address needs no sign-in, answers private and no-store, and is rate limited like other token addresses. An unknown or reset token answers not found, never an empty calendar.
- **CF3.** Every UID ends in the site marker: the site's host when the feed is first served, kept in core's configuration so a later change of domain does not change any UID. Availability drops imported events whose UID ends in it.
- **CF4.** Titles and locations are public-safe: a duty, call or meeting name and a venue, never another person's name, a reason, a note or anything classed personal.
- **CF5.** Front of house's front\_of\_house\_calendar\_feeds rows are copied into the module's table by migration with their hash and generation, and the old address answers with the merged feed, so nobody has to resubscribe.
- **CF6.** Erasing an account deletes its feed row in the same transaction. A contributor that is off, or that fails, adds nothing; the rest of the feed is served and the failure is logged.
