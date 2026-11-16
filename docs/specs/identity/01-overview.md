# Identity and accounts: specification

Nov 16, 2026 · @Matthew Adcock

Workstream 2 of the detailed-design stage. One person has one account; the audience experience is what everybody gets, and the members' area appears only while a fact about the person earns it.

## The design in one page

| Question | Answer |
| --- | --- |
| Who has an account? | Every person the theatre records, exactly one each. A guest buyer has one with no sign-in yet ("unclaimed"), and claims it the first time they sign in with the same address. |
| How do people sign in? | A passkey, or a link and six-digit code by email, or Google where the theatre turns it on. No passwords in the first release. |
| What separates audience from members? | Nothing about the account. A person with a standing (a role, a current membership, a place on a production) sees the members' area; a person without one cannot tell it exists. |
| What lets staff do things? | Abilities, reached three ways: a role somebody granted, a fact that is true now (tonight's shift), or owning the record. Roles are data the theatre edits; only Owner is fixed. |
| What protects sensitive work? | A session is basic or strong. Privileged abilities need a strong session (a passkey) and a fresh check, asked in place. |
| What stops access piling up? | Grants carry an end date and are never edited; facts end by themselves; nobody grants themselves or gives what they lack; the theatre always keeps an Owner. |
| What about duplicates? | Staff merge two accounts in one batch. Every module's rows follow from a declaration on the column, and a test built from the registry proves none was missed. |
| What about leaving? | A person downloads their data or asks for erasure. Erasure waits a cooling-off, respects holds a module declares, then clears every personal value in one batch. |

Three choices carry most of the weight. **States are read, not stored**, so an account cannot be "pending" in one table and "active" in another. **An account exists only after a proof or a real record**, so there are no half-made sign-ups to clean. **Completeness is tested from registries**, so merge, erasure and the members' area boundary stay whole as modules are added.

## Where each part stands

| Part | State | Contents |
| --- | --- | --- |
| 1. Scope | Draft complete | In and out of scope, what is assumed of other workstreams, glossary |
| 2. Data model | Draft complete | 17 tables with column rules, data class, and merge and erasure behaviour |
| 3. States and rules | Draft complete | Four life cycles as diagrams, the resolver, the eight separation rules, merge and erasure |
| 4. Interface to other modules | Draft complete | Services, events, points, jobs, secrets, and what each workstream must do to fit |
| 5. Screens | Draft complete | 31 screens, three wireframes |
| 6. Settings and abilities | Draft complete | 29 settings, 17 abilities, 14 preset roles |
| 7. Stories | Draft complete | 37 stories, 30 in the first release |
| 8. Test plan | Draft complete | Named never-regress cases by tier |
| 9. Questions for Matt | **Decided 16 Nov 2026** | 12 questions, every recommendation accepted by Matt |

Names follow the foundations formats as amended on 16 November 2026. The data-model column layout will be re-cut if the foundations data-class registry settles on a different one.

## What is not here

- Product code. This is a specification.
- The audit log, which the foundations thread specifies; identity supplies the actor, session and assurance level to it.
- Membership, shifts and training: they declare the facts identity reads, and are specified with their own modules.
