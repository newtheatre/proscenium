# 0021: The design language is vendored, not extended as a layer

- Status: Accepted (IT Manager decision, 26 August 2026)
- Date: 2026-08-26

## Context

The estate's design language exists as a Nuxt layer in a separate `ui` repository: the colour
scales, the semantic `--ui-*` mapping, the self-hosted fonts, the expressive utilities and the
Nuxt UI component theme. Its README documents adoption as `extends: ['github:newtheatre/ui']`.

That repository has no git remote. It has never been pushed, so the documented form cannot
resolve. The alternatives were to push it and extend by git reference, to publish it to GitHub
Packages the way `@newtheatre/auth-types` is published, or to copy it in.

A relative path to `../ui` was never an option: it would make this repository depend on the
workspace that happens to contain it, and an application that cannot be cloned on its own and
built is a broken application.

## Decision

The design language is copied into this repository and maintained here. `app/assets/css/theme.css`
and `app/app.config.ts` come from `ui` at commit `e738cdb`, which this record names so a
successor can see what has diverged since.

The layer's value was one source for four applications rendering the same brand. This system
retires all four by 31 October, after which the layer would have one consumer and the sharing
argument would be gone. Paying for a package release pipeline, or a git dependency that pins
nothing, to share with applications that are being switched off is the wrong trade.

The house rules travel with the copy and are not softened: no raw hex values in the application,
two intensities with the expressive kit reserved for public surfaces, at most one marquee CTA,
one sticker and one spotlight per view, `gold-400` never carrying text on a light background, and
show artwork never restyled.

## Consequences

- A colour or token change is now a change here, and the estate applications do not inherit it.
  Until cutover they keep whatever they have, which is what they have always had.
- The no-raw-hex rule is enforced by a test rather than by review, because a rule nothing checks
  is a rule that lasts until the first busy week.
- If the `ui` repository is ever pushed and the estate applications adopt it, this record is
  superseded rather than edited, and the copy here is diffed against `e738cdb` to see what moved.
- The layer shipped `@nuxt/ui` as a dependency. This application already carries its own, and the
  two must not diverge by a major version.
