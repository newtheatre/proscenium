# The design language

*House lights down, stage lights up.*

This is the reasoning behind `app/assets/css/theme.css` and `app/app.config.ts`. The code is
truth; when you change one, change this in the same pull request.

The language began as a shared Nuxt layer for the four-application estate. It is now vendored
here and maintained here, for the reasons in `decisions/0021-vendor-the-design-language.md`. That
record names the commit it came from, which is the only way a successor can tell what has since
diverged.

## One system, two intensities

The whole system draws on one set of tokens. What differs is how loudly a surface uses them.

| Intensity | Where | What it may use |
| --- | --- | --- |
| Calm | Admin, box office, rota, reports, rooms, training, the member's own account | The Nuxt UI defaults on our tokens. Nothing from the expressive kit. |
| Expressive | The public site and the show-night screens | The display face, the spotlight, and one marquee CTA, one sticker and one spotlight per view. |

The split is deliberate. A member on the box office computer at 19:15 with an unpaid queue does
not want personality; an audience member deciding whether to spend a Wednesday evening on
Sophocles does. Signature elements only signify while they stay rare, so the budget of one each
per view is a rule and not a suggestion.

Unifying four applications into one makes this easier to get wrong, not harder. The same person
moves from the public site to the till to the rota inside one session, and the surfaces have to
stay recognisably different while staying recognisably ours.

## Colour

| Scale | Role |
| --- | --- |
| `purple` | The brand. Interactive, primary, the curtain. |
| `gold` | The limelight. Highlights, celebration, hero moments on dark. |
| `ash` | Stage-black neutrals, hue-matched to purple so dark surfaces read as the house rather than as dead black. |

Three contrast floors are set in `:root` and must not be undone:

- Interactive purple resolves to `purple-600`. `purple-500` sits at roughly 3.9:1 on white, under
  the 4.5:1 floor for body-size text.
- Interactive gold resolves to `gold-700`. `gold-400` is a fill colour only, and always carries
  `ash-950` text on top of it. On stage black, `gold-400` is the signature and needs no help.
- Error red resolves to `red-700`. Nuxt UI ships `red-500`, and even `red-600` measures 4.0:1
  against the tinted background of a subtle error alert, which is exactly where error text sits.
  Measured by the axe run, not by eye (K-101).

Under `.dark` all three brighten to their 400s and the surfaces drop to the ash 950/900/800 ladder,
which is what "stage black" means in practice.

## The ground is paper

In light mode the page ground is `ash-50` and a raised surface is white: `--ui-bg` is `ash-50`,
`--ui-bg-muted` is `ash-100`, `--ui-bg-accented` is `ash-200`, and `--ui-bg-elevated` stays white
(K-130). Nuxt UI's default puts white on white, which makes a card read as a hole cut in the page
rather than a thing sitting on it. Every shell inherits this from the tokens; no screen sets its
own light-mode ground, and a screen that wants to lift something reaches for `bg-elevated` rather
than painting white itself.

## Focus

Keyboard focus is never removed, only restyled. `--nnt-focus-ring` is a two-pixel outline with a
two-pixel offset, applied by `:focus-visible` to every focusable element, so a new screen inherits
a visible focus indicator rather than opting into one (K-101 criterion 4). It brightens to gold
under `.dark`, purple-600 being invisible against stage black.

Two tests hold the floor: `design-language.test.ts` fails on any rule that removes an outline, and
`tests/e2e/accessibility.test.ts` focuses a real control in a real browser and reads back the
computed outline.

## State is never only a colour

Availability, validity and connection pair colour with words or shape (K-101 criterion 3). A badge
with no text in it, an icon-only button with no accessible name and a colour swatch that does not
say which colour it is all fail `design-language.test.ts`, which is how the rule survives the next
screen.

## Every control has a name

