# 8. Test plan

Fifty-eight named cases that must never regress, by area. Unit cases test pure functions (dates, derived states); integration cases run against D1 through the kit's harness with the settable clock; browser cases use Playwright on CI. Tests run on CI only, as the repository requires.

## Terms and seats

| Case | Level | What it proves |
| --- | --- | --- |
| `seats-never-exceeded-under-race` | Integration | Two term inserts for the last seat at once: one succeeds, one is refused naming the holder (T1) |
| `acting-holder-takes-a-seat` | Integration | An acting term on a full post is refused |
| `merged-holder-counts-once` | Integration | Two overlapping terms of the same post by two accounts later merged count as one seat |
| `no-self-recorded-term` | Integration | Recording, ending or extending one's own term is refused; an Owner succeeds (T3) |
| `requirement-checked-at-recording` | Integration | A non-member is refused a post that requires membership, with Membership's reason (T2) |
| `year-end-term-dates` | Unit | A `year_end` term started on 1 August ends on the next 31 July; one started on 31 July ends that day; 29 February never appears |
| `year-end-unset-refuses` | Integration | A `year_end` post refuses a term while `core.organisation.year-end` is unset |
| `recorded-in-error-never-in-office` | Integration | Its facts never held; history views omit it |
| `resignation-only-forwards` | Integration | A holder cannot resign with a past date (T6) |
| `vacancy-announced-once` | Integration | Ending one of two seats early announces `governance.post.vacant` once with vacancies 1; the year end announces nothing |

## Facts and authority

| Case | Level | What it proves |
| --- | --- | --- |
| `office-starts-at-local-midnight` | Integration | An ability mapped to `post-holder` works from 00:00 London on `starts_on`, in GMT and BST |
| `office-ends-at-local-midnight` | Integration | It stops at the end of the last day, across the October clock change |
| `early-end-removes-authority-next-request` | Integration | No grant is written or ended; the next request is refused |
| `pinned-fact-only-for-that-post` | Integration | A mapping pinned to Treasurer grants nothing to the Secretary |
| `member-of-holders-by-subquery` | Integration | The holders answer for a body with 120 posts binds no list of ids (chunk-of-90 rule) |
| `handing-over-ends-after-grace` | Integration | The outgoing holder reads the pack until grace ends, then is refused |

## Public page

| Case | Level | What it proves |
| --- | --- | --- |
| `name-hidden-without-consent` | Integration | With listing default `ask` and no agreement, the page shows the post name, never the holder |
| `withdrawal-shows-next-render` | Integration | Withdrawing consent hides the name on the next request, with no deploy |
| `stale-notice-after-grace` | Unit | The notice appears from year end plus grace until a term starting in the new year exists; not before |
| `unknown-post-key-fails-ci` | Unit | The content check refuses `:post{key="nope"}` |
| `role-address-never-personal` | Unit | The post form refuses an address that equals any holder's sign-in address |

## Handover

| Case | Level | What it proves |
| --- | --- | --- |
| `pack-opens-once-per-post-year` | Integration | Two task runs open one pack (unique key) |
| `sections-frozen-when-ready` | Integration | A contributor's figures change after ready; the pack still shows the frozen ones with their time |
| `failing-section-does-not-block` | Integration | A section that throws is stored as not available and the pack becomes ready |
| `only-incoming-holder-receives` | Integration | Anyone else marking received is refused (H4) |
| `task-readies-at-grace-end` | Integration | An open pack becomes ready when grace ends |
| `sections-hold-no-person` | Unit | A contributed block carrying an account id or email is rejected by the contract check |

## Documents

| Case | Level | What it proves |
| --- | --- | --- |
| `version-numbers-without-gaps` | Integration | Two uploads at once produce 1 and 2, never 2 and 2 |
| `new-version-keeps-previous-current` | Integration | An unsigned version 2 leaves version 1 current and the document not draft |
| `only-latest-version-signed` | Integration | Approving version 1 after version 2 exists is refused |
| `separate-signer` | Integration | With `separateSigner`, the uploader cannot approve; an Owner can |
| `review-date-from-sign-off` | Unit | Next review is sign-off date plus the period, in London dates |
| `lapse-is-derived-and-announced-once` | Integration | The day after the review date the state reads lapsed with nothing written; the task announces once |
| `readiness-line-false-when-lapsed` | Integration | The `core.record-check` line for a required kind turns not done when the document lapses or retires |
| `kind-from-switched-off-module-hidden` | Integration | Its documents stay, readable by managers, absent from tabs and readiness |
| `public-needs-publish-and-fresh` | Integration | Making a document public without a fresh sign-in is refused; with one, the file's access becomes public in the same batch |

