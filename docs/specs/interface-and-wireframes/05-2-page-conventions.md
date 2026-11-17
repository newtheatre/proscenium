# Page conventions

Every screen in the members' area and the console is one of seven page types, built from one page component each. A module chooses a type and fills its slots; it does not design a page. These are conventions: they hold whichever modules exist.

## The seven page types

| Type | Used for | Fixed by the platform | Filled by the module |
| --- | --- | --- | --- |
| List | Orders, people, bookings, any collection | Title, primary action, filter bar, table or cards, paging, export, saved views, empty state | Columns, filters, row actions |
| Record | One order, person, production, performance | Title, status, action menu, summary strip, tabs, history panel | Summary fields, tab contents |
| Form | Creating or editing | Field layout, validation display, save bar, unsaved-changes guard | The schema and its fields |
| Settings | A module's settings | Whole page, generated from the settings registry | Nothing but the declarations |
| Home | Console home, members' home, Tonight hub | Layout, card frame, ordering | Cards |
| Steps | First run, a module's setup, checkout | Step indicator, back and continue, resume later | Each step's content |
| Live | Door, till, boards, checklists | Status strip, offline behaviour, target sizes, dark ground | The task area |

Public content pages are an eighth kind that the theatre owns: prose in the site folder with platform components dropped in. The conventions under "Rules for every screen" still bind those components.

### List

The list rules below were redesigned on 16 November 2026 after Matt asked for Flytower-style filters, sorting by columns that are not shown and rows that open. He chose every option as recommended and added the search rule. The proposal behind them is `list-design/proposal.md` in the project files. They apply in the console and in site administration alike.

