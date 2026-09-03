import type { AuditActionName } from './audit-actions'

// Which route is answerable for which entry. `check:audit` reads this, so a privileged mutation
// arriving without an audit write is a failed build rather than a missed review (J-101 criterion 5).

export interface Covered {
  route: string
  actions: AuditActionName[]
  // Files the route delegates its write to, because the entry is built there rather than here.
  via?: string[]
  exempt?: never
}

export interface Exempt {
  route: string
  actions?: never
  via?: never
  // Why this route records nothing. A reason, not a permission: it is read at review time.
  exempt: string
}

export type Coverage = Covered | Exempt

export const AUDIT_COVERAGE: Coverage[] = [
  { route: 'server/api/account/close.post.ts', actions: ['account.erased'], via: ['server/utils/erasure.ts'] },
  { route: 'server/api/account/export.get.ts', actions: ['account.exported'] },
  { route: 'server/api/account/mfa/confirm.post.ts', actions: ['mfa.confirmed', 'mfa.recovery-codes.minted'] },
  {
    route: 'server/api/account/mfa/enrol.post.ts',
    exempt: 'an unconfirmed enrolment is not a second factor; confirming it is what is recorded',
  },
  { route: 'server/api/account/mfa/index.delete.ts', actions: ['mfa.removed'] },
  { route: 'server/api/account/mfa/recovery-codes.post.ts', actions: ['mfa.recovery-codes.minted'] },
  {
    route: 'server/api/admin/accounts/[id]/security.post.ts',
    actions: ['account.disabled', 'account.enabled', 'session.revoked', 'mfa.reset', 'account.erased.admin'],
    via: ['server/utils/erasure.ts'],
  },
  {
    route: 'server/api/admin/accounts/index.post.ts',
    actions: ['account.created.console', 'role.granted'],
    via: ['server/utils/accounts.ts'],
  },
  { route: 'server/api/admin/audit/export.get.ts', actions: ['audit.exported'] },
  {
    route: 'server/api/admin/audit/index.post.ts',
    actions: ['manual.role.granted', 'manual.role.revoked', 'manual.account.disabled', 'manual.account.enabled'],
    via: ['shared/utils/audit-actions.ts'],
  },
  { route: 'server/api/admin/memberships/[id]/confirm.post.ts', actions: ['membership.confirmed'] },
  { route: 'server/api/admin/memberships/export.get.ts', actions: ['membership.exported'] },
  {
    route: 'server/api/admin/memberships/index.post.ts',
    actions: ['membership.granted', 'account.student-id.recorded'],
    via: ['server/utils/membership.ts'],
  },
  { route: 'server/api/admin/fellowships/[id]/revoke.post.ts', actions: ['fellowship.revoked'] },
  { route: 'server/api/admin/fellowships/index.post.ts', actions: ['fellowship.awarded'] },
  { route: 'server/api/admin/config/[key].put.ts', actions: ['config.changed'] },
  { route: 'server/api/admin/roles/index.delete.ts', actions: ['role.revoked'] },
  { route: 'server/api/admin/roles/index.post.ts', actions: ['role.granted'] },
  { route: 'server/api/auth/magic-link/consume.post.ts', actions: ['session.started.magic-link', 'mfa.challenged'] },
  {
    route: 'server/api/auth/magic-link/request.post.ts',
    exempt: 'issues a token and asks for a message; the send is recorded in notification_log',
  },
  {
    route: 'server/api/auth/mfa/challenge.post.ts',
    actions: ['session.started.totp', 'session.started.recovery-code', 'mfa.challenged'],
  },
  {
    route: 'server/api/auth/password/forgot.post.ts',
    exempt: 'issues a token and asks for a message; the send is recorded in notification_log',
  },
  { route: 'server/api/auth/password/reset.post.ts', actions: ['password.set', 'password.reset'] },
  { route: 'server/api/auth/register.post.ts', actions: ['account.registered'], via: ['server/utils/accounts.ts'] },
  { route: 'server/api/auth/sign-in.post.ts', actions: ['session.started', 'mfa.challenged'] },
  { route: 'server/api/account/methods/[id].delete.ts', actions: ['account.method.removed'] },
  { route: 'server/api/account/password.put.ts', actions: ['account.method.added', 'password.set'] },
  { route: 'server/api/account/email.put.ts', actions: ['account.email.changed', 'account.email.changed.admin'], via: ['server/utils/email-change.ts'] },
  { route: 'server/api/account/profile.put.ts', actions: ['account.profile.updated'], via: ['server/utils/profile.ts'] },
  { route: 'server/api/account/profile.get.ts', exempt: 'reads your own profile' },
  { route: 'server/api/account/methods/index.get.ts', exempt: 'reads what the account signs in with' },
  { route: 'server/api/auth/passkey/register.post.ts', actions: ['account.method.added'] },
  { route: 'server/api/auth/passkey/authenticate.post.ts', actions: ['session.started.passkey'] },
  { route: 'server/api/rooms/availability.get.ts', exempt: 'reads what is already taken' },
  { route: 'server/api/rooms/policy.get.ts', exempt: 'reads the published booking rules' },
  { route: 'server/api/rooms/bookings/index.get.ts', exempt: 'reads the bookings you hold' },
  { route: 'server/api/rooms/bookings/[id]/cancel.post.ts', actions: ['room.booking.cancelled'] },
  { route: 'server/api/rooms/bookings/[id]/ics.get.ts', exempt: 'downloads a booking you already hold' },
  { route: 'server/api/account/room-feed.get.ts', exempt: 'says whether your own feed exists' },
  { route: 'server/api/account/room-feed.post.ts', actions: ['account.calendar-feed.issued'] },
  {
    route: 'server/routes/rooms/feed/[token]/calendar.ics.get.ts',
    exempt: 'reads your own bookings; a fetch is recorded on the token, not in the trail',
  },
  { route: 'server/api/rooms/requests.post.ts', actions: ['room.requested'] },
  { route: 'server/api/rooms/series.post.ts', actions: ['room.series.booked', 'room.series.requested'] },
  { route: 'server/api/rooms/bookings.post.ts', actions: ['room.booked'] },
  { route: 'server/api/admin/rooms/index.get.ts', exempt: 'reads the bookable estate' },
  { route: 'server/api/admin/rooms/queue.get.ts', exempt: 'reads what is waiting on a decision, ours and not' },
  { route: 'server/api/admin/rooms/requests/[id]/unlist.post.ts', actions: ['room.request.unlisted'] },
  { route: 'server/api/admin/rooms/external-requests/[id]/relist.post.ts', actions: ['external.request.relisted'] },
  {
    route: 'server/api/admin/rooms/requests/decide.post.ts',
    actions: ['room.request.approved', 'room.request.rejected'],
  },
  { route: 'server/api/admin/rooms/index.post.ts', actions: ['room.created'] },
  { route: 'server/api/admin/rooms/[id]/index.put.ts', actions: ['room.updated', 'room.hours.set'] },
  { route: 'server/api/admin/rooms/[id]/index.delete.ts', actions: ['room.updated'] },
  { route: 'server/api/admin/rooms/blackouts/index.get.ts', exempt: 'reads which rooms are shut' },
  { route: 'server/api/admin/rooms/blackouts/index.post.ts', actions: ['room.blackout.created'] },
  { route: 'server/api/admin/rooms/blackouts/[id].delete.ts', actions: ['room.blackout.removed'] },
  { route: 'server/api/admin/rooms/bookings/[id]/bump.post.ts', actions: ['room.booking.bumped'] },
  { route: 'server/api/admin/rooms/bookings/[id]/alternatives.get.ts', exempt: 'reads where a booking could go instead' },
  { route: 'server/api/admin/rooms/bookings/[id]/no-show.post.ts', actions: ['room.no-show.recorded'] },
  { route: 'server/api/admin/rooms/no-shows/[id]/withdraw.post.ts', actions: ['room.no-show.withdrawn'] },
  { route: 'server/api/rooms/standing.get.ts', exempt: 'reads your own record' },
  { route: 'server/api/rooms/external-spaces.get.ts', exempt: 'searches the rooms the SU manages' },
  { route: 'server/api/rooms/external-requests.get.ts', exempt: 'reads the unlisted rooms you asked for' },
  { route: 'server/api/rooms/external-requests.post.ts', actions: ['external.requested'] },
  { route: 'server/api/rooms/external-requests/[id]/cancel.post.ts', actions: ['external.request.cancelled'] },
  { route: 'server/api/admin/rooms/external-requests/[id]/submit.post.ts', actions: ['external.request.submitted'] },
  { route: 'server/api/admin/rooms/external-requests/[id]/assign.post.ts', actions: ['external.request.assigned'] },
  {
    route: 'server/api/admin/rooms/external-requests/[id]/refuse-assignment.post.ts',
    actions: ['external.request.assignment.refused'],
  },
  { route: 'server/api/admin/rooms/external-requests/[id]/reject.post.ts', actions: ['external.request.rejected'] },
  { route: 'server/api/admin/rooms/external-spaces/index.get.ts', exempt: 'reads the SU catalogue' },
  { route: 'server/api/admin/rooms/external-spaces/index.post.ts', actions: ['external.space.created'] },
  { route: 'server/api/admin/rooms/external-spaces/[id]/index.put.ts', actions: ['external.space.updated'] },
  { route: 'server/api/admin/rooms/external-spaces/[id]/notes/index.put.ts', actions: ['external.space.note.set'] },
  { route: 'server/api/admin/rooms/external-spaces/[id]/notes/[purpose].delete.ts', actions: ['external.space.note.removed'] },
  { route: 'server/api/admin/rooms/reports/utilisation.get.ts', exempt: 'reads booked hours against open hours' },
  { route: 'server/api/admin/rooms/reports/export.get.ts', exempt: 'the same figures as a file; no personal column is in it' },
  { route: 'server/api/auth/sign-out.post.ts', exempt: 'ending your own session changes no record' },

  { route: 'server/api/admin/training/departments/index.get.ts', exempt: 'reads the department vocabulary' },
  { route: 'server/api/admin/training/departments/index.post.ts', actions: ['department.created'] },
  { route: 'server/api/admin/training/departments/[code]/index.put.ts', actions: ['department.updated'] },
  { route: 'server/api/admin/training/departments/[code]/leads.post.ts', actions: ['department.lead.assigned'] },
  { route: 'server/api/admin/training/leads/[id].delete.ts', actions: ['department.lead.removed'] },
  { route: 'server/api/admin/training/modules/index.get.ts', exempt: 'reads the training catalogue' },
  { route: 'server/api/admin/training/modules/index.post.ts', actions: ['module.created'] },
  { route: 'server/api/admin/training/modules/[id]/index.put.ts', actions: ['module.updated'] },
  { route: 'server/api/admin/training/records/index.get.ts', exempt: 'reads one person\'s training history' },
  { route: 'server/api/training/records.get.ts', exempt: 'reads your own training records' },
  { route: 'server/api/training/modules.get.ts', exempt: 'reads the member-facing catalogue' },
  { route: 'server/api/training/next.get.ts', exempt: 'reads what you could take next, all from your own records' },
  { route: 'server/api/training/requests/index.get.ts', exempt: 'reads what you asked for' },
  { route: 'server/api/training/requests/index.post.ts', exempt: 'a demand signal about yourself, carrying no authority' },
  { route: 'server/api/training/requests/[id].delete.ts', exempt: 'withdraws your own ask' },
  { route: 'server/api/admin/training/requests/index.get.ts', exempt: 'reads the demand board' },
  { route: 'server/api/admin/training/requests/[id]/decline.post.ts', actions: ['request.declined'] },
  { route: 'server/api/admin/training/sessions/[id]/register.get.ts', exempt: 'reads the register a trainer is about to mark' },
  { route: 'server/api/admin/training/sessions/[id]/open-register.post.ts', actions: ['register.opened'] },
  { route: 'server/api/admin/training/sessions/[id]/attendees.post.ts', actions: ['session.attendee.added'] },
  { route: 'server/api/admin/training/sessions/[id]/cancel.post.ts', actions: ['session.cancelled'] },
  {
    route: 'server/api/admin/training/sessions/[id]/marks.post.ts',
    actions: ['register.corrected'],
    via: ['server/utils/training-register.ts'],
  },
  {
    route: 'server/api/admin/training/attendees/lookup.post.ts',
    actions: ['account.created.console'],
    via: ['server/utils/accounts.ts'],
  },
  {
    route: 'server/api/admin/training/sessions/[id]/mark.post.ts',
    actions: ['register.marked'],
    via: ['server/utils/training-register.ts'],
  },
  {
    route: 'server/api/admin/training/sessions/[id]/modules.put.ts',
    actions: ['session.modules.changed', 'register.freeze.released'],
  },
  { route: 'server/api/admin/training/modules/[id]/prerequisites.post.ts', actions: ['prerequisite.added'] },
  { route: 'server/api/admin/training/prerequisites/[id].delete.ts', actions: ['prerequisite.removed'] },
  {
    route: 'server/api/admin/training/signoffs/index.post.ts',
    actions: ['record.signed-off', 'record.signoff.unbounded'],
  },
  {
    route: 'server/api/admin/training/external-certificates/index.post.ts',
    actions: ['record.external-certificate'],
  },
  { route: 'server/api/admin/training/records/[id]/revoke.post.ts', actions: ['record.revoked'] },
  { route: 'server/api/admin/training/sessions/index.post.ts', actions: ['session.scheduled'] },
  { route: 'server/api/admin/training/sessions/index.get.ts', exempt: 'reads the scheduled sessions' },
  {
    route: 'server/api/admin/training/deliveries/preview.post.ts',
    exempt: 'the dry-run for a retrospective log; it writes nothing at all',
  },
  {
    route: 'server/api/admin/training/deliveries/index.post.ts',
    actions: ['record.delivery-logged'],
  },
  {
    route: 'server/api/admin/training/sessions/[id]/capacity.post.ts',
    actions: ['session.capacity.changed'],
  },
  { route: 'server/api/training/sessions/index.get.ts', exempt: 'reads the sessions open to you, and where you stand on each' },
  {
    route: 'server/api/training/sessions/[id]/signup.post.ts',
    exempt: 'joins a queue about yourself; the place it confers is derived, not granted',
  },
  {
    route: 'server/api/training/sessions/[id]/signup.delete.ts',
    exempt: 'leaves a queue you joined yourself, taking no authority with it',
  },

  // Development only, and absent from a build: nuxt.config excludes both files (K-124).
  {
    route: 'server/api/dev/seed.post.ts',
    actions: ['account.registered', 'account.erased.system'],
    via: ['server/utils/dev.ts', 'server/utils/accounts.ts', 'server/utils/erasure.ts'],
  },
  { route: 'server/api/dev/sweep-requests.post.ts', actions: ['room.request.expired'], via: ['server/utils/room-requests.ts'] },
  { route: 'server/api/dev/remind-rooms.post.ts', exempt: 'sends a reminder; the send is recorded in notification_log' },
  { route: 'server/api/admin/notifications/trouble.get.ts', exempt: 'reads the message log' },
  { route: 'server/api/dev/sign-in-as.post.ts', exempt: 'a development sign-in with no password, in no build' },
  { route: 'server/api/auth/verify/index.post.ts', actions: ['account.verified'] },
  {
    route: 'server/api/auth/verify/resend.post.ts',
    exempt: 'issues a token and asks for a message; the send is recorded in notification_log',
  },
  { route: 'server/routes/auth/google.get.ts', actions: ['account.created.google', 'session.started.google'] },
]
