# Identity consistency findings

Area: docs/specs/identity/ (all files), checked against foundations (02-formats and sub-tabs, 04, 06, 07, 08), core domain, box office, form builder, interface, and the design paper (Part A accounts tab, decisions, status tab, backlog and glossary). Paths below are relative to /home/user/proscenium/docs/ unless shown. Line numbers are from `grep -n` / `cat -n`.

## Summary

41 findings: 9 HIGH, 23 MEDIUM, 9 LOW.

The three that matter most:

1. **Non-members at a members' address** (F1). Identity's own states-and-rules tab promises a "this area is for members" page. Matt's recorded decision I3/Q3, identity's own story ID-18, the glossary and interface tab 3 all say "not found". One more interface line says a refusal page.
2. **Duplicate or divergent settings and shared enums** (F2, F3, F5). The re-assertion window exists twice, as 10 minutes in identity and 15 minutes in foundations. The members' area on/off switch and name exist twice (identity and interface), with different keys and different length limits. The `side` value is `members` in identity and `member` in core and foundations.
3. **Missing inputs from other documents** (F4, F6, F7). The account `origin` enum lacks the value identity itself uses. Core has no "year ends on" date, but year-end expiry depends on one. Foundations and the interface spec assume things identity does not provide: a "data-protection lead" role, and a `core.account-section` point whose shape differs between the two documents.

The one-account-for-audience-and-members decision is honoured everywhere I looked (see "Checked and consistent"). The only drift is in the paper's Part A wording (F33).

---

## HIGH

### F1. Non-members at a members' address: "not found" versus a "for members" page
- **A** `specs/identity/04-states-and-rules.md:201`: "A members' address that somebody without a standing opens shows a short page saying the area is for members, with the theatre's own getting-involved link. It does not reveal what the address would have shown."
- **B** `specs/identity/10-questions-for-matt.md:9` (Q3, decided A, accepted 16 Nov): "'Page not found', the same as any missing page ... the only answer that shows an audience member nothing of the members' side." Also `specs/identity/08-stories.md:142` ("gives the same 'not found'"), `specs/identity/09-test-plan.md:60`, `design-paper/12-build-backlog-and-glossary.md` glossary ("A person outside a shell sees 'not found', never a refusal"), `specs/interface-and-wireframes/03-states-and-rules.md` ("Signed in but not entitled to the shell ... answers 'not found'").
- Related: `specs/interface-and-wireframes/05-1-shells-and-navigation.md:74`: "A deep link into a shell the person is not entitled to is refused by the server with a page that says why and what would let them through." This contradicts interface tab 3 and the decision as well.
- **Prevails:** the recorded decision (Q3 A / I3).
- **Fix:** rewrite identity 04:201 to "answers exactly as a missing page does, and no link is offered". Reword interface 05-1:74 to "answers 'not found'".
- **Owner:** identity tab 3, interface tab 5-1.

### F2. Two settings for the fresh-proof window, with different defaults
- **A** `specs/identity/07-settings-and-abilities.md:30`: `core.sessions.reassert-window`, duration, 10m, 1m to 1h, "How long a fresh proof of identity covers further sensitive actions". Status tab I12 and Q12 also say 10 minutes.
- **B** `specs/foundations/08-settings-and-abilities.md:25`: `core.security.fresh-sign-in`, duration, 15 minutes, 5 to 60 minutes, "How recent a sign-in must be for abilities marked fresh. Read by identity."
- Foundations 02-3 makes `fresh` a per-ability duration. Identity has one global window.
- **Prevails:** identity owns re-assertion (foundations 02-3 "Who owns what") and Q12 settled 10 minutes.
- **Fix:** foundations drops `core.security.fresh-sign-in`, or identity states that `fresh` on every ability resolves to `core.sessions.reassert-window`. Say so in both tabs.
- **Owner:** foundations tab 6, identity tab 6.

### F3. Members' area switch and name declared twice (identity and interface)
- **A** identity `07-settings-and-abilities.md:41-42`: `core.members-area.enabled` (default true; presets student true, amateur true, small venue false) and `core.members-area.name` (default "Members' area", 40 characters; small-venue preset "Staff area").
- **B** interface `specs/interface-and-wireframes/06-settings-and-abilities.md:13-14`: `core.shells.members-area` (on or off, from preset) and `core.shells.members-area-name` (up to 30 characters, default "Members' area").
- The interface's own tab 3 line 50 says "the members' entry takes its label from `core.members-area.name`", so interface 06 disagrees with interface 03.
- **Prevails:** identity. Foundations says workstream 2 owns this area, and identity 04 and ID-20 depend on the identity keys.
- **Fix:** interface deletes both `core.shells.members-area*` rows and points to identity's keys. Align the length limit at 40. Also set the small-venue name preset ("Staff area") once.
- **Owner:** interface tab 6.

