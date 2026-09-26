import type { H3Event } from 'h3'
import type { AccountRow } from '#server/utils/accounts'

// Who may close a till session, and who may preview the figure closing will stamp: one answer for
// both, because one screen previews exactly what the other records (F-102, F-118 criterion 3).

// Nitro's auto-imports, not named: `requireNightAuthority` reaches a file that takes its own that
// way, and naming them here would put the whole authority graph in the Bun typecheck (CONTRIBUTING).
export async function closerFor(event: H3Event, session: { venueId: string, night: string }): Promise<AccountRow> {
  // Tonight's session closes under the same authority that opened it; a night that has ended has
  // no shift left to fall back on, so only the standing officer role reaches back for it.
  if (session.night === currentShowNight()) {
    return (await requireNightAuthority(event, 'BAR', { venueId: session.venueId })).account
  }
  return earlierNightOfficer(event, 'A session from an earlier night', 'close')
}

// The standing officer role, second factor and all: the one authority an ended night keeps, for
// its session and its unanswered charges alike (F-102 criterion 5, issue 1308).
export async function earlierNightOfficer(event: H3Event, what: string, to: string): Promise<AccountRow> {
  const resolved = await authority(event)
  if (!resolved.permissions.has('night.till')) {
    throw createError({ statusCode: 403, statusMessage: `${what} needs ${NIGHT_ROLE_OFFICER.BAR.words} to ${to}` })
  }
  await requireSecondFactorIfPrivileged(event, resolved)
  return resolved.account
}
