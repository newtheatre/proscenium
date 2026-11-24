# 1. Scope

Practice mode covers running a live screen on a throwaway copy of the theatre: making that copy, marking and fencing the screens, stopping anything from leaving, and the scenarios that say what to practise. It does not cover what is taught (Training), demonstrating the product to a theatre that has not installed it (demo mode, unscheduled), or test deployments.

## In

| Area | What is in |
| --- | --- |
| The practice store | One per person: the schema, a configuration copy, sample records; made at the start of a session, deleted at its end |
| Marking requests | The practice mark on every request from a practice tab; refusing an unmarked change from a practice page |
| Swapping bindings | Database, files, cache, job queues, email, realtime rooms; external calls answered from each call's practice answer; any other outbound fetch refused |
| The configuration copy | Which tables are copied, by declaration, and how personal, free-text and special columns are passed through their erasure rules |
| Sample sets | Fictional people, a sample production and tonight's performance, sold and reserved tickets, a till float. Contributed by the module that owns the records |
| Scenarios | What a person can practise: the screen it opens, the screens it allows, the role it acts with, the sample sets it needs, tasks with checks |
| The practice frame | The banner that cannot be dismissed, the tinted border, the title prefix, the practice panel (tasks, outbox, card reader, start again, leave) |
| Printed and scanned output | "Practice: not valid" on tickets, receipts and door lists; practice codes signed with the practice store's own keys |
| Session life | Start, resume, start again, leave, end when idle or at the end of the show night; one session per person |
| Administration | Switching practice off for the site, switching scenarios off, the idle limit |

## Out

| Not here | Where it lives |
| --- | --- |
| Lessons, quizzes, sign-offs, competencies | Training (amended, spec 14). A lesson section links to a scenario by id |
| Recording that someone practised | Not in the first release. Later, the event `core.practice.scenario-completed`, which Training may act on (PM-22) |
| Demo mode: a whole sample site for a committee evaluating the platform | Unscheduled (Integration ruling R-28; paper part 6). Practice mode is for people already using the theatre's own site |
| Preview deployments and the test instance | Foundations (part 12) and project setup. They are whole separate sites with their own database |
| Payments' test mode | Payments. A provider account in test mode takes test money on the real database; practice mode never reaches a provider at all |
| Practising console and admin screens (every live screen is in the first release) | Later (PM-25). The first release is live screens only, where mistakes cost most |
| Practising together on two devices | Later (PM-23): a trainer and a trainee sharing one store |
| Theatre-written scenarios | Later (PM-26). First-release scenarios ship with the modules |

## What this spec assumes of others

- **Foundations (the kit)** builds the store, the binding swap, the mark check and the copy, and adds `practice` to `defineTable` and `defineCall` (part 4).
- **Interface** draws the frame from its existing rule "a banner on every screen says the data is not real. It cannot be dismissed" (page conventions, Acting for someone, and modes). UI-29 is closed by this spec.
- **Identity** contributes the sample people and answers the practice actor's access from the scenario's role, inside the store only. Erasure ends a person's practice session.
- **Payments** contributes the practice card reader as a provider, and a practice answer for `payments.start-payment`.
- **Box office, Front of house, Bar** contribute their scenarios and sample sets, and nothing else changes in their code.
- **Training** links lesson sections to scenario ids and declares the fact `training.practice-open`, the only way anyone but an administrator may practise (Matt, 24 November 2026; agreed with the Training thread).
- **Reports** counts nothing from practice, because practice rows never reach the real database (agreed with the Reports thread, 23 November 2026).

## Glossary

Words this spec owns. Use them exactly; the menus and help say the same.

| Word | Meaning | Not to be confused with |
| --- | --- | --- |
| Practice mode | Running the theatre's real screens on a throwaway copy, marked as practice | Demo mode (a whole sample site, unscheduled); test mode (Payments' test provider accounts); a test instance |
| Practice session | One person's time in practice mode, from start to end, with one practice store | A sign-in session (Identity); a training session (Training's dated class) |
| Practice store | The throwaway database of one practice session | The theatre's database |
| Scenario | A thing to practise: a screen, its sample setup and optional tasks. Has an id `<module>.<name>` and a version | A course or lesson (Training) |
| Sample set | A named group of fictional records a module writes into a store, such as "tonight's sold house" | Seed data in tests (fixtures) |
| Configuration copy | The theatre's own non-personal setup copied into a store when a session starts | A backup or an export |
| Practice mark | What a practice tab sends with every request so the kit swaps the bindings |  |
| Practice answer | What a declared external call returns in practice instead of being made |  |
| Outbox | The list, inside a session, of emails and inbox items that would have been sent | Communications' mailings; a delivery log |
| Practice card reader | Payments' stand-in reader that approves, declines or times out when the trainee chooses | Payments' test mode reader |