A control is named by the `UFormField` it sits in, so the name is visible and clicking it focuses
the field. Where the layout genuinely cannot hold a visible label, a search box in a toolbar row or
a control in a table cell, the name is an `aria-label` and the placeholder stays an example
(K-101 criterion 5). A placeholder is never the name: it disappears as soon as anybody types.

A row action repeated down a column names what it acts on, a tab keeps its label at every width
(`sr-only sm:not-sr-only`, not `hidden`), and a chooser made of cards is a radio group with arrow
keys rather than a card that only takes a click. A name assembled from values guards the parts that
can be empty, so nothing reads "null" back. `admin-conventions.test.ts` holds all of it over the
console.

## Type

| Face | Use |
| --- | --- |
| Bricolage Grotesque | The poster voice. Headlines, show titles, section headings on public surfaces. Reach for `nnt-headline`. |
| Figtree | Body copy, UI chrome, and everything internal. |
| JetBrains Mono | Booking references, seat counts, times, prices in tables. Anything a member reads back to a patron aloud. |

All three are self-hosted through Fontsource. Nothing may add a Google Fonts request: one worker
serves the whole system, and a third-party font request is a third-party dependency on every
page load, including the door scanner on a bad foyer connection.

## The expressive kit

The kit is the public site and the show-night screens, and nowhere else. The console and the
member's own screens use none of it, whoever is signed in: a member reading a tab balance is
doing the calm half of the split, and a face spent on every screen signifies on none of them
(0084). Two tests hold that rather than review: `design-language.test.ts` refuses an `nnt-`
class on any page under the `member` layout, and `shells.test.ts` counts the kit on eight
member screens in a real browser, as it already does for the console. `/passes` and
`/training/modules` keep the display face and are not exceptions to it: both are public pages
in the `default` layout, opened by somebody who may hold no session at all.

| Utility or variant | What it is for |
| --- | --- |
| `nnt-spotlight` | A limelight beam on stage black. Hero bands, the show-night screens, the footer. Both beams fall off inside the box they are on, so an inset band reads as lit rather than as a clipped trapezoid. |
| `nnt-headline` | The display face, tight and balanced. Public headlines. |
| `nnt-shadow-poster`, `-primary`, `-ink` | The hard offset shadow of a hand-printed show poster. Composed through `--tw-shadow` so it stacks with ring utilities. |
| `nnt-ticket` | Perforated stub edges. Booking summaries, prices, anything that is literally a ticket. |
| `nnt-sticker` | The tilt on a badge. One per view. |
| `nnt-marquee` | Running-lights border for the one CTA that matters. |
| `nnt-scrim` | A legibility gradient over photography, so white text stays readable whatever the picture does. |
| `nnt-poster-none` | The frame of a show with no artwork yet. Two deep beams whose hues come from `--poster-from` and `--poster-to`, which `posterTint` derives from the show's title. |
| button `marquee` | The single CTA of a view. Colour-agnostic: passing `color` does nothing. |
| button `poster` | The secondary public action. Presses into its own shadow on click. |
| card `poster` | A show, treated as a printed poster. |
| card `ticket` | A booking, treated as a stub. |
| badge `sticker` | NEW, SOLD OUT, the season flash. |

## Chrome

The tokens and the component theme are shared; the layouts are not. Each surface is assembled
from Nuxt UI's structural components:

