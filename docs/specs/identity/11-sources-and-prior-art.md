# Sources and prior art

Every claim this specification makes about another system comes from the files below, read on 16 November 2026. Nothing here was copied; each is a lesson taken or a mistake avoided.

## Proscenium (the system NNT runs today)

Decision records are in [docs/decisions](https://github.com/newtheatre/proscenium/tree/main/docs/decisions) of the repository.

| Source | What this specification takes from it |
| --- | --- |
| Decision 0007 | One account per person across audience and members |
| Decision 0008 | Workspace-only Google sign-in, and no password on a society address: here a managed-domain setting, not a rule for every theatre |
| Decision 0009 | Roles end at the committee year end; authority on the night comes from facts, not standing grants |
| Decision 0011 | Erasure is anonymisation in one transaction; no personal free text in audit detail |
| Decisions 0026, 0060, 0066, 0071, 0088, 0091, 0103, 0114 and 0040 | Later corrections to sign-in, merge and permissions, read for what went wrong in practice |
| Known issues | Merge moves only some tables; classification is kept per table by hand; a Google re-authentication does not resume the action. Each is designed out here by a registry and a walking test. |

## Mailflare (Matt's Nuxt port)

| Source | What this specification takes from it |
| --- | --- |
| [server/db/schema/index.ts](https://github.com/MattA-Official/mailflare/blob/nuxt/server/db/schema/index.ts) | Sessions stored by token hash with the authentication methods used; a table of passkey challenges; enrolment grants of several kinds (setup, recovery, staff-issued); a recorded step-up per session |

## Flytower

| Source | What this specification takes from it |
| --- | --- |
| [docs/account.md](https://github.com/teamflytower/flytower/blob/main/docs/account.md) | Ten recovery codes that must be typed back before they count; recovery through a setup token when everybody is locked out |
| [docs/people.md](https://github.com/teamflytower/flytower/blob/main/docs/people.md) | Roles a team defines itself; "you can only give access you have yourself"; implied permissions shown locked; the last Owner cannot be removed; managing access from the thing it applies to |

## Law and standards

| Source | Used for |
| --- | --- |
| [UK GDPR, Article 12(3)](https://www.legislation.gov.uk/eur/2016/679/article/12) | A data request is answered without undue delay and within the applicable period. The period is a setting with a 30-day default; a theatre confirms it against its own law. |
| RFC 8176 (authentication method references) | The vocabulary a session uses to record how it was made |
| WebAuthn (W3C) | Passkeys |

## Not verified

- The Information Commissioner's Office guidance page on erasure could not be opened from here, so nothing is cited from it.
- No other theatre has been asked how its members and audiences overlap; the audience and members rules rest on NNT's experience and the design paper.

## This project

| Document | Link |
| --- | --- |
| Design paper | [Open-source theatre platform: design paper](https://claude.ai/artifact/8Yn8fPcsngaKVrTdijBaiD) |
| Foundations specification | [Foundations](https://claude.ai/artifact/RKRTkLkrG98jXHSBptUc1x) |
| Core domain specification | [Core domain](https://claude.ai/artifact/Qt8cFSyEekr7tfpiMCqe2E) |
