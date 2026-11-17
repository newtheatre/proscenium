// Corrects an award: the printed name, the date, what it is for, the citation, the decision, or
// where it is listed. Who holds it and which award it is never change; a wrong one is revoked.
import { getRouterParam } from 'h3'
import { defineRoute, first, nowMs, refuse } from '#kit'
import { awardFields, requireAward } from '../../../awards'

const COLUMN: Record<string, string> = {
  recipientName: 'recipient_name', awardedOn: 'awarded_on', awardedFor: 'awarded_for', citation: 'citation', productionId: 'production_id',
  decidedOn: 'decided_on', decisionNote: 'decision_note', visibility: 'visibility',
}

export default defineRoute({
  ability: 'awards.award.update',
  record: event => ['awards.award', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: awardFields.partial(),
}, async (_event, { input, record, unit }) => {
  const award = await requireAward(record!.id)
  if (input.productionId && !(await first('SELECT 1 FROM core_productions WHERE id = ?', input.productionId)))
    refuse('awards.award.no-production', 'There is no such production.', { status: 422, fields: { productionId: 'awards.award.no-production' } })
  const changed = Object.keys(input).filter(k => (input as Record<string, unknown>)[k] !== undefined && (input as Record<string, unknown>)[k] !== (award as unknown as Record<string, unknown>)[k])
  if (!changed.length) return { awardId: award.id }
  unit.add({
    sql: `UPDATE awards_awards SET ${changed.map(k => `${COLUMN[k]} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
    params: [...changed.map(k => (input as Record<string, unknown>)[k] ?? null), nowMs(), award.id],
  }).expect(1)
  unit.audit({ action: 'update', record: ['awards.award', award.id], detail: { fields: changed } })
  return { awardId: award.id }
})
