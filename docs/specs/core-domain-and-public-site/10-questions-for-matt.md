# 9. Questions for Matt

## Nine questions, all decided

**All nine were decided by Matt on 16 November 2026.** He accepted what was proposed on questions 1, 2, 3, 4, 5, 6 and 8, and the proposals at the foot of this tab. He decided differently on two: question 7 (two addresses, `/whats-on/<slug>` for current shows and `/shows/<slug>` for past ones) and question 9 (webhooks in the first release). He also asked for venue and space access features as a set list with icons, which is in part 2.

The options and reasoning are kept below as the record of why. In the table, the right-hand column is now the decision.

| # | Question | Decision |
| --- | --- | --- |
| 1 | Does core know whether a performance is on sale? | No. Box office does. |
| 2 | Can a production belong to more than one season? | No. One, or none. |
| 3 | How far does in-app branding go? | One colour, a grey tone, a heading font, corner roundness, logos. |
| 4 | Where do the public menu and footer links live? | In a file in the fork. |
| 5 | Are credits public, and what happens to them on erasure? | Public by default, the person may hide theirs, printed names stay on erasure unless they ask. |
| 6 | Is phone push in the first release? | No. Email and inbox first. |
| 7 | What is a production's permanent address? | `/whats-on/<slug>` while current, `/shows/<slug>` once past. |
| 8 | One language for production text at first? | Yes. |
| 9 | Do team alerts to Discord or a webhook belong in the first release? | Decided: webhooks are in the first release. |

## 1. Does core know whether a performance is on sale?

When this was asked, the paper's Part A gave a performance the states draft, on sale, cancelled, as Proscenium does. The paper has since been amended to match the decision. This specification gives it draft, scheduled, cancelled, completed, and leaves "on sale" to Box office.

| Option | What it means | For | Against |
| --- | --- | --- | --- |
| **A. Sale state is Box office's (recommended)** | Core says a performance exists and is public. Box office says whether, when and to whom it sells, through the booking-action point. | A theatre without the box office module has no meaningless state. On-sale dates, member presales and sold-out all live in one place. Core and Box office cannot disagree. | Departed from the paper as it then stood. "Announce now, sell later" needs Box office to be on. |
| B. Core holds on sale | As the paper and Proscenium. | Simple. Familiar. | A theatre using an outside ticketing service has an "on sale" switch that does nothing. Presales and timed releases need a second state in Box office anyway. |

The integrating thread agreed with A, and the box office specification now holds the sale state.

## 2. Can a production belong to more than one season?

| Option | For | Against |
| --- | --- | --- |
| **A. One season or none (recommended)** | Matches how theatres print a brochure. Simple addresses and archive. | A festival inside a season needs another way to group. |
| B. Several seasons | A show can be in "Autumn 2026" and "Fringe 2026". | Every list has to decide which season to show. More to explain. |
| C. Seasons inside seasons | Models a festival within a year. | Rarely needed and hard to undo. |

With A, a festival or strand is a production category or a content page listing chosen productions. A later "collection" record can add free grouping without changing seasons.

## 3. How far does in-app branding go?

You asked for branding to be controlled in the app. The question is how much.

| Option | What the theatre controls in the app | For | Against |
| --- | --- | --- | --- |
| A. As Flytower | Name, one colour, heading font, logo, favicon | Proven. Cannot be made unreadable. | Theatres care about look more than a hosting panel's users do. |
| **B. A little further (recommended)** | A plus a grey tone, corner roundness, a dark-mode logo, a social image, an email header and the default mode | Still cannot be made unreadable. Enough that two theatres do not look alike. | Seven controls to test in combination. |
| C. A theme editor | Every colour, spacing and font | Complete freedom. | Contrast can no longer be guaranteed. Every new component must honour every knob for ever. |

With B, a theatre that wants more designs its public pages in `site/`, where it has complete freedom and upstream never interferes. The member area and console keep the derived look.

## 4. Where do the public menu and footer links live?

| Option | For | Against |
| --- | --- | --- |
| **A. A file in the fork, `site/content/navigation.yml` (recommended)** | The menu is versioned and previewed with the pages it links to. Consistent with your decision that content is edited through Git. | Changing a link needs a commit, or Nuxt Studio. |
| B. An in-app menu editor | Anyone with the ability can change it at once. | A link to a page that does not exist yet, or no longer does. A second place content lives. |

Either way, links that modules add (My account, Sign in, Members) are placed by the shell, not written by the theatre.

## 5. Are credits public, and what happens to them on erasure?

This is the one question here with a privacy edge. A cast list is published information in a printed programme. It is also a person's name on the open internet for ever.

| Option | What happens | For | Against |
| --- | --- | --- | --- |
| A. Opt in | A credit is public only once the person agrees. | Strongest for privacy. | An archive full of gaps. Chasing consent from a cast of thirty for every show. Impossible for historical imports. |
| **B. Public by default, with a way out (recommended)** | The production team enters credits. A linked account is told and can hide its own credit at any time. A theatre-wide setting can flip the default. On erasure the account link goes and the printed name stays, unless the person asks for it to go, which one click does. | Matches what theatres already publish. The person stays in control. The archive stays whole. | Relies on the person noticing the message. Printed names of people with no account can only be removed by staff. |
| C. Staff decide, no personal control | Simplest. | Leaves the person no say. |  |

Separate from this, an index page for each person ("everything Alex has been in") is opt-in only under every option, and is left for a later release.

This touches the lawful basis for publishing names, which a theatre should confirm for itself. The recommendation is a design default, not legal advice.

## 6. Is phone push in the first release?

