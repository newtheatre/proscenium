# ADR-0026: Eligibility is read from rehearsal, behind one seam, failing open with a flag

**Status:** Accepted · **Date:** 2026-08-21 · **Deciders:** Matt Adcock (ITM 26/27)

## Context

The rota gates who may claim which shift: duty managing needs training, and selling alcohol needs
training ([12-access-and-staffing §3.3](../12-access-and-staffing-design.md),
[13-bar-design §5](../13-bar-design.md)). Both designs were drafted expecting to keep a
hand-maintained eligibility flag until a training system existed.

**It exists.** `rehearsal` (`training.newtheatre.org.uk`) is live. Its eligibility rules are named,
committee-editable data rather than code (its ADR-0006: "this app answers; consumers enforce"), and
`GET /api/v1/eligibility/:key?userId=` returns `{ eligible, missing, expiring }`. stage-door already
consumes it for conditional role grants (its ADR-0019). `rehearsal`'s own
`docs/consuming-the-api.md` names this rota as the reference consumer, and has been waiting for it.

So the choice is not whether to integrate, but how, and in particular what happens when the training
service cannot be reached at 19:10 on a Friday.

## Decision

**One seam, `isEligible(userId, ruleKey)`.** Every eligibility question in this app goes through it:
`duty-manager`, `door`, `bar`, and whatever the committee adds later. The rota never encodes what a
rule *requires* (only that there is one) so the committee can change the requirement in
rehearsal's admin UI without a deploy on either side.

**The rule keys are created in rehearsal, not here.** `door` and `bar` do not exist yet; creating
them is a prerequisite of the rota work, and it is committee policy expressed as data.

**Responses are cached for five minutes** and treated as advisory-fresh, never transactional, which
is what rehearsal's guidance asks of consumers.

**The failure direction is fail-open with a flag**, and it is chosen deliberately:

| Situation | Behaviour |
|---|---|
| API answers, eligible | Claim allowed. |
| API answers, not eligible | Claim refused, naming what is missing, from `missing`. |
| API unreachable, cached answer exists | Use the cached answer. Do not retry-hammer. |
| API unreachable, no cached answer | **Allow the claim, mark it for FOH-manager confirmation.** |
| 404 on the rule key | Surface loudly. A renamed or deleted rule is a configuration break, not a transient. |

Fail-open is right *here* because the consequence of the alternative is worse: failing closed means
a training outage empties the rota, and an unstaffed performance is a real harm tonight, whereas an
unqualified claim is a flagged row a human reviews. The claim is a promise to turn up, not a grant
of authority; the authority arrives with the shift being confirmed.

**This choice does not extend to the alcohol gate if it is ever made hard.** The till's training
warning is a soft gate today ([13-bar-design §4.1.2](../13-bar-design.md)), so fail-open costs
nothing. If the committee makes it a hard block, that is a licensing control, and a licensing
control that fails open is not one. Revisit this record at the same time, in the same commit.

## Alternatives considered

- **Keep a hand-maintained flag.** Two records of the same fact, one of which lapses silently, which
  is precisely the problem rehearsal was built to fix.
- **Snapshot daily, as stage-door does** (its ADR-0019). Correct for the seal path, where a live call
  would put a second service on every login in the estate. Overbuilt here: this is one call, on a
  claim, a few times a week, and a snapshot would add a table and a scheduled task to answer a
  question the API answers in 40ms.
- **Fail closed.** Defensible, and it makes a training outage into a staffing outage. Rejected on
  the balance of harms above.

## Consequences

- A service token is needed (`NUXT_TRAINING_API_TOKEN`: the `NUXT_` prefix is load-bearing) as a
  worker secret and in the password manager. Issuing it is a prerequisite in rehearsal.
- The failure direction must be **tested by killing the URL locally**, which is on rehearsal's
  consumer checklist. Untested fallbacks are decoration.
- Flagged claims need somewhere to be seen, so the rota admin screen grows a "confirm these" list.
  Fail-open without that list is just fail-open.
- rehearsal's consumers table should be updated from "not yet integrated" when this lands, and the
  ITM told, so that rule changes reach us.
