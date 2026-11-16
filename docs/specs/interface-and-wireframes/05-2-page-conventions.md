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

- **Filters live in the address.** A filtered list is a link that can be shared, bookmarked and reopened. Back returns to the same filter and scroll position.
- **One filter bar:** search first, then the two or three filters used most, then "More filters". Active filters show as removable chips with a "Clear all".
- **Table on a laptop, cards on a phone.** The module marks which two or three columns survive on a card. No sideways scrolling of a table on a phone.
- **Every list exports** what is currently filtered, as CSV, if the viewer holds the module's export ability. The export says how many rows and which filters.
- **Saved views:** a named filter, sort and column set, personal or shared with everyone who may open the list.
- **Bulk actions** appear in a bar only once rows are selected, and say how many they will affect.
- **Paging is by page with a stated total**, 25 rows by default. No infinite scroll in the console: a person must be able to say "it is on page 3".
- **Row click opens the record.** Row actions sit in one menu at the row's end, each naming what it acts on for a screen reader.

### Record

- **The title is the thing's own name** ("Hamlet", "Order 4F7K2"), with its status as a badge beside it. A status badge always carries a word.
- **One primary action** for the most likely next step in this state; everything else in an action menu. Destructive actions are last in the menu, separated.
- **A summary strip** of four to six facts sits above the tabs and stays put as tabs change.
- **Tabs come from modules.** A production's record shows Overview from the core, and Tickets, Rota, Budget from whichever modules are on. A tab the viewer may not open is absent.
- **History** is a panel on every record: who changed what and when, from the audit trail, with no personal free text.
- **Related records are links**, never repeated data that can go stale.

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

- **Generated, not hand-built.** Each setting's control, default, help text and validation come from the registry. A module writes no settings screen.
- **Each setting shows** its current value, its default with a "Reset" link when changed, who may change it, and a "Quoted on public pages" tag where a content page shows it live.
- **Changes save per section** with a stated summary ("3 changes"), and each links to its audit entry.
- **Settings search** in the console finds a setting by its label or by the words in its help text.
- **A setting the viewer may read but not change** is shown read-only with who can change it.

### Home

- **A home page is a queue, not a menu.** Cards are ordered by urgency: things overdue, things due today, things to know.
- **A card has one fact and one action.** "4 refunds awaiting approval. Review." A card with nothing to say is not shown.
- **When there is nothing to do, the page says so** and offers the two or three most common starting points.

### Steps

- **Three to five steps**, each a single decision, with the step names visible throughout.
- **Every step can be gone back to** without losing what was entered.
- **Setup can be left and resumed.** The console shows an unfinished setup as a card on home and a mark on the module.
- **The last step is a summary** of what will happen, with the action named on the button.

### Live

- **One job per screen.** No sidebar, no tabs beyond two or three large segments.
- **Every control is at least 48 by 48 pixels**, including secondary ones.
- **Dark ground by default**, for a dim foyer or wings. A theatre can turn that off.
- **The status strip** always shows the connection state in words and the number of actions waiting to send.
- **It works without a connection.** The screen loads tonight's data when opened, keeps working from that copy, and sends what was done when the connection returns. Tab 3 has the rules.
- **Results are unmistakable:** a full-width band with a word, a shape and a colour, and a sound or vibration where the device allows. Never colour alone.
- **The screen stays awake** while it is open.

### Editor, a named layout

A few console screens build a thing rather than fill in a record: the form builder first, later a seating plan and an email template. They share one full-width layout instead of each inventing one. It was added at workstream 5's request.

- **Three panes:** an outline on the left, the canvas in the centre showing the thing as its user will see it, and a panel for the selected item on the right.
- **A top bar** in place of the page header: tabs for the editor's modes, the saved state in words, undo and redo, a count of problems, Preview and the one primary action (Publish).
- **On a phone** one pane shows at a time, with the outline and the item panel as drawers.
- **The canvas previews at phone and laptop width**, switched from the top bar.
- **Changes save as a draft as they are made**; publishing is the confirmed act. Leaving never loses work.
- The console sidebar collapses to its icons while an editor is open.

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
