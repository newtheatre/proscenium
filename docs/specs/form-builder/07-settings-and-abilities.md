# 6. Settings and abilities

The module registers 20 settings and 14 abilities. Every limit below is read inside the service that writes, and every default is a proposal for Matt and the workshops to confirm, not a measured figure.

## Settings

Columns follow the foundations format. All are changed by `forms.settings.manage`, none is quotable on a content page, and the audience is staff unless stated.

| Key | Kind | Default | Limits | Audience | Purpose |
| --- | --- | --- | --- | --- | --- |
| `forms.limits.questions-per-form` | integer | 200 | 1 to 500 | staff | Most questions in one form |
| `forms.limits.pages-per-form` | integer | 30 | 1 to 100 | staff | Most pages in one form |
| `forms.limits.definition-size` | integer (kilobytes) | 256 | 32 to 1,024 | staff | Largest definition, kept well under D1's 2 MB row |
| `forms.limits.repeat-entries` | integer | 20 | 1 to 100 | staff | Most entries in one repeating group |
| `forms.limits.condition-depth` | integer | 3 | 1 to 5 | staff | How deeply condition groups nest |
| `forms.limits.review-criteria` | integer | 10 | 1 to 30 | staff | Most scoring criteria on one form |
| `forms.uploads.file-size` | integer (megabytes) | 10 | 1 to 100 | public | Largest single uploaded file |
| `forms.uploads.files-per-response` | integer | 10 | 1 to 50 | public | Most files on one response |
| `forms.uploads.types` | list of choice | PDF, images, common document formats | The platform's list | public | File types a form may accept |
| `forms.drafts.keep-for` | duration | 30d | 1d to 365d | signed-in | How long an untouched draft response is kept |
| `forms.drafts.reminder-before` | duration | 7d | 1d to 30d | staff | How long before deletion the reminder goes |
| `forms.retention.default` | duration | unset | 30d to 3,650d | staff | Retention offered when a form is first published |
| `forms.retention.require-choice` | boolean | true |  | staff | Whether a form holding personal answers must state its retention before publishing |
| `forms.public.allow-anonymous-respondents` | boolean | true |  | staff | Whether a form may be open to people who are not signed in |
| `forms.public.special-without-sign-in` | boolean | false |  | staff | Whether a special-category question may sit on a form open to people not signed in |
| `forms.public.turnstile` | boolean | true |  | staff | Whether forms open to anyone are protected by Turnstile when a key is configured |
| `forms.builder.free-patterns` | boolean | false |  | staff | Whether authors may write their own validation patterns |
| `forms.review.blind-by-default` | boolean | true |  | staff | Whether a new review stage hides reviewers' scores from each other until release |
| `forms.exports.keep-for` | duration | 7d | 1d to 30d | staff | How long a built export stays downloadable |
| `forms.actions.retries` | integer | 5 | 0 to 10 | staff | Attempts before an outcome action is abandoned and flagged |

Notes:

- `forms.retention.default` ships unset, as the paper's rule for a number nobody has agreed. With `require-choice` on, the publisher chooses per form. Matt decided on 16 November 2026 that no default ships.
- Opening and closing dates, caps, one response each and who may answer are not settings. They vary by placement, so they are columns on `forms_placements`, as the foundations settings format directs.
- Rate limits on the public routes are declared per route in the platform's own registry, not here.
- Presets: `student-society` and `amateur-company` take the defaults. `small-venue` sets `forms.review.blind-by-default` to false, since a venue with paid staff seldom runs a panel.

### Rules across settings

| Rule | Check |
| --- | --- |
| `reminder-inside-keep` | `forms.drafts.reminder-before` is shorter than `forms.drafts.keep-for` |
| `special-needs-anonymous-allowed` | `forms.public.special-without-sign-in` may be true only if `forms.public.allow-anonymous-respondents` is true |

## Abilities

The columns are the foundations format. An ability that acts on `forms.form` can be granted on one form or site-wide. One that acts on `forms.response` is granted on the form, which is the response's parent, and never on a single response. "Owner" is the record's owner: the creator of a form, the submitting account of a response. Suggested holders are identity's preset role keys, confirmed by the identity specification on 16 November 2026: the three abilities that change things site-wide go to `administrator`, the read-only `committee-member` role holds none, and a functional role such as `membership-officer` or `production-lead` is granted the per-form abilities on the forms that belong to its subject.

