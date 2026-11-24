# 6. Settings and abilities

Eighteen settings and eight abilities, in Foundations' layouts. Every default is a proposal until the workshops confirm it (the Phase 0 rule), and a key with no proposed value ships unset. No preset role is added: abilities map onto Identity's existing fifteen.

## Settings

| Key | Kind | Default | Limits | Changed by | Audience | Quotable | Purpose |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `core.import.keep-files` | duration | 30 days | 1 to 365 days | `core.programme.configure` | staff | No | How long an uploaded programme file is kept after its import |
| `core.sign-in.microsoft` | boolean | false |  | `core.identity-settings.manage` | public | No | Offer "Sign in with Microsoft". `onChange: confirm` |
| `core.sign-in.microsoft-client-id` | text | unset | at most 200 | as above | staff | No | The app registration's client id. Its secret is the credential `CORE_MICROSOFT_CLIENT_SECRET` |
| `core.sign-in.microsoft-tenants` | list of text | empty | tenant ids (GUIDs) | as above | staff | No | Organisations whose accounts may sign in. Empty: any work or school account. `onChange: confirm` |
| `core.sign-in.microsoft-personal` | boolean | false |  | as above | staff | No | Also accept personal Microsoft accounts |
| `core.sign-in.microsoft-domains` | list of text | empty | domains | as above | staff | No | Email domains whose addresses a Microsoft sign-in may link to by address (MS3) |
| `core.sign-in.microsoft-managed-domains` | list of text | empty | domains | as above | public | No | Addresses here sign in only with Microsoft (MS4). `onChange: confirm` |
| `core.sign-in.oidc` | boolean | false |  | as above | public | No | Offer a general OpenID Connect provider |
| `core.sign-in.oidc-label` | text | unset | 1 to 40 | as above | public | No | The button's name: "Sign in with {label}" |
| `core.sign-in.oidc-discovery` | text | unset | `https://`, at most 300 | as above | staff | No | The issuer's discovery address. Secret: `CORE_OIDC_CLIENT_SECRET` |
| `core.sign-in.oidc-client-id` | text | unset | at most 200 | as above | staff | No |  |
| `core.sign-in.oidc-domains` | list of text | empty | domains | as above | staff | No | As for Microsoft |
| `core.sign-in.oidc-managed-domains` | list of text | empty | domains | as above | public | No | As for Microsoft |
| `front-of-house.shifts.shadow-places` | integer | 1 | 0 to 5 | `front-of-house.settings.manage` | staff | No | Shadow places per shift, extra to its places. 0 turns shadowing at sign-up off |
| `box-office.door.count-out` | boolean | false |  | `box-office.settings.manage` | staff | No | Offer Out on the counter for timed performances too |
| `box-office.door.undo-within` | duration | 2 minutes | 0 to 15 minutes | `box-office.settings.manage` | staff | No | How long a door undo is open without a supervisor |
| `box-office.door.full-warning` | integer (percent) | 90 | 50 to 100 | `box-office.settings.manage` | staff | No | When the counter starts to warn, as a share of capacity |
| core.video.player-hosts | multi-select (dropdown) | YouTube, Vimeo | YouTube, Vimeo, Cloudflare Stream | core.programme.configure | staff | No | Which video hosts may play on public pages (VL1, VL5). Switching a host off keeps its stored addresses but shows only the Watch on link. Shared with Training's lesson videos |

Settings rules, checked together with every pending change (as Matt ruled, PR 562): Microsoft on needs its client id and secret; the general provider on needs label, discovery address, client id and secret; a domain appears in at most one managed-domains list (Google's existing `core.sign-in.managed-domains` included); every managed-domains list needs its provider on. The existing rule `managed-domains-need-provider` is generalised to these lists.

Placement: the sign-in settings live on each provider's card in Admin > Sign-in (`/admin/sign-in/providers`), as Google's do. The import setting is on the generated Programme settings page. The Front of house and Box office settings are on their modules' generated pages, in the shifts and door groups.

Not settings, by design: a crew call's perks rules are fields of the crew call (each festival decides), and a form's pass mark is a field of its version.

## Abilities

| Ability | Acts on | Risk | Owner | Implies | Purpose | Suggested holders |
| --- | --- | --- | --- | --- | --- | --- |
| `core.collection.manage` | `core.collection` | normal | ignored | `core.production.view` | Create, edit, order, publish and archive collections; add and remove productions | `administrator`, `communications-officer` |
| `core.programme.import` | site | normal | ignored | `core.production.view` | Upload, map, apply and undo a programme import | `administrator` |
| `front-of-house.crew-call.manage` | `front-of-house.crew-call` | normal | ignored |  | Create and run crew calls, their questions and perks rules; see who answered | `front-of-house-manager` |
| `front-of-house.crew-call.view-needs` | `front-of-house.crew-call` | privileged | ignored |  | See dietary answers with names, for catering. `fresh: false`, `audit: 'read'` | `front-of-house-manager`, `welfare-lead` |
| `front-of-house.handout.record` | `front-of-house.crew-call` | normal | refuses |  | Record and undo handouts. Owner refuses: nobody hands themselves a T-shirt | Fact `front-of-house.leading-shift`; `front-of-house-manager` |
| `front-of-house.shadow.confirm` | `core.performance` | normal | refuses |  | Confirm that someone shadowed tonight | Fact `front-of-house.leading-shift`; `front-of-house-manager` |
| `box-office.headcount.correct` | `core.performance` | normal | ignored | `box-office.ticket.admit` | Undo a tap older than the undo window, with a reason | `box-office-manager`, `front-of-house-manager` |
| `forms.form.mark` | `forms.form` | normal | ignored | `forms.form.edit` | Add correct answers, points and a pass mark, and system transitions. Separate so a theatre can let more people edit wording than marking | Holders of `forms.form.edit` by default |

Existing abilities cover the rest: the rota grid is `front-of-house.shift.manage`; tapping the counter is `box-office.ticket.admit`; line-ups and per-performance credits are `core.performance.schedule` and `core.production.edit`; the video address is `core.performance.schedule`; sign-in settings are `core.identity-settings.manage`.

## Notes

- **Dietary needs are special category.** The crew sign-up template (FB-515) classes the dietary question `special`, so its answers are sealed and only `crew-call.view-needs` sees them by name. Counts by need are aggregates and shown to `crew-call.manage`; a need with fewer than three people is shown as "fewer than 3" so a count cannot single anyone out.
- **`handout.record` refuses its owner** under Foundations' owner rule, so the record type's owner is the account the handout is for; the Owner role keeps its exemption (Matt, 23 November 2026).
- **Shadow confirmation refuses its owner**, which is how SH2's "nobody confirms their own" is enforced.
