# 9. Questions for Matt

Seven questions, all decided by Matt on question cards on 24 November 2026. Five went as recommended; questions 3 and 5 did not, and their decisions are written into parts 1 to 8. Each question is kept below with its reasoning as the record of why; under questions 3 and 5 the decision comes first.

| # | Question | Decision | Where it shows |
| --- | --- | --- | --- |
| 1 | Where does practice data live? | A throwaway store per person (as recommended) | Parts 2, 3, P-PM-1 |
| 2 | Practise on the theatre's own setup, or a generic sample theatre? | Our own setup, never our people (as recommended) | Part 2, setting `copy-configuration` |
| 3 | Who may practise? | **Only through a Training course** (not the recommendation) | Parts 4 and 6, PM-03, PM-12, T-PM-26 |
| 4 | Should finishing a scenario count in Training? | Later, switchable, off by default (as recommended) | PM-22, setting `report-completion` |
| 5 | Which screens first? | **Every live screen at once** (not the recommendation) | Part 4, PM-20, T-PM-25 |
| 6 | How are privileged steps practised? | A pretend prompt, clearly labelled (as recommended) | Rule M6, PM-17 |
| 7 | What is it called? | "Practice" (as recommended) | Glossary |

## 1. Where does practice data live?

**Recommendation: a throwaway store per person**, a Durable Object whose SQLite holds the schema, the configuration copy and sample records, deleted when the session ends.

- **For.** Nothing practice writes can ever sit in a real table, so no report, export, job or listener can pick it up by mistake. Each trainee has their own house, so two trainees never confuse each other. Cleaning up is deleting one object. It keeps "one D1 database" true.
- **Against.** The kit needs a D1-shaped adapter over the store and has to swap every binding; a desk request makes several round trips to the store. P-PM-1 measures both before anything is built.
- **Option B: one shared practice D1 database**, reset nightly. Simpler adapter (it is D1), but trainees share one sample night and see each other's sales, a reset mid-session wipes someone's work, and it is a second database to bind on every fork.
- **Option C: practice rows in the real tables with a flag.** Rejected: every query in every module would need the flag, and one forgotten filter puts sample tickets in a real report or a real door list.

## 2. The theatre's own setup, or a generic sample theatre?

**Recommendation: the theatre's own configuration**: venues, spaces, ticket types, bands, bar products, duties, checklists and settings, copied by each table's declaration, with every personal column passed through its erasure rule.

- **For.** A volunteer practises on the till they will use on Thursday, with NNT's own prices and products, not an invented theatre's. Training content can refer to real ticket names.
- **Against.** The copy has to be declared table by table, and a theatre's configuration is visible to every member who practises. Nothing in it is personal, and members already see prices and venues, so this seems acceptable; `core.practice.copy-configuration` turns it off.
- **The other option.** A shipped sample theatre only. Simpler, but practice would teach screens rather than the theatre's own way of selling.

## 3. Who may practise?

**Decision (Matt, 24 November 2026): only through a Training course.** A person may practise a scenario while Training's fact `training.practice-open` holds for it: a published course they may view whose lesson names it, a current record for a version that named it, or being a trainer of such a course (agreed with the Training thread). Administrators may open any scenario to check it. The recommendation below was not taken.

**Recommendation: every member**, through the fact `core.member`, as Interface's part 6 already says, plus the front-of-house manager role in the small-venue preset. Audience accounts may not.

- **For.** The point is to learn before being trusted with the real screen. Requiring a grant first defeats that. A store holds nothing real, so there is nothing to protect.
- **Against.** Every member can see the theatre's prices and set-up in a store (question 2) and use a little Cloudflare capacity. Rate limits still apply (part 2).
- **The other option.** Only people with a training course step that links to practice. Ties practice to Training, which Integration ruled against on 16 November.

## 4. Should finishing a scenario count in Training?

**Recommendation: not in the first release.** Training's online lesson section is completed by the learner pressing "I've tried it" (agreed with the Training thread). Later, PM-22 adds `core.practice.scenario-completed`, switched by `core.practice.report-completion`, off by default.

- **For waiting.** It keeps "writes nothing real" absolute while the rest is proven, and practising is not the same as being competent: a trainer's practical sign-off stays the evidence.
- **Against.** A training manager cannot see who practised. The later event fixes that, and it is the only real write practice mode would ever make.

## 5. Which screens first?

**Decision (Matt, 24 November 2026): every live screen at once.** The first release has six scenarios, covering the door, desk sale, till, bar till, front of house's night and incidents, and the build refuses a `/live` page no scenario covers. The recommendation below was not taken.

**Recommendation: the door, a desk sale and the till** (`box-office.door-scan`, `box-office.desk-sale`, `payments.till`). Box office is the platform's most crucial area (Matt's ruling), and these are the screens new volunteers use on their first night. Front of house's night, the bar till and refunds follow as PM-21.

## 6. How are privileged steps practised?

**Recommendation: a pretend confirm-it's-you prompt**, clearly labelled, that accepts a press. The person learns where the prompt appears without their real sign-in session being changed by practice.

- **The other option.** Require a real re-assertion. More realistic, but it writes to the real session, breaking "writes nothing real", and makes a trainee without a passkey unable to practise refunds.

## 7. What is it called?

**Recommendation: "Practice"** throughout: "Practice mode", the banner "Practice · not real", the button "Practise this screen" (British spelling of the verb). It is what Interface and the catalogue already say, it does not collide with Training's own words (course, session, lesson), and it stays clear of Payments' "test mode" and the unscheduled "demo mode".
