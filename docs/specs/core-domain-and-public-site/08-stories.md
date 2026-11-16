# 7. Stories

## How to read this part

Each story has an id, who it is for, and acceptance criteria that a test can check. **First** means the first release of this workstream's subject, which is roadmap phase 2: "a theatre publishes a season and a what's-on page". **Later** means after it. The person named in a story describes who does the job and is not a preset role: part 6 maps every ability onto the identity specification's presets.

52 stories: 44 first, 8 later. Seven were added at the end after Matt's decisions.

## Programme

| Id | Story | Acceptance criteria | Release |
| --- | --- | --- | --- |
| C-01 | As a programme manager I create a production as a draft. | A title alone is enough to save. The slug is made from the title and can be changed. A second production cannot take a slug that is or ever was in use. The draft appears on no public route. | First |
| C-02 | As a programme manager I publish a production. | Publishing is refused, naming what is missing, without a summary, a category, or advisories either listed or confirmed as none. Once published, its page answers at `/whats-on/<slug>` within a minute. | First |
| C-03 | As a programme manager I add one performance. | Start, end, venue and space are required. The end time and doors time start from the settings. A space outside the venue is refused. The performance starts as a draft and is not public. | First |
| C-04 | As a programme manager I add a run of performances in one go. | Given first date, last date, days and times, the dialog lists every performance it would create, marks any that clash or fall in a closure, and saves the rest. A run within the kit's limit on rows in one unit (core.units.set-rows-limit, 500 as shipped) is saved whole or not at all (part 4, fan-out). A longer run is created by a job in chunks, each safe to repeat, with progress shown. If the job stops part way, the dialog says how many were created and offers to finish or to remove them. | First |
| C-05 | As a programme manager I schedule a performance so the public can see it. | Refused if it overlaps another scheduled performance in an exclusive space, or falls in a blocking closure, each with the reason. Two people scheduling clashing performances at the same moment: exactly one succeeds. | First |
| C-06 | As a theatre manager I cancel a performance. | I must pick a reason. I see every module's impact line before confirming. A module's refusal stops the cancel and shows its reason, with a link to that module's own screen where it gives one. The public page shows it as cancelled within a minute. `core.performance.cancelled` is announced once. | First |
| C-07 | As a programme manager I reschedule or move a performance. | The same guards as scheduling apply to the new time or place. The event carries the old and new values. The operating day is recalculated. | First |
| C-08 | As a programme manager I change a production's slug. | The new address works. The old address redirects permanently to it, and still does after a second change. | First |
| C-09 | As a programme manager I enter credits. | A credit has a section, a role and a printed name, and may link to an account. Credits can be reordered within a section. A credit hidden from the public does not appear on any public route or in the open data. A person can hide their own linked credit from their account area, with no ability needed. | First |
| C-10 | As a programme manager I record advisories and access features. | Advisories come from the vocabulary, with an optional note each. Access features are set for each performance. Both show on the production page. With the collapse setting on, advisories are hidden until asked for. | First |
| C-11 | As a programme manager I group productions into a season. | A season has a name, a slug and dates, and may be one day long. A production belongs to at most one. An archived season is in the archive and off what's on. | First |
| C-12 | As the system I mark a performance completed. | Within ten minutes of its end, a scheduled performance becomes completed and announces its event once, even if the task runs twice. | First |
| C-13 | As a programme manager I see everything on a calendar. | Month, week and day views show performances and closures for a chosen venue or space, in the theatre's time zone. A performance at 00:30 sits with the evening before in the day view. | First |
| C-14 | As a programme manager I duplicate a production as a starting point. | The copy is a draft with details, credits and advisories copied, and no performances or files. | Later |
| C-15 | As a programme manager I write a production's text in more than one language. | Each public text field holds a version for each enabled language, and the page shows the visitor's. | Later |

## Places

| Id | Story | Acceptance criteria | Release |
| --- | --- | --- | --- |
| C-16 | As a theatre manager I add a venue. | Saving a venue creates one space of the same name. A venue the theatre does not manage is marked as such and still takes performances. | First |
| C-17 | As a theatre manager I add spaces to a venue. | A space has a kind, a capacity that may be empty, and flags for performable and exclusive. The last space of a venue cannot be deleted. | First |
| C-18 | As a theatre manager I record a closure. | A closure covers the theatre, a venue or a space, for a period. A blocking closure refuses a performance scheduled inside it. Existing performances inside a new closure are listed as a warning and not changed. | First |
| C-19 | As the system I import public holidays. | Holidays for the theatre's country appear on the calendar. Running the import twice creates nothing twice. A holiday warns and does not block. | Later |

