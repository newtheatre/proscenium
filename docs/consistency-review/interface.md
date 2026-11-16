# Interface and wireframes consistency findings

Area: /home/user/proscenium/docs/specs/interface-and-wireframes/ (all 13 files and the eight wireframe images, W1 to W8). Paths below are relative to /home/user/proscenium/docs/ unless shown in full. Short names: IF = specs/interface-and-wireframes, FND = specs/foundations, ID = specs/identity, CORE = specs/core-domain-and-public-site, BO = specs/box-office-payments-ledger, FB = specs/form-builder.

## Summary

31 findings: 9 HIGH, 14 MEDIUM, 8 LOW.

The three most important:

1. **Settings the interface declares already exist, under other names, in identity, core and foundations** (findings 1 to 4). The members' area name and on/off, the credit line, the default colour mode and the default language each have two keys. Two of the interface's abilities also differ from foundations' (`core.audit.read` against `core.audit.view`; `core.setting.change` declared twice).
2. **Box office puts the door under `/console/...` and says the desk phone-first**, while the interface rules that a one-job-during-a-performance screen is a Live page at `/live/...`, and that the desk is laptop-first. The interface is itself split on whether the desk is console or live (findings 5 to 7).
3. **Points are defined twice with different shapes.** `core.account-section` has two owners and two field lists (identity against interface). A production page gets its extra content through `core.production-section` (core: side panels) and `core.record-tab` (interface: tabs). The three interface points `core.help-page`, `core.on-shift-bar` and `core.tonight-tile` are in no foundations index (findings 8 to 10).

Prevailing sources used: the end of FND 02-formats.md (rulings of 16 November), the recorded Matt decisions, and the owning module's own spec.

---

## HIGH

### 1. Members' area setting: two keys, two limits (HIGH)
- Side A (IF 06-settings-and-abilities.md:13-14): `core.shells.members-area` (on or off) and `core.shells.members-area-name` ("Text, up to 30 characters"). 05-1 and 03:50 use the label "members' entry takes its label from `core.members-area.name`".
- Side B (ID 07-settings-and-abilities.md:41-42): `core.members-area.enabled` (boolean, true) and `core.members-area.name` ("Text, 40 characters"); presets at ID 07:73-74.
- IF contradicts itself: 03-states-and-rules.md:50 cites `core.members-area.name`, 06 declares `core.shells.members-area-name`. The limit differs (30 against 40).
- Prevail: identity. It owns the members' area standing and has the presets. Drop the two IF keys and have IF 06 point to identity's; fix the 30/40 split. Also fix the preset wording at IF 06:13 ("on for student society and amateur company, off for a small venue"), which matches identity's `enabled` values and so is fine once the key is shared.
- Owner: IF 06 (and IF 03:50).

### 2. Credit line: `core.shells.credit-line` against `core.brand.credit-line` (HIGH)
- A (IF 06:17): `core.shells.credit-line` | On or off | On.
- B (CORE 07-settings-and-abilities.md:39): `core.brand.credit-line` | boolean | true | "Shows 'Powered by Proscenium' in the public footer".
- Prevail: core (IF 06:28 itself says "Brand colour, logo, fonts and name are workstream 3's settings"). Remove the IF key. Owner: IF 06.

