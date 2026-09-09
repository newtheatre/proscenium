import { z } from 'zod'
import { toCsv } from '#server/utils/csv'
import { buildTablePdf } from '#server/utils/pdf'
import { saysIdType, saysOutcome, saysRefusalReason } from '#shared/utils/age-checks'
import { formatLondon, startOfLondonDay } from '#shared/utils/london'

const query = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  format: z.enum(['csv', 'pdf']),
})

const DAY_SECONDS = 24 * 60 * 60

// The register exported for a licensing inspection (E-119). CSV and a formatted PDF stating
// venue, period and generation date; both cover the same rows, nothing omitted (criteria 1, 2).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'age-checks.export')
  const { from, to, format } = await getValidatedQueryOrThrow(event, query)

  const fromAt = Math.floor(startOfLondonDay(from).getTime() / 1000)
  const toAt = Math.floor(startOfLondonDay(to).getTime() / 1000) + DAY_SECONDS
  const rows = await exportRows(fromAt, toAt)

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: resolved.account.id,
    action: 'age-checks.exported',
    target: null,
    detail: { from, to, format, rows: rows.length },
  }))

  const period = `${formatLondon(new Date(fromAt * 1000), { dateStyle: 'medium' })} to ${formatLondon(new Date(toAt * 1000 - 1000), { dateStyle: 'medium' })}`
  const venues = [...new Set(rows.map(row => row.venueName ?? 'Bar (no performance)'))]

  if (format === 'csv') {
    const csv = toCsv(rows.map(row => ({
      id: row.id,
      when: formatLondon(new Date(row.createdAt * 1000), { dateStyle: 'short', timeStyle: 'short' }),
      venue: row.venueName ?? '',
      outcome: saysOutcome(row.outcome),
      idType: row.idType ? saysIdType(row.idType) : '',
      reason: row.reason ? saysRefusalReason(row.reason) : '',
      description: row.description,
      product: row.product ?? '',
      notes: row.notes ?? '',
      checkedBy: row.checkedByName,
      supersedesId: row.supersedesId ?? '',
      supersededBy: row.supersededBy ?? '',
    })))
    setResponseHeader(event, 'content-type', 'text/csv; charset=utf-8')
    setResponseHeader(event, 'content-disposition', `attachment; filename="challenge-25-register-${from}-to-${to}.csv"`)
    return csv
  }

  const pdf = await buildTablePdf({
    title: 'Challenge 25 register',
    subtitleLines: [
      `Venue: ${venues.join(', ')}`,
      `Period: ${period}`,
      `Generated: ${formatLondon(new Date(), { dateStyle: 'full', timeStyle: 'short' })}`,
    ],
    columns: [
      { header: 'When', key: 'when', width: 90 },
      { header: 'Outcome', key: 'outcome', width: 60 },
      { header: 'ID / reason', key: 'idOrReason', width: 100 },
      { header: 'Description', key: 'description', width: 160 },
      { header: 'Product', key: 'product', width: 80 },
      { header: 'Checked by', key: 'checkedBy', width: 90 },
      { header: 'Supersedes', key: 'supersedesId', width: 90 },
      { header: 'Superseded by', key: 'supersededBy', width: 90 },
    ],
    rows: rows.map(row => ({
      when: formatLondon(new Date(row.createdAt * 1000), { dateStyle: 'short', timeStyle: 'short' }),
      outcome: saysOutcome(row.outcome),
      idOrReason: row.idType ? saysIdType(row.idType) : (row.reason ? saysRefusalReason(row.reason) : ''),
      description: row.description,
      product: row.product ?? '',
      checkedBy: row.checkedByName,
      supersedesId: row.supersedesId ?? '',
      supersededBy: row.supersededBy ?? '',
    })),
  })

  setResponseHeader(event, 'content-type', 'application/pdf')
  setResponseHeader(event, 'content-disposition', `attachment; filename="challenge-25-register-${from}-to-${to}.pdf"`)
  return pdf
})