## Feedback and privacy

| Case | Level | What it proves |
| --- | --- | --- |
| `feedback-drops-query-string` | Unit | `/console/orders?email=a@b` is stored as `/console/orders` |
| `feedback-rate-limited` | Integration | The eleventh report in a day is refused with the reset time |
| `triage-conditional` | Integration | Two triagers acting at once: the second is told it moved |
| `feedback-event-has-no-words` | Unit | The `governance.feedback.received` payload has no body, user agent or account |

Erasure of a holder (listing anonymised, bio redacted, photo deleted, notes redacted, feedback redacted, terms and sign-offs kept) is covered by the kit's generated erasure test from the column declarations, with one Governance case added: `erased-holder-still-fills-seat` (an erased holder's current term still counts toward seats and the page shows the post name).

## Reporting upstream (GV-30)

| Case | Level | What it proves |
| --- | --- | --- |
| `upstream-off-sends-nothing` | Integration | With the setting off (the default), a bug report queues nothing and the tick box is not offered |
| `upstream-payload-has-no-person` | Unit | The upstream body has no account, name, email, organisation name, user agent string beyond browser family, ids in paths or query strings; route patterns replace concrete paths |
| `upstream-words-only-when-ticked` | Unit | The words are in the body only when the reporter ticked; an idea is never sent |
| `upstream-failure-is-local-only` | Integration | Three failed posts leave the report `failed` and its local state and triage untouched |

## Meetings and actions

| Case | Level | What it proves |
| --- | --- | --- |
| `meeting-expected-fixed-at-send` | Integration | Expected attendees are the body's holders when the agenda is sent, by subquery; a term starting later is not added |
| `meeting-late-agenda-needs-reason` | Integration | Sending inside `agenda-notice` without a reason is refused inline; with one it sends and shows the reason |
| `meeting-change-tells-once` | Integration | Moving a sent meeting tells each recipient once with the change |
| `meeting-apologies-close-at-start` | Integration | Apologies one second after the start are refused, across both clock changes |
| `meeting-quorum-distinct` | Unit | Quorum counts distinct present holders; a merged account counts once; guests never count |
| `meeting-held-creates-minutes` | Integration | Marking held creates one `governance.minutes` document owned by the minutes post, or the marker when none is set |
| `minutes-approval-moves-meeting` | Integration | Signing off the minutes moves the meeting to minutes approved in the same batch; a second sign-off of the same version is refused |
| `meeting-cancel-clears-busy` | Integration | Cancelling removes every `core.person-busy` row with source `governance` and this meeting's id as reference in the same batch; a held meeting cannot be cancelled |
| `meeting-reserved-hidden` | Integration | A reserved item is absent from the agenda sent to a non-member and from public minutes, present for members |
| `action-close-conditional` | Integration | Two people closing one action at once leave one result; the second is told it moved |
| `action-follows-post` | Integration | A post-owned action shows for the new holder the day their term starts and not for the old |
| `action-reminder-once` | Integration | The reminder is sent once at `actions.reminder` before the due date, using the settable clock |
| `action-orphan-flagged` | Integration | A person-owned action whose owner leaves every post of the body shows "Needs a new owner" and is not moved |

A journey for meetings runs on CI: a manager creates a meeting from Find a time, sends the agenda, a holder sends apologies, the manager records attendance and marks it held, an action is raised, and the minutes are approved at the next meeting.

## Journeys in the browser

- Set up a committee of three posts, record terms, see the public page with one name hidden.
- Treasurer's handover: open, write a note, tick, mark ready; incoming holder receives.
- Upload a policy, sign it off, move the clock past the review date, see it lapse and the home card appear.
- Send feedback from a live screen on a phone viewport without leaving it.

## Not tested here

Identity's resolution of pinned facts (Identity's tests), Elections' counting (Elections'), Reports' figures inside a section (Reports'), Communications' delivery.