- **Everything that chooses rows lives in the address.** Search, filters, the view, the sort and the page make a link that can be shared, bookmarked and reopened. Back returns to the same list and scroll position.
- **One toolbar, in this order:** search, **Filters** (with a count when any are on), **Sort**, **Columns**. There are no separate menus for favourite filters and no "More filters".
- **Every list has search, and it searches every field** (Matt's rule). A list cannot switch it off. It searches every text field of the row that the list can show, whether its column is on screen or hidden, plus any further fields the list names (a reference, an email address, a note), and the children of a list with sub-rows. Matching ignores case and accents and matches any part of a word; several words must all match, in any field. Search starts at three letters: a shorter word is ignored, and when every word is shorter the list is shown unsearched with the hint "Type at least three letters to search" under the box. Search does not rank; the list's sort orders the matches. A field the viewer may not see is not searched for them, and foundations' data classes set a limit: an encrypted field and a special one (access needs, health) are never searched by a list. When the match was in a hidden column the row says so under its first cell ("Matches season: Autumn 2026"). Its address key is `q`, and it combines with filters and views.
- **Filters open in one panel:** a popover from 640 pixels up, a drawer from the bottom below that. Each filter is a labelled field and the list updates as each changes. The panel ends with "Clear all" and "Done". Everything changed during one visit to the panel makes one history entry, so Back undoes the visit and not each field.
- **Chips show what is on.** Under the toolbar, one chip for each filter in use, written "State: Draft, Published". Its cross removes it (named "Remove the filter State: Draft" for a screen reader); pressing the chip opens the panel at that field. "Clear all" follows the chips. The count on the Filters button counts filters, not values, and does not count search.
- **A cell may offer its value as a filter:** the row menu gains "Show only Autumn 2026". The list chooses which columns do.
- Finding rows by a person goes through identity. A filter or a search by someone's name or email uses identity's `findAccounts` service, which is guarded by identity's people-lookup ability and audited as a read on each call; the person filter is shown only to a viewer who holds that ability, and for anyone else search does not match on a person's name or email. A filter the viewer may not use is absent, and its key in the address is ignored.
- **Sorting has two controls.** A sortable column's heading is a button: the first press sorts by it in its natural direction, the second reverses, the third returns to the list's default sort; the heading carries an arrow and `aria-sort`. The Sort button always says how the list is sorted ("Sort: Run, soonest first") and its menu lists every sort the list declares, shown as a column or not, then the two directions. That is how a person sorts by something not on screen, and it is the only sort control below laptop width, where rows are cards.
- **One sort at a time,** worded by type: text "A to Z" and "Z to A"; dates "Soonest first" or "Newest first" and the reverse; numbers "Lowest first" and "Highest first". The server always adds the id as a tie-break, so pages never shuffle. A module may declare only a sort the server can answer from an index or a bounded scan.
- **Columns** ticks optional columns on and off; a column marked as always shown cannot be hidden. The choice is kept on the device for each list, cleared on sign-out, and stored in a saved view. It is not in the address, because it changes how rows look and not which rows.
- **Built-in views** are a few named presets of filters and sort that a list may declare, shown as tabs above the toolbar and kept in the address as `view=`. Saved views appear in the same place.
- **Table at laptop width, cards below it.** The list marks which two or three columns survive on a card. No sideways scrolling of a table.
- **Rows that open.** A row may open in one of two ways. Sub-rows are child records shown indented under the row in the same columns (a production's performances, an order's tickets). A detail panel is a free panel under the row for a few facts that do not merit a page. The chevron is its own button at the start of the row, named with the row ("Show performances of Hamlet"), and pressing the rest of the row still opens the record. "Expand all" and "Collapse all" sit by the table; what is open is not in the address.
- **Sub-rows follow the parents.** Children arrive with the page of parents, at most 20 for each; beyond that the last sub-row is a link ("All 34 performances"). Sort and paging apply to parents and children keep their own fixed order. A filter or a search that is about the children keeps a parent when any child matches and shows only the matching children, with "2 of 6 performances match. Show all". Bulk selection is of parents only. On a card the children are a disclosure ("6 performances") that opens a short list inside it.
- **Every list exports** what is currently filtered, as CSV, if the viewer holds the module's export ability. The export says how many rows and which filters, in the words of the chips. A list with sub-rows exports parents only unless it declares a child export.
- **Saved views:** a named filter, sort and column set, personal or shared with everyone who may open the list. A part that no longer validates is dropped and the view says so.
- **Bulk actions** appear in a bar only once rows are selected, and say how many they will affect.
- **Paging is by page with a stated total**, 25 rows by default, or 50 or 100. A list stops at 10,000 rows deep and asks the person to narrow it. No infinite scroll in the console: a person must be able to say "it is on page 3".
- **Row click opens the record.** Row actions sit in one menu at the row's end, each naming what it acts on for a screen reader.
- **When nothing matches** the page says "Nothing matches these filters" and offers to clear them. Focus stays where it was when only a filter changes.

The six kinds of filter, each with one key in the address so a filtered list stays a readable link:

| Kind | For | Control | In the address |
| --- | --- | --- | --- |
| `choice` | One of a few fixed values | Menu | `state=draft` |
| `choices` | Any of several values | Menu with ticks | `state=draft,published` |
| `grouped` | Many values in groups; a whole group or one value | Two-level picker with search | `action=orders` or `action=orders.refund` |
| `lookup` | A record: a person, a production, a venue | Search as you type | `production=prd_...` |
| `dates` | A day or a range | Presets beside a calendar | `when=7d` or `when=2026-11-01..2026-11-16` |
| `yes-no` | A flag | Three-way switch: any, yes, no | `listed=yes` |

A date preset stays relative in the address, so a link to "Last 7 days" still means that next month; presets are declared for each filter and days are the theatre's days, not the device's. A `lookup` holds an id only, and an id that no longer resolves shows as "Unknown" and matches nothing. The list page owns the keys `q`, `sort`, `order`, `page`, `size` and `view`, and a filter may not use them.

**The productions list** is the worked example. Its views are Now and next (the default: a performance today or later, soonest first, opened to show performances), Drafts, Past and All. Its columns are Production, Run, Venue, State and box office's Sales, and a production row opens to its performances as sub-rows. The column names, states and menus are core domain's, and the Sales column is box office's, contributed through `core.list-column` (part 4).

### Record

- **The title is the thing's own name** ("Hamlet", "Order 4F7K2"), with its status as a badge beside it. A status badge always carries a word.
- **One primary action** for the most likely next step in this state; everything else in an action menu. Destructive actions are last in the menu, separated.
- **A summary strip** of four to six facts sits above the tabs and stays put as tabs change. The record's own module supplies the first facts. Other modules add theirs (box office's "Sold: 212 of 480" on a production) through a new point, `core.record-fact`. Integration's ruling R-35 allows it (part 4).
- **Tabs come from modules.** A production's record shows core's own tabs first (Overview, Details, Dates, Credits, Media, Advisories and access), then Tickets, Rota and Budget from whichever modules are on, each contributed through `core.record-tab`, the only way to add a tab (a fact in the strip and a line in a checklist have their own points, under integration ruling R-35). A tab the viewer may not open is absent.
- **History** is a panel on every record: who changed what and when, from the audit trail, with no personal free text.
- **Related records are links**, never repeated data that can go stale.

