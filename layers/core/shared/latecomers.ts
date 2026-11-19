// When latecomers are let in (Matt, 2026-11-19): decided show by show. A production says nothing and
// takes the theatre's usual practice (core.visiting.latecomers). The house rules explain all four.

/** The four ways a show treats latecomers, as the setting and productions store them. */
export const LATECOMER_RULES = ['any-time', 'suitable-point', 'interval', 'not-admitted'] as const
export type LatecomerRule = typeof LATECOMER_RULES[number]

export const isLatecomerRule = (value: unknown): value is LatecomerRule => (LATECOMER_RULES as readonly unknown[]).includes(value)

/**
 * The rule that holds: the production's own, else the theatre's. "At the interval" with no interval
 * (at this performance) means latecomers are not let in at all, as the house rules say.
 */
export function latecomerRule(production: string | null | undefined, theatre: string | null | undefined, intervals: number | null | undefined): LatecomerRule {
  const rule = [production, theatre].find(isLatecomerRule) ?? 'suitable-point'
  return rule === 'interval' && !intervals ? 'not-admitted' : rule
}
