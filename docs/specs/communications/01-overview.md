# Communications: specification

Nov 16, 2026 · @Matthew Adcock

Communications is the switchable module `communications`: mailing lists people choose to join, a record of the consent behind every subscription, and messages written in the console. It sends nothing itself. Every message goes through core's notification pipeline, so core's suppression list, retries, sender identities and delivery log apply to it exactly as they do to a receipt.

**The first release sends notices, not newsletters.** Cloudflare's email service allows transactional email only, and Matt decided on 16 November 2026 to stay on Cloudflare alone. So the first release ships lists, consent wordings, sign-up with confirmation, unsubscribing, the lists in My account, notices to people chosen by what they hold, and an export of subscribers with their consent evidence for the theatre's own newsletter tool. Writing and sending a mailing is specified here in full and built in a later release, when a sender that permits it exists. Wherever a rule, screen, setting or story belongs only to a mailing, the text says "later".

Second-round specification, 16 November 2026, with all eleven of its questions decided. Written in the Foundations formats. The nine parts are the tabs on the left. Part 3 has state diagrams and a picture of the sending flow, part 4 opens with the module and its neighbours, and part 5 has wireframes W1 to W6.

## The design in eight lines

1. **A list is something a person joins; a topic is core's master switch.** The module declares two topics, one for each side. A theatre makes as many lists as it likes under them. Switching the topic off in core's preferences stops every mailing on that side.
2. **Consent is evidence, kept apart from state.** A subscription row says whether someone is on a list now. An append-only consent record says what they were shown, when, where and by whom, for every change.
3. **Two kinds of message.** A *notice* goes to people chosen by what they hold (tickets for Friday, a place on a production's team), needs no subscription, cannot be muted, and may not promote anything. A *mailing* goes to a list and needs a subscription; it is the later release.
4. **Audiences come through one point.** Communications declares the sources that read core and identity (a production's team, role holders, ability holders, members). Box office, and later Membership and Front of house, contribute their own, such as "ticket holders for a performance". Communications never reads their tables.
5. **A send is a snapshot.** Recipients are fixed when sending starts and handed to core in tranches, each as one set. A notice goes at once on the prompt lane. A mailing, later, goes on the bulk lane under a throttle and can be paused or cancelled part-way.
6. **Leaving takes one button and no sign-in**, from the manage link, which the confirmation message and the export both carry. A mailing, later, also carries the mail client's own unsubscribe button (RFC 8058).
7. **No tracking pixels, in any release.** Results count what core already knows: sent, bounced, failed.
8. **One account, two sides.** An audience list and a members' list are separate things with separate addresses, so a member never receives audience marketing because they are a member, and the reverse.

## Size

| Measure | Count |
| --- | --- |
| Tables | 9 |
| Settings | 14 |
| Abilities | 15 |
| Points offered | 2 |
| Audience sources this module declares | 6 |
| Stories | 38 (21 first release, of which 6 gate; 17 later) |
| Questions for Matt | 11, all decided |
| Requests to other workstreams | 9, all ruled |