| Surface | Layout | Built from |
| --- | --- | --- |
| Public site | `default` | `UHeader`, `UMain`, `UFooter`, `UFooterColumns`, `UNavigationMenu`, the `UPage*` family |
| Editorial and policy pages | `default`, through `app/pages/[...slug].vue` | A `PhotoHero` where the page has a banner and a spotlight band where it has none, then `UPage` with a prose-width `UPageBody` and `UContentToc` in the right slot from three sections up |
| Get involved | `default`, through `app/pages/get-involved.vue` | The one landing page: a left-aligned `PhotoHero` with the flash and the marquee, ticket-stub department tiles, a numbered step strip, a spotlight quote band, then the prose column. Its headline, flash, tiles, steps and quote are front matter, so the committee edits words and never the page |
| Operator documentation | `docs`, through `app/pages/docs/[...slug].vue` | The member shell's header with a search button, then `UPage` with a `UPageAside` of the collection's navigation tree on the left, `UPageHeader`, a prose `UPageBody` with previous and next links, and `UContentToc` in the right slot from three sections up (0076). Calm throughout |
| A member's own screens | `member` | The site header, a `UNavigationMenu` sub-nav of `MY_NAV`, the shared footer. No sidebar. Account settings pages (`/account/profile`, `/account/security`, `/account/notifications`) additionally wrap in `AccountSettings.vue`, a `UPage` with a `UPageAside` of `ACCOUNT_NAV`. Calm throughout, and nothing from the expressive kit: the page title is the one the layout or `AccountSettings` draws, a section heading is `text-lg font-semibold` and a heading inside one is `text-base font-semibold`, and a page takes `MEMBER_PAGE_READING`, `MEMBER_PAGE_WORKING` or `MEMBER_PAGE_WIDE` from `app/utils/member-shell.ts` rather than spelling a width of its own (0084) |
| Console: managing rooms, training, the bar, the box office, people, money | `console` | `UDashboardGroup`, `UDashboardSidebar` (its header a link to `/admin`, its `UNavigationMenu` vertical and `type="multiple"`, each group two `type: 'label'` sections), `UDashboardPanel`, `UDashboardNavbar`, `UDashboardSearch`, `UTable` |
| Show night | `tonight` | A plain dark subtree, because a phone held in a foyer is not a dashboard. The SumUp return screen (`/pay/return/[token]`) wears it too: it is a till operator's screen, and the signed key in its path is what it answers on, so the shell must not depend on a session (F-124 criterion 3) |
| The backstage board | `backstage` | The same dark subtree with nothing in it at all: no header, no footer, no link off the board (E-120 criterion 6) |
| The way in (`/sign-in`, `/register`, `/reset`, `/verify`, `/magic`) | `default` | The site header and footer as usual, with `WayIn.vue` drawing the page: a spotlight ground carrying the wordmark over one `UPageCard`. All five wear it, the last three being the screens a person reaches from an email, so the shape lives in one component rather than in five pages. The `signed-out` middleware sends a visitor who already has a session on to `next` or home |
| The error page (`app/error.vue`) | `default`, through `NuxtLayout` | The same `WayIn` shape inside the site chrome, so a mistyped URL costs the page and not the rest of the site. No status code is shown (`copy-style.md` section 6), and three ways on are offered: what's on, get involved and home. A second-factor refusal keeps its enrolment button above them (A-112, K-133) |

The shell follows the posture of the work, not the URL, and which shell a screen takes is a
decision record rather than a habit (`decisions/0040-navigation-is-shaped-by-posture-and-filtered-by-ability.md`).
`UDashboardSearch` is in the matrix above and is not built yet: it is the answer once the sidebar
passes roughly forty items, and it is now a story of its own (K-201) rather than a line in a
consequences list. The sidebar carries fifty-four, which is why each group splits into Every day
and Set-up first (0082): search finds a screen whose name you already know, and the sections are
what make an unfamiliar one findable at all.

Nine rules follow:

1. **A permanently dark region is marked `dark`.** The public header and footer are stage black
   in both colour modes. That is one class on the subtree, after which every semantic token
   inside resolves to its dark value on its own. Overriding slot classes to fake it works until a
   token moves, and then fails quietly in one component.
2. **Lists are `UTable` with column definitions.** The admin table theme lives in `app.config.ts`
   for exactly this reason. A hand-written `<table>` in a page is a copy of a decision that has
   already been made. A list long enough to page uses `UPagination` bound to the server's page,
   never a client-side slice of everything: the endpoint pages in SQL and answers with an
   envelope (CONTRIBUTING), so the browser never holds the whole table. A cell whose content
   varies widely in length (a diff, a free-text detail) shows a fixed number of badges plus a
   count of the rest, with the whole of it in the row's own expanded detail, rather than growing
   the row past its neighbours (0027).
