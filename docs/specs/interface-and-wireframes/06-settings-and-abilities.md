# 6. Settings and abilities

The interface layer registers 15 settings and 3 abilities, all under the module id `core`. Names follow workstream 1's rules: `<module>.<group>.<name>` for settings and `<module>.<record>.<verb>` for abilities. Every number below is a proposed default, not a decision. Where another workstream owns a control the interface draws, this tab names the owner's key and does not declare a second one.

## Settings

"Site owner" in the tables means identity's preset role `owner`, or whoever holds foundations' ability `core.setting.change` for the group; a theatre can map that to any role.

**Where these are shown** (integration ruling R-37, 16 November 2026). Placement is by group, and core has no settings page of its own, so each group below needs a named home. `appearance` is on the Branding screen, as the settings brief rules. The other five are not in the brief's table; Integration ruled these homes the same evening:

| Group | Home | Why |
| --- | --- | --- |
| `shells` | Theatre (`/admin/theatre`) | How the whole site behaves for members; set once |
| `language` | Theatre, beside foundations' `locale` | The same subject |
| `help` | Theatre | Set once for the install |
| `lists` | Advanced (`/admin/advanced`) | Limits, rarely changed |
| `live` | Advanced | Engineering limits for offline working |

`core.lists.page-size` is a choice of 25, 50 or 100 (ruled with the homes), the sizes foundations' `readList` accepts, in place of any whole number from 10 to 100.

### Shells

| Key | Type | Default | Who changes it | Quoted publicly |
| --- | --- | --- | --- | --- |
| `core.shells.members-landing` | `where-they-started` or `members-home` | `where-they-started` | Site owner | No |
| `core.shells.on-shift-bar` | On or off | On | Site owner | No |

Three controls the shells read are owned elsewhere and are not declared here:

- Whether the members' area exists and what it is called are identity's settings `core.members-area.enabled` and `core.members-area.name` (text, up to 40 characters, default "Members' area"). Their preset defaults are in identity's tab 7.
- The credit line in the public footer is core's setting `core.brand.credit-line`.

### Appearance

| Key | Type | Default | Who changes it | Quoted publicly |
| --- | --- | --- | --- | --- |
| `core.appearance.default` | `system`, `light` or `dark` | `system` | Site owner | No |
| `core.appearance.let-people-choose` | On or off | On | Site owner | No |
| `core.appearance.public-dark` | On or off | On. Off pins the public shell to light, for a theatre whose posters assume it | Site owner | No |
| `core.appearance.live-dark` | On or off | On | Site owner | No |

Colour mode is declared here and nowhere else: `core.appearance.default` is the mode a first-time visitor sees, and core's branding screen shows the same control without a key of its own.

Brand colour, logo, fonts and name are workstream 3's settings; they are not repeated here.

### Lists

| Key | Type | Default | Who changes it | Quoted publicly |
| --- | --- | --- | --- | --- |
| `core.lists.page-size` | 25, 50 or 100 | 25 | Site owner | No |
| `core.lists.export-max-rows` | Whole number, 100 to 50,000 | 10,000 | Site owner | No |
| `core.lists.shared-views` | On or off | On | Site owner | No |

### Live mode

| Key | Type | Default | Who changes it | Quoted publicly |
| --- | --- | --- | --- | --- |
| `core.live.keep-data-for` | Duration, 1 to 48 hours | 18 hours | Site owner | No |
| `core.live.queue-ceiling` | Whole number, 50 to 1,000 | 200 | Site owner | No |
| `core.live.stuck-after` | Duration, 5 to 120 minutes | 30 minutes | Site owner | No |
| `core.live.keep-screen-awake` | On or off | On | Site owner | No |

The sound a scan makes at the door is box office's setting `box-office.scanning.result-sound`, not the interface's (integration ruling R-29): off by default, one sound per scan when on. A person can still mute their own device.

### Language and help

| Key | Type | Default | Who changes it | Quoted publicly |
| --- | --- | --- | --- | --- |
| `core.language.offered` | List of shipped languages | `en-GB` only | Site owner | No |
| `core.help.in-app` | On or off | On | Site owner | No |

The theatre's default language is foundations' setting `core.locale.language`. A person's own language is identity's column `core_accounts.locale`, edited on the account screen.

Time zone, currency, language and the operating day's rollover hour are foundations' settings under `core.locale.*`; every screen reads them and none stores its own.

## Abilities

| Ability | Lets a person | Scope | Preset holders |
| --- | --- | --- | --- |
| `core.navigation.arrange` | Reorder, rename and hide menu entries | Site | Site owner |
| `core.saved-view.share` | Share a saved view with everyone who may open the list, and edit or remove shared views | Site or module | Each module's manager role, as the theatre maps it |
| `core.practice.use` | Open live screens in practice mode | Site | Every member |

Two abilities the interface uses are foundations' and are not declared here. `core.setting.change` guards the settings pages in both shells, unless a group or a setting names its own ability. `core.audit.view` guards the Activity list and a record's full history: the Activity list is foundations' Audit screen drawn with the List page, one screen and not two.

Export is not one ability. Each module declares `<module>.<record>.export`, and the list page shows Export only to a holder, so a training officer cannot export orders by holding a general export right.

## Things that are not abilities

| Thing | Why not |
| --- | --- |
| Entering the console | Derived: true for anyone holding an ability that a console entry names. Granting it directly would create people with an empty console |
| Entering the members' area | One fact from workstream 2: a current membership, role, shift or production place |
| Seeing Tonight | A fact: a confirmed shift in its window, or a standing night ability from Front of house |
| Saving a personal view, choosing appearance or language | Everybody may |

## Preferences a person sets for themselves

Not settings in the registry; rows in `core_preferences`: appearance, where sign-in lands, the order of their own bottom-bar sections, hints already dismissed. Language is not among them: it is identity's `core_accounts.locale`. Muting the result sound is a choice about one device, so it stays in that browser's local storage with the sidebar width.
