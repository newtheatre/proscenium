# 9. Questions for Matt

Twelve questions, all decided. On 16 November 2026 Matt accepted the recommendation in every case, except where he had already given a different view; none of those touches these twelve. The specification was written to the recommended answers, so it stands as it is.

| # | Question | Options | Recommendation | Decision |
| --- | --- | --- | --- | --- |
| 1 | Does buying as a guest create an account? | **A.** Yes, an unclaimed one that the buyer claims by signing in with the same address later. **B.** No, guest orders hold only an address and are never linked. **C.** No guest checkout; everybody signs in first. | **A.** One person stays one record from their first ticket, with no forced sign-up. B rebuilds the duplicate-people problem. C costs sales. | **A**, accepted 16 Nov 2026 |
| 2 | What opens the members' area? | **A.** Any standing: a role marked as opening it, or a fact a module marks as a standing (a current membership, a place on a production team). **B.** Only a paid or verified membership. **C.** A switch staff set on each account. | **A.** It follows facts the theatre already records, so nobody has to remember to open or close it. B fails a theatre with no membership scheme. | **A**, accepted 16 Nov 2026 |
| 3 | What does somebody without a standing see at a members' address? | **A.** "Page not found", the same as any missing page. **B.** "This is for members" with a way to join. | **A.** It is the only answer that shows an audience member nothing of the members' side. Joining is advertised on public pages the theatre writes. | **A**, accepted 16 Nov 2026 |
| 4 | Are passwords offered? | **A.** Never. **B.** Not in the first release; a sign-in method is a declared point, so one can be added. **C.** Yes, from the start. | **B.** Passkey plus emailed link and code covers everyone with an inbox, and leaves no password store to protect. | **B**, accepted 16 Nov 2026 |
| 5 | Does a Google sign-in count as strong enough for privileged work? | **A.** Never; staff need a passkey. **B.** A setting, off by default, that a theatre turns on for a managed domain whose provider enforces two-step sign-in. **C.** Always. | **B.** NNT can rely on its Workspace; a theatre accepting any Google account cannot. | **B**, accepted 16 Nov 2026 |
| 6 | Which ways back in exist for somebody who has lost their passkey? | **A.** Recovery codes only. **B.** Recovery codes, plus a single-use enrolment link issued by staff, plus an Owner break-glass that works only while a deployment secret is set. **C.** B without the break-glass. | **B.** A volunteer-run theatre will lose every Owner's device at some point. The break-glass is shut by default and shows red on the health page while open. | **B**, accepted 16 Nov 2026 |
| 7 | Is the emailed sign-in a link, a code, or both? | **A.** Link only. **B.** Six-digit code only. **C.** Both in one email; the code works only in the browser that asked. | **C.** The link is quickest on one device; the code covers reading email on a phone while buying on a laptop. | **C**, accepted 16 Nov 2026 |
| 8 | How long can a merge be undone? | **A.** Not at all. **B.** 30 days, a setting. **C.** For ever. | **B.** Wrong merges get noticed within weeks. For ever means keeping the old account's personal data for ever. | **B**, accepted 16 Nov 2026 |
| 9 | Can a person merge their own two accounts? | **A.** Staff only. **B.** Yes, after signing in to both, in a later release. **C.** Yes, in the first release. | **B.** It removes a routine staff job, but staff merge covers the first release. | **B**, accepted 16 Nov 2026 |
| 10 | How does self-requested erasure run? | **A.** Automatically after a cooling-off (7 days by default) unless a module holds it. **B.** Always reviewed by staff first. **C.** Immediately. | **A.** It meets the deadline without relying on a volunteer noticing, and the wait catches mistakes and hijacked accounts. | **A**, accepted 16 Nov 2026 |
| 11 | For a domain the theatre manages, such as NNT's Workspace, may its addresses also sign in by emailed link? | **A.** No: the provider only, and a role can require a managed identity. **B.** Yes, either way. | **A.** It keeps a leaver's access tied to the Workspace account being closed. It is a setting, so only theatres that name a managed domain are affected. | **A**, accepted 16 Nov 2026 |
| 12 | Are these defaults right? | Stay signed in 30 days, or 14 days unused. A fresh proof covers privileged changes for 10 minutes. A link and code last 15 minutes. Unclaimed accounts are anonymised after 3 years untouched, dormant claimed accounts after 2 years, both off until a theatre arms them. | Yes as starting values. All are settings. | **Yes**, accepted 16 Nov 2026 |

## Raised with other workstreams, not for you

| Matter | With | State |
| --- | --- | --- |
| Identity lives inside the `core` module, not a module of its own | Foundations | Agreed |
| Abilities carry assurance, freshness and an owner rule; scope derives from the record type | Foundations | Agreed; being added to the formats |
| Facts can be marked as a standing | Foundations | Agreed |
| Every column that references an account declares its merge rule | Foundations | Agreed |
| Who specifies the audit log | Foundations | Foundations will; identity supplies the actor, session and assurance level |
| Preset role keys every workstream maps abilities to | All, through integration | Proposed in part 6 |
| Who owns the Turnstile secret when box office also needs bot protection | Integration | Settled: core owns one bot-challenge service and its secret; routes opt in by declaration |