## Vocabularies

| Id | Story | Acceptance criteria | Release |
| --- | --- | --- | --- |
| C-20 | As an administrator I edit a vocabulary. | I can add, rename and reorder terms. Two live terms in one vocabulary cannot share a label, ignoring case. A locked vocabulary lets me rename and reorder only. | First |
| C-21 | As an administrator I retire a term without breaking old records. | A retired term is absent from every picker. A record that used it still shows its label. A term in use cannot be deleted; a term never used can. | First |
| C-22 | As an administrator I merge two terms. | After merging A into B, A is retired, records that used A are unchanged, and a report by term counts them under B. | Later |

## Files

| Id | Story | Acceptance criteria | Release |
| --- | --- | --- | --- |
| C-23 | As a programme manager I upload a poster. | A file over the limit, or of a type the slot does not take, is refused with the reason. The type is judged from the bytes. The image is not public until it has been checked and cleaned. A public image cannot be published without alt text. | First |
| C-24 | As a programme manager I replace a poster. | The new poster shows everywhere within a minute. At no moment does the production have no poster. The old one can be restored for the retention period and is then gone from storage. | First |
| C-25 | As anyone I cannot reach a file I should not see. | A file with record access returns "not found" to someone the owning module refuses, and to someone signed out. Its address cannot be guessed from its name. A signed address stops working after its time. | First |
| C-26 | As an administrator I see what is stored. | The library lists every file with owner and size, and total storage used. Stored bytes with no row are found and removed within eight days. | Later |

## Notifications

| Id | Story | Acceptance criteria | Release |
| --- | --- | --- | --- |
| C-27 | As a module I send a message as part of my own save. | If my batch fails, no notification exists. If it succeeds, a delivery exists for each allowed channel. Calling twice with the same dedupe key sends once. One call costs the same few statements for any number of recipients up to the kit's limit on rows in one unit (core.units.set-rows-limit); more is refused, and the caller chunks. Phase 1 form, for the sign-in gate: one call that queues one transactional email to one explicit address through the mail binding, with the caller's template, no account lookup, preferences, side or suppression, no template data written to any log, and a failure reported back to the calling job so it can retry. In phase 2 the same call runs on the full pipeline, unchanged for the caller, as a transactional notification type. | First |
| C-28 | As a person I get the message even when something goes wrong. | A delivery whose queue message is lost is sent within fifteen minutes. A failing send is retried with growing waits up to the setting, then marked failed, shown on the health screen, and announced. A type declared as bulk is queued on the bulk lane, and a prompt message sent while a thousand bulk sends are waiting still goes within a minute. | First |
| C-29 | As a person I choose what I hear about. | Switching a topic's email off suppresses the next message of that topic and records why. A transactional message is sent regardless and has no switch. Preferences on the audience side and the members' side are separate. | First |
| C-30 | As a person I read my inbox. | The bell shows my unread count for the side I am on. Opening a message marks it read. A message links only inside the application. | First |
| C-31 | As marketing I reword a message. | I edit beside a preview using sample data and the brand. A variable the type does not declare is refused at save. Publishing makes a new version; the log still shows the old wording for old sends. I can go back to the shipped wording. | First |
| C-32 | As an administrator I choose who mail comes from. | Each topic can use a named sender. Nothing is sent until the sending domain is set and verified, and the health check says so. | First |
| C-33 | As a person I get a digest in place of many messages. | With a topic set to daily, its messages are held and arrive as one at the digest time in the theatre's time zone, each listed once. | Later |
| C-34 | As a person I get notifications on my phone's lock screen. | Web push as a third channel, through the channel point. | Later |

## Branding and organisation

| Id | Story | Acceptance criteria | Release |
| --- | --- | --- | --- |
| C-35 | As an administrator I set the theatre's look. | I pick one colour and see the application, an email and a ticket in light and dark before saving. Whatever colour I pick, text on it meets 4.5 to 1. Saving asks for a fresh passkey check. After saving, every shell, email and PDF uses it within a minute. | First |
| C-36 | As an administrator I upload a logo safely. | An SVG containing a script, an external reference or a DOCTYPE is cleaned or refused. A raster logo has its metadata removed. A separate logo for dark mode is optional. | First |
| C-37 | As an administrator I set the time zone and when the day rolls over. | Every time in the application shows in that zone. Changing either setting recalculates the operating day of every performance not yet completed, and says how many first. Both are foundations settings (core.locale.time-zone and core.locale.day-start), shown on core's organisation screen. | First |