### 3. Default colour mode and language: three owners (HIGH)
- A (IF 06:23-25): `core.appearance.default` (system/light/dark, default `system`) and `core.appearance.public-dark`; (IF 06:52-53) `core.language.default` and `core.language.offered`.
- B (CORE 07:38): `core.brand.default-mode` | auto, light, dark | "The mode a first-time visitor sees". design-paper/11-design-stage-questions-and-status.md "Notes from integration" says "C3 and U6 overlap ... are one control". For language: FND 08-settings-and-abilities.md:16 `core.locale.language` (en-GB, "Shipped catalogues"), and CORE 06-screens.md Organisation screen lists "language".
- Same behaviour, different keys, different choice words (`system` against `auto`). Pick one owner per control: `core.brand.default-mode` for the default mode (core); `core.locale.language` for the default language (foundations). IF keeps only what is genuinely its own: `public-dark` (pin public shell to light) once reconciled with the brand mode, `core.language.offered`.
- Related (not interface's): FND 08:14-17 names time zone, currency and day start `core.locale.*`, but CORE 07:15,18 names them `core.organisation.time-zone` and `core.organisation.day-rollover`. IF 06:56 says "organisation settings owned by workstream 3", which agrees with core and not foundations. Foundations/core must reconcile; IF follows whichever wins.
- Owner: IF 06, CORE 07, FND 08.

### 4. Ability names differ from foundations' (HIGH)
- A (IF 06:62,65): `core.setting.change` ("Scope: Site or module", preset holder Site owner) and `core.audit.read` ("Open the Activity list and a record's full history").
- B (FND 08-settings-and-abilities.md:37,45): `core.setting.change` on record `core.setting` (parent link to the declaring module), already declared by foundations; `core.audit.view` ("Every search is audited"), and `core.audit.export`.
- Two problems. `core.setting.change` is declared by both documents, and IF's table of "5 abilities" (06:3) therefore double-counts one that foundations owns. `core.audit.read` is a name that exists nowhere else; foundations' is `core.audit.view`, and FND 02-formats.md:131 "a `read` action kind" is a different thing (the audit kind). IF 05-screens.md:53 "Activity" is foundations' "Audit" screen at `/console/system/audit` (FND 07-screens.md:15).
- Prevail: foundations. Remove `core.setting.change` from IF's list (say "uses foundations'"), rename to `core.audit.view` and say the Activity list is foundations' Audit screen. Recount IF's abilities (then 3, or 4 with `core.audit.view` removed too: `core.navigation.arrange`, `core.saved-view.share`, `core.practice.use`), and the intro sentence "20 settings and 5 abilities" (06:3, 01-scope:50).
- Owner: IF 06, IF 01 line 50, IF 05-screens.

### 5. Door route and shell: console in box office, live in the interface (HIGH)
- A (IF 05-3-key-journeys.md:12 and 05-4-wireframes.md:37): journey 4 "Scan at the door" is shell "Live", wireframe W5 "The scanner is a Live page". IF 05-1-shells-and-navigation.md:56-57 "Door, till, tonight board and checklists belong to live mode", and the ruling at 05-1:97 "A screen for one job during a performance is a Live page". Address example `/live/door` (05-1:94).
- B (BO 06-screens.md:53-54, 80): "Console shell: the door" with routes `/console/box-office/door/<performance>` and `.../list`; BO 05-interface-to-other-modules.md:93 contributes "Console entries: Box office (Sell, Orders, Door, ...)".
- BO contradicts itself: BO 06:159 says "Door runs in live mode ... | Agrees".
- Consequences: (a) under the interface's rule a steward whose only ability is `box-office.ticket.admit` (BO 07:93, via the on-shift fact) would be "entitled to the console" (IF 03:50, "holding any ability that a console entry names") because Door is a console entry, which is the wrong shell for a volunteer; (b) there is no `live`-shell navigation entry or `core.tonight-tile` from box office (BO declares neither), so the Door tile that IF journey 4 step 1 and journey 8 step 3 rely on never appears.
- Prevail: interface (the ruling of 16 November). Box office should move Door to `/live/box-office/door/<performance>` with shell `live` and contribute the tile; keep the printable door list in the console. Owner: BO 05, BO 06 (also the "Console shell: the door" heading).

### 6. The desk: console in the journeys, "a Live page" in W4 (HIGH)
- A (IF 05-4-wireframes.md:29): "The desk is a Live page: the sidebar is gone ... leaving is an explicit action"; image W4 titled "Selling at the desk: live mode, no sidebar".
- B (IF 05-1-shells-and-navigation.md:56): "Desk sales belong to the console, because they are done sitting at a laptop"; IF 05-3-key-journeys.md:11 journey 3 shell "Console"; BO 06-screens.md:50 and 126 route `/console/box-office/sell`, "lives in the console shell on a laptop"; paper 05-2-security-privacy-and-interface.md:41 "Desk screens are designed for a laptop".
- Also IF W5 image, first frame, lists a "Sell at the desk" tile on the Tonight hub (a live tile); journey 8 lists tiles "Door, Checklist, Incident" with no desk; image W5 lists "Scan tickets, Guest list, Sell at the desk, Report an incident".
- Target size also differs: W4 image says "Every control is at least 44 px tall", live rule is 48 (05-1:53, 05-2:75); console is 24 (05-2:157).
- Prevail: 05-1 ruling, journey 3 and box office (console, laptop-first). Amend W4's text and image title ("live mode, no sidebar") to "Console desk, sidebar collapsed" (or define a console "full-width desk" variant), drop the 44 px caption, and decide whether "Sell at the desk" is a Tonight tile (then say it opens the console desk, not a live screen). Owner: IF 05-4, W4 and W5 images.

### 7. Desk designed phone-first or laptop-first (HIGH)
- A (BO 06-screens.md:7): "Phone first. Checkout, the door and the desk are all designed at phone width first; the desk also has a two-column layout for a tablet."
- B (IF 05-3-key-journeys.md:11 "Sell at the desk ... Laptop"; paper 05-2-security-privacy-and-interface.md:41 "Desk screens are designed for a laptop"; IF 05-4:29-ish "laptop or tablet width").
- Prevail: the paper's Part B convention. Amend BO 06:7 to "checkout and the door are phone first; the desk is laptop first with a tablet layout". Owner: BO 06.

### 8. `core.account-section` has two owners and two shapes (HIGH)
- A (IF 04-interface-to-other-modules.md:17,88-92): New point, "A section of My account in the public shell (Tickets, Passes)"; fields `to` (under `/account`), `icon`, `order`, optional `count`. FND 06-interface-to-other-modules.md:52 indexes it under Interface (6).
- B (ID 05-interface-to-other-modules.md:160): identity "offers" it: "A section on the 'My account' page or on the console's account page: its id, side, the ability that shows it, and the component". ID 06-screens.md:86 uses it for sections on the console person page ("The tinted section is the `core.account-section` point"). FB 05-interface-to-other-modules.md:107 and 160 use it with a `side` (audience or members) for custom fields.
- The IF shape has no `side`, `ability` or `component` (an address-only link), and nothing for the console's person page; identity's has no `to`, `icon`, `order`.
- Prevail: one definition is needed from an integrator. Suggested: interface owns the point (as the index says) and adds `side`, `ability`, `component`, with `to`/`icon` optional, and a second target (`account` or `console-person`). Identity removes it from its "Points offered" table. Owner: IF 04, ID 05, FND 06 index.

### 9. A production page's extra content: `core.record-tab` against `core.production-section` (HIGH)
- A (IF 04:16,75-86; 05-2-page-conventions.md:35): `core.record-tab` adds "A tab on another module's record page (Tickets on a production)"; a production's record "shows Overview from the core, and Tickets, Rota, Budget" tabs; journey 6 (05-3:122-127) has an Overview checklist and "Performances" and "Tickets" tabs.
- B (CORE 05-interface-to-other-modules.md:125 and 06-screens.md:41; image CORE images/06-w2-console-production-dates.png): `core.production-section`, "Extra panels on the console production page (Box office's sales summary, Front of house's rota)", drawn as dashed side panels; core's tabs are "Details, Dates, Credits, Media, Advisories and access". Neither "Overview" nor "Performances" nor "Tickets" tab exists. FB 05:109 uses `core.record-tab` for forms on a core record, so both points are live for the same screen. BO declares neither.
- Prevail: unclear; needs Matt or the integrating thread. Recommended: keep interface's `core.record-tab` (generic, covers every record type), delete `core.production-section` from core (core can still contribute a card to the Dates tab), and amend core's tab list to match the Record convention (an "Overview" tab with the checklist). Owner: CORE 05, CORE 06, IF 05-3 (journey 6 tab names).

---

## MEDIUM

### 10. Three interface points missing from foundations' index; counts of points (MEDIUM)
- A (IF 04:3, 23): "It offers modules nine extension points"; the table lists nine, then "Two further points were added ... `core.on-shift-bar` ... `core.tonight-tile`", and `core.navigation-group` appears only in a bullet (04:60). That is 12, not nine. Seven page components, then `PageEditor`, `Calendar`, `LiveKeypad` added elsewhere (04:23, 05-2).
- B (FND 06-interface-to-other-modules.md:52): Interface (6) points are only `core.navigation-group`, `core.home-card`, `core.record-tab`, `core.account-section`, `core.search-source`, `core.quick-action`. `core.help-page`, `core.on-shift-bar` and `core.tonight-tile` are missing; IF 04:150-153 says new points "are declared here and indexed by workstream 1". `core.navigation`, `core.setup-step` and `core.public-component` are other owners' (IF counts them among its nine).
- Prevail: foundations' index should gain the three; IF 04 should say "nine points, plus two ... plus the group declaration" or restate the count. Owner: IF 04:3, FND 06.

### 11. Event name: `core.module.switched` does not exist (MEDIUM)
- A (IF 04:144): "It reads `core.module.switched` (from workstream 1)".
- B (FND 06-interface-to-other-modules.md, events table): `core.module.enabled`, `core.module.disabled`; also FND 02-formats.md:156 "`core.module.*`".
- Prevail: foundations. Owner: IF 04.

### 12. `core_saved_views.id` has no prefix; foundations' prefix index lacks interface's tables (MEDIUM)
- A (IF 02-data-model.md:30): `id` | text | "Primary key, opaque". `core_preferences` and `core_navigation_overrides` are keyed by their own columns (fine).
- B (FND 06:... "Index of id prefixes"; FND 02-formats.md "Scoped ids": "Each workstream should add a prefix to every table in its data model"; every id is `<prefix>_<26 characters>`). No prefix for `core_saved_views`; the index has no entry for the interface at all. IF 02:5 also says the column layout "will follow workstream 1's data-class registry once that sub-tab is written", which is stale (the registry exists).
- Prevail: foundations rule. Add a prefix (e.g. `svw`) and register it; update 02:5. Also naming: FND 02-formats.md:107 says interface is an area named `core.interface.*`, but IF's settings are `core.shells.*`, `core.appearance.*`, `core.lists.*`, `core.live.*`, `core.language.*`, `core.help.*` (06). Prevail: foundations if that ruling stands; otherwise fix foundations' example. Owner: IF 02, IF 06, FND 06.

### 13. Preferences stored twice: language (MEDIUM)
- A (IF 02:20 and 06:81): `core_preferences` keys include `language`; "Preferences a person sets for themselves ... appearance, language".
- B (ID 03-data-model.md:48): `core_accounts.locale` "a language tag the platform ships"; ID 06-screens.md:46 "Your details | Name, preferred name, phone, language".
- Two places hold a person's language. Prevail: identity's column (the account screen edits it, and notifications need it); IF drops `language` from `core_preferences`. Also 02:20 lists key `live-dark` and 06:81 "sound on this device" which is neither in the key list nor `core_preferences`; and the key `live-dark` duplicates the setting `core.appearance.live-dark`. Owner: IF 02, IF 06.

### 14. Inbox: one entry in the menu, two inboxes in core (MEDIUM)
- A (IF 05-1-shells-and-navigation.md:68 "Notifications | Always | The inbox"; 05-screens.md:24 one "Notifications inbox" in the public shell; 05-1:34 a bell in the members' top bar).
- B (CORE 06-screens.md "Account, both sides": "Messages for this side ... A person who is both audience and member sees each twice, once per side, never mixed"; CORE 02-scope.md A8 "separate inboxes and preference pages").
- The interface does not say which inbox the single "Notifications" menu entry opens, nor where the member inbox lives (a members' screen?). Prevail: core's two inboxes (a decision of core and identity). IF should list the audience inbox under My account and the member inbox in the members' area and say the menu opens the one for the current shell. Owner: IF 05-1, 05-screens.

### 15. Console groups: no home for core's, foundations' and forms' screens (MEDIUM)
- A (IF 05-1:111 and 09-questions:20, "decided"): fixed order "Tonight, Box office, Front of house, Bar, Spaces, Training, Membership, People, Money, Communications, Forms, Reports, Site settings". 05-1:46 "Site settings ... organisation, branding, modules, roles, people, updates and health".
- B (CORE 06-screens.md:36-63 and image 06-w2-console-production-dates.png): console sidebar items "Productions, Calendar, Seasons, Venues, Messages, Site and brand"; core's programme, places, files, vocabularies and message screens have no group in the list. FND 07-screens.md:5: "All but Setup live ... under a group called System" at `/console/system/*`. BO uses groups "Box office", "Payments", "Finance" (BO 05:93) and IF puts Payments under Money (04:53).
- Also "People" is both a group and part of "Site settings" (05-1:46 lists "roles, people"), and ID 06:63 calls its group "People".
- Prevail: interface owns the group list, so amend it to name the group for programme (Productions/Programme), places, files, messages, and rename "Site settings" or "System" so foundations' routes (`/console/system/...`) and group agree. The build check at 04:59-60 cannot pass until every module has a group. Owner: IF 05-1, 09-questions, FND 07.

### 16. First-run setup: five steps against six; wizard content differs (MEDIUM)
- A (IF 05-3-key-journeys.md:149-152): "Setup screen ... apply the database, create the owner with a passkey. **Five steps:** theatre name and type, time zone and currency, brand colour and logo with a live preview of all three shells, modules to switch on, sample data or a clean start." Page-convention for Steps says "Three to five steps" (05-2:67).
- B (FND 07-screens.md:19-26): six steps: Check, Prepare the database, Create the Owner, The theatre (name, time zone, currency, language), Choose a starting point (a preset), Checklist. Brand colour is not a wizard step; it is a `core.setup-step` "Your look" shown on the checklist and skippable (CORE 06-screens.md:80). Paper 06-setup-branding-and-public-site.md:9-13 has a wizard of name, time zone, currency, season pattern and brand colour plus a preset.
- Prevail: foundations owns Setup (the interface only draws it). Reconcile the three: IF journey 9 and 05-screens "First-run setup" must follow FND 07 (including "language", presets, and "Check") and either use the Steps page's 5-step cap or note the exception. Owner: IF 05-3 and 05-2.

### 17. Navigation `ability` field: required, omitted, or a fact-like condition (MEDIUM)
- A (IF 04:51): "Omitted only for `account` entries, which every signed-in person has".
- B (FND 02-1-module-manifest.md:182): `ability` | **Yes** (required). ID 06-screens.md:102-103 shows "Shown by `core.signed-in`" and "Any standing" for entries (identity's account entries use a route declaration/fact as the visibility rule, which IF 04:51 forbids: "Never a fact"). FB 05-interface-to-other-modules.md:106 declares "Reviews ... shown to anyone with a review waiting" and "My forms ... shown when the person has a draft or a response": data conditions, not abilities (they would be `count`-hidden entries at best).
- Prevail: foundations says required; resolve with a rule: an `account` entry names the route declaration `signed-in` (or a `core.signed-in` ability), and "has a draft" entries use a `count` of zero to hide. Owner: IF 04, ID 06, FB 05.

### 18. Public header: shapes differ (MEDIUM)
- A (IF 05-1:26, 65-72 and 05-1:73): public header has "What's on, ... basket (only when it holds something), account menu or 'Sign in'"; Members' area and Console are reached **only** through the account menu ("the only way between them", W1 image).
- B (ID 06-screens.md:5-15 and ID image 06-header-three-people.png): header links "Shows, Visit"; "Basket" always present; "Members area" and "Console" shown as pills **in the header** beside "My account" (the prose of the same ID page says "The account menu holds ... A person with a standing sees one more entry", so ID's text and image disagree too).
- Prevail: interface (it owns the shells). Redraw ID's image to the account menu; align the labels ("What's on" is the interface and core's name, `/whats-on`). Owner: ID 06 (image and text).

### 19. W7 audience menu: entries in the image differ from the text (MEDIUM)
- A (IF 05-1:72 and 05-4:53): "An audience member's menu is therefore three lines long: My account, Notifications, Sign out." The menu list also includes Appearance and language.
- B (IF images/05-4-w7-one-account-two-people.png): frame 1 shows "My tickets, My details, Sign out"; frame 2 adds "Go to: Members area, Console" and no Tonight, Notifications, or Appearance. The label is "Members area" (no apostrophe), against "Members' area" everywhere else and the setting default (IF 06:14).
- Prevail: the text (05-1 table). Redraw W7 frames 1 and 2. Also the W7 frame 4 caption "The bar shows only while your shift is running" against 03:171-ish where the window opens 30 minutes before call time and closes 60 minutes after the shift ends (see 21). Owner: IF image and 05-4.

### 20. Public routes outside the reserved list: `/orders/<token>`, `/passes` (MEDIUM)
- A (IF 05-1:101 "A theatre's content page can never collide with a platform page, now or after an update, because the reserved list is short and fixed"; list in 04:151-152 and FND 02-formats.md:116,135,163).
- B (BO 06-screens.md:24,27): public platform pages "Manage booking `/orders/<token>`" and "Buy a pass `/passes`" at the root. Neither prefix is reserved, so a theatre page `site/content/orders.md` or `passes.md` would collide and the build check would not refuse it.
- Related: IF 05-1:89-96's Addresses table lists only `/book`, `/account`, `/members`, `/console`, `/live`, `/sign-in`, `/setup`; `/api`, `/files`, `/mailing` and underscores are in 04:151-152 only, and FND 12-1-repository-and-owned-paths.md:74 omits `/mailing`. The example `/book/hamlet/thu-14-mar` (05-1:90) is a two-segment slug path, whereas BO's route is `/book/<performance>` (one segment) with `/book/basket`, `/book/done/<token>`.
- Prevail: foundations' ruling. Move BO's pages under `/book` or `/account` (e.g. `/account/orders/<token>`? that needs sign-in; so `/book/order/<token>`) or add them to the reserved list; fix the example. Owner: BO 06, IF 05-1, FND 12-1.

### 21. On-shift window: "from the shift's start" against the window rule (MEDIUM)
- A (IF 05-3-key-journeys.md:142): "From the shift's start, a bar across every page reads 'You are on shift. Open Tonight'". W7 caption "The bar shows only while your shift is running."
- B (IF 03-states-and-rules.md:164-172, 323): the window opens 30 minutes before call time and closes 60 minutes after the shift ends; the bar and Tonight follow it ("Shift later today, window not open | ... No").
- Prevail: 03 (the stated assumption, which agrees with identity's "a confirmed shift in its window", ID 05:176). Amend journey 8 and the W7 caption to "from when the window opens". Owner: IF 05-3, W7.

### 22. Journey 1 and W3: step numbering, where the hold starts, and where "pay" lives (MEDIUM)
- A (IF 05-3:24-35 mermaid): five stages (Production page, Choose tickets, Your details, Payment page, Confirmation) and the note "the hold starts" at Choose tickets; steps text (05-3:39-46) has seven steps and says the hold starts at step 4, Basket; "6. Pay ... The provider's form sits inside the page"; mermaid "Payment page, the provider's own".
- B (IF 05-4:21 and image W3): "Step 3 is the payment provider's own page, which is why it has no wireframe"; the image shows "Step 1 of 3 Choose tickets / Step 2 of 3 Your details with Pay £24.00 / confirmation" and "Held for you for 10:00" on the Choose tickets frame (hold starting there); the sign-in link is "Have an account? Sign in" on step 2 (matches), the image has "Save tickets offline", "Create an account" and no "Add to wallet" (journey step 7).
- BO 06-screens.md:20 and 148: "Check and pay `/book/basket`: countdown, lines, fee, total, contact details, pay" is one screen; BO claims "Same steps; the hold starts at the basket | Agrees" (BO 06:148), which is not true of IF's seven steps and two-step image.
- Prevail: box office (it owns the rules), with the interface adapting: the hold starts when the claim batch runs (BO 06:35 "Pressing the button runs the claim batch") or at Basket (BO 06:148); decide which and make the mermaid, text, W3 and image agree. Owner: IF 05-3, 05-4 and image W3; BO 06:35 against 06:148.

### 23. Statuses in the images are not box office's states (MEDIUM)
- A (IF images W2, W6: order status "Paid", "Refunded"; 05-3-key-journeys.md:110 "Outcome on the record: refunded").
- B (BO 04-states-and-rules.md:26-47, 156-158): order states are Basket, Awaiting payment, Confirmed, Reserved, Expired, Cancelled; ticket states valid, void, admitted. There is no "Paid" or "Refunded" order state (refunds are per line, the order stays Confirmed or becomes Cancelled).
- W2 sidebar labels also differ from BO's nav: "Desk" (BO: Sell), "Customers" (no BO screen), "Price lists" (BO: Ticket types and prices), "Every day"/"Set up" (05-1:42 "everyday ... set-up"; the declared section ids are `everyday` and `setup`).
- Prevail: box office's states. IF 05-4:61 already says the three W8 settings are examples; add the same caveat for W2 and W6 or redraw. Owner: IF images W2, W6 and 05-3 journey 5.

### 24. Refund self-approval rule (MEDIUM)
- A (IF 05-3:115): "The seller is refunding their own order | Refused, with who can do it instead".
- B (BO 07-settings-and-abilities.md:121 `payments.refund.approve` "Approve a refund; never your own above the limit"; BO 06:160 "Refunding your own order is refused | A requester cannot approve their own refund | Agrees"; paper 11: B5 "Two different people, except at or under a limit that ships at zero").
- The two rules differ (own order against own request; refused outright against approvable by someone else). Prevail: box office. Reword the journey row. Owner: IF 05-3.

### 25. Door result bands and sound against settings (MEDIUM)
- A (IF 05-4:37): "Its answer fills the top of the screen in words, with a sound and a vibration"; 05-2:79 "a sound or vibration where the device allows"; W5 image "A tone and a buzz confirm".
- B (IF 06:46): `core.live.result-sound` default **Off**; BO 06:88 "One word, one colour, one sound per scan". 
- And journey 4 (05-3:90) "amber 'Already scanned at 19:12 by Sam'" against the W5 image frame 4: "Do not admit / Already scanned at 19:12 on this phone" in a dashed (not amber) band, plus a "Let in anyway ... Asks for a reason" button that journey 4 (05-3:98) does not have ("nobody at the door is asked to resolve it"). The image also shows "Wrong night" copy as BO's "wrong performance, with which one" (BO 06:89).
- Prevail: settings and journeys over the wireframe prose. Decide whether sound is on by default (box office says one sound per scan) and align `core.live.result-sound` default; remove or explain "Let in anyway". Owner: IF 06, 05-4, W5 image; BO 06:88.

### 26. Phone-width breakpoints: 640 against 1024 (MEDIUM)
- A (IF 07-stories.md:13 "bottom bar ... below 640 pixels"; 05-2:99 "default below 640 pixels").
- B (IF 07:31 UI-11 "table above 1024 pixels and cards below"; FND 07-screens.md:86 "tables collapse to cards below the narrow breakpoint defined by workstream 6" which IF never names).
- Prevail: unclear; the interface should name one breakpoint set (phone, tablet, laptop) and state which applies to cards and to the bottom bar. Owner: IF 05-2.

### 27. Settings page copy: "who may change it" against "who last changed it" (MEDIUM)
- A (IF 05-2:54 and 07 UI-14): each setting shows "who may change it".
- B (IF W8 image: "Each row shows its default, who last changed it, and a link to its help page"; FND 07-screens.md:43 "when and by whom it was last changed"; FND 07:48 deployment-managed settings read-only).
- Both can be true, but the page convention omits "when and by whom last changed" and "limits", which foundations lists; and 05-2:56 "Settings search ... by its label or by the words in its help text" against FND 07:44 "label, help text or key". Prevail: foundations' list as the minimum. Owner: IF 05-2.

### 28. Where "My forms" and the review queue sit: recorded as agreed but not written (MEDIUM)
- A (IF 01-scope.md:62): "Agreed with workstream 5: the Editor layout, the review queue's two homes, and where My forms sits." IF 05-1:97 rule says own-things screens belong in the members' area (or My account), operational ones in the console.
- B (FB 06-screens.md:22,27,33 and FB 05:106-107): Review queue in console or members' area; My forms in both the audience account (`core.account-section`) and the members' area; FB 05:164 "Review and My forms are placed as tab 5 says".
- Nothing in IF 05 describes the two homes (they appear only as the W7 image card "My forms"). Not a contradiction of substance but a broken "agreed" reference; the review queue is also a console/members split that the 05-1:97 rule (shell follows whose business) does not explain. Owner: IF 05-1 (add a line).

---

## LOW

### 29. Story and screen counts stale in the scope tab and the paper (LOW)
- A (IF 01-scope.md:51): "34 stories, UI-01 to UI-34". Paper design-paper/12-build-backlog-and-glossary.md:14 table row "UI-01 to UI-34 | 34 | 0 | 24 | 10".
- B (IF 07-stories.md:3): "36 stories: 24 in the first release, 11 later, and one (UI-36) ..."; backlog line 133 itself says "Interface grew from 34 to 36".
- Prevail: tab 7 (36). Fix IF 01:51 and the backlog table. (Checked and agreeing: 31 screens at 05-screens:3, 26 test cases at 08:3, nine questions, 20 settings, 5 abilities.) Owner: IF 01, paper 12.

### 30. Stale status wording (LOW)
- IF 04-interface-to-other-modules.md:5 "Everything here is written in draft 1 of workstream 1's formats ... marked **new**", and the `core.navigation` table marks `group`, `section`, `count`, `match` "**New**" and "any of" as new, while 04:146-154 and FND 02-formats.md:116-118 record them as accepted. IF 05-1-shells-and-navigation.md:113 "They follow draft 1". IF 01-scope.md:59 "First full draft ... Every part is written" against the "Agreed" and accepted state. Fix by dropping "draft 1" language. Owner: IF 04, 05-1, 01.
- design-paper/11 Notes: "C3 and U6 overlap ... Answering U6 settles both" is stale since U6 is closed; it also hides finding 3. Owner: paper 11.

### 31. Smaller wording and rendering items (LOW)
- IF 05-1-shells-and-navigation.md:89 Addresses table cell is malformed: `/`whats-on``, `/``whats-on``/hamlet` (inline code broken by nested backticks); CORE 06-screens.md:38 has the same fault in its Production row ("/whats``-``on/<slug> while current, /shows/<slug> once past"). Matt's decision (production at `/whats-on/<slug>` while current, `/shows/<slug>` once past) is correctly quoted in IF 01:63 and FND 02-formats.md:157; but FND 02-formats.md:157 calls `/whats-on` and `/shows` "core-owned address prefixes" while IF 01:63 and CORE 05:193 say they are not reserved. Foundations should say "core-owned routes, overridable, not reserved".
- IF 01-scope.md:63 says "access features show as icon and label chips from `core.place-access`"; CORE 03-data-model.md:277-280 says `core.place-access` describes a building and is separate from `core.access-feature` (a performance's features), and the rule appears nowhere in IF 05. Clarify which vocabulary.
- IF 06-settings-and-abilities.md "Site owner" (the preset role is "Owner", ID 07:144) and "Each module's manager role", "Every member" are not preset keys in identity (`owner`, `administrator`, `box-office-manager`, `volunteer`...). Use identity's role names or say "a theatre maps".
- IF 03-states-and-rules.md diagram (lines 103-125): the Stuck state has no exits although the note and table say "a stuck act is still retried"; add Stuck to Sending and Confirmed. The table says "after 30 minutes of being connected" while the diagram says "unsent 30 minutes".
- IF W8 image: "Buy without an account" has no matching box-office setting (BO 07:13-44 lists none; guest checkout is a principle, BO 06:6), and "Stop online sales ... Was 0 minutes" is `box-office.sales.close-before` (default 0m, fine) but the label "Refund cut-off before a performance" used in journey 10 (05-3:155) matches no setting (BO has `box-office.cancellations.until-before`, 24 hours default, only used when `cancellations.by-buyer` is on; default off). Treat as examples and say so in 05-3.
- IF 05-3 journey 7 and journey 1 say "Add to wallet"; the W3 image says "Save tickets offline" and no wallet button.
- IF 03:200 (and 03:45-47) uses "second factor"; identity and foundations use "re-assert / fresh sign-in" (ID 06:31 "Confirm it is you"; FND 08:25 `core.security.fresh-sign-in`), although FND 02-3-abilities-registry.md:51 also says "second factor". Align wording with identity.

---

## Checked and consistent

- Shell names and the four navigation shells `account`, `members`, `console`, `live`; reserved prefixes `/account /members /console /live /book /sign-in /setup /api`, underscore, `/files`, `/mailing`: IF 04:151-152 agrees with FND 02-formats.md:116,135,165 and FND 02-1:188 (apart from the omissions noted in 20).
- Navigation entry extra fields `group`, `section` (`everyday`/`setup`), `count`, `match`, and `ability` taking one ability or a list ("any of"): agree with FND 02-1:178-187, apart from "required" (17).
- Idempotency key and refusal body `{ code, reason, remedy?, fields? }`: IF 04:154 against FND 02-formats.md:117-118.
- The `core.member` fact and `describeViewer`: IF 03:50 ("the name, the sides open, the navigation entries allowed") agrees with ID 05:17 and ID 07:130-133; members' area opens on a "standing" (ID 07) as IF 05-1:10 says; an audience member sees no members' entry (ID 06:5, ID 08:153); a lapsed standing reverts to the audience account (paper 04-1:23, IF test "Lapsed member reverts"); `/members` answers "not found" for the unentitled (ID question I3, IF 03:45).
- Preset default for the members' area (on for student society and amateur company, off for a small venue) matches ID 07:73-74.
- Wording of the paper's interface conventions (Nuxt UI first, three shells, phone-first operational screens, strings through translation, WCAG 2.2 AA, no half-filled page, list conventions) all appear in IF 05-2; the paper's "Desk screens are designed for a laptop" agrees with IF (not with BO, see 7).
- Editor layout (outline, canvas, panel, top bar with tabs, saved state, undo/redo, problems count, Preview, Publish; sidebar collapses; read-only or take over) agrees with FB 06-screens.md:41-51 and FB 05:163.
- Desk copy changes box office asked for (cash only after the attempt fails, no pass or voucher at the desk in the first release, Resend/Show/Admit instead of "Mark collected", access note shown as a mark, "Not paid. Send to the desk") are in IF 05-3:77-83 and 05-3:89-99 as BO 06:155-159 requested.
- The 04:23 "Calendar" and "LiveKeypad" additions and UI-35/UI-36 agree with the backlog (design-paper/12:133).
- The setting `core.live.queue-ceiling` 200 and `core.live.stuck-after` 30 minutes match 03:141 and 03:138; `core.live.keep-data-for` 18 hours matches 02:62; page size 25 matches 05-2:27 and 09-questions.
- Counts: 31 screens (7+5+12+4+3), 20 settings (5+4+3+5+3), 5 abilities, 26 test cases (9+9+6+2), nine questions, and 24 first-release plus 10 later plus UI-35 plus UI-36 stories (only the "34" in 01 and the paper is stale).
- Mermaid blocks in 03 (shell flow, page data states, queued write) and 05-3 (journey 1) agree with their tables, except the items in 22 and 31 (Stuck exits).
- Image links all resolve to files that exist in images/ (W1 to W8, png and svg).
