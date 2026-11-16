# 9. Questions for Matt

All ten are decided: Matt accepted every recommendation on 16 November 2026. Each row keeps its options and the recommendation he accepted, and the specification follows them.

| # | Question | Options | Recommendation | Decision |
| --- | --- | --- | --- | --- |
| 1 | Does review ship in the form builder's first release? | (a) Yes: stages, private scores, conflict lockout and decisions are in the first release. (b) No: the first release is forms and simple stages; review follows | (a). Replacing a proposals module is the reason the form builder is core, and a first release without review cannot run a proposals round. It adds three stories (FB-405 to FB-407) | (a), as recommended. Matt, 16 November 2026 |
| 2 | Does an approved proposal create its production automatically in the first release? | (a) Later: the decision is recorded and someone creates the production by hand. (b) First release: an outcome action creates it | (a). The action needs core's production service to be settled, and creating a production by hand from an approved proposal is a small step. The mechanism (FB-506) is in the first release with membership as its first host, and the action that creates a production is FB-512, later | (a), as recommended. Matt, 16 November 2026 |
| 3 | May people who are not signed in fill in a form? | (a) Yes, where the form's author allows it, protected by Turnstile and rate limits. (b) Never: every form needs an account | (a). Feedback surveys, access requests and enquiries are forms an audience member should not need an account to answer. A theatre can switch it off with one setting | (a), as recommended. Matt, 16 November 2026 |
| 4 | May a form ask special-category questions, such as access needs or health details? | (a) Yes, encrypted, readable only with a separate ability, each view audited, signed-in respondents only by default. (b) Not in the first release | (a). Access requirements and incident reports are among the forms the paper lists, and both need them. Refusing would push that data into email | (a), as recommended. Matt, 16 November 2026 |
| 5 | Who may change a response after it is submitted? | (a) The form's author chooses per placement: never, until the form closes, or only when staff return it. Default: only when returned. (b) Always editable until closing. (c) Never | (a) with that default. Reviewers should not find a proposal changed under them, but a typing error should be fixable by sending it back | (a), default only when returned, as recommended. Matt, 16 November 2026 |
| 6 | How are calculated values written? | (a) Picked: choose a function and the questions it uses. (b) Typed: a formula as in a spreadsheet. (c) Both, picked first and typed later | (c). Picking suits someone who has never built a form, which is the usability test. A typed formula can be added later on the same stored form without changing any existing form | (c), as recommended. Matt, 16 November 2026 |
| 7 | Which built-in records get custom fields first? | (a) Production, person and venue. (b) Those plus performance, space and ticket type. (c) Production only | (a). These three are core records, so custom fields do not wait for another module. The others are added by their own modules through the same slot mechanism | (a), as recommended. Matt, 16 November 2026 |
| 8 | Must a form state how long its answers are kept before it can be published? | (a) Yes, where it asks for personal data; the platform ships no default period. (b) Ship a default (for example 24 months, and 12 for declined applications) that a theatre may change. (c) No requirement | (a). A period nobody chose is a period nobody can defend. The templates each suggest one, so the author accepts or changes a suggestion and is never faced with a blank | (a), as recommended. Matt, 16 November 2026 |
| 9 | Can a reviewer's scores and comments ever reach the applicant? | (a) Never through the platform; only the decision and the message written for them. (b) The theatre may choose to release anonymised comments as feedback. (c) Included in the applicant's download of their own data | (a) for the interface, with a note in the site owner's documentation that a data-protection request may still oblige disclosure and that reviewers should write accordingly. (b) can follow if theatres ask | (a), as recommended. Matt, 16 November 2026 |
| 10 | Should forms be portable between theatres? | (a) Yes: export and import a form as a file, and accept community templates into the upstream repository. (b) Export and import only. (c) Neither | (a), after the first release. It suits an open-source project: one theatre's good proposal form becomes everyone's starting point. Imported forms land as draft versions and pass the same checks | (a), after the first release, as recommended. Matt, 16 November 2026 |

## Decided here without asking

These follow from the paper or from another workstream's ruling, and are listed so Matt can overrule any of them.

| Choice | Decision | Basis |
| --- | --- | --- |
| Can the form builder be switched off? | No. It is always on, as its own layer | The paper calls it part of the core; foundations confirmed `switchable: false` on 16 November 2026 |
| How many languages can one form have? | One, in the first release. The definition leaves room for translations beside the text | The paper makes every platform string translatable; a theatre's own questions are its content, like its pages |
| Can two people edit one form at the same time? | No. The second sees who is editing and may take over | Simple, and safe with autosave; live co-editing is a large feature with little demand |
| Does a submitted response follow later edits to the form? | No. It stays on the version it answered | The paper: "A response always belongs to the version it answered" |
| Can a question's type be changed after publishing? | No. It is retired and replaced | Keeps old answers meaningful |
| Is there a script or code step in logic? | No. Conditions and a fixed list of functions only | Safe to run on the server, and readable as sentences |
| Does payment at the end of a form ship in the first release? | No. It follows the Payments interface from workstream 4 | Nothing in the first templates needs it except the paid joining form, which Membership will own |
| Do custom fields use the same builder? | Yes, with pages, workflow and payment hidden | The paper: "one mechanism to learn, not two" |

## Still open with other workstreams

These are not for Matt unless two workstreams disagree. Tab 4 has the detail.

- Payment from a form (FB-508, later). Payments has designed it: forms owns an intent part and contributes a settlement handler. Box office has yet to list forms as an owner.
- Nothing with foundations: it reserved the address /forms on 16 November 2026.
- The exact call a checkout makes for its questions. Integration settled the name, the subject and the model (box-office.checkout-questions, a ticket type, forms' slot); the call is settled when that later story is specified.

Settled since the first draft: the form builder is always on (workstream 1), vocabularies and files are core services (workstream 3), two short questions may sit side by side at laptop width (workstream 6), and workstream 2 ruled that a fact cannot deny access, so the conflict lockout is a guard inside forms, that grants stop at the form, and that a signed-out response is keyed to its email address.
