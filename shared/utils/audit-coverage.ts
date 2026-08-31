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
  { route: 'server/api/account/methods/index.get.ts', exempt: 'reads what the account signs in with' },
  { route: 'server/api/auth/sign-out.post.ts', exempt: 'ending your own session changes no record' },

  // Development only, and absent from a build: nuxt.config excludes both files (K-124).
  {
    route: 'server/api/dev/seed.post.ts',
    actions: ['account.registered', 'account.erased.system'],
    via: ['server/utils/dev.ts', 'server/utils/accounts.ts', 'server/utils/erasure.ts'],
  },
  { route: 'server/api/dev/sign-in-as.post.ts', exempt: 'a development sign-in with no password, in no build' },
  { route: 'server/api/auth/verify/index.post.ts', actions: ['account.verified'] },
  {
    route: 'server/api/auth/verify/resend.post.ts',
    exempt: 'issues a token and asks for a message; the send is recorded in notification_log',
  },
  { route: 'server/routes/auth/google.get.ts', actions: ['account.created.google', 'session.started.google'] },
]