### F4. Account `origin` enum lacks a value identity itself uses
- **A** `specs/identity/03-data-model.md:51`: `origin | enum | setup, self, guest, invite, staff`.
- **B** `specs/identity/05-interface-to-other-modules.md:53`: "An unclaimed account with origin `named-by-other`" and `:56` "Accounts with origin `named-by-other` use the same rule". Box office `specs/box-office-payments-ledger/03-data-model.md:357` also relies on `named-by-other`.
- A check constraint on the column as written would reject the value, which is a build error.
- **Prevails:** tab 4 and box office, since they describe a behaviour a person needs (service-messages-only for named people).
- **Fix:** add `named-by-other` to the enum (and say which origin staff-created accounts get, `staff` or `invite`). Also settle which origin the desk uses for a door-list person with no address.
- **Owner:** identity tab 2.

### F5. The `side` value is `members` in identity and `member` in core and foundations
- **A** identity `05-interface-to-other-modules.md:38`: "`side` is `audience` or `members`". `04-states-and-rules.md:205`, `06-screens.md` and the paper glossary ("side: ... Identity owns it") agree.
- **B** core `specs/core-domain-and-public-site/03-data-model.md:335,353,377,393,467`: "`side` ... one of `audience`, `member`". Core's own scope `02-scope.md:48` says "Its name for the members' side is 'members'; this document's 'member' should read the same." Foundations `02-4-data-class-registry.md:66` has `realm`: "`audience`, `member` or `operational`".
- Core's `notify` passes a side to identity's `addressFor`, so a mismatched literal is a runtime bug.
- **Prevails:** glossary ruling (identity owns "side") and core's own scope note: `members`.
- **Fix:** core tab 2 columns change to `members`. Foundations either renames the realm value or records that realm `member` is the same thing as side `members`.
- **Owner:** core tab 2, foundations 02-4.

### F6. Year-end expiry has no data source: core offers no "current year ends on"
- **A** identity `02-scope.md:48`: "3. Core domain | The organisation's year pattern offers a 'current year ends on' date. Grants that expire at the year end read it." Used by `core.grants.default-expiry` (year-end), the `year_end` expiry rule, ID-24, and the test plan's year-end cases.
- **B** core `07-settings-and-abilities.md:13-26` lists all `core.organisation.*` settings: no year, season-year or committee-year setting, and no year pattern anywhere in core. Paper Part A (`design-paper/04-part-a-features.md:25`) promises "The year and season pattern: a committee year, a financial year, named seasons, or none." Only box office declares `finance.year.starts` (a financial year).
- **Prevails:** unclear: needs Matt or the integrating thread. The paper requires the pattern, and core does not declare it.
- **Fix:** core adds a setting for the committee year end (identity reads it), or identity adds its own `core.grants.year-end` setting and notes that core's year pattern is out of scope.
- **Owner:** core tab 6 (preferred), identity tab 1.

### F7. Foundations relies on a "data-protection lead" role that identity does not define
- **A** `specs/foundations/08-settings-and-abilities.md:48`: "`core.audit.view` is also offered to the data-protection lead role that identity defines." Also `specs/foundations/07-screens.md:15` (Audit screen: "Owner; data-protection lead") and `specs/foundations/09-stories.md:65` (F-33).
- **B** identity `07-settings-and-abilities.md:144-172`: 15 preset roles (14 plus `welfare-lead`). None is a data-protection lead. The paper backlog `12-build-backlog-and-glossary.md:146` says "Preset roles stay at fifteen".
- **Prevails:** identity (it owns preset names; status tab and backlog fix the count at fifteen).
- **Fix:** foundations offers `core.audit.view` to `administrator` or `committee-member`, or Matt adds a sixteenth preset (and the backlog line changes).
- **Owner:** foundations tabs 6 and 3; identity only if a role is added.

