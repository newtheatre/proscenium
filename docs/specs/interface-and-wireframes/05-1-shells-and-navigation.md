# Shells and navigation

Proscenium has three shells, one per relationship a person has with the theatre, plus a chrome-free live mode for work done standing up. A person only ever sees the shells they are entitled to, and one account menu joins them.

## The three shells

|  | Public | Members' area | Console |
| --- | --- | --- | --- |
| For | Anyone: finding a show, buying, managing their own tickets | A member's own things: shifts, training, rooms, notices | Work done for the theatre: selling, approving, configuring, reporting |
| Who sees it | Everyone, signed in or not | Only a person with a current membership, role, shift or production place | Only a person holding at least one console ability |
| Tone | A customer of the theatre | A colleague in the theatre | An operator at a desk |
| Intensity | Expressive: brand colour, display font, posters | Calm | Calm and dense |
| Frame | Header, page, footer | Top bar with section links; bottom tab bar on a phone | Collapsible sidebar, page header, command palette |
| Designed for | Phone first | Phone first | Laptop first, usable on a phone |
| Rendered | On the server, for search engines and social cards | In the browser | In the browser |
| Who may restyle it | The theatre, in its site folder | Nobody; branding only | Nobody; branding only |

&#91;embedded content: W1 · the four frames and the account menu\]

Each frame is recognisable at a glance, which matters most for a person who uses more than one. Larger drawings of each are in the Wireframes sub-tab.

### Public shell

- **Header:** logo and name, What's on, the theatre's own content links, basket (only when it holds something), account menu or "Sign in".
- **Footer:** the theatre's links, contact, policies, an optional credit line. One shape for everybody; a link that needs sign-in sends the visitor through sign-in and on to where they meant to go.
- **My account** lives here, not in its own shell: tickets, orders, passes, vouchers, saved details, preferences. It is the audience experience, so it carries no member vocabulary at all.
- **Booking** (choose, basket, checkout, confirmation) uses the public header in a reduced form: logo, a step indicator and the basket timer. Nothing in it leads away from paying.
- The layout and any page can be replaced by a file of the same path in the theatre's site folder. The booking flow and My account are platform pages a theatre styles through branding, not by override.

### Members' area

- **Top bar:** logo, the area's name, up to six section links, notifications bell, account menu. On a phone the section links become a bottom tab bar of four plus "More".
- **Home** is a list of what needs the member next: tonight's shift, a training record about to lapse, a booking awaiting approval. Modules contribute cards; the page is never a grid of module logos.
- **Sections come from modules.** With only Front of house switched on, the bar reads Home, Shifts. Nothing is shown for a module that is off.
- It is deliberately not a sidebar. A member who also has console access must be able to tell at a glance which of the two they are in.
- A theatre with no membership never switches the members' area on, and every trace of it disappears.

### Console

- **Sidebar:** theatre mark, then one group per module in a fixed order that does not vary by viewer. Inside a group, everyday work comes first and set-up second, under those two labels. A group with nothing the viewer may open is absent, not greyed.
- **Page header:** sidebar toggle, page title, the page's one primary action, search, help for this screen.
- **Console home** is a work queue: things awaiting this person (refunds to approve, bookings to confirm, failed sends), then today's performances. Modules contribute the cards.
- **Command palette** (Ctrl or Cmd K): go to any screen the viewer may open, find a person, an order or a production, run a common action.
- **Site settings** is the last group: organisation, branding, modules, roles, people, updates and health.
- On a phone the sidebar becomes a drawer and tables become stacked cards. Every console screen works on a phone; none is designed there first.

### Live mode

Live mode is a layout, not a fourth shell. It has no navigation of its own because a person in it is doing one job: scanning the door, running the till, watching tonight.

- Full screen, dark by default, every control at least 48 by 48 pixels.
- A thin status strip: what this screen is, which performance, the connection state, how many actions are waiting to send, and a way out.
- It opens from a tile on the Tonight hub, which is offered wherever a person who can work tonight looks: first in the account menu, as a bar across the public site and members' area while they are on shift, and as the landing page after sign-in during their shift.
- Desk sales belong to the console, because they are done sitting at a laptop. Door, till, tonight board and checklists belong to live mode.

## Moving between shells

The account menu is the one component every shell renders, so it is the only way between them.

| Entry | Shown when | Goes to |
| --- | --- | --- |
| Tonight | The person can work tonight (a confirmed shift in its window, or a standing ability) | The Tonight hub |
| My account | Always | Tickets and orders in the public shell |
| Members' area | The person is entitled to it | Members' home |
| Console | The person holds any console ability | Console home |
| Notifications | Always | The inbox |
| Appearance, language | Always | A small menu |
| Sign out | Always | The public home |

