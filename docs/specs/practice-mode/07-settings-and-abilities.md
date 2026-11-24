# 6. Settings and abilities

Practice mode has five settings, all on the Admin › Practice page (PM-S9), and two abilities. Nobody holds a standing grant to practise: a person may practise a scenario only while a Training course opens it to them (Matt, 24 November 2026), and administrators may open any scenario to check it.

## Settings

All are `core.practice.*`, changed with `core.practice.manage`, audience `staff` unless shown. None is quotable.

| Key | Kind | Default | Range | Audience | Meaning |
| --- | --- | --- | --- | --- | --- |
| `core.practice.enabled` | boolean | true |  | signed-in | Off hides every entry point and ends every session at its next request (S5). The scenario list says "Practice is switched off here" |
| `core.practice.idle-end` | duration | 2h | 15m to 12h | signed-in | A session with no marked request for this long ends. Shown on the panel ("Ends after 2 hours idle") |
| `core.practice.scenarios-off` | list of choice | empty | the contributed scenario ids | signed-in | Scenarios the theatre does not offer. Searchable, because the list grows with modules |
| `core.practice.copy-configuration` | boolean | true |  | staff | Off makes stores from the shipped sample configuration instead of the theatre's own venues, prices and products (question 2). For a theatre that does not want even its prices in a store |
| `core.practice.report-completion` | boolean | false |  | staff | Later (PM-22). On, finishing every task of a scenario announces `core.practice.scenario-completed` for Training |

The end of the show night is not a practice setting: it is `core.locale.day-start` (04:00 as shipped), which every operational day already uses (S5).

## Abilities

In Foundations' seven-column format.

| Ability | Acts on | Risk | Owner | Implies | Purpose | Holders in the presets |
| --- | --- | --- | --- | --- | --- | --- |
| `core.practice.use` | `core.practice-scenario` | normal |  |  | Start, carry on and leave one's own practice session on that scenario. `audit: false`: using it writes nothing real, by design | Fact `training.practice-open` in all three presets; no role holds it |
| `core.practice.manage` | site-wide | normal |  | `core.practice.use` | Change the settings above, switch scenarios off, and open any scenario to check it. Audited, as every setting change is | `administrator` (and `owner`, which holds everything) |

`core.practice.use` was declared by Interface (part 6 of its spec) as a site-wide ability for every member. This spec takes it over and narrows it, as Matt decided: it now acts on one scenario and comes only from the Training fact, so Interface's ability count drops by one and its "every member" holder is withdrawn.

**Inside a store** a person holds the scenario's `abilities` instead of their own roles (M6). Those grants exist only in the store and are never shown on the real permission screens.

## Presets

| Preset | Practice on | Who may practise | Scenarios on at setup |
| --- | --- | --- | --- |
| `student-society` | Yes | Holders of `training.practice-open` for that scenario; administrators | Every contributed scenario |
| `amateur-company` | Yes | The same | Every contributed scenario |
| `small-venue` | Yes | The same | Every contributed scenario |

In every preset, practice does nothing for anyone but administrators until a training manager publishes a course whose lesson links to a scenario.

## Facts used

| Fact | Owner | Used for |
| --- | --- | --- |
| `training.practice-open` | Training | Presets map it to `core.practice.use`. Held for a scenario through a course that may be viewed, a current record, or being a trainer (part 4) |
| `front-of-house.on-shift` | Front of house | Inside a store only, created by sample sets so screens that need tonight's shift work as they do for real |
