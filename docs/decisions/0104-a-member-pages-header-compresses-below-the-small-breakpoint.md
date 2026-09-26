# 0104: A member page's header compresses below the small breakpoint

- Status: Proposed
- Date: 2026-09-26
- Amends: 0084 (the member shell's widths and its page title), for phones only

## Context

0084 settled the member shell's three widths and its heading voice, and said nothing about how
tall they stand on a phone. The MVP flow review of 25 September 2026 (issue 1342) measured the
first screen of a member page at 500px wide. The page's top padding (`py-16`), `UPageHeader`'s own
padding, its `text-3xl` title and a description of two or three `text-lg` lines, under a strip of
ten links, pushed the content 60 to 75% of the way down: on Rooms, the first free slot was below
the fold. The widths were right; their height was a desktop's.

The strip is taken away below `sm` by the same issue, since the header's menu holds the same
list. What is left is the header itself.

## Decision

**Below `sm`, a member page's header is compact. At `sm` and above it is what 0084 and Nuxt UI
give it.**

- The three widths in `app/utils/member-shell.ts` pad `py-6` below `sm`:
  `MEMBER_PAGE_READING` is `max-w-3xl py-6 sm:py-16`, `MEMBER_PAGE_WORKING` is
  `max-w-xl py-6 sm:py-16` and `MEMBER_PAGE_WIDE` is `max-w-5xl py-6 sm:py-10`.
- Every `UPageHeader` in the member shell, on a page or in `AccountSettings.vue`, takes
  `MEMBER_PAGE_HEADER` from the same file: `py-4` rather than `py-8`, a `text-2xl` title and a
  `text-base` description below `sm`, and Nuxt UI's own sizes above it.
- The description is never clamped or hidden. It keeps every word it has.

The page title is still the one the page or `AccountSettings` draws, and 0084's section and
nested heading sizes are unchanged.

## Consequences

- On a phone the content starts in the first screen. Measured on the access requirements page at
  390px wide, the strip and header took 384px under the site header before the form began; they
  now take 190px.
- `tests/unit/design-language.test.ts` pins the three widths, `MEMBER_PAGE_HEADER` and that every
  member `UPageHeader` takes it, so a new page cannot spell its own.
- Desktop is unchanged, and so is every page's copy.
- A description that runs long still costs a phone its lines. Shortening one is copy work for the
  page that owns it, not something the shell does to it.

## Options considered

- **Leave it.** Refused: a member on a phone scrolled past the header to reach what they came
  for on every page, which is the one job the shell has.
- **Clamp the description to one line below `sm`.** Refused, though it saves the most. Rooms
  says in its description how to choose a slot by touch, so a clamp would hide the one
  instruction on the screen it is for, and a truncated sentence reads as a fault.
- **Hide descriptions on phones.** Refused for the same reason, more so.
- **One header component for the member shell.** Refused for now: `UPageHeader` with a named
  `ui` object is one line on each page, a test can see it, and a component would have to repeat
  every prop Nuxt UI already takes.
