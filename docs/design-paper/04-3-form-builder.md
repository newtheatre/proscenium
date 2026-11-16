# Form builder

A full form builder with a strong engine is part of the core, so that any module can ask a theatre's own questions without new code. It takes inspiration from Matt's [form-builder](https://github.com/MattA-Official/form-builder) project and is designed fresh, with usability as the first requirement.

## Why it is core

A form engine turns many would-be features into configuration. That is the main reason Programming and production management can stay low priority: a proposals round becomes a form with a review step, not a module.

| Use | Without a form builder | With one |
| --- | --- | --- |
| Show proposals | A whole module | A form template with a review workflow |
| Audition sign-up | Custom screens | A form attached to a production |
| Membership application | Fixed fields | The theatre's own joining form |
| Questions at checkout | Hard-coded options | A form attached to a ticket type |
| Room booking extras | Fixed fields | A form attached to a space |
| Incident and near-miss reports | One fixed layout | The theatre's own report form |
| Expense claims, feedback, surveys | Separate tools | Forms |

## What a form can contain

- **Fields:** short and long text, number, money, date and time, single and multiple choice, yes or no, phone, email, address, file upload, signature, rating.
- **Pickers that read the platform:** a person, a production, a performance, a space, an inventory item.
- **Structure:** sections, pages, repeating groups, two fields side by side, explanatory text and images.
- **Logic:** show or hide, require, skip to a section, end early, all from conditions on earlier answers or on who is answering.
- **Calculated values:** totals, counts and dates worked out from answers.
- **Validation:** length, range, date bounds, patterns, with the theatre's own error messages.
- **Payment:** a form can end in a charge through the Payments module.

## What the engine guarantees

- **One definition, checked in both places.** The same rules run in the browser and on the server, as in the reference project.
- **Versions.** Editing a live form creates a new version. A response always belongs to the version it answered.
- **Every field has a data class**, so erasure and retention work on form answers exactly as on built-in data.
- **Answers can map to real fields.** A joining form's phone number updates the person's record, not a blob.
- **Drafts and resuming**, including on a poor connection.
- **Permissions:** who may fill it in (anyone, signed-in audience, members, a named group), who may read responses, who may edit the form.
- **Windows and limits:** opening and closing dates, one response per person, a cap on responses.

## Workflows on responses

- Stages such as submitted, in review, approved, declined, each with who may move it.
- Review with private scores and comments, declared conflicts of interest and automatic lockout.
- Notifications at each stage through the notification centre.
- Results as a table, with filters, export and simple charts.

## Usability requirements

The reference project works but is not very usable, so these are requirements, not hopes.

- A live preview beside the editor, on phone and desktop widths.
- Logic written and read as plain sentences ("Show this when Role is Director"), never as a rule table.
- Templates for the common forms listed above, shipped with the platform.
- Undo, duplicate, drag to reorder, and a test mode whose responses are discarded.
- A warning before any edit that would orphan existing answers.
- Tested with someone who has never built a form before each release.

## Custom fields

Custom fields on built-in records (a production, a person, a booking) are the same engine: a small form attached to the record type. There is one mechanism to learn, not two.