- An audience member's menu is therefore three lines long: My account, Notifications, Sign out. They are never shown a locked or greyed members' entry.
- The current shell's own entry is marked, not removed, so the menu does not rearrange as a person moves.
- A deep link into a shell the person is not entitled to is refused by the server with a page that says why and what would let them through. A hidden link is tidiness, never enforcement.

## Where a person lands

1. A link with a destination always wins: after sign-in the person arrives where they were going.
2. Otherwise, a person on shift lands on the Tonight hub.
3. Otherwise they land where they started signing in: the public home from the public site, members' home from a members' link.
4. A theatre can change the default for members to members' home.

## Addresses

Each shell owns a reserved prefix and everything else belongs to the theatre's own pages.

| Prefix | Shell | Example |
| --- | --- | --- |
| `/` and anything not reserved | Public: the theatre's content pages | `/about`, `/`whats-on``, `/``whats-on``/hamlet` |
| `/book` | Public, booking flow | `/book/hamlet/thu-14-mar` |
| `/account` | Public, My account | `/account/tickets` |
| `/members` | Members' area | `/members/shifts` |
| `/console` | Console | `/console/box-office/orders` |
| `/live` | Live mode | `/live/door` |
| `/sign-in`, `/setup` | Centred single-task layout |  |

- Within a shell the next segment is the module, so a module's pages sit together and a module that is switched off takes its whole subtree with it.
- The prefix decides rendering, caching, security headers and the guard in one route rule each, which is what Part B asks for.
- A theatre's content page can never collide with a platform page, now or after an update, because the reserved list is short and fixed. The build refuses a content page under a reserved prefix.
- This departs from today's Proscenium, which names the domain first (`/rooms` and `/rooms/manage`). That suits one theatre with a fixed set of modules; it does not suit a fork whose owner adds pages at the root. It is question 2 for Matt.

## How navigation is built

- **One declaration.** A module's manifest lists its destinations: which shell, which group, the label, the icon, the address and the ability needed. Nothing else registers a link.
- **The same declaration drives the guard.** The route guard resolves the current address against the declarations and checks the ability it finds, so a deep link and the menu agree by construction.
- **Filtered by ability, shaped by posture.** The viewer's abilities, including those derived from facts such as tonight's shift, decide what is listed. The order never changes with the viewer.
- **Counts are opt-in.** A destination may name a count (refunds awaiting approval). Counts load after the page, never block it, and are announced to screen readers as part of the link's name.
- **A theatre may reorder and rename members' sections and hide a destination** in settings. It cannot show a destination to someone who lacks the ability.
- **Group order in the console** is set by the platform: Tonight, Box office, Front of house, Bar, Spaces, Training, Membership, People, Money, Communications, Forms, Reports, Site settings. A theatre's own module declares where it sits relative to these.

The formats are in tab 4. They follow draft 1 of workstream 1's manifest, in which a navigation entry is a contribution to the core's navigation point.

## Where this comes from

| Idea | Source | What changes here |
| --- | --- | --- |
| Posture picks the shell; one declaration drives menu and guard; filtering is never enforcement | Proscenium decision [0040](https://github.com/newtheatre/proscenium/blob/main/docs/decisions/0040-navigation-is-shaped-by-posture-and-filtered-by-ability.md) | Three shells and a mode instead of four shells; the declaration comes from module manifests instead of one file; shell-first addresses |
| A console group splits into everyday and set-up | Proscenium decision [0082](https://github.com/newtheatre/proscenium/blob/main/docs/decisions/0082-a-console-group-splits-into-every-day-and-set-up.md) | Kept as is |
| Tonight is offered wherever a person who can work tonight looks | Proscenium decision [0094](https://github.com/newtheatre/proscenium/blob/main/docs/decisions/0094-tonight-is-offered-wherever-a-person-who-can-work-tonight-looks.md) | Kept; the fact comes from workstream 2's derived authority |
| The members' surface is calm | Proscenium decision [0084](https://github.com/newtheatre/proscenium/blob/main/docs/decisions/0084-the-member-shell-is-calm-and-its-headings-say-so.md) | Kept, and the audience account is moved out of it into the public shell |
| A sidebar shell whose navigation the page chooses, with one page header component | Mailflare [dashboard layout](https://github.com/MattA-Official/mailflare/blob/nuxt/app/layouts/dashboard.vue) and [Navbar](https://github.com/MattA-Official/mailflare/blob/nuxt/app/components/app/Navbar.vue) | Used for the console only |
| A separate public layout beside the signed-in one | Flytower panel layouts (`default`, `centered`, `public`) | Three signed-in surfaces instead of one |
