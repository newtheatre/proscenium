import { db, schema } from '@nuxthub/db'
import { eq, sql } from 'drizzle-orm'
import type { NightReport } from '../db/schema/reports'

/** One screen of email: enough to reconstruct the night (docs/12 §4.3). */
function renderReport(report: NightReport, autoClosed: boolean, closingNote: string | null): string {
  const money = (pence: number) => formatPence(pence)
  const rows = (cells: string[][]) => cells
    .map(([label, value]) => `<tr><td style="padding:2px 12px 2px 0;color:#555">${label}</td><td><strong>${value}</strong></td></tr>`)
    .join('')

  const banner = autoClosed
    ? `<p style="background:#fef3c7;border:1px solid #f59e0b;padding:10px;border-radius:6px">
         <strong>Auto-closed &mdash; no duty manager sign-off.</strong>
         Nobody closed this night by noon the following day.
       </p>`
    : ''

  const a = report.attendance
  const t = report.takings

  const incidents = report.incidents.length
    ? `<ul>${report.incidents.map(i => `<li><strong>${formatStamp(i.at)}</strong> ${escapeHtml(i.body)} <em>&mdash; ${escapeHtml(i.author ?? 'unknown')}</em></li>`).join('')}</ul>`
    : '<p style="color:#555">Nothing logged.</p>'

  const milestones = report.milestones.length
    ? `<ul>${report.milestones.map(m => `<li><strong>${formatStamp(m.at)}</strong> ${escapeHtml(m.label)}</li>`).join('')}</ul>`
    : '<p style="color:#555">No timings recorded.</p>'

  const staffing = report.staffing.length
    ? `<ul>${report.staffing.map(s => `<li>${escapeHtml(s.role)}: ${escapeHtml(s.name ?? 'unfilled')} (${escapeHtml(s.status)})</li>`).join('')}</ul>`
    : '<p style="color:#555">Nobody was rostered.</p>'

  const bar = report.bar
    ? `<h3>Bar</h3>
       ${report.bar.unclosed ? '<p style="background:#fef3c7;padding:8px;border-radius:6px"><strong>The bar session was never closed.</strong></p>' : ''}
       <table>${rows([
          ...report.bar.takingsByTender.map(x => [x.tender, money(x.totalPence)] as string[]),
          ['ID checks accepted', String(report.bar.idChecks.accepted)],
          ['ID checks refused', String(report.bar.idChecks.refused)],
        ])}</table>
       ${report.bar.comps.length
          ? `<p><strong>Comps</strong></p><ul>${report.bar.comps.map(c => `<li>${escapeHtml(c.what)} &mdash; ${escapeHtml(c.reason)}, asked by ${escapeHtml(c.requestedBy ?? 'unknown')}, approved by ${escapeHtml(c.approvedBy ?? 'unknown')}</li>`).join('')}</ul>`
          : '<p style="color:#555">No comps.</p>'}
       ${report.bar.lowStock.length ? `<p><strong>Below par:</strong> ${report.bar.lowStock.map(escapeHtml).join(', ')}</p>` : ''}
       ${report.bar.closingNote ? `<p><em>${escapeHtml(report.bar.closingNote)}</em></p>` : ''}`
    : ''

  return `<div style="font-family:system-ui,sans-serif;max-width:640px">
    <h2>${escapeHtml(report.performance.showTitle)}</h2>
    <p style="color:#555">${escapeHtml(report.performance.venueName)} &middot; ${formatStamp(report.performance.startsAt)}</p>
    ${banner}
    <h3>Attendance</h3>
    <table>${rows([
      ['Capacity', a.capacity == null ? 'unlimited' : String(a.capacity)],
      ['Sold', String(a.sold)],
      ['Collected', String(a.collected)],
      ['No-shows', String(a.noShows)],
      ['Walk-ups', String(a.walkUps)],
      ['Pass admissions', String(a.passAdmissions)],
    ])}</table>
    <h3>Takings for this performance</h3>
    <table>${rows([
      ['Tickets', money(t.ticketsPence)],
      ['Walk-ups', money(t.walkUpPence)],
      ['Comped', money(t.compPence)],
      ['Total', money(t.totalPence)],
    ])}</table>
    <h3>Access</h3>
    <p>${report.access.bookingsWithNeeds} booking(s) using access tickets, ${report.access.verified} with a verified profile.
      <em style="color:#555">Counts only: needs and names are never in this report.</em></p>
    <h3>Incidents</h3>
    ${incidents}
    <h3>Timings</h3>
    ${milestones}
    <h3>Who was on</h3>
    ${staffing}
    ${bar}
    ${closingNote ? `<h3>Closing note</h3><p>${escapeHtml(closingNote)}</p>` : ''}
  </div>`
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]!))
}

/** Europe/London, because the Worker runs in UTC. */
function formatStamp(value: string): string {
  const date = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

/** Recipients: the closing DM, plus the standing archive addresses. */
export async function emailNightReport(reportId: string, report: NightReport, autoClosed: boolean): Promise<void> {
  const stored = await db.select({
    closingNote: schema.performanceReports.closingNote,
    closedByUserId: schema.performanceReports.closedByUserId,
  }).from(schema.performanceReports).where(eq(schema.performanceReports.id, reportId)).get()

  const standing = String(useRuntimeConfig().nightReportRecipients ?? '')
    .split(',').map(address => address.trim()).filter(Boolean)

  const closer = stored?.closedByUserId
    ? await db.select({ email: schema.users.email }).from(schema.users)
        .where(eq(schema.users.id, stored.closedByUserId)).get()
    : null

  const recipients = [...new Set([...standing, closer?.email].filter(Boolean) as string[])]
  if (!recipients.length) {
    console.warn('[night-report] no recipients configured; the stored report is still the record')
    return
  }

  const html = renderReport(report, autoClosed, stored?.closingNote ?? null)
  const subject = `${report.performance.showTitle} — ${report.performance.night}${autoClosed ? ' (auto-closed)' : ''}`

  for (const to of recipients) {
    await sendEmail({ to, subject, html })
  }

  await db.update(schema.performanceReports)
    .set({ emailedAt: sql`(current_timestamp)` })
    .where(eq(schema.performanceReports.id, reportId))
}
