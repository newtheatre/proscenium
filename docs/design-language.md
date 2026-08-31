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
with no text in it and an icon-only button with no accessible name both fail
`design-language.test.ts`, which is how the rule survives the next screen.

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

| Utility or variant | What it is for |
| --- | --- |
| `nnt-spotlight` | A limelight beam on stage black. Hero bands, the show-night screens, the footer. |
| `nnt-headline` | The display face, tight and balanced. Public headlines. |
| `nnt-shadow-poster`, `-primary`, `-ink` | The hard offset shadow of a hand-printed show poster. Composed through `--tw-shadow` so it stacks with ring utilities. |
| `nnt-ticket` | Perforated stub edges. Booking summaries, prices, anything that is literally a ticket. |
| `nnt-sticker` | The tilt on a badge. One per view. |
| `nnt-marquee` | Running-lights border for the one CTA that matters. |
| `nnt-scrim` | A legibility gradient over photography, so white text stays readable whatever the picture does. |
| button `marquee` | The single CTA of a view. Colour-agnostic: passing `color` does nothing. |
| button `poster` | The secondary public action. Presses into its own shadow on click. |
| card `poster` | A show, treated as a printed poster. |
| card `ticket` | A booking, treated as a stub. |
| badge `sticker` | NEW, SOLD OUT, the season flash. |

## Chrome

The tokens and the component theme are shared; the layouts are not. Each surface is assembled
from Nuxt UI's structural components:

| Surface | Built from |
| --- | --- |
| Public site | `UHeader`, `UMain`, `UFooter`, `UFooterColumns`, `UNavigationMenu`, the `UPage*` family |
| Admin, rooms, training, reports | `UDashboardGroup`, `UDashboardSidebar`, `UDashboardPanel`, `UDashboardNavbar`, `UDashboardSearch`, `UTable` |
| Show night | A plain dark subtree, because a phone held in a foyer is not a dashboard |

Three rules follow:

1. **A permanently dark region is marked `dark`.** The public header and footer are stage black
   in both colour modes. That is one class on the subtree, after which every semantic token
   inside resolves to its dark value on its own. Overriding slot classes to fake it works until a
   token moves, and then fails quietly in one component.
2. **Lists are `UTable` with column definitions.** The admin table theme lives in `app.config.ts`
   for exactly this reason. A hand-written `<table>` in a page is a copy of a decision that has
   already been made. A list long enough to page uses `UPagination` bound to the server's page,
   never a client-side slice of everything: the endpoint pages in SQL and answers with an
   envelope (CONTRIBUTING), so the browser never holds the whole table.
3. **The show-night screens are phone-first and work offline.** They cache their night on open
   and render from cache when the network drops (`architecture.md`, module K). Anything that only
   looks right on a desk monitor is wrong for the surface it is on.

## Photography and show artwork

The photographs of the building and of past productions are ours, and they carry the spotlight
better than any gradient. Two rules:

1. **Always scrim.** White text over an unscrimmed photograph is a contrast failure waiting for
   the one image that is bright in the wrong corner. Put `nnt-scrim` between the image and the
   text, every time.
2. **Show art is sovereign.** A production's poster is designed by that show's team, in its own
   world of colour. The house frames it and never restyles, tints, or overlays it. The frame is
   ours; what is inside it is theirs.

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
scales exist and that no Google Fonts request has crept in.

`tests/e2e/shells.test.ts` holds the rest to the same standard, in a real browser: a public view
spends its expressive budget at most once each, the admin shell uses none of the kit at all, and
the public chrome resolves stage black from the subtree it is marked on rather than from
overridden slot classes.

What is still review's job is judgement: whether a surface is calm or expressive in the first
place, whether a photograph is scrimmed, and whether show artwork has been left alone. A count
cannot see any of those.
