# Writing the operator documentation

How the pages under `content/docs/` are written, pictured, checked and kept current (J-109,
0076). This is for whoever edits a page: the reader's own guide to the wiki is the
**This documentation** section of `/docs/getting-started/finding-your-way`, and that page
carries one sentence pointing here.

The documentation is part of the application. It lives in this repository, is reviewed in the
same pull request as the behaviour it describes, and is served at `/docs` to anybody signed in.
There is no separate wiki to fall behind.

**Drift is a defect.** A screen that changes without its page changing is a bug in the same
sense as a refusal that says the wrong thing, and it is fixed the same way: in a pull request,
by whoever changed the screen. The cautionary tale is the old rooms application, whose published
rules described a product the code did not contain.

## Where the pages live

Markdown files under `content/docs/`, one folder per section and one file per screen:

```
content/docs/index.md                      /docs
content/docs/12.system/index.md            /docs/system
content/docs/12.system/1.settings.md       /docs/system/settings
content/docs/12.system/.navigation.yml     the section's title and icon in the sidebar
```

The number at the front of a folder or a file orders it in the sidebar and is dropped from the
address, as is `.md`; `index.md` is the section's own page. Links between pages use the address
form, `/docs/system/settings`. Every section folder carries a `.navigation.yml` naming the
section's title and icon.

A section, a page title and the address all say what the screen says: the section is named as
`shared/utils/site-nav.ts` names its group or shell, the title is the screen's own name, and the
address is the title in lower case with hyphens. No two pages share a title.
`tests/unit/docs-nav-map.test.ts` holds all four, and the sidebar map on **Finding your way**
against `CONSOLE_NAV`.

## Front matter

Every page opens with the same block, in this order:

```
---
title: Settings
description: One sentence saying what the page is for, ending with a full stop.
module: Platform
updatedOn: 2026-09-15
updatedBy: Matt Adcock
navigation:
  icon: i-lucide-sliders-horizontal
---
```

There is no in-app editor, so `updatedOn` and `updatedBy` are set by hand by whoever edits the
page, in the same commit. `module` is the area of the backlog the screen belongs to.

## The shape of a page

Each page documents one screen, and only a screen that exists: a page file under `app/pages/`
and behaviour visible in its code. The backlog describes intent; the code is the truth, and a
promise the code does not yet keep is left out rather than written as coming.

- An opening paragraph: who works the screen, named by role title, and where it is in the
  navigation.
- **If something goes wrong** immediately after it, quoting each refusal in the screen's own
  wording. It comes before the tasks because somebody a refusal has stopped is the likeliest
  reader, and `tests/unit/docs-screen.test.ts` keeps it first.
- Tasks as numbered steps, with one annotated picture per screen after the step it illustrates,
  and a legend beneath saying what each numbered badge is.
- **What happens next**: what is recorded, who is told. Where it names an audit entry, it quotes
  the label `shared/utils/audit-actions.ts` gives the action, which is what the audit screen
  shows.
- **Related pages**.

## The words

`docs/copy-style.md` governs the pages, in the member shell's register: full sentences, warm and
direct, "we" for the theatre, "you" for the reader.

A page never shows the estate's own vocabulary. No permission code, audit action name,
configuration key, stored enum value, decision record or story id reaches a page; the opening
paragraph names the officer instead of the permission, and a role title is spelled as
`ROLE_WORDING` in `shared/utils/roles.ts` spells it. Nothing is done by "the system", and a page
does not explain itself with "because": the instruction belongs on the page and the reasoning in
the decision record. `tests/unit/docs-copy.test.ts` holds all of that, reading the registries
themselves so a permission or an action added later is covered the day it is added. A page
quoting a screen word for word is read past, in quotation marks for a refusal and in bold for a
control, so a screen whose own wording breaks a rule is fixed on the screen.

A figure the configuration owns is never typed into the prose. It is written as a token, the
key's name inside a pair of double curly braces, and renders as the live value (0012). A key
marked sensitive, whose value could name a person, cannot be quoted at all, and the build
refuses a page that tries. The Settings page is the one place a key is named, since that screen
shows the key itself.

No em dashes anywhere; British English throughout.

## Pictures

Every picture is captured from a seeded development server, with numbered badges drawn over the
elements the legend names. A manifest per section under `scripts/docs-shots/` says, for each
picture, which page to open, as which seeded persona, at which width, and which elements to
number:

```
bun run docs:shots            # every picture
bun run docs:shots system     # one section, by name
```

It needs a development server on port 3101, seeded (`bun run seed`, which writes
`.data/personas.json`), and a Chrome or Chromium for `Bun.WebView`. The pictures are committed
under `public/images/docs/`, and the command is not part of the build. Re-run it for a section
whenever its screens change, and commit the new pictures with the page. The picture folders keep
the section names the shot manifests use, which are not always the section's address.

Where a picture is known to be stale and cannot be retaken in the same change, the page carries
a callout saying what has moved, and the callout goes when the picture is retaken.

## Checks

- `bun run check docs` fails when a page is missing its front matter, shows a picture that is not
  in the repository, links to a page that does not exist, or a picture is shown by no page.
- `bun run check content-tokens` fails on a token naming an unknown or sensitive key.
- `bun run check comments` fails on an em dash.
- `tests/unit/docs-links.test.ts` fails when a screen names a page that does not exist, or a
  console or member destination names none.
- `tests/unit/docs-nav-map.test.ts`, `docs-copy.test.ts` and `docs-screen.test.ts` hold the tree,
  the words and the shape.

All of them run in CI on every pull request.

## The help link on each screen

Every console, member and show-night screen names its page in `definePageMeta({ docs })`, and
each carries a **Help for this screen** button that opens it. A renamed page therefore breaks the
build rather than the link.

## Making a change

1. Edit the page, or add one following the shape above.
2. Set `updatedOn` to today and `updatedBy` to your name.
3. If a screen changed, re-run the pictures for its section.
4. Run the checks above.
5. Open the pull request with the code change it belongs to. The reviewer checks the page against
   the screen.

## Reporting drift

**Report as out of date** is on every page, for any signed-in reader. It notifies the IT Manager
at once and writes an **Operator documentation flagged as out of date** entry to the audit trail,
naming the page and the reader. There is no list of open reports: the notification and the trail
entry are the record, and the IT Manager fixes the page in a pull request.
