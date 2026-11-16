# 5. Screens

The interface layer itself owns 33 screens: the frames, the homes, and the screens no single module can own. Every other screen belongs to a module and is listed in that module's specification, built from the page types defined here.

| Sub-tab | Holds |
| --- | --- |
| Shells and navigation | The four shells (public, members' area, console, site administration), live mode, the account menu, addresses, how navigation is assembled |
| Page conventions | The seven page types and the rules every screen follows |
| Key journeys | Ten journeys step by step, with what the person sees when each goes wrong |
| Wireframes | Drawn layouts of the shells and the important screens |

## Screens the interface layer owns

"First" means the first release (roadmap phases 1 to 3). Screens marked with a workstream number are drawn here and specified there.

### Public shell

| Screen | Purpose | Who sees it | Type | First |
| --- | --- | --- | --- | --- |
| Public layout | Header, footer, account menu, on-shift bar | Everyone | Frame | Yes |
| Booking layout | Reduced header with steps and hold timer | Anyone booking | Frame | Yes |
| My account home | Upcoming tickets first, then links to the rest | Signed-in person | Home | Yes |
| Account sections frame | Tickets, orders, passes, details, preferences, security: the frame that module and workstream 2 pages sit in | Signed-in person | Frame | Yes |
| Notifications inbox (audience side; the member inbox is a separate screen in the members' area) | Read and unread, with a count | Signed-in person | List | Yes |
| Not found, refused, error | Say what happened and where to go | Everyone | Page | Yes |
| Offline page | Shown by the installed app when a page was never loaded | Everyone | Page | Yes |

### Members' area

| Screen | Purpose | Who sees it | Type | First |
| --- | --- | --- | --- | --- |
| Members' layout | Top bar, bottom tabs, on-shift bar | Members | Frame | Yes |
| Members' home | What needs this member next | Members | Home | Yes |
| More | Sections that do not fit the bottom bar | Members, on a phone | List | Yes |
| My history | Shifts worked, training held, shows credited, from whichever modules are on | Members | Record | Later |
| Welcome | One-time introduction after joining | New members | Steps | Later |

### Console

| Screen | Purpose | Who sees it | Type | First |
| --- | --- | --- | --- | --- |
| Console layout | Sidebar, page header, command palette, help panel | Anyone with a console ability | Frame | Yes |
| Console home | Work awaiting this person, then today | Anyone with a console ability | Home | Yes |
| Command palette | Go to, find, do; shared with site administration | Anyone with a console or site administration ability | Overlay | Yes |
| Help panel | This screen's documentation beside the screen | Anyone with a console or site administration ability | Overlay | Yes |
| Module settings page | Generated from the registry, at `/console/<module>/settings` | Per setting's ability | Settings | Yes |
| Module setup | A module's guided setup | Site owner or the module's manager | Steps | Yes |
| Saved views manager | Rename, share and delete saved views | Anyone with a saved view | List | Later |

### Site administration

| Screen | Purpose | Who sees it | Type | First |
| --- | --- | --- | --- | --- |
| Site administration layout | The console's frame with the named strip, "Back to console" and its own sidebar | Anyone holding the ability of a site administration entry | Frame | Yes |
| Overview | What needs attention, then the state of the installation, at `/admin` | Anyone holding the ability of a site administration entry | Home | Yes |
| Settings (foundations' screen, drawn here) | Site-wide settings by module, and search across every setting, at `/admin/settings` | Anyone who may read settings | List and Settings | Yes |
| Modules (foundations' screen, drawn here) | Switch on and off, with dependencies and setup state, at `/admin/modules` | Site owner | List | Yes |
| Navigation | Reorder and rename members' sections, hide destinations, at `/admin/navigation` | Holder of `core.navigation.arrange` | Form | Later |
| Appearance preview | The public site, members' area and console in the theatre's branding, light and dark, on core's Branding screen | Site owner | Record | Yes |
| Activity (foundations' Audit log) | The audit trail as a filterable list, at `/admin/audit` | Per audit ability | List | Yes |

### Live mode

| Screen | Purpose | Who sees it | Type | First |
| --- | --- | --- | --- | --- |
| Live layout | Status strip, dark ground, target sizes, offline handling | Anyone who can work tonight | Frame | Yes |
| Tonight hub | Tonight's performances and the tiles this person may open | Anyone who can work tonight | Home | Yes |
| Sync status | What is waiting to send, what was refused and why | Anyone in live mode | List | Yes |
| Practice mode | The same screens on sample data, marked as practice | Anyone training | Frame | Later |

### Single-task layout

| Screen | Purpose | Who sees it | Type | First |
| --- | --- | --- | --- | --- |
| Centred layout | Logo and one card: sign-in, link confirmation, setup | Everyone | Frame | Yes |
| First-run setup | From empty database to a branded site | The first owner | Steps | Yes |
| Sign-in, verify, recover | Drawn here, specified by workstream 2 | Everyone | Form | Yes |

## Screens drawn here that other workstreams own

| Screen | Owner | Wireframe |
| --- | --- | --- |
| Production page, choose tickets, basket, checkout, confirmation | 4. Box office (page content: 3. Public site) | W3 |
| Desk sale | 4. Box office | W4 |
| Door scan | 4. Box office | W5 |
| Order record, refund | 4. Box office | W6 |
| Orders list | 4. Box office | W2 |

They are drawn because the wireframes are where the conventions are tested. Where workstream 4's rules differ from a drawing, its rules win and the drawing changes.
