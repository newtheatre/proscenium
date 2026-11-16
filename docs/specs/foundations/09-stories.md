# 7. Stories

## Stories

Thirty-seven stories: thirty-four in six groups, and three added on 16 November 2026 (F-35, F-36 and F-37, below the fifth group). Eleven are needed for the gate, twenty-four more for the first release, and two are later. Each has an id (F for foundations), who it is for, and acceptance criteria a test can check. The order within a group is the suggested build order; the first two groups come before any other workstream can build.

## A. The repository and the kit (build first)

| Id | Story | Accepted when |
| --- | --- | --- |
| F-01 | As a contributor I can clone the repository and run it locally with one command | `bun install` then `bun run dev` serves the site with local D1, files, cache and queues; no account needed |
| F-02 | As a contributor I can declare a module and have it loaded | A folder in `layers/` with a `module.ts` appears in the generated registry; a manifest error fails the build with the file and field named |
| F-03 | As a contributor I declare tables with the class of every column | A column with no class fails the build; the generated schema and migration match |
| F-04 | As a contributor I write a route that cannot forget its permission check | A route with neither `ability` nor `public: true` fails the build ('signed-in' is the ability for any signed-in person, and there is no ability named 'public'); a refused request gets the standard body |
| F-05 | As a contributor my change, its audit row and its events commit together or not at all | The four unit-of-work cases in the Proofs tab pass on local D1 |
| F-06 | As a contributor I can announce an event and another module can listen | A listener in a second module runs after commit; with that module off, nothing runs and nothing fails |
| F-07 | As a contributor I can queue a job and schedule a task | The job runs once though its message is delivered twice; the task runs once though cron fires twice in the minute |
| F-08 | As a contributor I call a payment provider safely | A simulated timeout leaves an attempt with no outcome; the reconcile handler settles it; nothing is shown as done before the outcome commits |
| F-09 | As a contributor I read settings and they are typed and validated | `useSetting('x')` for an undeclared key is a type error; an out-of-limit value cannot be saved |
| F-10 | As a contributor I get told when code and declarations disagree | The conformance checks (Test plan) run in CI and locally with one command |

## B. Setup and deploy

| Id | Story | Accepted when |
| --- | --- | --- |
| F-11 | As a theatre I get my own running copy without creating any Cloudflare resource by hand | The documented route produces a working site; no identifier is pasted anywhere |
| F-12 | As the person who deployed, only I can run setup | `/setup` does nothing without the setup code; it answers 404 once an Owner exists |
| F-13 | As an Owner I am walked from an empty database to a usable site | The six setup steps complete; leaving and returning resumes at the same step |
| F-14 | As an Owner I can start from a preset | A preset lists what it will switch on and change before I confirm; afterwards those modules are on and those settings set |
| F-15 | As an Owner I see what is still to do | The checklist shows module-contributed steps and ticks them when their condition is met |

## C. Modules, settings and credentials

| Id | Story | Accepted when |
| --- | --- | --- |
| F-16 | As an Owner I can switch a module on | Its screens, navigation and routes appear; required modules are switched on with it after I confirm; a missing `always` secret blocks it with the secret's name |
| F-17 | As an Owner I can switch a module off without losing anything | Its routes answer 404, its jobs wait, its data is untouched; switching on restores everything |
| F-18 | As an Owner I am stopped from switching off something another module needs | The refusal names the modules that require it |
| F-19 | As an Owner I can find and change any setting | Search finds it by label or help text; the page shows default, limits and last change |
| F-20 | As a successor I can see what this theatre decided | The Changed from default filter lists every non-default setting with who changed it and why |
| F-21 | As a module manager I can change my module's settings and no others | With a grant on one module's settings, other modules' settings are read-only |
| F-22 | As a content editor I can quote a policy number on a public page and it stays true | `:setting{name="..."}` renders the live value; an unknown or non-quotable name fails CI |
| F-23 | As an Owner I can enter a provider key without it ever being readable again | After saving, only the last four characters show; the audit row has no value |
| F-24 | As an Owner I can copy my conventions to a test site | Export then import shows a preview of differences and applies only what I confirm; sensitive values are not exported |

## D. Updates

| Id | Story | Accepted when |
| --- | --- | --- |
| F-25 | As a theatre I am offered each new release as a pull request with its notes | The update action opens one pull request per release, with the lockfile resolved and checks run |
| F-26 | As a theatre I can change my site freely and still merge releases | A fork that only changed owned paths merges every release with no conflict but the lockfile (Proofs) |
| F-27 | As a theatre I am told before I break the rule | The owned-path check fails a pull request that edits an upstream file not listed in `site/overrides.json`, naming the file and where the change belongs |
| F-28 | As an Owner I apply database changes knowingly | After a deploy with pending migrations, visitors see the maintenance page; Apply runs them with progress; a failed migration leaves the database unchanged and says which one |
| F-29 | As a theatre I can write my own module | A module in `site/layers/x-*` with its own tables, migrations, settings and abilities works and survives an upstream merge |

**Added after the real deploy (16 November 2026).** F-35, first release: as a theatre whose copy was made by the Deploy to Cloudflare button, I link my copy to upstream once, so that every later release merges in the ordinary way. Accepted when a copy made from a release as a single fresh commit, with theatre work on top, is linked by `scripts/link-upstream` and then merges the next release with no conflict outside the lockfile; a copy that is already linked is left alone; a copy whose recorded version matches no upstream tag is refused with the reason. F-25 (the update action) runs the same link by itself.

**Added when the kit was built (16 November 2026).** F-36, first release: as a theatre I am protected from guessing and flooding however many copies of the Worker are running. Accepted when the `sign-in`, `public-form` and `presented-value` classes count in a store shared by every instance (built as a Durable Object counter; Cloudflare's rate limiting binding was evaluated and rejected, see the Formats tab), each limit is a count and a period read from `core.rate-limits.<class>`, and a test with two instances shows one shared count.

**Added for the door (16 November 2026).** F-37, first release: as a module I can sign a short code that a device checks with no connection. Accepted when a module that declares a signing purpose can sign and verify under it; `signing.publicKeys` returns every key still valid for checking; a scheduled task rotates a key when it is due and retires the old one after its keep period, erasing the private part; an Owner can retire a key at once from the Health screen after being told what it will invalidate; and no private key ever leaves `core_signing_keys`, where it is encrypted.

## E. Health, jobs and audit

| Id | Story | Accepted when |
| --- | --- | --- |
| F-30 | As an Owner I can see whether the system is well | The health screen shows each check with a remedy; a secret removed from the deployment turns its check to failing within a minute |
| F-31 | As an Owner I hear about a problem I did not go looking for | A check failing for longer than the setting sends one notification, not one a minute |
| F-32 | As an Owner I can retry failed background work | A dead job can be retried; a job of a switched-off module cannot run and says why |
| F-33 | As an Owner or administrator handling a data-protection question I can answer who did what and why they could | An audit search by person or record returns rows with the grant or fact that allowed each; the search itself is audited |

## F. Testing

| Id | Story | Accepted when |
| --- | --- | --- |
| F-34 | As a contributor I can run every test tier locally on Linux, the supported system for tests | Unit, integration and browser tiers each run with one command, locally and in CI |

## Deferred, with reasons

- **A marketplace or installer for third-party modules.** A theatre's own module lives in its fork; sharing one is copying a folder. Anything more waits for real demand.
- **Per-record setting overrides.** See question 1.
- **Rolling back a release from the console.** Cloudflare's own rollback covers code; database changes within a major only add, so the previous code still runs against the newer schema.
