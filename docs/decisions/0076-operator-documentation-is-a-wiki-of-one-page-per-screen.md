# 0076: Operator documentation is a wiki of one page per screen, with its pictures committed

- Status: Accepted
- Date: 2026-09-15

## Context

J-109 asks for every module's operator documentation in-app, reachable from the screens it
documents. What shipped first was one page per module under `content/docs/`, two of them, on a
plain hero-and-prose route with no navigation between pages, no search, no table of contents and
no link from any screen. `docs/known-issues.md` named the gap. The page for the box office
already described a ticket export screen that has no page file: the drift J-109 exists to
prevent had started inside the documentation itself.

The old rooms application is the cautionary tale in `CONTRIBUTING.md`, but its documentation
was the best thing about it: a docs layout with a tree on the left and the page's headings on
the right, an index split by audience, and task pages written as numbered steps with a picture
per step. Nobody who reads that kind of page needs a predecessor's folder.

## Decision

**One page per screen or task, in a numbered tree under `content/docs/`.** A section is a
folder (`04.box-office/`) with a `.navigation.yml` naming it and an `index.md` overview; a page is
`<n>.<slug>.md` inside it. Nuxt Content's own rules give the URL (`/docs/box-office/the-desk`):
the ordering prefix and the index file are not part of it. Every page carries `title`,
`description`, `module`, `updatedOn` and `updatedBy`, and is read through the same policy-token
resolver the public policy pages use, so a threshold named on a page is the one enforced (0012).

**The docs layout is a reading surface, not a fifth posture.** `app/layouts/docs.vue` wears the
member shell's chrome with a `UContentNavigation` tree beside the page, search over the
collection, a table of contents from three headings up, and previous and next links. It is
reached from every shell's account menu, which is the one `SHELL_NAV` entry; the tree inside it
comes from the collection rather than `site-nav.ts`, because a page is a document and not a
destination the sidebar guards (0040 stands).

**A screen names its page.** `definePageMeta({ docs: '/docs/box-office/the-desk' })` on a page
file, and `DocsLink.vue` in the console navbar, the member header and the show-night top bar
renders the help link. `tests/unit/docs-links.test.ts` fails a console, member or show-night
screen with no page named, and a page named that does not exist.

**Pictures are captured by a script and committed.** `bun run docs:shots` drives a seeded dev
server as the persona each screen needs, draws numbered badges over the elements the page's
legend names, and writes PNGs under `public/images/docs/`. The manifest lives beside the runner,
one file per section. CI never runs it (0032); a page's prose, its manifest entry and its picture
move together. `bun run check docs` refuses a page missing its provenance, a picture nothing
shows, a picture that is not there, a link to no page, and a section with no navigation entry.

**The collection is not readable anonymously.** Nuxt Content serves a collection's query route
and its SQL dump with no authentication of its own, and in production the dump is also a static
asset served before the worker runs. `server/middleware/docs-content.ts` requires a session on
both paths, and `nuxt.config.ts` tells wrangler to run the worker first for them; a unit test
reads the built `wrangler.json` to prove the rule survived the build. The public collection is
untouched.

## Consequences

- Around seventy pages replace two. Each names the permission or shift that reaches its screen,
  walks the task in numbered steps, quotes the screen's refusals in its own wording, and says what
  is recorded and who is told.
- A behaviour change updates the page, the page's `docs:` meta if it moved, and its picture, in
  the same pull request. `CONTRIBUTING.md` says so; review checks it.
- First client-side navigation inside `/docs` downloads Nuxt Content's WASM SQLite and the
  whole collection dump, prose only. If that grows past what a phone in a foyer should pay, four
  small server routes behind `requireAccount` replace the client database; nothing in the pages
  changes.
- `updatedOn` and `updatedBy` are still set by whoever edits the file: the in-app editor J-109
  criterion 2 asks for is the same deferred surface 0051 left the public pages without.