3. **The show-night shell carries one header, and the screens fill it in.** `app/layouts/tonight.vue`
   draws the back arrow, a mono uppercase eyebrow, the show title, the "Thu 5 Nov 19:30 Main Hall"
   line and the on-shift badge. A screen says what goes in it through `setNightEyebrow` (which
   `NightScreen` calls with its own title) and `setNightSubject` (which the screens that know
   tonight's show call), and a screen that names nothing still sits under the running house: the
shell fills the title and the line in from the performance `/api/tonight/authority` marks active,
so no page draws a heading of its own. The hub at `/tonight` is the night's
   destinations, one `NightTile` card each, ordered by how often a tile is tapped on a night and
   with Emergency last and red; a tile appears or does not by the viewer's own resolved authority
   (the till), never to hold the grid to a count. A titled block is `NightBlock`, a single number
   is `NightKpi` and the matinee-day picker is `NightPerformanceSwitcher`; none of the four is in
   the expressive kit, and all four are show-night only.
4. **The show-night screens are phone-first and work offline.** They cache their night on open
   and render from cache when the network drops (`architecture.md`, module K). Anything that only
   looks right on a desk monitor is wrong for the surface it is on. Every control on one clears
   48 by 48 pixels, not only the primary actions K-102 criterion 2 names: a cold hand in a dark
   foyer does not aim, and a secondary control missed twice costs more than the room it saved.
   That floor is one rule, `.nnt-night` in `app/assets/css/theme.css`, and the two show-night
   layouts put the class on the body so a teleported modal is inside it too; a screen never asks
   for it field by field. The shells stand on `min-h-dvh` rather than `min-h-screen`, and the
   pinned area pads by `env(safe-area-inset-bottom)`, so a phone's own browser chrome and home
   indicator never sit on top of the action under the thumb. `tests/unit/night-shell.test.ts`
   holds all three.
5. **Navigation is declared once and filtered by ability.** Every destination in the console
   sidebar, the member sub-nav (`MY_NAV`), account settings (`ACCOUNT_NAV`), the account menu, the
   public header (`HEADER_NAV`, a derived slice of `PUBLIC_NAV`) and the footer comes from
   `shared/utils/site-nav.ts`, and the console middleware guards a route from the same entry the
   sidebar renders. A screen added to a layout and not to the declaration fails
   `tests/unit/site-nav.test.ts` (0040). Three things about a console entry are tests there too,
   and not review's job (0082): a group is ordered as Every day then Set-up, or names no section
   at all; an icon belongs to one entry across the whole sidebar; and a nav label is character for
   character the `title` its page sets in `definePageMeta`, with the shorter noun winning, because
   the sidebar truncates at its default width and the navbar does not (issue 921).
6. **Every console list is a `UTable` with column definitions, and it stays usable below `sm`.**
   Table markup written by hand takes none of the shell's behaviour, so it arrives with no empty
   state, no loading state and no column rules; a list of rows on the console is a `UTable` or it
   is a defect (K-123 criterion 9). A money column is right-aligned and mono through
   `RIGHT_ALIGNED` and `saysMoney`. A column of row actions has a header, `ACTIONS_HEADER`
   hiding the word where a visible one would read as noise, and an empty header is not a header.
   A row offers at most three actions in line, the primary one visible and the rest in a
   `UDropdownMenu` (K-123 criterion 10). A secondary column carries `app/utils/responsive-table.ts`'s
   `HIDE_BELOW_SM` class on both its header and cell, and its content moves into the primary
   column's own cell as an `sm:hidden` line, so nothing a phone reads is lost, only where it sits;
   the row's actions never move. A read-only history table with no primary column instead renders
   as one card per row below `sm`, the table itself hidden there (issue 922). A true-or-false
   column ("In use", "Sold") is `StatusCell`, never a pair of sentences: a tick or a cross, with
   the words for each value as its label. The icon is hidden from a screen reader and the words
   are read in its place; below `sm`, where a column of icons loses its header, the words stay on
   screen beside it, so neither the icon nor its colour carries the meaning alone (K-135).
7. **A shell's title is not a link inside a link.** `UHeader` wraps its `#title` slot in its own
   anchor, so the slot holds `SiteWordmark`, not a `NuxtLink`, and the destination is the `to`
   prop. `UHeader` does not carry its default slot into the mobile panel either, so a header with
   links gives the `#body` slot the same navigation.
8. **There is one confirmation shape on the console: `ConfirmModal`.** Every destructive or
   money-moving action opens it (K-123 criterion 7, 0032). Its title states what is about to
   happen rather than asking a question, its `consequence` line says what follows, its button is
   the verb and the thing it acts on ("Refund £12.50", "Retire Studio", never a bare "Delete"),
   and `error` is for destruction while `primary` is for a money or publishing action that is
   not. A refusal from the route renders inside it, above the footer, because a page-level alert
   sits behind the overlay where nobody reads it. The cancel word comes from
   `CONFIRM_BACK_LABEL` in `shared/utils/admin-conventions.ts`, so unifying it later is one
   string. `tests/unit/admin-conventions.test.ts` is what holds the rule. It serves the public
   shell's destructive actions too, cancelling a booking and leaving a waiting list among them: a
   visitor undoing something irreversible is owed the same sentence an officer is (D-110
   criterion 6, D-113 criterion 6). The member shell answers to it as well: withdrawing from a
   session or a request, releasing a shift, withdrawing access requirements or a membership
   claim, and removing an authenticator or a way in all ask first (issue 1153 item 7). Where the
   action also sits behind re-authentication, the confirmation comes first and gives way to the
   re-authentication modal, whose success runs the confirmed call once without asking again
   (A-128 criterion 9). Cancelling a room booking still confirms in a dialogue of its own, with
   its choice of scope; moving it onto `ConfirmModal` is owed.
9. **Every console modal wears that same frame, whether it confirms or collects.** Its actions
   sit in the `#footer` slot, the primary verb first and the way out beside it, so no modal
   puts a Save halfway down a scrolling body. The way out is one word everywhere, read from
   `CONFIRM_BACK_LABEL`, and a modal that collects something has one as surely as a modal that
   confirms: the cross in the corner is a control a phone barely offers and nobody reads as a
   cancel. A title states what the modal does ("Void this charge"), because the two buttons
   below it are already the question. A refusal from the route renders inside the modal above
   its footer, `ConfirmModal`'s `failure` prop where it is one and a `UAlert` at the top of the
   body where it is a form, and the page's own alert is hidden while a modal is open. The
   show-night kit is not bound by this: it keeps its own register (rule 3).
10. **A console screen says what it is for in one sentence, and the documentation says the
    rest.** The navbar carries the title, so no screen draws a `UPageHeader` of its own; beneath
    it comes at most one line of plain prose, above the first table or form. An officer who
    wants more presses the help button, which opens the screen's `content/docs/` page through
    the `docs` entry in its `definePageMeta` (J-109, 0076). A `UAlert` is for a state the reader
    has to act on, a refusal, a warning about the data in front of them or an empty result: one
    that is always there is furniture, and it is read the second time and never again.
    `tests/unit/admin-conventions.test.ts` holds the rule, against named lists that may shrink
    and may not grow (K-123 criterion 11, issue 1151 item 2).

## Photography and show artwork

The photographs of the building and of past productions are ours, and they carry the spotlight
better than any gradient. Three rules:

1. **Always scrim.** White text over an unscrimmed photograph is a contrast failure waiting for
   the one image that is bright in the wrong corner. Put `nnt-scrim` between the image and the
   text, every time. The same floor goes under the artless poster frame, whose two hues come from
   a hash of the title and will eventually land light.
2. **Show art is sovereign.** A production's poster is designed by that show's team, in its own
   world of colour. The house frames it and never restyles, tints, or overlays it. The frame is
   ours; what is inside it is theirs, so a listing's flag goes on the card body and never inside
   the frame.
3. **A banner photograph is decorative.** The headline beside it is what the page says, so
   `PhotoHero` renders an empty `alt` and takes no `alt` prop: a caller that named the picture
   would have a screen reader read it before the words. `design-language.test.ts` refuses one.

The house photographs live under `public/images/`, the logos under `public/images/logos/`, and
`PhotoHero` is the one component that draws a banner, so rules 1 and 3 are applied in one place. It takes
`compact` where the picture is a band rather than the whole first screen, and its `title` and
`description` slots take over from the props where the headline carries a word in its own colour,
as what's on does. `align="start"` caps the words at a reading width inside the site column, never
the column itself, so a wide screen keeps the hero's left edge where every other section's is.
`PosterFrame` is the matching one place for show artwork: it draws the poster when there is one
and, when there is not, the show's own two hues under its title in the display face, which is why
a show with no artwork yet looks deliberate rather than broken, and why real posters will land in
one component (J-111). The hues and the corner glyph come from `posterTint` and `posterGlyph` in
`shared/utils/listing.ts`, seeded by the frame's `slug` and falling back to the title, so a show
keeps its frame wherever it is drawn; every caller passes `slug` or none of them does, because two
seeding differently give one show two frames. `titled` is how a caller with a heading of its own
keeps the frame from printing the title a second time. The artless frame is a landscape band below
`sm`, a poster above it: three cards on a phone are three cards and not three screens. A banner
is WebP or AVIF, at most 1920 pixels wide and under 300 KB; the camera originals stay out of the
repository. `tests/unit/static-assets.test.ts` holds the budget and refuses a reference to a picture
that is not there (K-126). The default Open Graph image, `public/og-default.png`, is the what's-on
banner scrimmed with the white logo over it, so a shared link looks like the house even for a page
with no picture of its own.

## Printing

Almost nothing here is printed, and what is printed is printed from a dark screen: a show-night
screen defaults to stage black, and a browser asked to print one sends the lot to the paper.
`theme.css` carries a single `@media print` rule that hides the page and shows only what is
marked `.print-pass`, light on white, inside a `.print-sheet` lifted to the top of the page. A
walk-up's door pass at the till is what it exists for (F-123).

A screen with something worth printing marks that region and nothing more; there is no
per-screen print stylesheet, because two of them would disagree about what "print" means.

## What belongs here

A colour, a font or a token change belongs in `theme.css`, and a component variant belongs in
`app.config.ts`. There is no upstream to send it to any more, and no other application waiting to
inherit it, so the review here is the only review it gets.

Nothing else may introduce a colour scale, a font, or a raw hex value. If a colour is needed and
is not a token, add the token.

The one exception is show artwork, which is sovereign and never house-styled.

## How this is enforced

The rule that a colour must be a token is a test, not a review habit:
`tests/unit/design-language.test.ts` fails on a raw hex anywhere under `app/` except
`theme.css` itself, which is where the tokens are defined. It also asserts that the three brand
scales exist, that no Google Fonts request has crept in, and that the print rule is still there.

`tests/e2e/shells.test.ts` holds the rest to the same standard, in a real browser: a public view
spends its expressive budget at most once each, the admin shell and the member's own screens use
none of the kit at all, and the public chrome resolves stage black from the subtree it is marked
on rather than from overridden slot classes.

What is still review's job is judgement: whether a surface is calm or expressive in the first
place, whether a photograph is scrimmed, and whether show artwork has been left alone. A count
cannot see any of those.
