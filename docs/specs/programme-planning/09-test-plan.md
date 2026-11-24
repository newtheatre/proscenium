# 8. Test plan

One proof, then 12 unit, 24 integration and 6 end-to-end cases, filed under the tier that runs them (Foundations' CI and test harness). Every case is named so it can be cited, and none may regress. Suites run on CI only, as the repository's rules say.

## The publish proof

Run once on a real D1 database before PP-06 is called done, because the publish is the one place this module writes many core rows at once.

| Run | Set-up | Must show |
| --- | --- | --- |
| PP-P1 | 140 draft placements over 10 spaces and 4 days, none clashing | One publish schedules all 140 in one batch, under the set-rows limit, and the time is recorded |
| PP-P2 | The same with one pair of drafts overlapping in one exclusive space | The whole publish is refused, the refusal names that pair, and no row changed |
| PP-P3 | Two publishes of the same plan sent at once | One succeeds; the other is refused as stale; nothing is scheduled twice |
| PP-P4 | A room booking made in a space while a publish over it runs | Either the booking is bumped by the publish, or the booking is refused; never both standing |

## Unit

| Id | Case |
| --- | --- |
| U-01 | Warning keys are the kind plus sorted ids, so the same facts give the same key whatever the order of reading |
| U-02 | Changeover uses the larger of the space's changeover and get-out plus get-in, and never less than core's turnaround |
| U-03 | Entry windows: no can window means the entry can play at any time except a cannot; any can window means it cannot play outside them; get-in and get-out widen the window |
| U-04 | In two places treats touching windows (one ends 14:00, the next starts 14:00) as no clash, and any overlap as a clash |
| U-05 | Hard against soft: W1, W2 blocking, W3 and non-yielding W5 are hard; all others are not |
| U-06 | An offered slot's pattern expands to the right instants across a clock change, in the theatre's time zone, by operating day (04:00 to 04:00) |
| U-07 | Drop-in placements occupy the space for their whole opening hours |
| U-08 | A notice fingerprint changes when space, start or end change, and not when the title does |
| U-09 | Gathering: the send time is the later of the last change plus the gather period |
| U-10 | Recipients: entry contacts with `told` plus contributed accounts, de-duplicated; a person on three entries gets one message |
| U-11 | The tray order: accepted before candidate, then fewest placements against wanted, then title |
| U-12 | Day view windows over 14 days, or 30 spaces, are refused before any read |

## Integration

| Id | Case | Rules |
| --- | --- | --- |
| I-01 | Starting a plan twice for one season gives one plan | E1 |
| I-02 | Submitting a call response creates its entry in the same unit; a failing bound answer fails the whole submission | C4 |
| I-03 | A resubmission updates a candidate and leaves an accepted entry alone | C5 |
| I-04 | Accept through the form's transition makes one production, links it, converts option-1 pencils, announces `entry.accepted` with rights status; running the action twice changes nothing | E3, E4 |
| I-05 | Accept on an entry already decided is refused with `programme-planning.not-candidate` | E3 |
| I-06 | Declining in review deletes pencils and the entry leaves the tray | E5 |
| I-07 | Withdrawing an accepted entry with a scheduled placement is refused with `programme-planning.scheduled` | E7 |
| I-08 | Core cancelling the production withdraws the entry and keeps its placements | E8 |
| I-09 | Placing an accepted entry makes a core draft performance and a placement row in one unit | P3 |
| I-10 | A board write against a stale version is refused and writes nothing | P8 |
| I-11 | Dropping on a full offered slot is refused with `programme-planning.slot-full`, decided on the statement, not a prior read | P4 |
| I-12 | Line-up placement adds a core line-up item and a placement row; removing it removes both | P5 |
| I-13 | Moving a scheduled placement shows core's change impact and, after confirming, marks the entry for a changed notice | P6, N3 |
| I-14 | Pencils appear in `core.space-busy` as yielding and never refuse a room booking | P2 |
| I-15 | Publish schedules every draft placement or none, and quotes each refusal | U4 |
| I-16 | Publish with a different version or count than reviewed is refused quoting both | U3 |
| I-17 | Two drafts that clash only with each other are refused at publish | U5 |
| I-18 | Publish with "also publish productions" publishes only drafts placed in the plan | U4 |
| I-19 | The notice job sends once per person and records a notice row and fingerprints; running it twice sends nothing twice | N1, N2, N6 |
| I-20 | Manual sending: nothing is sent until Tell acts | N5 |
| I-21 | A person reading the board without `entry.view` sees entries' titles and no people, and other modules' items as "Busy" where the contributor says so | O2, W7 |
| I-22 | Erasing an applicant withdraws a candidate entry, anonymises an accepted one, deletes their entry-people rows, and keeps planning facts | Part 2 |
| I-23 | Merging two accounts on one entry leaves one entry-people row | Part 2 |
| I-24 | The retention task deletes only declined and withdrawn entries older than the setting, with their dependants | PP-24 |

## End to end

| Id | Journey |
| --- | --- |
| E-01 | A programmer starts a plan, adds three entries by hand, drags them onto the board, sees a clash, moves one, publishes; the performances are scheduled and listed on the What's on page |
| E-02 | A proposer answers a call; a reviewer accepts in review; the entry is in the tray with its entry windows; placing it outside its entry windows warns |
| E-03 | A festival day with a showcase: two acts dropped into a line-up, published, each act's contact receives one notice naming the showcase |
| E-04 | After publish, a programmer moves a performance twice within ten minutes; the act gets one changed notice |
| E-05 | Every board action done with the keyboard alone, and the board passes the accessibility checks Interface sets |
| E-06 | A second programmer moves a block while the first has the board open; the first's next move is refused and their board shows the change |
