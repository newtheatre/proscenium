# 8. Test plan

## How to read this part

Every story in part 7 gets tests for its acceptance criteria; those are not listed again. This part lists the **named cases**: situations that have gone wrong in real systems or would be costly here, each given a name so it can be talked about and so it never quietly leaves the suite.

Three tiers, as the paper sets them: **unit** (one function, no database), **integration** (services against a real local D1, queue and bucket), **end to end** (a browser against the built Worker).

## Time

| Name | Tier | Set up | Must hold |
| --- | --- | --- | --- |
| The midnight show | Unit, integration | Rollover 04:00. A performance starting 00:30 on Sunday. | Its operating day is Saturday. `listPerformancesOnDay(Saturday)` returns it; Sunday does not. |
| The clocks change | Unit | Europe/London. Performances at 19:30 on the Saturday before and the Sunday after the clocks go back, and one at 01:30 on the night itself. | Both evening shows display 19:30. The 01:30 show has one unambiguous instant and one operating day. The calendar feed gives the same local times. |
| The moved rollover | Integration | 40 future performances. Change the rollover from 04:00 to 06:00. | Every performance not completed has its operating day recalculated once. Completed ones are untouched. |
| The one-day season | Integration | A season starting and ending on the same date. | It saves and publishes. |
| The far-away theatre | Unit | Time zone Pacific/Auckland, server in UTC. | "Today" and the digest hour follow the theatre, not the server. |

## Programme

| Name | Tier | Set up | Must hold |
| --- | --- | --- | --- |
| The double booking | Integration | Two requests schedule overlapping performances in one exclusive space at the same moment. | Exactly one succeeds. The other is refused with the clash named. |
| The moved matinee | Integration, end to end | A scheduled performance is rescheduled. | One event with old and new times. The public page shows the new time within a minute. The old time appears nowhere. |
| The cancelled night | Integration | Cancel a performance with a test module contributing an impact line and, in a second run, a refusal. | First run: the line is shown and the cancel completes with one event. Second run: nothing changes and the refusal's reason is shown. |
| The whole run cancelled | Integration | Cancel a production with 12 future and 3 completed performances. | The 12 are cancelled in the same batch with the same reason. The 3 are untouched. |
| The changed slug | Integration, end to end | Change a slug twice. Then try to give the first slug to another production. | Both old addresses redirect permanently to the current one. The reuse is refused. |
| The draft leak | End to end | A draft production with a draft performance, and a published production with one draft performance. | No public page, feed, open-data route, sitemap or search result mentions any draft. Each returns "not found", not "forbidden". |
| The silent warning | Integration | A production with no advisories and no confirmation. | It cannot be published. |
| The closed week | Integration | A blocking closure, then a performance inside it. Then a closure created over an existing performance. | The first is refused. The second saves, lists the performance as a warning, and changes nothing. |
| The long run | Integration | A run that would create 200 performances. | Saved in batches that respect the 90-parameter limit, all or nothing. |

## Vocabularies

| Name | Tier | Set up | Must hold |
| --- | --- | --- | --- |
| The retired term | Integration | A production uses a category. Retire the category. | The production still shows it. New productions cannot pick it. Deleting it is refused. |
| The renamed term | Integration | Rename a term used by old records. | Every record shows the new label. No record was rewritten. |
| The duplicate label | Integration | Add "comedy" where "Comedy" is live. Then where "Comedy" is retired. | Refused in the first case, allowed in the second. |

## Files

| Name | Tier | Set up | Must hold |
| --- | --- | --- | --- |
| The poisoned SVG | Unit | Logos containing a script element, an event attribute, an external image, a `javascript:` link, a DOCTYPE with an entity. | Each is cleaned to something harmless or refused. None reaches storage as uploaded. |
| The lying file | Integration | A program renamed `poster.png`, declared as an image. | Rejected from its bytes. Its stored bytes are removed. |
| The orphaned poster | Integration | Replace a poster, and make the delete step fail. | The new poster is live. The old one is an extra file, later purged. The production never has no poster. |
| The private file | End to end | A file with record access. | Signed out: not found. Signed in without access: not found. With access: served, on a signed address that fails after expiry. |
| The photo with a location | Unit | A JPEG with GPS metadata. | The stored image has none. |
| The abandoned upload | Integration | Begin an upload and never send it. | The row is rejected after the timeout and never served. |
| The lost bytes | Integration | Stored bytes with no row, one a minute old and one a week old. | The weekly task removes the old one and leaves the new one. |

## Notifications