- **A side panel that stays** (the `aside` slot) may sit beside the tabs at laptop width, for the one or two things a person watches while working through the tabs. Below laptop width it folds to a single line above the tabs that opens ("Ready to publish: 3 of 5"), so it never pushes the work down.
- **A tab's table follows the list rules.** A table inside a tab is a list in small: the same sorting, the same rows that open, and bulk actions in a bar once rows are selected.

**The production record** is the worked example, kept with tabs at Matt's choice. Header: the title, the state as a badge with a word, and one primary action that follows the state (Draft has "Publish", Published has "View public page", Withdrawn has "Publish again"); the menu holds Preview, Add performances, Duplicate, Withdraw, Cancel the run and, last, Delete. Summary strip: Run, Next performance, Season, Performances. Side panel: the poster, with replace, and "Ready to publish?", a checklist of what the public page still lacks, each line linking to the place that fixes it; whether a missing line stops publishing is core's existing publish rule. Another module adds a line to that checklist through `core.record-check` (part 4). Tabs: core's Overview, Details, Dates, Credits, Media, and Advisories and access, then box office's Tickets and prices and Sales, and front of house's tab. The Dates tab is a table of performances by time with earlier ones folded away; a row opens to a detail panel, "Add performances" adds a run in one go, and moving, retiming or cancelling selected rows says what it touches before it happens. What each tab holds is its owner's to specify.

### The trail and the way back

Added 16 November 2026. Agreed between the list design, Nuxt UI and interface build threads; approved by Matt with a thumbs-up on the described design that evening.

