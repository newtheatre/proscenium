# 9. Questions for Matt

Eight questions, all answered by Matt on 24 November 2026. Seven went as recommended. Question 4 chose the embedded player, so C-64, VL1 to VL5, the setting core.video.player-hosts and the test plan now follow it.

| # | Question | Options | Recommendation |
| --- | --- | --- | --- |
| 1 | May a collection span seasons, or only sit inside one? | (a) Inside one season only. (b) Either: a season-bound collection for a festival strand, or a standing one ("Studio shorts") across seasons | (b). Festivals need (a), and a theatre's themed strands need standing ones; one optional column covers both |
| 2 | How is an exhibition open on several days shown? | (a) One drop-in performance per opening day. (b) One performance spanning every day | (a). Every record keys to a performance and the night runs 04:00 to 04:00, so attendance, rota and incidents stay per day. A run makes the days in one go |
| 3 | What does undoing an import undo? | (a) Delete only what it made. (b) Also put back what it updated | (a). Putting back an update can overwrite a person's later edit; updates are listed for checking instead |
| 4 | Is a performance's video shown as a link or played on the page? | (a) A link card. (b) An embedded player, using YouTube's privacy-enhanced address | (a). An embed sets third-party cookies on play and would need a consent step; a link needs none. (b) could follow as a setting. Answer: Matt chose (b), the embedded player |
| 5 | When may a Microsoft sign-in join an existing account by its email address? | (a) Never: always prove the address by code. (b) When Microsoft says the domain owner verified it (`xms_edov`) and the domain is listed. (c) Always | (b). Microsoft documents that its email claim is not to be trusted; (c) would let anyone with a tenant claim any address. (b) keeps students' one-click sign-in for the university's own domain |
| 6 | Ship the general OpenID Connect provider with Microsoft, or Microsoft alone? | (a) Microsoft alone. (b) Both in ID-47 | (b). The flow is already general (`providers.ts`); the extra is one configured entry and its card, and it covers other universities' providers without more code |
| 7 | Should the door counter refuse at capacity? | (a) Refuse further ins. (b) Warn and keep counting | (b). The people are physically there; refusing the tap only makes the figure wrong. Turning people away is the steward's act, and the counter says Full |
| 8 | How is a T-shirt or meal earned? | (a) By rules on the crew call (shifts worked, minutes on shift, asked for). (b) A list someone keeps by hand | (a), with a handout to anyone recorded and marked "not yet earned" (HO2). It replaces Helfertool and Discord polls with counts nobody has to tally |
