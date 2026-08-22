/**
 * What the door tells someone arriving late. A short list, because a volunteer
 * reads it out and every show having its own wording helps nobody.
 */
export const LATECOMER_POLICIES = [
  'SUITABLE_BREAK',
  'INTERVAL_ONLY',
  'NOT_ADMITTED',
  'ANY_TIME',
] as const

export type LatecomerPolicy = (typeof LATECOMER_POLICIES)[number]

/** The sentence itself, so the door and the show page never disagree. */
export const LATECOMER_POLICY_LABELS: Record<LatecomerPolicy, string> = {
  SUITABLE_BREAK: 'Admitted at a suitable break, at the duty manager\'s discretion',
  INTERVAL_ONLY: 'Admitted at the interval only',
  NOT_ADMITTED: 'Latecomers cannot be admitted',
  ANY_TIME: 'Admitted at any time',
}

export function latecomerPolicyLabel(value: string | null | undefined): string | null {
  if (!value) return null
  return LATECOMER_POLICY_LABELS[value as LatecomerPolicy] ?? value
}
