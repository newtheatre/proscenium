# 0051: Editorial content ships as markdown, and copy the committee has not supplied is marked as a placeholder

- Status: Accepted
- Date: 2026-09-05

## Context

D-103 asks for the site's editorial pages (about, history, get involved, technical
specification) with two things beyond a routed markdown page: a non-technical editing surface
"in the Nuxt Studio style", and the old estate's four pages migrated "with their copy".

Neither was buildable as stated without a decision. `nuxt-studio` is a runtime dependency this
repository has never taken, and adopting it inside a content story would make an unvalidated
choice the pattern every future content screen inherits, never checked against the
`cloudflare_module` Nitro preset this application actually deploys to. And "with their copy"
means, read literally, importing a real theatre's venue dimensions, rigging, get-in routes and
recruitment copy from an old repository, none of it verified, some of it (the technical
specification) never live in the first place because it shipped commented out.

Both questions went to Matt rather than being guessed. His answers, 5 September 2026:

1. Ship markdown only; defer the editor. D-103 lands the `content/` pages, the routing and the
   token pipeline the policy pages will share. Adopting `nuxt-studio` needs its own story with a
   spike against `cloudflare_module` first.
2. Ship copy clearly marked as awaiting the committee, not the old estate's text and not invented
   text either. The criterion says rewritten, and rewriting is a later editorial pass; nothing
   that looks authoritative may reach the public site before the committee has actually supplied
   it.

## Decision

**The four pages are markdown files under `content/`, rendered through one catch-all route,**
`app/pages/[...slug].vue`. A page's route is its path under `content/`; a path with none is a
404. This is deliberately the same pipeline J-110's policy pages will use: J-110 adds files, not
a second route or a second collection.

**Every section of every page is placeholder prose, and the page says so.** Each of
`about.md`, `history.md`, `get-involved.md` and `technical-specification.md` carries
`placeholder: true` in its frontmatter, defined on the `content` collection schema in
`content.config.ts`. The catch-all route reads the flag and renders a banner: "Awaiting committee
copy. This page is a placeholder." No section states a fact about the theatre; each names what
belongs there instead ("Awaiting committee copy: capacity and stage dimensions for each venue").

**No content is imported from the old estate.** The old repository's `about.md`, the Vue
`get-involved.vue` and the commented-out `technical.md` are not read into this repository. What a
successor sees in `content/` is the shape D-103 designed, never a copy of the old estate's words
with a flag bolted on.

**The editing surface is out of scope.** No `nuxt-studio` dependency, no draft or preview state
beyond what a pull request already gives a markdown edit, no in-app publish action. A page is
edited by editing the file and merging, exactly like any other content in this repository, until
the deferred story lands something better.

## Consequences

- D-103 ships criteria 1, 3, 4 and 5 (as narrowed above) and states criterion 2 as unmet, with a
  `docs/known-issues.md` row naming the follow-up story and the Nitro-preset spike it needs first.
- `docs/workshops.md` gains a row naming exactly what the committee must supply for each page,
  so clearing a `placeholder: true` flag is a known, bounded task rather than an open one.
- A future editing-surface story inherits a real constraint: whatever it builds must still let
  `placeholder: true` mean what it means here, or the two stories' pages disagree about what
  "unpublished" looks like.
- `check:content-tokens` (0012) is exercised against real markdown for the first time, though
  these four pages carry no `{{TOKEN}}`, being editorial rather than policy pages; it stays
  unexercised against a real token until J-110.

## Options considered

- **Import the old estate's copy and mark it "under review".** Rejected: it is unreviewed prose
  about a real venue's dimensions and access route reaching a public page, which is exactly what
  criterion 5's "rewritten, not imported" exists to prevent, and it reads as more authoritative
  than a page with nothing on it at all.
- **Leave the four routes unbuilt until the committee supplies copy.** Rejected: the routing, the
  collection schema and the catch-all are real infrastructure other stories (J-110) need now, and
  a page a visitor cannot reach is a worse gap than one that is honest about being unfinished.
- **Build a minimal in-repository draft and publish flow now, short of `nuxt-studio`.** Rejected
  for this story: any editing surface, minimal or not, is the pattern a successor copies for the
  next content screen, and building one without validating it against the deployed Nitro preset
  first is the same mistake at a smaller size.
