// The members list as a CSV file (MEM-27): the view the person is looking at, every page of it, up
// to EXPORT_LIMIT rows. The read is audited as an export.
import { getQuery, setResponseHeader } from 'h3'
import { defineRoute } from '#kit'
import { EXPORT_LIMIT, readMembers } from '../../../members'

// A cell a spreadsheet would read as a formula starts with a quote mark instead.
const cell = (value: string | number | null) => {
  const text = value === null ? '' : String(value)
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export default defineRoute({ ability: 'membership.membership.export', rateLimit: 'export' }, async (event, { actor, unit }) => {
  const { rows, total } = await readMembers(getQuery(event) as Record<string, string | string[] | undefined>, actor, unit.view(), true)
  unit.audit({ action: 'export', ability: 'membership.membership.export', detail: { rows: rows.length, total, limit: EXPORT_LIMIT } })
  setResponseHeader(event, 'content-type', 'text/csv; charset=utf-8')
  setResponseHeader(event, 'content-disposition', 'attachment; filename="members.csv"')
  const lines = [['Name', 'Member number', 'Scheme', 'Status', 'Until', 'Joined'], ...rows.map(r => [r.name, r.number, r.scheme, r.status, r.until, r.joined])]
  return lines.map(l => l.map(cell).join(',')).join('\n') + '\n'
})
