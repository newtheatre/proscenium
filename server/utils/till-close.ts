import type { H3Event } from 'h3'
import type { AccountRow } from '#server/utils/accounts'
import type { NightScope } from '#shared/utils/night-authority'

// Who may close a till session, and who may preview the figure closing will stamp: one answer for
// both, because one screen previews exactly what the other records (F-102, F-118 criterion 3).

// Nitro's auto-imports, not named: `requireNightAuthority` reaches a file that takes its own that
// way, and naming them here would put the whole authority graph in the Bun typecheck (CONTRIBUTING).
export async function closerFor(event: H3Event, session: { venueId: string, night: string }): Promise<AccountRow> {
  return barAuthorityFor(event, session.night, { venueId: session.venueId }, 'A session from an earlier night', 'close')
}

// Tonight's bar authority for tonight's work; an ended night has no shift left, so only the standing
// officer role reaches back, second factor and all, for its session and charges (F-102.5, issue 1308).
export async function barAuthorityFor(event: H3Event, night: string, scope: NightScope, what: string, to: string): Promise<AccountRow> {
  if (night === currentShowNight()) return (await requireNightAuthority(event, 'BAR', scope)).account
  return barOfficerFor(event, what, to)
}

// The standing half alone, for what only ever concerns ended nights: the till's list of what they
// left open (issue 1316).
export async function barOfficerFor(event: H3Event, what: string, to: string): Promise<AccountRow> {
  const resolved = await authority(event)
  if (!resolved.permissions.has('night.till')) {
    throw createError({ statusCode: 403, statusMessage: `${what} needs ${NIGHT_ROLE_OFFICER.BAR.words} to ${to}` })
  }
  await requireSecondFactorIfPrivileged(event, resolved)
  return resolved.account
}
