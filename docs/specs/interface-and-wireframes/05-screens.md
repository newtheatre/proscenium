# 5. Screens

The interface layer itself owns 31 screens: the frames, the homes, and the screens no single module can own. Every other screen belongs to a module and is listed in that module's specification, built from the page types defined here.

| Sub-tab | Holds |
| --- | --- |
| Shells and navigation | The three shells, live mode, the account menu, addresses, how navigation is assembled |
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
| Notifications inbox | Read and unread, with a count | Signed-in person | List | Yes |
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
| Command palette | Go to, find, do | Anyone with a console ability | Overlay | Yes |
| Help panel | This screen's documentation beside the screen | Anyone with a console ability | Overlay | Yes |
| Settings search | Find any setting | Anyone who may read settings | List | Yes |
| Module settings page | Generated from the registry | Per setting's ability | Settings | Yes |
| Modules | Switch on and off, with dependencies and setup state | Site owner | List | Yes |
| Module setup | A module's guided setup | Site owner or the module's manager | Steps | Yes |
| Navigation settings | Reorder and rename members' sections, hide destinations | Site owner | Form | Later |
| Appearance preview | The three shells in the theatre's branding, light and dark (branding itself is workstream 3) | Site owner | Record | Yes |
| Saved views manager | Rename, share and delete saved views | Anyone with a saved view | List | Later |
| Activity | The audit trail as a filterable list | Per audit ability | List | Yes |

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
