# 7. Stories

The interface backlog is 40 stories: 26 in the first release (roadmap phases 1 to 3), 13 later, and one (UI-36) whose release follows the bar's. Each has criteria a test can check. Story ids start `UI-`; the phase is the roadmap phase the story is needed by.

## First release

### Shells

| Id | Story | Acceptance criteria | Phase |
| --- | --- | --- | --- |
| UI-01 | As a visitor I see the public shell with the theatre's header and footer | Header shows logo, name, What's on and the theatre's own links; footer is identical signed in or out; the page is rendered on the server; replacing the layout file in the site folder changes it with no other edit | 1 |
| UI-02 | As anyone signed in I move between shells from one account menu | The menu is the same component in every shell; it lists only shells I am entitled to; the current one is marked; an audience account sees no members' or console entry anywhere in the page source | 1 |
| UI-03 | As a member I use the members' area on a phone | Top bar on a laptop; bottom bar of four sections plus More at phone width (below 640 pixels); sections come only from modules that are on; with the setting off, every `/members` address answers not found | 2 |
| UI-04 | As an officer I use the console | Sidebar groups in the fixed order; each group split into everyday and set-up; groups with nothing I may open are absent; the sidebar collapses and becomes a drawer on a phone | 1 |
| UI-05 | As someone on shift I am offered Tonight wherever I look | Account menu's first entry, a bar on public and members' pages, and the sign-in landing all appear together and disappear together when the shift window closes | 3 |
| UI-06 | As a door volunteer I work in live mode | No sidebar or bottom bar; status strip shows screen, performance, connection in words, and waiting count; every control is at least 48 by 48 pixels; dark by default | 3 |
| UI-07 | As anyone refused I am told why | A refused address shows the reason and what would let me through; no screen ever renders an empty shell; a signed-out visitor is returned to their address after sign-in | 1 |

### Navigation

| Id | Story | Acceptance criteria | Phase |
| --- | --- | --- | --- |
| UI-08 | As a module author I add a screen with one declaration | Adding a navigation contribution makes the entry appear and guards the address; a page under a shell prefix with no entry fails the build; switching the module off removes the entry and the address | 1 |
| UI-09 | As an officer I find anything from the command palette | Ctrl or Cmd K opens it; it lists only screens I may open; it finds records through each module's search source; results look the same for every record type; it works by keyboard alone | 2 |
| UI-10 | As an officer I see what is waiting on a menu entry | A count loads after the page; a failed count shows nothing rather than zero; the count is part of the link's accessible name | 3 |

### Page types

| Id | Story | Acceptance criteria | Phase |
| --- | --- | --- | --- |
| UI-11 | As a module author I build a list from the list component | The list is declared once with `defineList` and the page, data route and export read that declaration. Search, filters, view, sort and page are in the address; Back restores them. Search is always present and matches every text field the list can show, hidden columns included, and says where a hidden match was. The toolbar is search, Filters, Sort, Columns; filters open in one panel (a drawer below 640 pixels) and show as chips; the six filter kinds work and an unknown key or value is refused. A heading sorts, and the Sort control offers every declared sort, shown or not. Table at laptop width (1024 pixels and above) and cards below it; export respects filters and the row ceiling; empty list and empty filter show different messages | 1 |
| UI-12 | As a module author I build a record page | Title, status badge with a word, one primary action, summary strip, tabs; another module's tab appears through the record-tab point and vanishes when that module is off; a history panel lists audit entries; an optional side panel sits beside the tabs at laptop width and folds to one line above them below it | 2 |
| UI-13 | As a module author I build a form from a schema | Browser and server show the same message for the same invalid value; the button names the act and cannot be pressed twice; leaving with changes asks once; a stale save shows a conflict, never overwrites | 1 |
| UI-14 | As an officer I change a setting on a generated page | A module with settings gets a page with no page code; each setting shows value, default, reset, limits, who may change it, when and by whom it was last changed, and a tag when quoted publicly; a read-only viewer sees who can change it | 1 |
| UI-15 | As a site owner I find a setting by searching | Search matches label and help text across all modules that are on; a result opens the setting scrolled into view and highlighted | 2 |
| UI-16 | As an officer I land on a home page that is a queue | Cards come from modules, sorted overdue, today, information; a card with a zero count is absent; with nothing waiting the page says so and offers common starting points | 2 |
| UI-17 | As a site owner I am guided through setup in steps | Steps can be revisited without losing entries; setup can be left and resumed from a card on console home; the last step summarises what will happen | 1 |

### States and feedback

| Id | Story | Acceptance criteria | Phase |
| --- | --- | --- | --- |
| UI-18 | As anyone I never see a half-loaded page | A failed first load shows only the reason and Retry; a failed refresh keeps the data and marks it with its time | 1 |
| UI-19 | As anyone I confirm only what cannot be undone | The dialog names the thing and the consequence and its button repeats the verb; no browser prompt exists in the codebase; reversible acts offer Undo instead | 1 |
| UI-20 | As staff taking money I see the total the system expects | Every money action shows its expected total; a mismatch from the server is refused with both figures | 3 |
| UI-21 | As staff acting for someone I can always see whose account I am in | A banner names the person on every screen until I stop; it cannot be dismissed | 3 |

