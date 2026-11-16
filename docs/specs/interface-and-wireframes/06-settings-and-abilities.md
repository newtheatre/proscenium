# 6. Settings and abilities

The interface layer registers 20 settings and 5 abilities, all under the module id `core`. Names follow workstream 1's rules: `<module>.<group>.<name>` for settings and `<module>.<record>.<verb>` for abilities. Every number below is a proposed default, not a decision.

## Settings

"Site owner" means whoever holds `core.setting.change` for the group; a theatre can map that to any role.

### Shells

| Key | Type | Default | Who changes it | Quoted publicly |
| --- | --- | --- | --- | --- |
| `core.shells.members-area` | On or off | From the preset: on for a student society and an amateur company, off for a small venue | Site owner | No |
| `core.shells.members-area-name` | Text, up to 30 characters | "Members' area" | Site owner | Yes |
| `core.shells.members-landing` | `where-they-started` or `members-home` | `where-they-started` | Site owner | No |
| `core.shells.on-shift-bar` | On or off | On | Site owner | No |
| `core.shells.credit-line` | On or off | On | Site owner | No |

### Appearance

| Key | Type | Default | Who changes it | Quoted publicly |
| --- | --- | --- | --- | --- |
| `core.appearance.default` | `system`, `light` or `dark` | `system` | Site owner | No |
| `core.appearance.let-people-choose` | On or off | On | Site owner | No |
| `core.appearance.public-dark` | On or off | On. Off pins the public shell to light, for a theatre whose posters assume it | Site owner | No |
| `core.appearance.live-dark` | On or off | On | Site owner | No |

Brand colour, logo, fonts and name are workstream 3's settings; they are not repeated here.

### Lists

| Key | Type | Default | Who changes it | Quoted publicly |
| --- | --- | --- | --- | --- |
| `core.lists.page-size` | Whole number, 10 to 100 | 25 | Site owner | No |
| `core.lists.export-max-rows` | Whole number, 100 to 50,000 | 10,000 | Site owner | No |
| `core.lists.shared-views` | On or off | On | Site owner | No |

### Live mode

| Key | Type | Default | Who changes it | Quoted publicly |
| --- | --- | --- | --- | --- |
| `core.live.keep-data-for` | Duration, 1 to 48 hours | 18 hours | Site owner | No |
| `core.live.queue-ceiling` | Whole number, 50 to 1,000 | 200 | Site owner | No |
| `core.live.stuck-after` | Duration, 5 to 120 minutes | 30 minutes | Site owner | No |
| `core.live.keep-screen-awake` | On or off | On | Site owner | No |
| `core.live.result-sound` | On or off | Off | Site owner; each person can also mute their own device | No |

### Language and help

| Key | Type | Default | Who changes it | Quoted publicly |
| --- | --- | --- | --- | --- |
| `core.language.default` | A shipped language | `en-GB` | Site owner | No |
| `core.language.offered` | List of shipped languages | `en-GB` only | Site owner | No |
| `core.help.in-app` | On or off | On | Site owner | No |

Time zone, currency and the operating day's rollover hour are organisation settings owned by workstream 3; every screen reads them and none stores its own.

## Abilities

| Ability | Lets a person | Scope | Preset holders |
| --- | --- | --- | --- |
| `core.setting.change` | Change settings in a group; granted per settings group | Site or module | Site owner |
| `core.navigation.arrange` | Reorder, rename and hide menu entries | Site | Site owner |
| `core.saved-view.share` | Share a saved view with everyone who may open the list, and edit or remove shared views | Site or module | Each module's manager role |
| `core.audit.read` | Open the Activity list and a record's full history | Site, module or record | Site owner; a module's manager for that module |
| `core.practice.use` | Open live screens in practice mode | Site | Every member |

Export is not one ability. Each module declares `<module>.<record>.export`, and the list page shows Export only to a holder, so a training officer cannot export orders by holding a general export right.

## Things that are not abilities

| Thing | Why not |
| --- | --- |
| Entering the console | Derived: true for anyone holding an ability that a console entry names. Granting it directly would create people with an empty console |
| Entering the members' area | One fact from workstream 2: a current membership, role, shift or production place |
| Seeing Tonight | A fact: a confirmed shift in its window, or a standing night ability from Front of house |
| Saving a personal view, choosing appearance or language | Everybody may |

## Preferences a person sets for themselves

Not settings in the registry; rows in `core_preferences`: appearance, language, where sign-in lands, the order of their own bottom-bar sections, sound on this device, hints already dismissed.