| Ability | Acts on | Risk | Owner | Implies | Purpose | Suggested holders |
| --- | --- | --- | --- | --- | --- | --- |
| `forms.form.create` | Site only | normal | ignored |  | Start a new form, from blank or a template | `administrator` |
| `forms.form.edit` | `forms.form` | normal | grants |  | Edit the draft version, preview, run test mode | The form's creator, as owner |
| `forms.form.publish` | `forms.form` | normal | ignored | `form.edit` | Publish, pause, close and archive; attach to `forms.link` | `administrator` |
| `forms.form.share` | `forms.form` | normal | grants |  | Grant and remove the per-form abilities on a form | The form's creator, as owner |
| `forms.response.read` | `forms.response` | normal | grants |  | See responses and results, except restricted answers. The submitter always sees their own | Granted per form |
| `forms.response.manage` | `forms.response` | normal | refuses | `response.read` | Move responses along transitions marked for managers, message submitters, answer on someone's behalf, withdraw | Granted per form |
| `forms.response.decide` | `forms.response` | normal | refuses | `response.read` | Perform a transition to an approved or declined stage | Granted per form |
| `forms.response.export` | `forms.form` | privileged | ignored | `response.read` | Build and download an export | Granted per form |
| `forms.response.read-special` | `forms.response` | privileged | ignored | `response.read` | See special-category answers, one response at a time. Declares `audit: 'read'`, so each view is recorded | `welfare-lead` only |
| `forms.review.score` | `forms.response` | normal | refuses |  | Be assigned as a reviewer and submit reviews. After release, open the summary of a response they were assigned | Granted per form, or to the holders of a role |
| `forms.review.chair` | `forms.form` | normal | ignored | `response.read` | Assign reviewers, release a round, see the summary | Granted per form |
| `forms.template.manage` | Site only | normal | ignored |  | Save, rename and delete the theatre's own templates; import a form file | `administrator` |
| `forms.action.retry` | Site only | normal | ignored |  | Retry or dismiss an abandoned outcome action | `owner` |
| `forms.settings.manage` | Site only | privileged | ignored |  | Change the settings above | `owner` |

Rules:

- **Attaching a form to a module's slot** needs that slot's own ability, declared by the host, as well as `forms.form.publish`. Forms does not decide who may add questions to a checkout.
- **Custom-field values** are read and written with the host record's abilities, not with `forms.response.*`. A person who may edit a production may edit its custom fields.
- **A restricted question** (one whose class is special, or which the author marks restricted) is hidden from `forms.response.read` and shows as "restricted". Only `read-special` reveals it.
- **Nobody decides, reviews or moves their own response**, and nobody grants themselves an ability on a form. Both are refused at the write.
- **A conflict of interest removes access** to that one response from every ability above, including `read-special` and export. It is a guard in forms' own service, run after the platform's authorisation, because the permission model only ever allows (workstream 2's ruling).
- **Site owners are not exempt.** An override of a lockout is possible only by removing the assignment's conflict, which is itself recorded and shown to the chair.
- **Derived authority.** The submitter may read, revise when returned and withdraw their own response without any ability. A co-author the submitter adds to a draft response may edit that draft response and nothing else, until it is submitted.

**The privileged set is deliberate, and it is three abilities.** A privileged ability asks for a second factor re-asserted in the session. Reading special-category answers and taking personal data out in bulk carry that cost, as does changing the limits; a welfare lead will be asked once per session before opening access needs. Reading and deciding ordinary responses stay normal, so that a committee running a proposals round is not asked for a second factor at every sitting. `owner: 'refuses'` is how nobody moves, decides or reviews their own response; a response keyed to an address has no owner, so forms' service applies the same refusal by matching the address.

## What the submitter can always do

These need no ability and cannot be switched off, because they are the person's rights over their own data.

- See every response they have submitted, with its status, in their account.
- Download their own answers.
- Withdraw a response that has not reached a final stage.
- Ask for erasure through the platform's usual route.
