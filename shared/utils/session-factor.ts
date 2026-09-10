// What proved this session, in the audit trail's own vocabulary (session.started.<factor>).

export const SESSION_FACTORS = ['password', 'totp', 'recovery-code', 'google', 'passkey', 'magic-link'] as const
export type SessionFactor = (typeof SESSION_FACTORS)[number]

// A passkey and a Workspace sign-in each prove two things in one step; a bare password or a
// mailbox link proves one and still needs its own second factor (A-128 criteria 1 and 2).
export function satisfiesSecondFactor(factor: SessionFactor): boolean {
  return factor !== 'password' && factor !== 'magic-link'
}