### Live mode and offline

| Id | Story | Acceptance criteria | Phase |
| --- | --- | --- | --- |
| UI-22 | As a door volunteer I keep working without signal | A live screen opened online keeps working with the network off; acts queue and send in order on reconnect; a replayed act is applied once | 3 |
| UI-23 | As a door volunteer I can see what has not been sent | The strip shows the waiting count; the sync status screen lists each act in words with its state; a refused act says why; signing out with unsent acts asks first | 3 |

### Accessibility and language

| Id | Story | Acceptance criteria | Phase |
| --- | --- | --- | --- |
| UI-24 | As anyone I can use every screen by keyboard and screen reader | Automated accessibility checks pass on every page type in each shell, light and dark; skip link, landmarks and one heading per page; focus visible and returned after dialogs; no state shown by colour alone; every string from a catalogue | 1 |

## Later

| Id | Story | Acceptance criteria |
| --- | --- | --- |
| UI-25 | As an officer I save and share a view of a list | A view stores filters, sort and columns; saved views sit beside a list's built-in views and use the same `view=` key; a shared view is offered to everyone who may open the list; a view with a removed filter opens with a notice |
| UI-26 | As a site owner I rearrange and rename members' sections | Order, label and hidden state are settings; nothing can be shown to someone without the ability |
| UI-27 | As a member I see my own history across modules | Shifts, training and credits from whichever modules are on, in one place |
| UI-28 | As a new member I am welcomed once | A one-time introduction after becoming entitled; never shown again once dismissed |
| UI-29 | As a trainee I practise live screens safely | Practice mode uses sample data, is marked on every screen, and writes nothing real. Owned here with Foundations, not by Training, because it needs none of Training's tables; it covers the desk and the door |
| UI-30 | As anyone I open help for the screen I am on | The help panel shows that screen's documentation without leaving it |
| UI-31 | As a reader of another language I choose it | Offered languages are a setting; choice is a preference; dates, numbers and money follow it |
| UI-32 | As someone using the installed app I get a useful offline page | A page never loaded shows what is available offline instead of a browser error |
| UI-33 | As a site owner I preview my branding across all shells | One screen shows public, members', console and live in light and dark with contrast figures |
| UI-34 | As anyone I undo a mistaken bulk action | A bulk action states how many it affects and offers Undo where the module supports it |

**UI-35, added 16 November 2026 at the request of Spaces.** As a module author I show bookings, a rota or sessions with the shared calendar. Criteria: day and week views with several columns; every block shows its state as a word and a border as well as a colour; a List view holds the same items, filters and actions and is fully usable by keyboard and screen reader; colours come only from the eight named calendar colours, which pass contrast in light and dark under any brand. Needed by roadmap phase 4, when Spaces and the Front of house rota arrive, so it is not in the first release.

**UI-36, added 16 November 2026 at the request of Bar.** As a volunteer on a till I type an amount on a keypad made for a touch screen. Criteria: keys are at least 56 by 56 pixels; money mode holds pence and shows pounds and pence; the figure is announced as it changes; a physical keyboard works too; nothing is confirmed until the screen's primary action is pressed. Needed with the bar's first stories: phase 3 if Matt accepts the bar there, otherwise with the bar.

**UI-37, added 16 November 2026 with the list design.** As an officer I open a row to see what is under it, choose my columns and start from a built-in view. Criteria: a list may declare sub-rows or a detail panel; the chevron is its own named button and the rest of the row still opens the record; at most 20 children show for a parent, then a link to them all; sort, paging and bulk selection are of parents; a filter or search about children keeps a parent when any child matches and says how many match; built-in views are tabs above the toolbar; the Columns choice survives a reload on the same device, is cleared on sign-out and never appears in the address. Phase 2, with the productions list.

**UI-38, added 16 November 2026 with the list design.** As a module author I add a column to another module's list. Criteria: a `core.list-column` contribution appears after the owner's columns for a viewer who holds its ability and is absent otherwise and when its module is off; it makes one request for a page of rows, however many rows there are. Later than the first release unless box office's Sales column is wanted in phase 3.

**UI-39, added 16 November 2026 with core domain's content warnings (a later slice Matt accepted).** As an audience member I read a production's content warnings in layers. Criteria: warnings are grouped under headings; each carries its level (mentioned, discussed or depicted) as a word, never as colour alone; the advisories component has a compact form for cards and listings that opens to the full one; both forms are usable by keyboard and screen reader. Later, with core domain's slice; the detail is to be agreed with core domain.

**UI-40, added 16 November 2026 with the list design.** As anyone below a list I can see where I am and get back. Criteria: a console or site administration page that gives a trail shows a breadcrumb from 640 pixels up and one back button, named with its destination, below that; a members' or My account page shows a worded back link; a crumb to a list reopens it with the view, filters, search, sort and page it was left with; the page title stays the only top heading. Phase 2.

## Not stories here

- Branding controls, the content components and the public pages themselves: workstream 3.
- Sign-in, account linking and the entitlement facts: workstream 2.
- The form builder's editor: workstream 5, on these page types.
- Every box-office screen's behaviour: workstream 4. This backlog delivers the frames and components those screens are built from.
