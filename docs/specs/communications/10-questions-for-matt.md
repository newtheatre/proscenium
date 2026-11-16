# 9. Questions for Matt

**All eleven questions are decided.** On 16 November 2026 Matt chose option B for question 11 and accepted the recommendation on each of the other ten. Nothing here waits on him. The table gives each decision; the sections below keep the reasoning, and in sections 1 to 10 the recommendation printed in bold is the decision.

| No. | Decided | Effect after question 11 |
| --- | --- | --- |
| 1 | Two kinds, mailings and notices, in this module | Notices are built first; mailings are a later release |
| 2 | The existing-customer basis is supported and off by default | Later, with mailings (COM-30). The wording about the law is still to be checked before the documentation makes any claim |
| 3 | No open tracking in any release; aggregate click counts later if wanted | Later (COM-38) |
| 4 | Double opt-in on by default for an address not already proved, with a setting | First release |
| 5 | Approval by a second person is a setting, off by default | Later, with mailings (COM-31) |
| 6 | Email for the first release; text messages later as a core channel | First release is email only |
| 7 | Staff may import a list on a recorded statement, with reconfirmation offered | Later (COM-25), as before |
| 8 | Consent evidence is kept 6 years after a subscription ends, as a setting from 1 to 10 years | First release |
| 9 | The proofs may be run before the build is scheduled | Two run now with core: a tranche of notifications in one batch, and bounce and complaint events (P-COM-3). The 10,000-recipient proof waits for mailings |
| 10 | A public archive of mailings is later, per list, off by default | Later (COM-37) |
| 11 | No mailings in the first release; the platform stays on Cloudflare alone | See the end of this page and part 7 |

## 1. Mailings and notices

The catalogue gives Communications "audiences drawn from other modules: ticket holders for a performance, a production's team". Those are two different acts. Telling Friday's audience that the car park is shut is something they need whatever they think of marketing. Telling them about next season is marketing.

**Recommendation: keep both in this module, as separate kinds.** A notice cannot be muted, so it has its own ability, must state a reason, may only go to a source marked for it, and cannot carry promotional blocks. Box office still sends the automatic message when a performance is cancelled or moved; a notice is what staff choose to add by hand.

The risk is that a notice is used to get round an unsubscribe. The guards are the separate ability, the tick-box statement, the audit entry with the count, and the missing blocks. They make misuse deliberate and visible, not impossible.

## 2. Writing to ticket buyers who did not tick a box

UK rules allow marketing by email to existing customers about similar things, if they were given a clear chance to opt out when their details were taken and in every message since. Many venues rely on it. Others, and most volunteer societies, prefer a plain tick box.

**Recommendation: build it, leave it off.** With `communications.consent.existing-customer` off, every audience list needs a tick. A theatre that turns it on gets an automatic list fed by box office's "booked in the last N months", an opt-out line at checkout, and the opt-out in every mailing. The system records the basis and the evidence; whether to rely on it is the theatre's decision, and the documentation should say so plainly. I have not taken legal advice, and this should be checked before the documentation makes any claim about what is lawful.

## 3. Tracking

Open tracking works by a hidden image unique to each person. Apple's Mail Privacy Protection, which preloads images, has made the numbers unreliable, and it is the kind of quiet surveillance a community theatre should not do by default. Click tracking rewrites every link through the theatre's domain.

**Recommendation: no open tracking, in any release. No click tracking in the first release.** Later, offer aggregate click counts per link with no record of who clicked (COM-38). The first release reports what core already knows: sent, bounced, complained, failed, unsubscribed.

## 4. Double opt-in

Without it, anyone can sign up someone else's address, and a typing mistake puts a stranger on the list. With it, some people never click the link.

**Recommendation: on by default for any address not already proved**, off for a signed-in person and at checkout, where the address is used for the tickets anyway. A theatre can turn it off globally or per list.

## 5. Approval before sending

**Recommendation: a setting, off by default**, on in the presets for a small professional venue. A volunteer society with one publicity officer has nobody to approve. COM-31 is a later story.

