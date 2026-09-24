# 0093: Documentation has three audiences, and the public tier is its own collection

- Status: Accepted (IT Manager, 24 September 2026)
- Date: 2026-09-24
- Amends: 0076

## Context

0076 made the operator documentation one collection, `docs`, readable only with a session, and
said nothing about who a page is for. Feedback on 23 September (issue #1263) asked for three
audiences: the public (whether you need an account, creating one, signing in, booking), members
(booking rooms, the rota, front of house shifts) and the committee (every console screen). A
visitor today has no help at all, since everything sits behind sign-in, and a member reading the
tree sees every console page beside the three or four that concern them.

Filtering the one gated collection by audience cannot give a visitor anything. Nuxt Content
serves a collection as a single SQL dump that the browser downloads whole for client-side
navigation, so opening `docs` to anonymous readers and hiding committee pages in the tree would
hand every page, thresholds and internal screens included, to anybody who fetches
`/__nuxt_content/docs/sql_dump.txt`. The gate 0076 put on the dump is the only thing keeping the
operator pages off the public internet; it has to stay whole.

## Decision

**Three audiences: `public`, `member` and `committee`.** Every documentation page carries an
`audience` field in its front matter, and `bun run check docs` refuses a page without one or with
a value its collection does not allow.

**The public tier is a separate collection, `help`, under `content/help/`, served at `/help`
without a session.** Its dump and query route are open like the `content` collection's, and it
holds only pages written for somebody who is nobody here yet: whether an account is needed,
creating one, signing in. Its pages carry `audience: public`, and it is linked from the public
shell's footer. The `content` collection excludes `help/**`, so a help page is never also an
editorial page. `server/middleware/docs-content.ts` keeps gating the `docs` collection's dump and
query route exactly as 0076 set out; nothing about `help` touches that gate.

**Member and committee are navigation only.** Both stay in the one gated `docs` collection, each
page marked `member` or `committee`. The docs layout shows committee pages in the tree and in
search only to a viewer who holds any live role grant or standing permission; everyone signed in
sees the member pages. A member who follows a link to a committee page still reads it: the
collection is already theirs, so hiding it would be decoration posing as access control, and a
page that names a screen they cannot open does no harm. If a committee page ever holds something
a member must not read, it moves to a third, separately gated collection by the same reasoning as
the public tier, never behind a filter.

## Consequences

- A visitor has help pages for the first time, and they share the public shell, its footer and
  its policy-token rendering (0012), so a lifetime quoted on one is the configured value.
- Two pages can say similar things: the public signing-in page and the operator page on signing
  in. The public one is written for a visitor and links to nothing gated; the operator page keeps
  the refusals and the console's side. Keeping them in step is the review checklist's job, the
  same as any page and its screen.
- Every one of the operator pages gains an `audience` line. A new page without one fails CI.
- The session answer gains whether the viewer holds any live role, since the chrome cannot tell a
  role with no standing permission from no role at all. It is a hint the tree filters by, never a
  guard (0009).
- The tone of the existing pages is not changed by this record; that is an editor's pass, not an
  architectural one.

## Options considered

- **Filter the one collection by audience, open to all.** Refused: the dump would publish every
  operator page, which is what 0076's gate exists to stop.
- **A server route per page instead of the client dump.** Possible later (0076 already names it
  as the fallback if the dump grows too heavy), but it would not change who may read what, and it
  is more machinery than three public pages need.
- **Gate committee pages by permission now.** Deferred: nothing on them is secret from a member,
  and a second gated collection costs a second dump and a second gate to keep proven.
