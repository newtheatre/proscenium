// A refund's title: the record it gives money back on, never the person's name.
import { first } from '#kit'
import { describeOwners } from '../../owners'

export default {
  async resolve(id: string) {
    const row = await first<{ owner_module: string, owner_record: string }>('SELECT p.owner_module, p.owner_record FROM payments_refunds r JOIN payments_intent_parts p ON p.id = r.part_id WHERE r.id = ?', id)
    if (!row) return null
    const owner = (await describeOwners([{ module: row.owner_module, record: row.owner_record }])).values().next().value
    return { title: owner?.reference ? `Refund on ${owner.reference}` : 'Refund', to: owner?.to ?? '/console/payments/refunds' }
  },
}
