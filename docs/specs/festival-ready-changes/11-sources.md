# Sources

Everything here was read on 23 November 2026 from branch `next` of newtheatre/proscenium (commit cf7907e1) unless it is an outside page.

## Repository

| What | Path | Used for |
| --- | --- | --- |
| Core domain tables | `layers/core/server/db/domain.ts` | Productions, performances, credits, spaces, closures as built; the "no new CHECK on a built table" practice |
| Space guard | `layers/core/server/programme/performances.ts` (`noClash`, `assertSpaceFree`) | Drafts are not clash-guarded; turnaround |
| Core services | `layers/core/server/services.ts` | No write services exist yet for productions or performances |
| Sign-in providers | `layers/core/server/identity/providers.ts`, `oidc.ts`; `layers/core/module/identity.ts` | The provider flow is already general; Google's settings and rules |
| Federated identities | `layers/core/server/db/identity.ts` | Keying by provider and subject |
| Forms tables and engine | `layers/forms/server/db/schema.ts`, `layers/forms/shared/engine/types.ts` | Definition format, transitions, responses, action runs |
| Front of house tables | `layers/front-of-house/server/db/schema.ts` | Shifts without a performance already exist; assignments |
| Box office tables | `layers/box-office/server/db/schema.ts` | Scans made on the device, offline |
| Foundations formats | `docs/specs/foundations/02-*.md` | Table layout, data classes, abilities, settings, reserved prefixes, `core.requirement` |
| Core spec | `docs/specs/core-domain-and-public-site/` | Stories C-01 to C-59, settings and abilities layouts |
| Form builder spec | `docs/specs/form-builder/` incl. `13-changes-2026-11-21.md` | FB-512, slots, change-page format |
| Front of house spec | `docs/specs/front-of-house/` | FH-01 to FH-47, settings, abilities, screens |
| Box office spec | `docs/specs/box-office-payments-ledger/06-screens.md` | The door screen |
| Identity spec | `docs/specs/identity/07-settings-and-abilities.md` | The fifteen preset roles |

## Project documents

- [Proscenium: the plan beyond what is built](https://claude.ai/artifact/Ncea8wJY5z2sdaA89cigQk), Overview, Training and Festivals tabs.
- Third-round brief, `/mnt/project-files/third-round-specs/brief.md`.
- Agreements with the Programme planning, Festival, Training (amended), Rehearsals, Productions and Fundraising specs, 23 November 2026, recorded in the Overview tab.

## Outside pages

| Page | Used for |
| --- | --- |
| [Microsoft identity platform: ID token claims reference](https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference) | `tid`, `oid`, `sub` pairwise per app, `email` not to be trusted |
| [Microsoft: OpenID Connect on the v2.0 endpoint](https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc) | Discovery address per tenant |
| [Microsoft: optional claims reference](https://learn.microsoft.com/en-us/entra/identity-platform/optional-claims-reference) | `xms_edov` |
| [Microsoft: claims validation](https://learn.microsoft.com/en-us/entra/identity-platform/claims-validation) | Check `tid` against the tenants allowed |
| [pretalx API fundamentals](https://docs.pretalx.org/api/fundamentals/) | The schedule endpoint is public; tokens give non-public data, so the import uses none |

## Not verified

1. **pretalx's schedule export paths and fields.** The pretalx pages read did not list the frab-compatible `schedule.json` and its fields; C-63 assumes the published schedule export (title, start, duration, room, track, type, abstract, speakers' public names, a stable code). To confirm against a real pretalx event, such as WSAF's, before C-63 is built.
2. **Microsoft's issuer for multi-tenant sign-in** is inferred from the v2.0 authority and Microsoft's sample token (`https://login.microsoftonline.com/<tid>/v2.0`), not stated word for word. To confirm with a test tenant when ID-47 is built.