### F8. `core.account-section`: owner, shape and scope disagree
- **A** identity `05-interface-to-other-modules.md:160` (a point identity "offers", kind data): "A section on the 'My account' page or on the console's account page: its id, side, the ability that shows it, and the component". `06-screens.md:41,86` rely on this.
- **B** interface `04-interface-to-other-modules.md:17,92`: "`core.account-section` | A section of My account in the public shell (Tickets, Passes)"; fields "`to` (under `/account`), `icon`, `order`, optional `count`". It is a link entry with no component, no side and no console use. Foundations' index (`specs/foundations/06-interface-to-other-modules.md:52`) lists it under Interface (6), not Identity. Forms and box office contribute to it under interface's shape.
- Consequences: a console account page section has no point at all. A "side" cannot be set on the entry.
- **Prevails:** unclear: needs integration. Foundations' index says interface owns the name. Identity needs the console variant.
- **Fix:** keep `core.account-section` as the interface's link-based point for My account (identity contributes its own seven screens to it). Give identity's console person page its own point, for example `core.account-console-section`, with the component and ability fields, and register it in foundations' index.
- **Owner:** identity tab 4, interface tab 4, foundations index.

### F9. Identity's facts API cannot be implemented from the foundations fact format (`holdersOf`)
- **A** identity `05-interface-to-other-modules.md:39`: `holdersOf(ability, record?)` "Resolves across granted roles ..., facts mapped to the ability, and ownership ... Returns canonical account ids, each once". Core's `notifyHolders` (`core .../05-interface-to-other-modules.md:70`) depends on it.
- **B** `specs/foundations/02-3-abilities-registry.md:87,93`: a fact's `server/facts/<name>.ts` "answers whether an account holds the fact, for which record, and until when", an "asynchronous, read-only function". It answers per account, and there is no way to list the accounts that hold a fact. The same gap affects the `core.members` audience source (`05:100`, "everyone for whom `core.member` is true").
- **Prevails:** foundations' format must grow, since identity's services are agreed in core, box office and the interface.
- **Fix:** add an optional `holders(record?)` enumerator to the fact entry, or state that `holdersOf` and `core.members` enumerate by querying each standing source's own list. Say which in identity 05.
- **Owner:** foundations 02-3, identity tab 4.

---

## MEDIUM

### F10. Pronouns: promised in a story and a wireframe, excluded elsewhere
- **A** `specs/identity/08-stories.md:94` (ID-11): "A person can change their name, the name they are known by, and pronouns." The wireframe `images/06-person-page-console.svg` shows "Known as, pronouns".
- **B** `specs/identity/02-scope.md:53`: "A theatre's extra questions about a person (pronouns, course, dietary needs) are form-builder fields ... Identity ships none of them." `03-data-model.md` has no pronouns column. `06-screens.md:46` "Your details: Name, preferred name, phone, language".
- **Prevails:** scope and data model (form builder owns them).
- **Fix:** delete "pronouns" from ID-11 and the wireframe, or move it to a form-builder-bound field.
- **Owner:** identity tabs 5 and 7.

### F11. Emergency contacts and access needs: "later" in stories, first release everywhere else
- **A** `specs/identity/08-stories.md:129` (ID-17): "Emergency contacts and access needs (later)". The grouping table at `:8` lists it under Later.
- **B** `specs/identity/06-screens.md:50,59`: "Access needs" (My account) and "Member details ... emergency contacts" both marked Release "First". Tables `core_emergency_contacts` and `core_access_profiles`, abilities `core.emergency-contact.read` and `core.access-profile.read`, and the `welfare-lead` preset are all specified without a release split.
- **Prevails:** unclear: needs Matt or the integrating thread. Forms and front of house both asked for the welfare holder (`07:166`), which implies first release. The backlog (`12-build-backlog`, 7 later stories) places ID-17 as later.
- **Fix:** either mark both screens "Later" or promote ID-17 and change the counts (37, 30, 9, 21, 7; backlog row).
- **Owner:** identity tabs 5 and 7; backlog row.

### F12. Recovery codes: required for every first passkey, or only for Owners?
- **A** `specs/identity/04-states-and-rules.md:127`: "Recovery codes are offered to anyone and required of nobody except Owners, who are shown them at setup and must type one back."
- **B** `specs/identity/08-stories.md:36` (ID-03): "Adding the first passkey shows the recovery codes and asks for one to be typed back before the page can be left." `06-screens.md:27` "Add a passkey ... skippable unless a sensitive ability is held".
- **Prevails:** states-and-rules (and ID-37 for Owners); ID-03 should say "offers".
- **Fix:** reword ID-03 to an offer for non-Owners, with the typed-back requirement for Owners only.
- **Owner:** identity tab 7.

