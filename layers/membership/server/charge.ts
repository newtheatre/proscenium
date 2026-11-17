// Reaching the fee collector through the point membership.charge, which the fees module answers
// while it is on. Null means every scheme is free and one that requires payment cannot be joined
// online (rule S5).
import { refuse, usePoint } from '#kit'
import type { MembershipCharge } from './points/charge'

export async function charger(): Promise<MembershipCharge | null> {
  return (await usePoint<MembershipCharge>('membership.charge'))[0]?.value ?? null
}

/** S5: the collector, or a refusal saying the scheme cannot be joined online now. */
export async function requireCharger(): Promise<MembershipCharge> {
  const found = await charger()
  if (!found) refuse('membership.join.not-online', 'This scheme cannot be joined online at the moment.', { status: 409, remedy: 'Contact the theatre to join.' })
  return found!
}
