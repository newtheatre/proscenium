# 0114: The IT Manager's role holds every permission, and nobody grants themselves a role

- Status: Accepted (IT Manager, 29 September 2026)
- Date: 2026-09-29

## Context

The role audit against the constitution (issue #1211, recommendation R4) proposed narrowing
`ADMIN` once the Treasurer and the Secretary held their own grants: the IT Manager's role would stop
holding `finance.write` and `access.verify`, by analogy with 7.8.2, which keeps acting as Treasurer
or Secretary within the Committee. The audit itself recorded that this was a policy choice, not a
clause: the constitution does not name these acts, and it assigns access verification to nobody.

The IT Manager decided on 29 September 2026 that `ADMIN` stays all-powerful. It is the recovery
route for every other post: when a Treasurer's grant lapses at the year end or a Secretary resigns
mid-term, the IT Manager is who keeps Z readings recorded and access queues moving until the
Committee fills the post.

The same recommendation also refused a grant to the granter's own account. Only `ADMIN` holds
`roles.grant`, so the refusal is about committee standing, not permissions: an IT Manager who grants
themselves `COMMITTEE` or a post role would take the Committee's standing (0113), which reaches tab
credit, committee notices and duty manager eligibility (0115), without anybody else deciding it.

## Decision

**`ADMIN` holds every permission.** `PERMISSION_MAP.ADMIN` stays `PERMISSIONS`, with no exceptions.
R4's narrowing is not adopted. `PROTECTED_ROLE` keeps its meaning: `ADMIN` alone holds `roles.*`,
`accounts.create`, `accounts.disable`, `accounts.merge`, `config.write`, `backups.*`,
`training.override`, `comms.*`, `finance.reopen`, and, since `MANAGER` retired (0113),
`fellowships.write`, `members.write` and `ticketing.manage`.

**Nobody grants themselves a role.** A grant whose holder is the granter's own account is refused
for every role but `ADMIN`, on `/people/roles` and on Add someone. Granting oneself `ADMIN` changes
nothing, since the granter already holds it. Another IT Manager makes the grant, and it is audited
with that person as the actor.

## Consequences

- A-118 gains a criterion for the self-grant refusal.
- The money separation pinned by 0113's unit test excepts `ADMIN` permanently rather than until
  R4. What answers the concentration is who holds `ADMIN`: the Archivist and one delegate, with the
  President reviewing their grants and settings changes, and every act audited.
- An IT Manager who also holds a post (the Archivist, whose post is `COMMITTEE`) receives that
  grant from the other IT Manager. With a single IT Manager, the grant waits for a second one, which
  0009's permanent grant rule already expects to exist.

## Options considered

- **Narrow `ADMIN` as R4 proposed.** Rejected by the IT Manager: it would leave Z readings and
  access verification with nobody whenever the Treasurer's or the Secretary's grant lapses.
- **Drop the self-grant refusal as well.** It takes no permission from `ADMIN`, and without it the
  Committee's standing could be self-conferred.