### F13. Welfare lead missing from the "Suggested holders" column
- **A** `specs/identity/07-settings-and-abilities.md:162`: "Identity's abilities for each role are the Suggested holders column above." Rows `:109-110`: `core.emergency-contact.read` "Fact: the duty manager's shift tonight"; `core.access-profile.read` "Box-office manager; fact: ...".
- **B** `:172`: welfare-lead "holds `core.access-profile.read` and `core.emergency-contact.read`, and nothing else." Forms `07-settings-and-abilities.md:48`: "`welfare-lead` ... alone holds read-special in the presets".
- **Prevails:** the "fifteenth preset role" text, since it was added later for these abilities.
- **Fix:** add "Welfare lead" to both rows. Decide whether Box-office manager really holds `core.access-profile.read` (it may be deliberate through `share_with_box_office`; say so).
- **Owner:** identity tab 6.

### F14. Retention screen names the wrong ability to arm
- **A** `specs/identity/06-screens.md:80`: "Retention | What each sweep would do today; arm or disarm it | `core.identity-settings.manage` | Later". `:106` navigation: "Settings: Sign-in, Retention | `core.identity-settings.manage`".
- **B** `specs/identity/07-settings-and-abilities.md:56,117`: `core.retention.armed` "Changed by `core.retention.arm`"; ability `core.retention.arm` "Arm or disarm the account sweeps | Owner only".
- **Prevails:** tab 6 (07), the abilities table.
- **Fix:** the screen shows to `core.identity-settings.manage` but the arm control needs `core.retention.arm`.
- **Owner:** identity tab 5.

### F15. Turnstile secret: name and optionality disagree
- **A** `specs/identity/05-interface-to-other-modules.md:216`: "`CORE_TURNSTILE_SECRET` | Optional | Not identity's: ... the secret CORE\_TURNSTILE\_SECRET\_KEY". One row names two spellings.
- **B** `specs/foundations/08-settings-and-abilities.md:67`: `CORE_TURNSTILE_SECRET_KEY` | when-used | "(declared by identity, verified by core)". Identity ID-10 (`08-stories.md:87`) "refuses outright, with a red health check, if the challenge secret is not set", which is not optional. Identity Q-table (`10:30`) says "core owns one bot-challenge service and its secret".
- **Prevails:** `CORE_TURNSTILE_SECRET_KEY`, owned by core.
- **Fix:** remove the row from identity's secrets table (point to core), or use the exact name. Foundations' note "declared by identity" and identity's "Not identity's" conflict, so pick core. Align ID-10 and 04:98 ("when a key is set") on required versus optional.
- **Owner:** identity tab 4, foundations tab 6.

### F16. Encryption key for access profiles: `CORE_PROFILE_KEY` or `CORE_ENCRYPTION_KEY`
- **A** identity `05:213`: "`CORE_PROFILE_KEY` | Always | Encrypting access profiles; versioned". `03-data-model.md:334-335`: payload "encrypted in the application before storage", Special category, `key_version`.
- **B** foundations `02-4-data-class-registry.md:44` ("Special category columns are encrypted by the helper ... with a key held as a Worker secret") and `08-settings-and-abilities.md:65`: `CORE_ENCRYPTION_KEY` "Encrypts stored credentials and columns of class special ... with a key version".
- **Prevails:** foundations: one platform key and one rotation procedure, using `col.special()` rather than a bespoke payload column.
- **Fix:** drop `CORE_PROFILE_KEY`, or state why access profiles need a separate key. Note `col.special()` takes a column name and "cannot be searched", so the single `payload` text blob is a deliberate choice that should say so.
- **Owner:** identity tabs 2 and 4.

