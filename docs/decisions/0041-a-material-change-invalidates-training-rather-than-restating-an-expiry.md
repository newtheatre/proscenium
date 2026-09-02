# 0041: A material change invalidates training, rather than restating an expiry

- Status: Accepted
- Date: 2026-09-02

## Context

0018 settled that a training record's expiry is stamped at award from the module's policy as it
stood that day, and that changing the policy afterwards moves nothing. It then named one exception:
a previewed, count-confirmed recalculation, administrator-only and scoped to one module a run, as
the only retroactive path to a stamped date. That tool was built (G-124) and it worked as
specified.

It answers a question the theatre does not ask. A module's expiry policy is the least likely thing
about it to change, and when it does change the committee's own rule is that a lifetime is fixed
the day it is earned, so the honest answer to "the policy moved" is to leave every existing record
alone. What actually changes is the **content**: the theatre stops using an Eos lighting desk and
starts using an FLX, and everybody holding the lighting module now holds training in a desk we do
not own. No restatement of a date can express that. The record is not late, it is wrong.

The backlog's existing answer to a material change is G-109's retire-and-recreate: retire the
module, create a successor with a new published id, and leave the old records standing against the
retired module. That is right for a module that has become a different subject, and wrong for one
that is the same subject taught on new equipment, because it silently keeps every old record valid
at every gate.

## Decision

**A stamped expiry is final.** `expires_on` is written once, at the award, and nothing in the
system may ever move it. The append-only trigger on `training_records` enforces this rather than
merely documenting it: the clause that admitted a restatement is gone, so an attempt from any path
aborts at the database. Recalculation, its permission `training.recalculate`, its audit action and
its screen are withdrawn, and G-124 is resolved as withdrawn.

**The retroactive path is invalidation, not restatement.** Where a module changes materially, the
person editing it may declare the change material and invalidate the existing records against it.
Invalidation is revocation with a reason naming the change, so the table stays append-only and
nothing is deleted or edited; the people affected are told; and the run is previewed and
count-confirmed before it writes, the way every other bulk act in this system is.

**A module that is new, or that has just been invalidated, is bootstrapped.** The people who
already know the thing are granted records in one audited action rather than being made to sit the
module again. Without this, invalidation is unusable: nobody will invalidate a module if the cost
is re-teaching the entire theatre.

Both are V2 (G-209 and G-210). MVP ships with no retroactive path at all, which is the safe
default: revocation and re-grant already exist for one record at a time.

## Consequences

- 0018's decision text is superseded in this one respect, and 0018 carries a pointer to here. Its
  other terms, including that validity is derived and never stored, carry unchanged.
- G-123 criterion 3 becomes absolute rather than nearly absolute: no exception survives it.
- Retire-and-recreate (G-109) remains the right answer where a module has become a different
  subject. Invalidation is for a module that is the same subject taught differently. The two are
  distinguished by whether the published id still describes what is taught.
- Between now and G-209, a material change is handled by revoking the affected records one at a
  time, which is laborious and correct. If that proves painful before V2, it is an argument for
  pulling G-209 forward, not for restoring recalculation.
- An expiry set at sign-off as an explicit override is unaffected: it was always somebody's
  decision rather than the policy's, and it is now frozen along with everything else.