| Name | Tier | Set up | Must hold |
| --- | --- | --- | --- |
| The double send | Integration | The send job runs twice for one delivery, at once. | One message goes to the provider. |
| The lost queue message | Integration | A delivery is recorded and its queue message dropped. | The sweep sends it within the stuck window. |
| The rolled-back receipt | Integration | A caller's batch fails after `notify()` added its statements. | No notification, no delivery, no inbox item. |
| The muted receipt | Integration | A person with every switch off receives a transactional type. | It is sent. The preferences screen offers no switch for it. |
| The muted newsletter | Integration | The same person receives an optional type. | Suppressed, with the reason recorded, and nothing sent. |
| The hard bounce | Integration | The provider reports a hard bounce. | The delivery is bounced. The address is suppressed. The next send to it is skipped with that reason. |
| The wrong side | End to end | A person who is audience and member gets one message of each kind. | Each appears only in its own side's inbox and count. |
| The unknown variable | Unit | A template using a variable its type does not declare. | Refused at save. |
| The old wording | Integration | Send, edit the template, send again. | The log shows each send with the wording it used. |
| The emptied log | Integration | A delivery reaches a final state. | The notification's payload and any bare address are cleared. Type, time and outcome remain. |
| The provider outage | Integration | The provider fails for an hour. | Deliveries retry with growing waits and are sent when it returns. None is sent twice. |
| The same route | Unit | Search the code for any send that does not go through `notify` or `notifyAddress`. | None exists. |

## Branding

| Name | Tier | Set up | Must hold |
| --- | --- | --- | --- |
| The red brand | Unit, end to end | Accent set to pure red. | Danger buttons are still told apart from brand buttons. Text on the accent meets 4.5 to 1 in both modes. |
| The pale brand | Unit | Accent set to pale yellow, then to near-black. | The chosen shade still meets 4.5 to 1 in light and in dark mode. |
| Every colour | Unit | 1,000 random accents. | The contrast rule holds for all of them. |
| The stale logo | End to end | Change the logo. | Every shell and the next email use the new one within a minute, with no hard refresh. |
| The unconfirmed rebrand | End to end | Save the brand with a session older than the freshness window. | A passkey check is asked for before anything is saved. |

## Public site

| Name | Tier | Set up | Must hold |
| --- | --- | --- | --- |
| The stale listing | End to end | Publish, cancel and withdraw, checking the public page after each. | Each change shows within a minute. |
| The unknown token | Unit | A page quoting a missing setting, an unquotable one, and an unknown component. | The check fails for each, naming the file and line. |
| The missing module | End to end | A page uses a component from a module that is switched off. | The page renders without it, with no error, and the readiness screen lists it. |
| The clean merge | Integration | A fork with changed `site/` content, an overridden page and its own component merges a new upstream release. | No conflict in `site/`. The override still wins. |
| The unready site | End to end | A fresh install. | Every page carries `noindex` and `robots.txt` disallows everything until setup completes. |
| No scripts | End to end | Scripts disabled. | What's on, a production page and a content page are readable and navigable. |
| The broken redirect | Unit | A redirect to a page that does not exist. | The check fails. |

## People

| Name | Tier | Set up | Must hold |
| --- | --- | --- | --- |
| The erased director | Integration | Erase an account that has credits, uploads, an inbox, preferences and sent notifications. | The outcomes in part 2's erasure table, each checked. Their name is not findable in the archive search unless question 5's answer keeps printed names. |
| The merged account | Integration | Merge two accounts that both have inbox items and preferences. | Nothing remains on the losing account. Where both set a preference, the survivor's stands. |
| The suppressed ghost | Integration | Erase an account whose address was suppressed. | The suppression still blocks a later send to that address. |

## Modules on and off

| Name | Tier | Set up | Must hold |
| --- | --- | --- | --- |
| Core alone | End to end | Only core and the public site on. | A season and a what's-on page can be published. No booking button shows unless an external link is set. This is the phase 2 gate. |
| Public site off | End to end | Switch the public site off. | The console works. Public routes return "not found". Nothing is deleted, and switching it on restores everything. |
| The upgrade | Integration | A database from the previous release with data in every core table. | Migrations apply, and every row reads back correctly. |

## Added after Matt's decisions of 16 November 2026

| Name | Tier | Set up | Must hold |
| --- | --- | --- | --- |
| The closing night | End to end | A production whose last performance ends during the test. | Before: `/whats-on/<slug>` serves it and `/shows/<slug>` redirects there. After: the reverse. Both redirects are temporary. No link returns "not found" at any moment. |
| The revival | Integration | Add a future performance to a past production. | It is current again and `/whats-on/<slug>` serves it. |
| The private archive | End to end | Past shows set to not public. | Every route in story C-47 returns "not found", for a past show under either address. The open data and sitemap list no past production. A current show is untouched. |
| The leaky webhook | Unit | Build the webhook body for every declared event, with records whose every personal column holds a marker string. | No body contains the marker. A new event that would include it fails this test. |
| The internal event | Integration | A webhook subscribed to a module wildcard, and an event marked internal. | The internal event creates no delivery and is not offered on the screen. |
| The forged address | Unit | Webhook addresses: plain HTTP, a private network range, localhost, a host that resolves to a private address. | Each is refused at save, and again at send time. |
| The dead receiver | Integration | A receiver that always fails. | Retries follow the back-off. The webhook pauses at the set count, one message goes to its managers, and no delivery is attempted afterwards. The pause event creates no webhook delivery of its own. |
| The replayed delivery | Integration | The send job runs twice for one webhook delivery. | The receiver gets the same delivery id both times, and the signature's time lets it reject an old copy. |
| The bare icon | End to end | A venue page with access features. | Every icon has a visible label and an accessible name. A venue with none shows no access row and no "not accessible" wording. |

That makes 63 named cases.
