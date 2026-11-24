# 5. Screens

Practice mode adds nine screens of its own and changes none of the live screens: it draws a frame around them. Every practice page uses the live layout, so controls stay 48 pixels or more and the screen is dark by default.

## Inventory

| Id | Screen | Address | Who sees it | Type | Release |
| --- | --- | --- | --- | --- | --- |
| PM-S1 | Practice: the scenarios a person can practise, and their active session if any | `/practice` | Holders of `core.practice.use` on at least one scenario (through a Training course), and administrators | List of cards | First |
| PM-S2 | Starting: "Setting up a practice theatre" with progress, then the scenario's screen; or "Practice couldn't start" with a reference | `/practice/<scenario id>` | The same | Interstitial | First |
| PM-S3 | The practice frame around every live page | `/practice/live/…` | The same | Frame | First |
| PM-S4 | The practice panel: tasks, things to run now, the outbox, Start again, Leave practice | Over PM-S3 | The same | Slide-over | First |
| PM-S5 | Not part of this practice: the page exists but the scenario does not include it | Over PM-S3 | The same | Notice | First |
| PM-S6 | Ended: why the session ended (left, idle, end of the night, updated, switched off) and Start again | `/practice/<scenario id>` | The same | Notice | First |
| PM-S7 | The practice card reader: shown when a payment waits, with the outcomes the scenario allows (Approved, Declined, Card removed, No answer) | Over PM-S3 | The same | Sheet | First |
| PM-S8 | One would-be email from the outbox, rendered as the theatre's real email, under the line "Practice: this email was not sent" | Over PM-S4 | The same | Sheet | First |
| PM-S9 | Admin › Practice: switch practice on or off, the idle limit, each scenario's switch, and (later) reporting completion to Training | `/admin/practice` | `core.practice.manage` | Settings page | First |

Practice is reached through Training (Matt, 24 November 2026). The main entry point is Training's lesson section "Try it in practice", which opens `/practice/<scenario id>`. The live home (`/live`) shows a "Practise" button, and a live screen's menu shows "Practise this screen", only to someone who holds `core.practice.use` on at least one scenario, or on that screen's scenario.

## Rules for every practice screen

- **The banner** is Interface's practice banner: "Practice · not real", the scenario's tasks count, and the button that opens the panel. It is part of the frame, not of any page, so no page can leave it out (P1). It cannot be dismissed or scrolled away.
- **The border** is a straight 4-pixel line in the theme's warning colour around the whole viewport, square to the screen edge. It is not a decorative accent bar: it exists so that a glance across a busy box office tells you which device is practising.
- **The title** starts "Practice ·", so a practice tab is recognisable in the tab bar and the app switcher.
- **Sound and haptics** on the door are unchanged: practice should feel like the real thing.
- **Leaving** returns to `/live` (or to the lesson that opened it) and ends the session (S5).

## Wireframe: the door in practice, and the panel

_[Diagram: wireframe · the door in practice, and the practice panel, on a phone]_

Left, the real door screen inside the frame: nothing about the page itself changes. Right, the panel opened from the banner: the scenario's tasks as square tick boxes that tick themselves (T1), the would-be emails, Start again and Leave practice.

## PM-S1, the scenario list

A list of cards, one per scenario the person's courses open to them, grouped under the live screen each opens, with the course that opens it named under the summary ("Opened by Box office volunteer, lesson 3"). Each card: label, summary, minutes, and one button. A card for the scenario with an active session reads "Carry on" with "Started 19:02" and a secondary "Start again"; starting any other card first asks to leave the active one (S2). A scenario that cannot start says why in a line ("Bar is switched off"), with no button. A person with no open scenario sees "Practice opens through a training course" with a link to My training; an administrator sees every scenario, marked "Checking as an administrator".

## PM-S7, the practice card reader

A sheet over the till when `payments.start-payment` answers `'ask-trainee'`. It shows the amount and "The practice card reader is waiting. Choose what the card does." with the scenario's outcomes as large buttons. The till then behaves exactly as it does with the real reader for that outcome, including the timeout path for No answer, so the trainee learns what each failure looks like.