### F17. Data model is not written in the foundations layout, and says it will be re-cut
- **A** `specs/foundations/02-4-data-class-registry.md:120-137`: part 2 gives each table "a heading line" (realm, subject, append-only, retention), types such as timestamp and boolean, and erasure verbs keep, anonymise, redact, clear, retain. `04-data-model.md:5` repeats that every table has the heading line.
- **B** `specs/identity/03-data-model.md`: no table has realm, subject, append-only or retention. Types are `time` and `flag`. Erasure values are "Set to null", "Row deleted", "Kept". Only `core_fact_abilities` (`:222-238`) is written in the new style (backtick names, `instant`, "Rules"). `01-overview.md:36` and `02-scope.md:31` still say "will be re-cut ... when they land", and the formats landed.
- **Prevails:** foundations format.
- **Fix:** add the heading line per table (for example `core_accounts`: realm operational, subject `id`; `core_emergency_contacts`: realm member; `core_access_profiles`: special), map erasure to the standard verbs, and delete the "will be re-cut" sentences. Realm matters for the privacy record and exports.
- **Owner:** identity tab 2, tab 1.

### F18. "Privileged" does not imply "fresh" in identity; it does in foundations
- **A** `specs/foundations/02-formats.md:112`: "`risk: 'privileged'` defaults to strong and fresh." `02-3-abilities-registry.md:61` `fresh`: "set when `risk` is `privileged`".
- **B** `specs/identity/07-settings-and-abilities.md:97`: "A privileged ability needs a strong session. A privileged ability used to change something also needs a fresh re-assertion." Reads such as `core.account.read`, `core.emergency-contact.read` and `core.access-profile.read` are privileged but would not need fresh. `04-states-and-rules.md:114` ("any ability its module flags as sensitive").
- The abilities table has no `assurance`, `fresh` or `grantAt` columns, so which abilities opt out cannot be seen.
- **Prevails:** identity's refinement is sensible, but must be declared. Foundations' default needs `fresh: false` on read abilities.
- **Fix:** add the three entry fields to the identity ability table (at least `fresh: false` on the reads, `grantAt: site` on `core.retention.arm`, `core.identity-settings.manage` and similar). State the rule once in both documents.
- **Owner:** identity tab 6.

### F19. "Benefits service" is stale: box office uses `core.requirement`
- **A** `specs/identity/02-scope.md:52`: "Member prices come from a benefits service that Membership offers and box office calls." `04-states-and-rules.md:203`: "box office asked the benefits service".
- **B** `specs/foundations/02-formats.md:167-187` (requirements) and box office `05-interface-to-other-modules.md:247`: "Box office calls `requirements.check(refs, { account, at, record })`". `fact:core.member` is a valid reference (`02-formats.md:173`).
- **Prevails:** foundations ruling on `core.requirement`.
- **Fix:** replace "benefits service" with "`requirements.check`". Add `core.requirement` to identity's points and facts reading, and say `core.member` can be referenced as `fact:core.member`.
- **Owner:** identity tabs 1 and 3.

### F20. Preset roles named by other specs do not exist
- **A** core `07-settings-and-abilities.md:102-116` suggested holders: "Programme manager", "Theatre manager", "marketing", "duty manager". Box office `05:198` and `07:139` still say "Role names are illustrations until workstream 2 publishes its preset roles".
- **B** identity `07-settings-and-abilities.md:142-157`: the 14 keys (plus `welfare-lead`) have no programme-manager or theatre-manager. The nearest are `administrator`, `production-lead` and `communications-officer`.
- **Prevails:** identity's list (agreed as the one list; foundations `02-1:220`).
- **Fix:** core maps "Programme manager" and "Theatre manager" to identity keys (or asks identity for a new preset; the backlog fixes the count at 15). Box office clears the stale "illustrations" sentence.
- **Owner:** core tab 6, box office tabs 4 and 6.

### F21. Form builder expects identity to contribute `forms.bindable`; identity does not
- **A** form builder `05-interface-to-other-modules.md:13`: `forms.bindable` example contributor "Identity: phone number, emergency contact". `:160` "Custom fields on a person | 2 | Settled | They attach to `core.account` with a side".
- **B** identity `05-interface-to-other-modules.md:152-162` (points) and `:218-226` (what each workstream must do): no `forms.bindable`, no `forms.slot` for `core.account`. `03-data-model.md:329` says the access questions are "a form-builder form" but the payload is an encrypted blob in identity.
- **Prevails:** unclear: needs integration. Form builder has recorded it as settled.
- **Fix:** identity lists contributions: `forms.bindable` for phone, preferred name and emergency contact, and a `forms.slot` on `core.account`. Also say how the access-needs form feeds `core_access_profiles`.
- **Owner:** identity tab 4.