## Public site

| Id | Story | Acceptance criteria | Release |
| --- | --- | --- | --- |
| C-38 | As a visitor I see what is on. | `/whats-on` lists published productions with a scheduled performance still to come, soonest first, and nothing in draft. It works with scripts off. It passes the accessibility checks. | First |
| C-39 | As a visitor I read about a production. | The page shows title, summary, poster, dates with venue and access features, advisories, credits, and a booking action for each date where one exists. It carries event data that search engines read, and a social card. | First |
| C-40 | As a theatre I write my own pages in my fork. | A markdown file in `site/content/` becomes a page. It can use the listed components. The public menu comes from the navigation file in the same folder, and a link to a missing page fails the check. Merging a new upstream release changes nothing in `site/`. | First |
| C-41 | As a theatre I quote a live policy number on a page. | `:setting{name="..."}` shows the current value and changes when the setting does. A name that does not exist or is not quotable fails the check before deploy. | First |
| C-42 | As a theatre I am told what is unfinished. | The readiness screen lists every placeholder page, missing brand item and image without alt text. Search engines are turned away until setup is complete. | First |
| C-43 | As a visitor I browse past seasons. | The archive lists past productions by year and finds them by title, company or credited name. A person whose credit is hidden cannot be found. | First |
| C-44 | As a visitor I subscribe to a calendar feed. | `/whats-on.ics` holds every scheduled performance with the right local time across a clock change, and marks cancelled ones as cancelled. | Later |
| C-45 | As a theatre moving from an old site I keep my old links working. | Each line of `redirects.yml` redirects permanently. A line pointing at a missing page fails the check. | First |

## Added after Matt's decisions of 16 November 2026

All six are for the first release. Where an earlier story names a production's address (C-02, C-08, C-39), read it by C-46 and C-47.

| Id | Story | Acceptance criteria | Release |
| --- | --- | --- | --- |
| C-46 | As a visitor I find a show at the right address. | A current production answers at `/whats-on/<slug>` and a past one at `/shows/<slug>`. The other address redirects, temporarily, to the right one. Each page names its real address in a canonical link. A production becomes past when its last performance ends, with nobody doing anything, and current again if a date is added. A cancelled production is past from the moment it is cancelled, and its page says cancelled. | First |
| C-47 | As a theatre I choose whether past shows are public. | With `public-site.archive.public` off, `/shows`, every past production under either address, archived season pages and the archive search return "not found", and past productions are absent from the open data and the sitemap. Current shows are unaffected. Turning it on restores everything. | First |
| C-48 | As a theatre manager I record what access a venue and its spaces have. | I pick features from a list, each with an optional note. A space shows its venue's features and its own. On the public venue page and beside each date, every feature shows as an icon with its label. A venue with none recorded shows nothing, and is listed on the site-readiness screen. | First |
| C-49 | As an administrator I add a webhook. | I give a name, an HTTPS address, a format and the events to send. An address on a private or local network, or a non-HTTPS one, is refused. For signed JSON the secret is shown once. The address is masked afterwards. "Send a test" delivers a marked test event and shows the receiver's status. | First |
| C-50 | As the receiver of a webhook I can trust what arrives. | Each signed delivery carries a time and a signature I can check with the secret, and an id that is the same on a retry. The body holds the event's name, time and ids and the record's public title, and no personal data. Only events not marked internal can be chosen. | First |
| C-51 | As an administrator I am told when a webhook stops working. | A failing delivery is retried with growing waits up to the setting. After the set number of failures in a row the webhook is paused, its managers get a message, and no more deliveries are attempted. I can read the log, retry a delivery, rotate the secret and resume. | First |

One more was added on 16 November 2026 at Matt's request, for the first release:

| Id | Story | Acceptance criteria | Release |
| --- | --- | --- | --- |
| C-52 | As an administrator I have the sending domain set up for me. | With the optional Cloudflare token present, "Set up automatically" creates the sending subdomain under the site's hostname, sets the sending domain, waits while Cloudflare reports it not ready, and verifies it, with no DNS typed by anyone. It asks for a fresh passkey check and is audited. Pressing it twice creates nothing twice. A sending domain already set is not replaced without confirmation. On a `workers.dev` address the button is replaced by an explanation. Without the token nothing changes and the manual route works. The token appears in no response, log or audit entry. | First |

That makes 52 stories: 44 first, 8 later.
