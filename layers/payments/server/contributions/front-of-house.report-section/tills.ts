// Payments' section of the night report: the till sessions closed on the performance's operating day,
// with the cash expected, counted and the difference, in all and for each till that was out. Amounts
// are minor units with the currency code as their unit. Compiled at sign-off, so the report keeps the
// figures of that moment. The shape is front-of-house.report-section's contract.
import { sessionsOnNightOf } from '../../night'

export default {
  label: 'payments.report.tills',
  order: 60, // not-policy: its place among the other modules' parts
  async compile(performanceId: string) {
    const { sessions } = await sessionsOnNightOf(performanceId)
    const closed = sessions.filter(s => s.state === 'closed' && s.closedAt !== null)
    const lines: { label: string, value: string | number, unit?: string }[] = [{ label: 'payments.report.sessions-closed', value: closed.length }]
    const left = sessions.length - closed.length
    if (left) lines.push({ label: 'payments.report.sessions-not-closed', value: left })
    // Totals per currency: a theatre takes one, but nothing here adds two together.
    for (const currency of [...new Set(closed.map(s => s.currency))]) {
      const mine = closed.filter(s => s.currency === currency)
      const sum = (pick: (s: typeof mine[number]) => number | null) => mine.reduce((total, s) => total + (pick(s) ?? 0), 0)
      const expected = sum(s => s.expectedCashMinor)
      const counted = sum(s => s.countedCashMinor)
      lines.push({ label: 'payments.report.expected', value: expected, unit: currency })
      lines.push({ label: 'payments.report.counted', value: counted, unit: currency })
      lines.push({ label: 'payments.report.difference', value: counted - expected, unit: currency })
    }
    // Each till that was out, named as it was opened.
    for (const s of closed) {
      const difference = (s.countedCashMinor ?? 0) - (s.expectedCashMinor ?? 0)
      if (difference) lines.push({ label: s.pointLabel, value: difference, unit: s.currency })
    }
    return lines
  },
}