### F22. Unclaimed retention: two different rules
- **A** `specs/identity/05-interface-to-other-modules.md:56`: "An unclaimed account is anonymised `core.retention.unclaimed-after` after the last record that references it, and at the next sweep if nothing references it at all."
- **B** `specs/identity/04-states-and-rules.md:276`: "An unclaimed account with no order, record, grant or booking newer than the unclaimed-days setting" (Default "Off until armed"). `07:53` `core.retention.unclaimed-after` default 1095d.
- An account with no references would be erased at once under A and after three years under B. A also ignores "off until armed".
- **Prevails:** tab 3 and settings.
- **Fix:** reword 05:56 to the 04 rule (clock from the later of creation and last reference, only when armed). Also fix the setting name "unclaimed-days" to `core.retention.unclaimed-after`.
- **Owner:** identity tab 4.

### F23. Foundations' audit table declares `move` on an append-only column
- **A** `specs/foundations/04-data-model.md:82`: `actor_account_id` "`col.account`, role actor, on merge move" in `core_audit`, which is append-only (`:17`).
- **B** `specs/foundations/02-formats.md:114`: "Append-only tables must use `alias`." Identity's merge-completeness test (`09-test-plan.md:71`) walks the same registry.
- **Prevails:** the formats ruling: `alias`.
- **Fix:** change the audit column to `alias`. Relevant to identity because merge reads must follow `merged_into_id`.
- **Owner:** foundations tab 2.

### F24. "Unassigned audit service": stale
- **A** `specs/identity/02-scope.md:51`: "The audit service is in nobody's list of workstreams ... Raised with the integrating thread."
- **B** `specs/foundations/02-formats.md:115`: "Foundations specifies the audit service and its table `core_audit`." Identity's own `01-overview.md:41` and `10-questions-for-matt.md:28` already say foundations does.
- **Prevails:** foundations ruling.
- **Fix:** replace the row by "Foundations: audit service and `core_audit`".
- **Owner:** identity tab 1.

### F25. Wrong cross-reference: passwords are question 4, not question 1
- **A** `specs/identity/02-scope.md:33`: "Passwords, Microsoft sign-in | Not in the first release ... Question 1 asks Matt to confirm."
- **B** `specs/identity/10-questions-for-matt.md:7,10`: question 1 is guest accounts; question 4 is passwords (decided B). Microsoft is not asked at all (decision in `design-paper/08-decisions.md:12` says Google first).
- **Prevails:** tab 9.
- **Fix:** "Question 4 records Matt's decision."
- **Owner:** identity tab 1.

### F26. `core.signed-in` is used as an ability; foundations says it is a route declaration
- **A** `specs/identity/06-screens.md:102`: "My account | Public, account menu | `core.signed-in`".
- **B** `specs/identity/05-interface-to-other-modules.md:180`: "A fact for 'has a live session' | The route declaration `signed-in`". `specs/foundations/02-1-module-manifest.md:187` (navigation `ability` takes an ability or list, "never a fact name") and `02-3:112` (`ability: 'signed-in'`).
- Foundations' shell names for navigation are `account`, `members`, `console`, `live` (`02-formats.md:116`); identity writes "Public, account menu" and interface says My account is part of the public shell.
- **Prevails:** foundations' navigation format.
- **Fix:** write "ability: `signed-in`" (the route keyword), and name shells as the manifest does. Interface and foundations must agree on whether `account` is a shell.
- **Owner:** identity tab 5, interface, foundations.

### F27. Unverified address rules contradict guest checkout
- **A** `specs/identity/04-states-and-rules.md:56`: "An unverified address cannot be used to sign in and receives only its own verification message."
- **B** `:41`: an unclaimed account "receives only messages about the thing that made it (an order confirmation, an invitation)". `05:38`: `addressFor` "an unclaimed account returns the address it was created with". `03:76,79` guest addresses are added as `checkout` and have `verified_at` null. `05:38` also says `addressFor` gives "the verified address".
- **Prevails:** the guest-checkout behaviour (decision Q1).
- **Fix:** scope 04:56 to addresses added by the person, and say `addressFor` may return an unverified checkout address for an unclaimed account for service messages only.
- **Owner:** identity tabs 3 and 4.

