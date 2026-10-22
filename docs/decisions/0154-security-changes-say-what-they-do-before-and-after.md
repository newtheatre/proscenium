# 0154: Security changes say what they do, before and after

- Status: Proposed
- Date: 2026-10-21
- Amends: A-108 (a password change leaves other sessions alone), A-110, A-105, H-104 criterion 7

## Context

Driven on 21 Oct 2026 the account settings did several things a person could not see coming or
tell had happened:

- **Show a new set of recovery codes** acted on one click and killed the printed set.
- Changing the password from Security left every other session signed in, while a reset ended
  them. Somebody changing it because they suspect misuse expects the opposite.
- Every passkey was "Unnamed passkey", so two devices could not be told apart when removing one.
- A phone number shown to tonight's team accepted "not a phone".
- An email setting switch saved with no sign that it had.

## Decision

- Making a new set of recovery codes is **asked first**, naming how many saved codes stop working.
- The password field carries **Sign out my other devices**, ticked by default. Ticked, the change
  bumps the session epoch in the same write and re-seals the session that made it, so only the
  others end. `PUT /api/account/password` takes `signOutOthers`, which defaults to false for any
  other caller.
- Adding a passkey **asks for a name at once**, offering a guess from the browser ("Chrome on
  Android") to keep or change; **Rename** is offered on every passkey. `PATCH
  /api/account/methods/{id}` sets the label on the caller's own passkey, 1 to 60 characters, and
  audits `account.method.renamed` with no free text (0011).
- A phone number, the member's own or an emergency contact's, must be one: digits with the usual
  spaces, brackets, dashes and leading +, 7 to 15 digits.
- An email setting shows a quiet **Saved** tick beside its switch for a moment. Still no toast, as
  H-104 criterion 7 wants.

## Consequences

- A phone number saved before this that is not one must be corrected the next time the profile is
  saved; nothing rewrites it.
- The role grant warning now sends people to "Security", the page's real name.
