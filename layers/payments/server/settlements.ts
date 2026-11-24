import { runInContext, useContext, usePoint } from '#kit'
import type { Settlement } from './points/settlement'

/**
 * The settlement handlers of the modules that are on, by owner module. A handler is its owner's own
 * code, so it runs as its owner: the request is Payments', but what the handler signs or reads under
 * its module's name (a door code for a ticket it issues) is its own to use.
 */
export async function settlements(): Promise<Map<string, Settlement>> {
  const out = new Map<string, Settlement>()
  for (const c of await usePoint<Settlement>('payments.settlement')) {
    if (out.has(c.module)) throw new Error(`${c.module} contributes to payments.settlement twice; a module has one handler for all its parts`)
    const as = <T>(fn: () => T): T => runInContext({ ...useContext(), module: c.module }, fn)
    const { settle, refunded, release, describe, receiptLink, kept } = c.value
    out.set(c.module, {
      settle: (unit, part) => as(() => settle(unit, part)),
      refunded: (unit, part, refund) => as(() => refunded(unit, part, refund)),
      release: release && ((unit, part) => as(() => release(unit, part))),
      describe: describe && (record => as(() => describe(record))),
      receiptLink: receiptLink && ((unit, part, person) => as(() => receiptLink(unit, part, person))),
      kept: kept && ((unit, part) => as(() => kept(unit, part))),
    })
  }
  return out
}