- **Console and site administration, from 640 pixels up: a breadcrumb trail** of the page's parents in the header, before the title: "Productions / Hamlet", "Venues / Main House / Edit". The first crumb is the navigation entry; a navigation group ("Programme") is not a crumb because it is not a page, and tabs are not crumbs. The page title stays the only top heading and is the last item, not a link. A page that is itself a navigation entry has no trail.
- **Below 640 pixels the trail gives way to one back button** to the nearest parent. It is an icon only, because the header already holds the menu button, the title and the primary action, and it is named "Back to Productions" for a screen reader.
- **Members' area and My account: a worded back link** above the title at every width ("‹ My bookings"). They are too shallow for a trail.
- **A link to a list returns the list as it was left:** the same view, filters, search, sort and page. The kit remembers each list's last address for the browser tab's session, and a form panel's close uses the same one.
- **One stated parent for each record.** A record with more than one way in has one parent that its page names (a performance's is its production). A page opened from a search result or a notification still shows its true parent; the browser's Back is the way to return to where one came from.
- **No separate Back button beside a trail,** which would be two controls for one job. Public pages and live mode have neither. Steps pages keep their own Back and Continue; panels and dialogs have Cancel or Close, never Back.
- **The page passes the trail, the frame draws it.** A page gives its parents' labels and addresses once its record has arrived; the frame never fetches a label or builds a trail from the address. The trail is a navigation landmark labelled "Breadcrumb", apart from the sidebar's.

This does not touch site administration's "Back to console" at the top of its sidebar, which moves between shells; the trail moves within one.

### Form

- **Short forms open in a panel over the list** (up to about six fields). Longer ones get their own page. The module does not choose by taste: the page component decides from the field count.
- **One column.** Two fields side by side only when they are one thought (start and end, first and last name).
- **Labels above fields, always visible.** A placeholder is an example, never the label. Help text sits under the field.
- **Required is the default**; optional fields say "(optional)".
- **Validation uses the schema the server uses.** Errors show on leaving a field and on submit, beside the field, with a summary at the top that links to each. The first invalid field takes focus.
- **The save bar** stays visible at the foot: primary action on the right, Cancel beside it. The button names the act ("Create performance", "Refund £12.00"), never "Submit" or "OK".
- **While saving** the button shows progress and cannot be pressed twice. A saved form says so and returns to where the person came from.
- **Leaving with unsaved changes** asks once. Long forms keep a draft on the device and offer to restore it.
- **A conflict** (someone else saved first) shows both versions of the changed fields and asks which to keep. It never silently overwrites.

### Settings

Redesigned on 16 November 2026 (integration ruling R-37, agreed by Matt; brief in `settings-design/build-brief.md`). The format, `settingGroups` and `settingPages`, is foundations'; this is the page it draws.

- **Generated, not hand-built.** Each setting's control, default, help text and validation come from the registry. A module writes no settings screen.
- **The page draws a page, not a module.** A settings page is declared once and holds the groups placed on it, each group a section. A module's own page is at `/console/<module>/settings`, in the set-up half of its group; a page placed in site administration is listed there. Core has no page of its own: its groups go to named pages (Theatre, Sign-in, Privacy, Programme settings, People settings).
- **Every setting has exactly one home.** A setting managed on a screen of its own is not drawn on a generated page; search still finds it and opens that screen. There is no catch-all page.
- **Each setting shows** its current value, its default with a "Reset" link when changed, its limits, and a "Quoted on public pages" tag where a content page shows it live. Under a changed setting is one line, "Changed by Sam Patel, 12 November", which opens that setting's history in a drawer. A setting managed by the deployment is shown read-only and says so.
- **One line says who may change a section.** Where every setting in a section shares an ability the section is headed "Changed by people who can manage box office"; a setting that differs says so itself. A setting the viewer may read but not change is read-only.
- **Search is at the top of every settings page** and in the command palette. It is one index across both shells, matches label, help text and key, shows only settings on pages the viewer may open, and opens the setting's page or screen with it scrolled into view.
- **A "Changed" filter** leaves only the settings that differ from their default.
- **Changes save per section** with a stated summary ("3 changes"). "Reset section" sits beside Save and goes through the same save, so it is confirmed and recorded like any change.
- **Extra confirmation only where declared.** A setting declared to confirm, or to need a reason, shows what will change and asks again, and asks for the person to sign in again in place when their session is not fresh. Every other setting saves with no prompt, in site administration as in the console.
- **A period is one control** (`DurationInput`, in the kit and open to modules): a number and a unit side by side, from second to year, offering only the units that fit the setting's limits. A stored value shows in the largest unit that divides it exactly ("7 years"), the help line says a month is 30 days and a year 365, and limit messages use the same words ("must be at least 5 minutes"). Because the unit shown follows the value, a duration's label and help text never name a unit.
- **Advanced** (`/admin/advanced`) is a generated page holding every group marked advanced, whichever module declares it, each headed with its module's name, under a warning that these are engineering limits and rarely need changing.
- **Settings history** (`/admin/settings-history`, seen with `core.audit.view`) lists every change, newest first, filtered by module, page and person. Each row has "Revert", which sets the old value back through the ordinary save: the same ability, rules and confirmation, and its own row with the reason "Reverted". A sensitive setting's values are never shown and it has no Revert.

As built (kit PR 115, 17 November 2026), three details differ from what R-37 first recorded. Every setting names its own ability and a group has none; the one "Changed by people who can..." line still heads a section wherever its settings share an ability. A page's id is `<module>.<page>`, with `core.advanced`, `<module>.settings` and `<module>.admin` reserved. And a setting may name a screen of its own only once that screen shows and saves it; until then it is drawn on a generated page, and Shells and navigation lists which settings that affects for now.

### Home

- **A home page is a queue, not a menu.** Cards are ordered by urgency: things overdue, things due today, things to know.
- **A card has one fact and one action.** "4 refunds awaiting approval. Review." A card with nothing to say is not shown.
- **When there is nothing to do, the page says so** and offers the two or three most common starting points.

### Steps

- **Three to five steps**, each a single decision, with the step names visible throughout. Where the number of steps is set by the theatre and passes five, as in a built form, the indicator shows "Page 4 of 9" and the current page's title in place of every step name.
- **Every step can be gone back to** without losing what was entered.
- **Setup can be left and resumed.** The console shows an unfinished setup as a card on home and a mark on the module.
- **The last step is a summary** of what will happen, with the action named on the button.

### Live

- **One job per screen.** No sidebar, no tabs beyond two or three large segments.
- **Every control is at least 48 by 48 pixels**, including secondary ones.
- **Dark ground by default**, for a dim foyer or wings. A theatre can turn that off.
- **The status strip** always shows the connection state in words and the number of actions waiting to send.
- **It works without a connection.** The screen loads tonight's data when opened, keeps working from that copy, and sends what was done when the connection returns. Tab 3 has the rules.
- **Results are unmistakable:** a full-width band with a word, a shape and a colour, and a vibration where the device allows, with a sound when the owning module's setting allows one (the door's is box office's, off by default) and the device is not muted. Never colour alone.
- **The screen stays awake** while it is open.

### Editor, a named layout

A few console screens build a thing rather than fill in a record: the form builder first, later a seating plan and an email template. They share one full-width layout instead of each inventing one. It was added at workstream 5's request.

- **Three panes:** an outline on the left, the canvas in the centre showing the thing as its user will see it, and a panel for the selected item on the right.
- **A top bar** in place of the page header: tabs for the editor's modes, the saved state in words, undo and redo, a count of problems, Preview and the one primary action (Publish).
- **On a phone** one pane shows at a time, with the outline and the item panel as drawers.
- **The canvas previews at phone and laptop width**, switched from the top bar.
- **Changes save as a draft as they are made**; publishing is the confirmed act. Leaving never loses work.
- The console sidebar collapses to its icons while an editor is open. An editor's subject is one document, so it does not use the Form type's field-by-field conflict choice: it shows who else is editing, offers read-only or take over, and refuses a stale save.

### Calendar, a shared component

One `Calendar` component serves every module that shows time: Spaces' bookings, Front of house's rota and Training's sessions. No module draws its own.

- **Views:** day and week, with several columns side by side (one per space, role or trainer). On a phone it shows one day and one column at a time, with the column chosen from a menu.
- **Blocks carry state** in three ways at once: a word, a border style and a colour, so state never depends on colour alone.
- **The list is the equal route.** Every calendar has a List view of the same items with the same filters and actions, reachable by one control and by keyboard. It is the accessible route and the default at phone width when there are more than three columns.
- **Calendar colours** are a fixed, named set of eight (`calendar-1` to `calendar-8`), each with a light and dark pair that passes 4.5 to 1 for text and 3 to 1 against the page. They are separate from the brand accent and from the status colours, so no brand can make them unreadable. A module maps its categories to names, never to colour values.
- **Times** follow the theatre's zone and the show-night rule; a block that crosses midnight is drawn once, on the night it belongs to.
- **Acting on a block** opens the record's side panel. Dragging to move or resize is an extra for pointer users; the same change is always available as a form.

### Keypad, for live mode

One `LiveKeypad` component serves any live screen that takes a number: the bar till's amounts and quantities, cash tendered at the desk, a typed ticket code.

- **Keys** are the ten digits, a double zero, a decimal point where the mode allows one, Clear and Backspace, each at least 56 by 56 pixels, in the telephone layout (1 2 3 on the top row).
- **Modes** are money, whole number and code. Money shows pounds and pence as typed and holds the value in pence; the module never parses text.
- **The figure being typed** is shown large above the keys and announced to a screen reader as it changes. A physical keyboard types into it directly, and the keys are real buttons.
- **It never confirms by itself.** The screen's one primary action does that, and names the amount.
- **It works offline** like the rest of a live screen and makes no sound or vibration of its own; feedback belongs to the result, not to each key.

## Rules for every screen

### Structure

- One page title, which is also the browser tab's title and the first heading.
- One primary action per view. A second competing button is a sign the page is doing two jobs.
- A skip link to the main content, and landmarks for navigation, main and footer.
- Content width is one of three named widths: reading (forms, settings), standard (lists, records) and full (calendars, seating plans). A page names one; it does not set its own.

### Loading, empty, refused, failed

- **Loading** shows the page's frame at once and a skeleton where data will be. Nothing jumps when data arrives.
- **Empty** says what belongs here, why it might be empty, and offers the action that fills it, with a link to that screen's help.
- **Refused** says why, and what would let the person through: "Refunds over £50 need the Treasurer. Ask them, or send this refund for approval."
- **Failed** shows only the reason and a retry. A screen whose data did not load never shows a half-filled page.
- **Offline** outside live mode shows a banner, keeps what is on screen readable, and disables actions that need the server, saying so.

### Feedback

- **A toast** confirms something that worked and needs no reply. It never carries an error the person must act on, and never the only copy of information.
- **Errors appear where they happened**: beside the field, or in an alert at the top of the panel that failed.
- **A confirmation dialog** is for acts that cannot be undone. It names the thing ("Cancel the 19:30 performance of Hamlet?"), states the consequence ("84 ticket holders will be emailed"), and its button repeats the verb. No browser prompts.
- **Undo beats confirm.** Where an act can be reversed, do it at once and offer Undo for ten seconds.
- **Money:** any screen that takes or returns money shows the total it expects. If the server's total differs, the action is refused and both figures are shown.

### Choices in forms

- **A choice of many is square tick boxes.** Where a person may pick more than one option, the options are tick boxes (Nuxt UI `UCheckboxGroup`, or one `UCheckbox` per option when each ticked option opens its own field, such as a note). A tick box stays square whatever the brand's corner radius: the kit pins its corners, because a large radius would otherwise turn it into a circle.
- **A choice of one is round radio buttons** (`URadioGroup`), or a select when there are more than about six options. A radio button is never used where more than one answer can be true, and a tick box is never used for "pick one".
- **A yes or no on its own is one tick box** with a label that reads as a statement ("I use a wheelchair"). A follow-up question appears beneath it only once it is ticked, and is not asked otherwise (`showIf` on a `PageForm` field).
- **Each option can carry a line of explanation** beneath its label, in plain words, when the label alone could be read two ways.

### Acting for someone, and modes

- **On behalf of:** when staff act for a customer or member, a banner names the person for as long as that is true, and the act is recorded as such.
- **Practice and demo:** a banner on every screen says the data is not real. It cannot be dismissed.
- **Preview deployments** carry a similar banner, so nobody mistakes one for the live site.

### Words

- British English is the source language. Every string goes through translation, in one catalogue per language per module.
- Sentence case everywhere. Buttons are verbs. No jargon in the public shell: "performance", not "instance"; "ticket", not "allocation".
- The audience experience and the members' experience keep separate vocabularies. "Shift", "rota", "training" and "member" never appear on an audience screen unless the theatre's own content puts them there.
- Dates and times show in the theatre's time zone, in the reader's language. A time after midnight on a show night is shown as part of that night ("Thursday, 00:30"), following the operating-day setting.
- Money shows with its currency symbol from the theatre's currency setting; no screen assumes pounds.

### Accessibility

The standard is WCAG 2.2 at level AA, checked by automated tests in CI and by hand before a release.

- **Targets** are at least 24 by 24 CSS pixels everywhere ([WCAG 2.2, 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)), 44 in the public shell and members' area, 48 in live mode.
- **Contrast** is at least 4.5:1 for text. The brand colour is never used raw: the derived shade that passes is.
- **State is never only a colour.** Availability, validity and connection pair colour with a word or a shape.
- **Every control has a visible name.** Icon-only buttons have an accessible name and a tooltip.
- **Keyboard:** everything works without a pointer, focus is always visible, and a dialog returns focus to what opened it.
- **Motion** respects the reduced-motion setting. Nothing flashes.
- **Seating plans and calendars have a list equivalent** that does the same job.
- **Timeouts are announced.** A basket about to expire says so with time to extend it.

**One set of widths.** Every screen uses the same three, which are Tailwind's and Nuxt UI's own steps: phone is below 640 pixels, tablet is 640 to 1023, laptop is 1024 and above. At phone width the members' section links become the bottom tab bar and a calendar defaults to its List view. Below laptop width (phone and tablet) a table becomes stacked cards and the console sidebar becomes a drawer. No screen names a width of its own; "the narrow breakpoint" in foundations' screens means below laptop width.

### Appearance

- **Two intensities.** Expressive (display font, brand colour as a surface, posters) belongs to the public shell and to live mode's result bands. Calm (the component library's defaults on the theatre's tokens) is everything else.
- **Light and dark** follow the device, with a choice in the account menu. Live mode defaults to dark.
- **Status colours never change with the brand**: success, warning and danger are fixed, so a red brand cannot make a healthy screen look broken.
- **Components come from Nuxt UI first.** Custom markup only where it has nothing suitable: the seating plan, the scanner, the calendar.
- **Icons and fonts are bundled.** Nothing loads from a third party.

### Help

- Every members' and console screen has a help link in its header that opens the documentation page for that screen in a side panel.
- Module setup steps and empty states link to the same pages.

## Where this comes from

| Idea | Source | What changes here |
| --- | --- | --- |
| One page component for list, admin and settings pages, with title and main action in the header | Mailflare [Page.vue](https://github.com/MattA-Official/mailflare/blob/nuxt/app/components/app/Page.vue) and its [porting notes](https://github.com/MattA-Official/mailflare/blob/nuxt/docs/PORTING.md) ("One page layout") | Seven typed page components instead of one |
| Form controls fill their field, tables carry their own frame, badge colours adjusted centrally to pass 4.5:1, dialog actions on the right | Mailflare [app.config.ts](https://github.com/MattA-Official/mailflare/blob/nuxt/app/app.config.ts) | Kept as central configuration |
| Confirmations are modals, never browser prompts | Mailflare [ConfirmModal.vue](https://github.com/MattA-Official/mailflare/blob/nuxt/app/components/app/ConfirmModal.vue) | The dialog must name the thing and the consequence |
| One system, two intensities; state is never only a colour; every control has a name; 48 pixel targets on show-night screens | Proscenium [design language](https://github.com/newtheatre/proscenium/blob/main/docs/design-language.md) | The palette and faces are the theatre's, not NNT's |
| One set of component conventions for the admin surface | Proscenium decision [0032](https://github.com/newtheatre/proscenium/blob/main/docs/decisions/0032-the-admin-surface-has-one-set-of-component-conventions.md) | Enforced by typed page components instead of by review |
| One brand colour, a derived range, fixed status colours | Flytower [branding](https://github.com/teamflytower/flytower/blob/main/docs/branding.md) | Extended to email, tickets and PDFs by workstream 3 |
