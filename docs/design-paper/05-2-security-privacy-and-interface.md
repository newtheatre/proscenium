# Security, privacy and interface

Security and accessibility are platform services that every module gets by default and cannot opt out of.

## Sign-in and sessions

- Passkeys first. An emailed link or code and Google sign-in are also in the first release. Password and Microsoft sign-in come later; a sign-in method is a declared point, so one can be added.
- A theatre can restrict an identity provider to its own domain and forbid passwords on that domain.
- An unverified address cannot sign in.
- Privileged actions re-assert a second factor, scoped to the session.
- Sessions are revocable on the server, and a person can see and end their own.
- A recovery route for a locked-out owner that does not need a developer.

## Requests

- Security headers (content security policy, transport security, frame and referrer policy) on every response, declared once in configuration.
- Rate limits are declared per route and enforced by the platform. A route with no declaration fails the build.
- Turnstile on registration, sign-in and guest checkout, off when no key is configured.
- Every input is validated against a schema shared by the form and the server.
- A constraint violation is turned into a clear refusal by one shared helper.

## Secrets

- Worker secrets only. Never in the repository, configuration defaults, fixtures, tests or documentation.
- A missing secret fails once and clearly at start-up, naming what is missing.
- Seed scripts generate random credentials at run time, print them once and refuse to run against production.

## Privacy

- Erasure anonymises in one batch and keeps the history.
- Special-category data is encrypted in the application before it is stored.
- No personal free text in audit detail.
- Retention periods are settings, enforced by scheduled sweeps.
- Consent for marketing is recorded per list with its wording and date.
- A person can download their own data.

## Interface

- **Nuxt UI components first.** Custom markup only where nothing fits.
- **Three shells:** public, member and console. Navigation is shaped by posture and filtered by ability.
- **Phone-first operational screens** that survive a dropped connection through a local cache and a write queue. Desk screens are designed for a laptop.
- **Every string goes through translation.** British English is the source language. Catalogues are files per language per module.
- **Accessibility to WCAG 2.2 AA**, tested automatically in CI and by hand before a release.
- **A screen whose data did not load shows only why**, never a half-filled page.
- **One set of conventions for lists:** filters in the address, export, empty states.

## Branding

Branding is derived, as in Flytower.

- The theatre picks one colour. The app works out a range of shades from it and uses, in light and in dark mode, the nearest shade that passes 4.5:1 contrast.
- Status colours (success, warning, danger) never change, so a red brand does not make a healthy screen look broken.
- Name, logo, favicon and display font are set in the app. Fonts are chosen from a bundled list, so nothing loads from a third party.
- Uploaded images are cleaned before they are kept.
- Branding reaches everywhere: the app, emails, tickets, PDFs, social cards and passkey prompts.
- A small credit line can be turned off.
