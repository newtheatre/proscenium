# Form builder: detailed specification

Nov 16, 2026 · @Matthew Adcock

Workstream 5 of the detailed-design stage. This document specifies the form builder, including forms with a review step, which replace a dedicated proposals module. Each of the nine parts has its own tab.

## At a glance

&#91;embedded content: how the parts fit · 6 parts, 5 kinds of plug-in\]

An author publishes a version; the browser and the server both run the same engine over it; the stored response keeps its version and moves through the workflow.

## The design in ten decisions

| # | Decision | Why |
| --- | --- | --- |
| 1 | A form version is one immutable definition; editing happens in a draft and reaches people only on Publish | A response always knows exactly which form it answered, and a half-made edit never reaches a respondent |
| 2 | One engine, with no platform dependencies, runs unchanged in the browser and on the server, and a shared case set proves they agree | "Checked in both places" becomes a tested fact, and the server never trusts the browser |
| 3 | Logic lives on the item it affects (show when, require when, where a page goes next) and reads as a sentence | The reference project's separate rule list is the hardest part of it to use, and the paper forbids a rule table |
| 4 | Logic is data: conditions and a fixed list of functions, never script | It can be checked before publishing, shown as words, and run safely on the server |
| 5 | Each answer is its own row with its own data class | Erasure, retention, encryption and filtering work per question, exactly as on built-in data |
| 6 | Every question has a lasting identity across versions, and its type never changes | Results span versions, and changing a form cannot silently reinterpret old answers |
| 7 | Other modules connect through five kinds of declaration: slots, picker types, bindable attributes, outcome actions and templates | Forms never names another module, and any module can use forms without forms changing |
| 8 | Custom fields are a form in "record" mode, attached to a slot on a record type | One mechanism to learn, as the paper asks |
| 9 | A workflow is stages the theatre names, each of one of six fixed kinds, with review as a stage that hides scores and locks out conflicts | Proposals need no module of their own, and reports can understand any theatre's workflow |
| 10 | Counted limits (a cap, one response each, limited options) are database constraints inside the same unit of work as the submission | The last place is taken once, with no check in application code to race |

## How to read this document

| Tab | Holds |
| --- | --- |
| 1. Scope | What is in and out, how a proposals round is covered, and what is assumed of other workstreams |
| 2. Data model | The definition format and sixteen tables, each column with its class and erasure behaviour |
| 3. States and rules | The life of a form, a version and a response; workflow and review rules; the engine's rules |
| 4. Interface to other modules | Points, slots, services, events, facts and jobs |
| 5. Screens | Twenty-one screens, the builder in detail, and two wireframes |
| 6. Settings and abilities | Twenty settings and fourteen abilities |
| 7. Stories | Forty-one stories with acceptance criteria, in a first release and later |
| 8. Test plan | Twenty-four named cases that must never regress |
| 9. Questions for Matt | Ten choices, each with a recommendation |
| Sources and prior art | What was read, and what was taken or left from each |

## Status

First draft, complete on all nine parts, written on 16 November 2026. No product code has been written.

| Item | State |
| --- | --- |
| Aligned with foundations (workstream 1) | Yes: points and contributions, units of work, per-row data classes, naming, settings format, always-on, public components, erasure in append-only tables |
| Aligned with interface (workstream 6) | Yes on what was asked: the Editor layout, side-by-side rows and where review and "My forms" live. The wireframes follow those rulings and still need a check against its full page conventions at integration |
| Aligned with identity (workstream 2) | Yes in tab 4: the conflict lockout is a guard inside forms, grants stop at the form, and signed-out responses are keyed to an email address. Tabs 2, 3, 4, 6 and 7 were rechecked against these rulings on 16 November 2026; tab 2 carries them as three dated amendments under the responses table |
| Aligned with core domain (workstream 3) | Yes: vocabularies, files, the notification-type point and the record types that slots refer to |
| Waiting on box office and payments (workstream 4) | The charge service and its event names; the checkout slot |
| Decided by Matt | All ten questions in tab 9, as recommended, on 16 November 2026 |