### F28. `core_fact_abilities` key and prefix note count two columns, but the key has three
- **A** `specs/identity/03-data-model.md:36`: "`core_role_abilities` and `core_fact_abilities` are keyed by their two columns together". `:230` "Key: `fact` and `ability` together."
- **B** `:234`: with pinned mappings "its key is `fact`, `ability` and `pinned_record` together". Foundations' index (`06-interface-to-other-modules.md:63`) repeats "keyed by their two columns".
- **Prevails:** `:234` (the later ruling).
- **Fix:** fix `:36` and `:230`, and the foundations index note.
- **Owner:** identity tab 2, foundations index.

### F29. Anonymous desk sale: raised, never answered
- **A** box office `02-scope.md:47` "Open: an anonymous desk sale with no account"; `05:107` "the order has no account; raised with workstream 2".
- **B** identity `05:46`: "Every human a module records is a `core_accounts` row". Its cases (`:48-54`) cover a name with no address but not a sale that records no person.
- **Prevails:** unclear: needs identity to answer. Likely: an order with no buyer needs no account, and the order's subject is `none`.
- **Fix:** add a row to identity's "People without a sign-in" table.
- **Owner:** identity tab 4, box office.

### F30. Duplicate-suggestion behaviour in the paper has no home
- **A** `design-paper/04-1-accounts-audience-and-members.md:32`: "When the system sees a second account being created for an address pattern or name it already knows, it offers to link."
- **B** identity: merge offered only when an added address is held by another account (`04:49-50`), plus staff merge. No name or address-pattern matching anywhere. `01-overview.md` and scope do not list it as out of scope.
- **Prevails:** unclear. The paper is a statement of intent; the spec may be narrower.
- **Fix:** state in identity tab 1 that name matching is out of scope (or add a staff "possible duplicates" list), and tone down the paper.
- **Owner:** identity tab 1, paper 04-1.

### F31. Guest checkout wording in Part A
- **A** `design-paper/04-part-a-features.md:29`: "Guest checkout without an account, claimable later."
- **B** identity `10-questions-for-matt.md:7` (Q1 A, decided): guest checkout creates an unclaimed account. The status tab says Part A "will be amended".
- **Prevails:** the decision.
- **Fix:** "Guest checkout, with an unclaimed account the buyer can claim later."
- **Owner:** paper Part A.

### F32. Merge naming: winner and loser versus survivor
- **A** identity `03,04` use "winner" and "loser"; `05:40` `mergeAccounts(survivorId, otherId)`; `08:227` "the survivor".
- **B** the paper glossary lists "survivor" as the identity word; core uses "surviving" and "survivor".
- **Prevails:** glossary: "survivor".
- **Fix:** use "survivor" for the account kept and "merged-away account" for the other. Low risk but visible in table headings (`winner_id`, `loser_id`).
- **Owner:** identity tabs 2 and 3.

---

## LOW

### F33. Microsoft in the paper's sign-in list
- `design-paper/05-1-data-settings-and-permissions.md:67`: "Sign-in | Passkey, email link, Google, Microsoft". Identity `02-scope.md:33` puts Microsoft out of scope for the first release, and the decision (`design-paper/08-decisions.md:12`) is passkey plus email link with Google first. Mark Microsoft as later.

### F34. Ability count in the intro: 16 versus 17
- **A** `specs/identity/07-settings-and-abilities.md:3`: "Identity registers 29 settings and 16 abilities".
- **B** `:122` "That makes 17 rows" and `01-overview.md:31` "17 abilities". I counted 17 rows.
- **Fix:** change `07:3` to 17.

### F35. Preset role count in the overview: 14 versus 15
- **A** `specs/identity/01-overview.md:31`: "29 settings, 17 abilities, 14 preset roles".
- **B** `specs/identity/07:164` "A fifteenth preset role" (`welfare-lead`); `design-paper/12-build-backlog-and-glossary.md:146` "Preset roles stay at fifteen". The table has 14 rows plus the welfare row.
- **Fix:** overview says 15.

### F36. Primary address wording
- `specs/identity/08-stories.md:102` "Changing the primary address" and the console wireframe "Primary address, verified" versus the model's two named pointers (`audience_email_id`, `members_email_id`; `04:52`). Use "the audience address or the members' address".

### F37. Placeholder name for an erased person
- `specs/identity/05:20`: `accountLabel` gives "Former account". Foundations `02-4:53` and `04-data-model.md:83` use "Former member" and "the theatre's term for a former member". Pick one, and make it a vocabulary term if the theatre may rename it.