| Option | For | Against |
| --- | --- | --- |
| **A. Email and inbox first, push later (recommended)** | Two channels done well, including retries, bounces and preferences. Push adds permission prompts, per-device subscriptions and platform quirks. | Front-of-house staff on a show night are better reached by push than by email. |
| B. All three at once | Complete from the start. | More to get wrong in the release that everything else depends on. |

The channel point means push is added later without touching the pipeline. If front of house needs it, it can arrive with that module in phase 4.

## 7. What is a production's address? (Decided)

**Matt's decision, 16 November 2026:** `/whats-on/<slug>` for current shows and `/shows/<slug>` for past shows, with public access to past shows as a setting. The options first offered are kept below for the record.

| Option | For | Against |
| --- | --- | --- |
| **A. `/whats-on/<slug>` (recommended)** | One obvious place. Reads well when the show is current. | Slightly odd for a show from 1998. |
| B. `/shows/<slug>` | Neutral about time. Proscenium uses it. | Two sections (what's on, shows) for one thing. |
| C. `/<year>/<slug>` | The year disambiguates revivals. | A postponed show changes address. |

How the decision is carried out, so that a link never breaks when a show closes:

| Rule | Detail |
| --- | --- |
| Which address is the real one | A production is **current** from publication until its last performance has ended, and **past** after that. A published production with no dates yet is current. Current lives at `/whats``-``on/<slug>`, past at `/shows/<slug>`. |
| The other address always redirects | A request for `/shows/<slug>` while the show is current goes to `/whats``-``on/<slug>`, and the reverse once it is past. A poster's QR code and an old social post keep working for ever. |
| The redirect is temporary, by design | A revival or an added date makes a past production current again, so browsers and search engines must not remember the redirect as permanent. Each page names its real address in a canonical link, which is what search engines follow. |
| One slug across both | The slug is unique across all productions, current and past, and an old slug still redirects under both prefixes. |
| Past shows can be private | New setting `public-site.archive.public` (boolean, default on, changed by `public-site.site.configure`). When off, `/shows`, `/shows/<slug>`, season pages for archived seasons and the archive search return "not found", past productions leave the open data and the sitemap, and `/whats``-``on/<slug>` for a past show returns "not found" too. |
| The lists | `/whats``-``on` lists current productions. `/shows` is the archive, replacing `/archive`. |

Two things went slightly beyond what Matt wrote, and both stand:

- **A cancelled production** is past from the moment it is cancelled, and shown as cancelled. Part 3 states the rule.
- **The calendar feed** follows the same spelling, `/whats-on.ics`.

Every other part of this document now uses the two addresses.

## 8. One language for production text at first?

| Option | For | Against |
| --- | --- | --- |
| **A. One language for production text, the interface translatable (recommended)** | The interface is built for translation from day one, as the paper requires. Production text in several languages multiplies every editor screen. | A bilingual theatre, for instance in Wales, cannot use the first release fully. |
| B. Multilingual production text from the start | Right for bilingual theatres. | A large cost for every theatre to serve a few. |

The data model does not rule B out: text fields move to a side table keyed by language when the time comes (story C-15).

## 9. Do webhooks belong in the first release? (Decided)

**Matt's decision, 16 November 2026:** yes, webhooks are supported from the first release. The options first offered are kept below for the record.

Flytower sends operational alerts to Discord, ntfy and signed webhooks. A theatre's committee may well live in Discord or Slack.

| Option | For | Against |
| --- | --- | --- |
| **A. Later (recommended)** | Notifications to people are the need in phase 2. Alerts to a shared channel raise a real question about what personal data may leave the system. | Small theatres would use it at once. |
| B. First release | Cheap to add technically. | The personal-data rule has to be designed first, not after. |

How the decision is carried out. The tables are in part 2, under "Group 6: webhooks".

| Rule | Detail |
| --- | --- |
| What a webhook is | An address outside the system that is told when something happens. A theatre adds as many as it likes, each with a name, an address and a choice of which events it hears. |
| What it hears | Any event a module announces that is not marked internal: a production published, a performance cancelled, and later an order placed. Subscribing is by event name, with a wildcard for a whole module. |
| No personal data leaves | This was the reason to wait, so it is settled as a rule. A webhook carries the event's name, time and ids, plus the public title of the record it is about. Event payloads already carry ids and never names or free text, by the foundations rule. Anything more is fetched by the receiver through the public data, or later through an authenticated interface. |
| Three formats | Signed JSON for other software. Discord and Slack formats, which send a one-line sentence built from the same public fields, so a committee channel can be told "Hamlet: Saturday matinee cancelled" with no code. |
| Signed | Each signed JSON delivery carries a time and a signature made with a secret shown once when the webhook is created. The receiver can check it came from this theatre and is not a replay. Flytower signs its webhooks the same way. |
| Reliable, and it gives up politely | A listener records one delivery for each matching webhook as the event is delivered. A job then sends it, retries with growing waits, and logs the outcome. A webhook that fails 20 times in a row is paused and its managers are told. |
| Safe addresses only | HTTPS only. Addresses that point at private or local networks are refused. The address is treated as a secret, since a Discord address contains one, and is shown masked after saving. |
| Who may manage them | A privileged ability, `core.webhook.manage`, held by the administrator and owner presets (part 6). |

One thing this does not include, to check: **incoming** webhooks, where another system tells this one something. Those arrive with the modules that need them, such as a payment provider's in the box office workstream.

## Proposals that need only a nod

These are defaults in part 6 that seemed worth showing you, not open questions.

| Proposal | Value |
| --- | --- |
| Operating day rolls over at | 04:00 |
| Doors open before a performance | 30 minutes |
| A deleted file can be restored for | 30 days |
| Delivery log kept for | 400 days |
| Inbox messages kept for | 180 days |
| Tries before a message fails for good | 5 |
| "Powered by Proscenium" in the public footer | On, and a theatre can turn it off |
| Open programme data and calendar feed | On |
