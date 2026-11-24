// Box office's section of the night report (Box office specification, part 5, front-of-house.report-section):
// tickets and who came, then each ticket let in without its requirement being checked again (its
// source was off, failing or not open to the steward) and each one admitted anyway with a reason, so
// the duty manager can follow them up. A ticket is listed by its booking reference and type, with
// the time it came in and, for an override, the reason chosen. Where the door counter was used, its
// walk-ups and peak inside follow, beside admitted and never added to it (BO-73). Compiled at sign-off.
import { all, first, useSetting } from '#kit'
import { headcountFor } from '../../headcount'

interface Admission { reference: string, type_name: string, scanned_at: number, reason: string | null }

export default {
  label: 'box-office.report.attendance',
  order: 10, // not-policy: its place among the other modules' parts
  async compile(performanceId: string) {
    const counts = await first<{ tickets: number, admitted: number | null, comps: number | null }>(
      `SELECT count(*) AS tickets, sum(CASE WHEN t.admitted_at IS NOT NULL THEN 1 ELSE 0 END) AS admitted, sum(CASE WHEN y.kind = 'complimentary' AND l.pass_redemption_id IS NULL THEN 1 ELSE 0 END) AS comps
        FROM box_office_tickets t JOIN box_office_order_lines l ON l.id = t.order_line_id JOIN box_office_ticket_types y ON y.id = l.ticket_type_id
        WHERE t.performance_id = ? AND t.state = 'valid'`, performanceId)
    // Only the scan that let each ticket in counts, so a ticket scanned again later is listed once.
    const admissions = (result: string, unchecked: number) => all<Admission>(
      `SELECT o.reference, y.name AS type_name, s.scanned_at, m.label AS reason FROM box_office_scans s
        JOIN box_office_tickets t ON t.id = s.ticket_id AND t.admitted_scan_id = s.id JOIN box_office_order_lines l ON l.id = t.order_line_id
        JOIN box_office_orders o ON o.id = l.order_id JOIN box_office_ticket_types y ON y.id = l.ticket_type_id LEFT JOIN core_terms m ON m.id = s.reason_term_id
        WHERE s.performance_id = ? AND s.result = ? AND s.unchecked = ? ORDER BY s.scanned_at, o.reference`, performanceId, result, unchecked)
    const [unchecked, overridden] = await Promise.all([admissions('admitted', 1), admissions('admitted_by_override', 0)])
    const timeZone = (await useSetting('core.locale.time-zone') as string | null) ?? 'UTC'
    const clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone })
    const tickets = Number(counts?.tickets ?? 0)
    const admitted = Number(counts?.admitted ?? 0)
    const ticket = (a: Admission) => `${a.reference} · ${a.type_name}`
    const counted = (await headcountFor([performanceId]))[performanceId]!
    const counter = counted.in || counted.out
      ? [
          { label: 'box-office.report.walk-ups', value: counted.walkUps },
          ...counted.out ? [{ label: 'box-office.report.counted-out', value: counted.out }] : [],
          { label: 'box-office.report.peak-inside', value: counted.peak },
        ]
      : []
    return [
      { label: 'box-office.report.tickets', value: tickets },
      { label: 'box-office.report.admitted', value: admitted },
      { label: 'box-office.report.not-in', value: tickets - admitted },
      { label: 'box-office.report.complimentary', value: Number(counts?.comps ?? 0) },
      ...counter,
      { label: 'box-office.report.unchecked', value: unchecked.length },
      ...unchecked.map(a => ({ label: ticket(a), value: clock.format(a.scanned_at) })),
      { label: 'box-office.report.overridden', value: overridden.length },
      ...overridden.map(a => ({ label: ticket(a), value: `${clock.format(a.scanned_at)} · ${a.reason ?? ''}` })),
    ]
  },
}