### F38. Interface says My account is shown "Always"
- `specs/interface-and-wireframes/05-1-shells-and-navigation.md:80` (account menu): "My account | Always"; identity `06-screens.md:102` shows it only to a signed-in person. The menu only exists for a signed-in person, so no real conflict, but state "when signed in".

### F39. Identity's setup step does not mention the setup code
- `specs/identity/06-screens.md:112`: "Create the first Owner ... Name, address, passkey, recovery codes typed back". Foundations `07-screens.md:19` says `/setup` needs `CORE_SETUP_CODE`, and story ID-37 (`08:253-256`) does not mention it. Add a line so the two flows read as one.

### F40. Foundations still lists preset role names as open
- `specs/foundations/02-formats.md:99` "Still open: ... The preset role names that presets map abilities to. Workstream 2 owns them." Identity has published them (`07:142`). Mark closed.

### F41. "My account" `core.account.merged` payload and claim event timing
- Not an inconsistency of names, but note: forms and core list `core.account.claimed` and `core.account.merged` as "Settled" listener events (form builder `05:162`, core `05:111`), while identity marks all of its events `internal: true` (`05:121`). Internal events still reach listeners, so this is consistent, but the form builder text should say "internal event" so nobody offers them to a webhook.

---

## Checked and consistent

- **Id prefixes and table count.** All 15 prefixes in identity 03 (acc, aem, pky, fid, rcc, tok, pch, ses, rol, gra, mrg, mrgi, dreq, emc, apr; random flags) match foundations' index (`06-interface-to-other-modules.md:63`), with no clashes against other owners' prefixes. 17 tables = 15 with ids plus two keyed tables; backlog says 17.
- **Counts that agree.** 29 settings (counted 10+5+5+9), 31 screens (9+7+3+12), 37 stories (30 first release, 9 gate, 7 later; backlog row 9/21/7 and its phase lists add to 30), 12 questions, 17 ability rows, 15 preset roles (paper backlog line 146), 3 wireframes, 4 diagrams.
- **Questions for Matt.** Q1 to Q12 decisions match the paper status tab I1 to I12 (wording and answers) and the decisions tab (passkey plus email link, Google first). Defaults in settings (30d, 14d, 10m, 15m, 1095d, 730d, 7d cooling-off, 30d merge undo) match Q12 and the other questions.
- **One account for audience and members.** Honoured in identity overview, scope, tab 3 rules 1 to 8, ID-19 and ID-21, and in core (`core_accounts` only; `side` per row), box office (orders keyed to an account, no name or email of its own), form builder (custom fields attach to `core.account`), interface (one account menu, My account inside the public shell) and the paper's Part A and glossary. No spec introduces a separate member account or member login. The only drift is the paper's guest wording (F31).
- **Foundations contracts.** Module id `core` and area names; `core.account` / `core.role` / `core.grant` / `core.data-request` record types; `core.member` fact; points `core.sign-in-method`, `core.erasure-hold`, `core.merge-handler`, `core.export-contributor`; the `col.account` role and `onMerge` options and the alias-on-append-only rule; `pin: true` fact mappings (identity owns the mapping table); `standing: true` facts; `internal: true` on every identity event; email-subject and `unlinked: 'staff'` rows (identity's sweep follows the rulings); rate-limit class `sign-in`; refusal body; `audit: 'read'` handling; `defineRoute` `protect: 'turnstile'`.
- **Core domain.** `addressFor(accountId, side)`, `holdersOf(ability, record)`, `mergeAccounts` named as agreed; `core.production-team` is declared as a standing fact (identity 05:222 and core 07:139); the audience-source contribution of role holders belongs to identity (core `05:289`); core's merge-by-declaration matches identity's merge design; `notify` takes an account and a side.
- **Box office.** `findOrCreateAccount(address, name, origin)` signature, unclaimed accounts for guests, erasure holds contributed by box office and payments, "Tickets and orders" through `core.account-section` (but see F8 for the shape).
- **Interface.** `describeViewer` returns the name, the sides open and the navigation entries (interface 03:50 and identity 05:17); `core.member` as the members' entitlement; three shells plus live; the header states (signed out, audience, member, staff) match ID-20 and the header wireframe; the shared word "hold" and "claim" rulings.
- **Form builder.** welfare-lead alone holds read-special; Administrator is "Officers and staff"; membership-officer and production-lead are the functional roles; merge and claim events used as internal listeners.
