# Sources

Read on 23 November 2026, branch `next` of [newtheatre/proscenium](https://github.com/newtheatre/proscenium) unless shown.

| Source | What it gave |
| --- | --- |
| Third-round brief, `/mnt/project-files/third-round-specs/brief.md` | Format, rules, spec 13's scope |
| [Proscenium: the plan beyond what is built](https://claude.ai/artifact/Ncea8wJY5z2sdaA89cigQk), Overview and Training tabs | Practice mode as a platform capability; Training's online lessons |
| `docs/specs/interface-and-wireframes` (05-screens, 05-2 page conventions, 06 settings and abilities, 07 stories UI-29) | The banner rule, `core.practice.use`, the original story |
| `docs/specs/training-records` (01 overview, 02 scope, 10 questions) | Integration's ruling moving practice out of Training |
| `docs/specs/foundations` (02-1 manifest and reserved prefixes, 02-2 settings, 02-3 abilities, 02-4 data classes, 03 scope, 05 rules U1 to U9, 06 index of id prefixes and points) | Formats, the one-database invariant, prefixes in use |
| `docs/specs/spaces-and-room-booking` | Model of tone and depth for parts 2, 6, 7 and 9 |
| `docs/consistency-review` (paper, core, interface, integration-rulings R-28) | Demo mode unscheduled and distinct from practice |
| `docs/kit/README.md` | Units, external calls, the mailer, files, realtime |
| Code: `layers/core/kit/context.ts`, `database.ts`, `external.ts`; `nuxt.config.ts` | Every binding reached through `context.env`; `externalCall` as the one door to providers |
| Code: `layers/core/app/layouts/live.vue`, the live pages of box office, payments and front of house | What the first scenarios open |
| Code: `layers/box-office/module.ts`, `layers/payments/server/providers.ts`, `test-money.ts`, `calls/start-payment.ts` | Ability names, door-code signing, the provider point, Payments' separate test mode |
| [RFC 2606](https://www.rfc-editor.org/rfc/rfc2606) | `.invalid` is reserved and never delivered to |
| Ofcom's drama telephone numbers | Not opened: the site refused an automated fetch. The range in part 2 is to be confirmed |
| Threads: Training (amended), Reports, and the boundaries thread, 23 November 2026 | Agreed names: `core.practice-scenario`, `/practice/<id>`, `core.practice.scenario-completed`; Reports counts nothing from practice |
