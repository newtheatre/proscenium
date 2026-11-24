# 9. Questions for Matt

Eight questions, the sixth in two parts, each with options and a recommendation. The rest of this spec assumes every recommendation; answering differently changes only the parts named.

**Answered by Matt on 24 November 2026**, on question cards: 1 (a) require Spaces; 2 (a) drafts hold rooms; 3 (a) the whole schedule; 5 (b) attendance and reports in the first release, attendance off by default, against the recommendation; 6a (a) later, amateur companies only; 6b (a) the under-18 marker in the first release; 8 (a) a later Productions story. Question 4 moved to Availability; question 7 rests with Integration's R3-12. The spec is written to these answers.

## 1. Should Rehearsals need Spaces switched on?

- **(a) Require Spaces.** Every call in a theatre room books it through Spaces in the same save; calls elsewhere are a place in words.
- **(b) Require only Productions.** Rooms are always words; stage managers book rooms separately in Spaces, and the two can disagree.
- **(c) Two modules**, a small "rehearsal rooms" bridge that requires both.

**Recommendation: (a).** The point of splitting Rehearsals from Productions was that rehearsal calls lean on rooms, and at NNT every rehearsal room is approved by the Theatre Manager through Spaces anyway. The cost: Rehearsals ships after Spaces, so in stage 4 of the map's order, not before. Changes: part 4's manifest, rules B1 to B7.

## 2. Does a draft call hold its room?

- **(a) Yes.** Saving a draft makes the room booking (or request), so a term can be planned weeks ahead without losing rooms.
- **(b) Only when published.** Drafts are free to change, but the room may be gone by the time the sheet is issued.

**Recommendation: (a).** Stage managers plan weeks ahead and issue a week at a time; rooms are the scarce thing. Drafts that pass their date are deleted with their bookings (rule B3 and the sweep), so nothing lingers. Changes: rule B1.

## 3. By default, does the cast see the whole rehearsal schedule?

- **(a) The whole published schedule**, who is called to what included.
- **(b) Only their own calls.**

**Recommendation: (a)**, changeable per production. In student and amateur companies the whole company usually sees the schedule, and people swap and help. A production can choose (b). Changes: setting `rehearsals.schedule.team-sees`, rule V2.

## 4. What happens to the reason someone gives for a conflict?

- **(a) Optional, and seen only by the person and the schedule's leads.**
- **(b) No reasons at all**, only dates and times.
- **(c) Visible to the whole team.**

**Moved to Availability.** Stated availability and its reasons now belong to the Availability module (Integration ruling R3-26), so this question is answered in its spec, which recommends that a reason is private to the person by default and that they can share it, entry by entry, with people who can plan for them. Rehearsals shows a reason only where Availability allows. Changes here: none.

## 5. Are attendance and rehearsal reports in the first release?

- **(a) Later.** The first release is calls, conflicts, rooms and messages.
- **(b) First release**, with attendance off by default.

**Recommendation: (a).** The first release already gives a production everything it needs to run rehearsals; reports and attendance are valuable but the paper and email habits they replace work for now. Moving them up adds two stories (RH-41, RH-42) and about six tests. Answered (b): RH-41 and RH-42 are in the first release and tests U-13, U-14 and I-20 to I-23 cover them; RH-43, the figures in Reports, stays later.

## 6a. Should the platform handle licensed child performers?

- **(a) Later, for amateur companies only:** a child flag on a team member, their licensed hours checked per day, and a chaperone called with them (RH-47).
- **(b) Not at all**; companies with children keep their own records.

**Recommendation: (a), as a later story.** NNT casts students, and some members are now 17, mostly international students and students at Nottingham International College. As we understand the English rules (to be checked before this is specified), performance licences, their limits on hours and chaperones apply only to children up to compulsory school age, about 16, so NNT's 17-year-olds do not trigger them. Licensed children stay a later story (RH-47) for amateur companies. Members who are under 18 but past school age are question 6b. Changes: part 7 only.

## 6b. Should a team member under 18 be marked?

- **(a) Yes, in the first release.** An "under 18" marker on a team member, shown in the planner and the team list to the people who run calls, from a recorded date, never inferred.
- **(b) No.** Stage managers keep track themselves.

**Recommendation: (a).** NNT now has members who are 17, so a stage manager planning a late call or a get-out should see at a glance who is under 18 and take care. The marker is a warning (W6), never a refusal, and carries no limit on hours. It follows Integration's ruling R3-25 (assumed until you answer its question 10): Identity holds only the date a person turns 18 (story C-74), set by the member on joining or by a membership officer after seeing ID, and deleted once it passes; Rehearsals asks core's ageStatus(person, date) and never reads the date. The marker shows only to people who run calls and never in exports, and there is no parental contact. An optional warning when an under-18's call ends late (W7) reads core's key core.under-18.latest-finish, which ships unset and which Productions reads too. Changes: rules W6 and W7, story RH-50, test U-11, part 4's open point 4.

## 7. One personal calendar feed, or one per module?

- **(a) One feed** owned by core: each module contributes a person's items to it (shifts, rehearsal calls, training sessions), and a person subscribes once.
- **(b) One per module**, as Front of house already does for shifts.

**Recommendation: (a), decided in the Integration pass.** People will not subscribe to three feeds. `Integration has taken this up as ruling R3-12 (core.calendar-feed, story C-70), pending your answer, and this spec is already written that way: no feed table here. Choosing (b) brings back a rehearsals_feeds table and two routes. Changes: part 2`, RH-33 and RH-49.

## 8. Where do auditions and casting live?

- **(a) A later Productions story**, using the form builder's sign-up slots for audition times and Productions' team for the cast list.
- **(b) In Rehearsals**, as an audition call kind with sign-ups.

**Recommendation: (a).** Casting decides who is on the team, which is Productions'; Rehearsals starts once there is a team to call. An audition can still be held in a room through Spaces' Audition purpose today. Changes: none here; it is a note for Productions.
