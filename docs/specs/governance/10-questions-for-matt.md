# 9. Questions for Matt

All nine questions were answered by Matt on decision cards on 24 November 2026 (00:28 to 00:31). Seven went as recommended; two did not, and the spec has been rewritten for them. The original questions are kept below as the record.

| Question | Answer | Effect on the spec |
| --- | --- | --- |
| 1. How a post gives authority | Facts tied to the term (as recommended) | As written |
| 2. Names on the public page | Ask each holder (as recommended) | As written |
| 3. Acting holder and seats | Acting takes a seat (as recommended) | As written |
| 4. Holder stops meeting requirements | Flag it for staff (as recommended) | As written |
| 5. Where feedback goes | Queue in the app plus event (as recommended) | As written |
| 5b. Feedback to the upstream project | **Optional opt-in to upstream** (not as recommended) | New setting `governance.feedback.upstream`, off by default; bug reports go upstream with technical context only, the reporter's words only if they tick a box. Story GV-30 |
| 6. Meetings now or later | **Meetings in the first release** (not as recommended) | Meetings with agendas, attendance, minutes and action items move into the first release: four new tables, a meeting life cycle, screens, settings, abilities, stories GV-23 and GV-29 |
| 7. Signers per policy | One signer with the ability (as recommended) | As written |
| 8. NNT's move to Governance | Map posts at NNT's setup (as recommended) | As written; the mapping is confirmed with Matt before NNT switches Governance on |

## 1. How does holding a post give authority?

| Option | What happens |
| --- | --- |
| **A. Facts (recommended)** | Holding a post is the fact `governance.post-holder`; being on a body is `governance.member-of`. A theatre maps abilities to them on the roles screen, pinned to one post or body. Authority starts and ends with the term; nothing is granted or revoked |
| B. A post names a role | Recording a term creates an Identity grant of the post's role, ending with the term. Familiar, but two records (term and grant) must agree, and a correction to one must reach the other |
| C. Both | Facts by default, with an optional role per post for theatres that prefer roles |

Recommendation A. It is the platform's own rule that authority derives from facts, never a standing grant (decision 0009), and it is how NNT's "a live committee role" checks become exact. It depends on Identity resolving pinned fact mappings, which is specified but not built.

## 2. Are holders' names on the public page by default?

| Option | What happens |
| --- | --- |
| **A. Ask each holder (recommended)** | The post's name and address always show; the holder's name shows once they agree. The term-started message asks |
| B. Shown unless the holder declines | Names show from the start; a holder can hide theirs |
| C. A setting, default B | The theatre decides; NNT would choose B, as its committee is a public office it publishes today |

Recommendation A as the platform default, with the setting `governance.committee.listing-default` so NNT can choose "shown". A student committee is a public office, but a youth company's or a small charity's may not be.

## 3. Does an acting holder take a seat?

| Option | What happens |
| --- | --- |
| **A. Yes (recommended)** | Acting cover fills a vacancy; to cover an absence, the absent holder's term is ended or the post gets a second seat |
| B. No | Acting holders sit beside the holder; seats can be exceeded by acting terms |

Recommendation A: seats then always mean what the constitution says, and "cover while someone is away" is rare enough to record by ending a term.

## 4. What happens when a holder stops meeting a post's requirements?

| Option | What happens |
| --- | --- |
| **A. Flag it (recommended)** | The term stands; a health check lists the holder for staff to act on |
| B. End the term automatically | The term ends with reason `other` the day the requirement fails |

Recommendation A. A membership that lapses in a renewal gap should not silently remove a Treasurer's authority mid-week; a constitution usually says how a post is vacated, and that is a human decision.

## 5. Where does feedback go?

| Option | What happens |
| --- | --- |
| **A. A queue in the app and an event (recommended)** | Reports wait in Governance's queue. `governance.feedback.received` can be delivered by webhook to the theatre's own automation, which may open a tracker issue and write the link back |
| B. Also an email digest | As A, plus a daily email to triagers (the notification type exists, off by default per person) |
| C. A built-in GitHub connection | The Worker holds a tracker token and opens issues itself |

Recommendation A, with B available per person. C repeats what NNT's decision 0086 rejected: a tracker token in the Worker and a third party on a show-night tap. Separately: should a fork's reports ever reach the upstream Proscenium project? Recommendation no; a theatre forwards what it chooses.

## 6. Meetings now or later?

| Option | What happens |
| --- | --- |
| **A. Minutes as documents now, meetings later (recommended)** | Minutes are register documents with a meeting date; GV-23 adds agendas, attendance and actions later |
| B. Meetings in the first release | Agendas, attendance, minutes and action items from the start |

Recommendation A. NNT runs meetings on paper and in person (your note of 16 November that proposals are done in meetings); the register gives minutes owners and sign-off at once.

## 7. How many people sign off a policy?

| Option | What happens |
| --- | --- |
| **A. One signer with the ability (recommended)** | Any holder of `governance.document.sign-off` approves; `separateSigner` stops self-approval where a kind asks |
| B. A number of signers per kind | A kind may need two or more sign-offs before a version is current |

Recommendation A for the first release; B can be added to the kind contract later without a data change, since sign-offs are already rows.

## 8. Should NNT's posts confer exactly what NNT's roles do today?

NNT's decision 0113 maps eighteen posts onto seven roles (President, Secretary, Treasurer, Front of House Manager, Theatre Manager, Committee, IT Manager). With Governance, the five post roles become pinned fact mappings, Committee becomes `governance.member-of` on the Committee body, and the IT Manager stays a role because it is a function, not a post.

| Option | What happens |
| --- | --- |
| **A. Map them at NNT's setup (recommended)** | An NNT setup note lists each post's abilities, confirmed with you before NNT switches Governance on |
| B. Keep NNT on roles | NNT records terms for the public page and handover only; authority stays on yearly grants |

Recommendation A, when NNT moves to Governance; the live NNT site is unaffected until you choose to deploy it.
