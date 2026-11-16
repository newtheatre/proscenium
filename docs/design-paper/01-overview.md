# Open-source theatre platform: design paper

Nov 16, 2026 · @Matthew Adcock

## How to use this paper

This paper designs a new theatre management platform from the ground up. It is not a plan to modify Proscenium, and nothing in it assumes Proscenium's code.

It is split into two parts that must stay uncoupled:

- **Part A, Features** says what the platform does for a theatre. It never names a framework, a database or a file layout.
- **Part B, Conventions** says how the software is built, deployed and maintained. It never depends on which features exist.

The test for keeping them apart: any feature in Part A could be rebuilt on a different stack without rewriting Part A, and any convention in Part B would still hold if every module were replaced.

Several threads work on this document. Each section opens with its conclusion. Choices that have been made are recorded in the Decisions tab, and the platform keeps the name Proscenium.

## Vision and principles

A free, open-source system that runs a whole theatre, deployed entirely on Cloudflare, which the Nottingham New Theatre (NNT) can adopt and any other theatre can fork.

1. **General first, NNT as the first tenant.** Nothing NNT-specific is hard-coded. NNT's rules (its payment reader, its sign-in domain, its committee year) are configuration that happens to be NNT's.
2. **Fork the site, configure the rest.** A theatre forks the repository and writes its public pages as content. Everything else, including branding, is controlled inside the running app.
3. **Powerful through modules.** Each capability is a module a theatre switches on. A theatre that only needs a rota and a what's-on page gets a small, simple system.
4. **Cheap to run and to hand over.** One deploy on a free or near-free Cloudflare plan, no servers, and documentation a volunteer successor can pick up cold.
5. **Policy is data.** Numbers, deadlines, roles and permissions are settings enforced where data is written, not constants in code.
6. **Upgrades must be painless for forks.** A theatre that forked a year ago can pull the latest release without merge conflicts in files it was never meant to touch.

## What each tab holds

| Tab | Contents |
| --- | --- |
| Lessons from Proscenium | What to keep from Proscenium, what it does poorly, what it does not cover |
| Part A: Features | Who the platform serves, the always-on core, how a theatre makes it its own |
| Module catalogue | Sixteen modules, each with its capabilities |
| Beyond Proscenium | Capabilities Proscenium lacks and what they ask of the core |
| Part B: Conventions | Cloudflare runtime, lessons from Mailflare, repository shape, module manifest |
| Data, settings and permissions | Database rules, data classes, the settings and permission registries, providers |
| Security, privacy and interface | Sign-in, request protection, secrets, privacy, interface rules, derived branding |
| Engineering, releases and docs | Tooling, tests, environments, releases, documentation, licence |
| Setup, branding and public site | First run, what lives in the app and what in the fork, public pages |
| Roadmap | Eight phases with gates, box office first, and what to do before any code |
| Decisions | Matt's decisions on the eleven open choices |

Added on 16 November 2026 after Matt's decisions:

- Accounts: audience and members sets out one account with separate audience and members' experiences.
- Form builder describes the form builder and its engine.
- Research holds the comparison with other systems, Cloudflare limits and costs, and payment-provider fees, with sources.