## 6. Channels

**Recommendation: email for the audience side; email and the in-app inbox for members.** Text messages need a paid provider and their own consent rules. Because every message is a core notification, adding a channel later is a core story and changes nothing here.

## 7. Importing an existing list

NNT and every theatre that adopts the platform already has a mailing list somewhere. Refusing to import it means the module is not used.

**Recommendation: allow it, with a recorded statement** of how and when those people agreed, written into every consent record the import makes, and an option to ask everyone to confirm. The ability is privileged and asks for a fresh sign-in. An import never re-subscribes someone who has left.

## 8. How long to keep consent evidence

**Recommendation: 6 years after the subscription ends**, the usual UK limitation period for a civil claim, as a setting from 1 to 10 years. While someone is subscribed the evidence is always kept.

## 9. Proofs before build

Three things were assumed when this specification was first written: that a tranche of 50 recipients fits one D1 batch, that a 10,000-recipient mailing does not delay a ticket email, and that Cloudflare's email sending reports a bounce and a complaint. Part 8 lists them as P-COM-1 to P-COM-3.

**Decided: the proofs may be run before the build is scheduled**, shared with core. The bounce half of P-COM-3 has passed (part 8 and the end of part 3). P-COM-1 and the complaint half of P-COM-3 are still to run. P-COM-2 waits for the release that adds mailings, and with it the defaults for the per-minute rate and the daily limit.

## 10. A public archive of mailings

**Recommendation: later.** A mailing's body is classed internal because a list may be told things not meant for everyone. A per-list switch to publish sent mailings is COM-37.

## Not questions, but worth knowing

- **Where this lands.** Communications is a second-round module. Notices are the part nearest to box office and could be built straight after it; lists, consent and the export can follow whenever wanted, and mailings come in a later release.
- **What it leaves to the theatre.** The wording of each consent sentence, the choice of basis, and what counts as "not promotional" in a notice. The module records each choice and makes none.
- **One naming point, settled.** Integration ruled on 16 November 2026 that a group of recipients handed over together is a "tranche", because "batch" means only the D1 batch that commits a unit of work. The specification uses "tranche" throughout.

## 11. Cloudflare does not allow marketing email. How are mailings sent?

Found on 16 November 2026, after the first ten questions were written. Cloudflare's FAQ for its email service says: "Can I use Email Service for marketing emails? No. Email Service supports transactional email only." A mailing in this specification (a newsletter or a season announcement to a list) is marketing email, even though every recipient opted in. A notice, a confirmation message and a test send are transactional and are unaffected.

This touches the project's rule that everything runs on Cloudflare, so it was Matt's to decide. The three options put to him:

| Option | What happens | Cost |
| --- | --- | --- |
| A. A second sender for mailings | Core's notification pipeline gains a transport setting for non-transactional mail. A theatre that wants mailings adds one outside provider that permits marketing; everything else, including every ticket email, stays on Cloudflare. Without it, mailings cannot be scheduled and the screens say why | One exception to "Cloudflare only", confined to one adapter in core. Bounce and complaint feedback for mailings then comes from that provider |
| B. No mailings in the first release | The module ships lists, consent, sign-up, unsubscribe and notices. Subscribers are exported, with their consent evidence, to whatever newsletter tool the theatre uses | The theatre keeps two tools, and an unsubscribe made in the outside tool does not come back unless someone imports it |
| C. Keep the design and ask Cloudflare | The specification stays as written and mailings are marked blocked until Cloudflare says whether opted-in newsletters are acceptable | Unknown wait. The product is in beta and the answer today is a plain no |

**Decided by Matt on 16 November 2026: B, no mailings in the first release.** The platform stays on Cloudflare alone and gains no second sender. Part 7 lists the stories of each release, part 5 says which screens wait, and the export (COM-26) is in the first release with consent evidence and each person's manage link. Mailings return when a later release adds a sender that permits them or Cloudflare changes its rule.
