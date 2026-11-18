// An order's title and address, for the command palette and record fields: its booking reference,
// with the buyer's name when it has one. One query, since access checks on an order ask its
// resolver for a parent too.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ reference: string, name: string | null, preferred_name: string | null, anonymised_at: number | null, has_buyer: number }>(
      `SELECT o.reference, a.name, a.preferred_name, a.anonymised_at, o.account_id IS NOT NULL AS has_buyer
         FROM box_office_orders o LEFT JOIN core_accounts a ON a.id = (SELECT coalesce(merged_into_id, id) FROM core_accounts WHERE id = o.account_id)
        WHERE o.id = ?`, id)
    if (!row) return null
    const buyer = !row.has_buyer ? null : row.anonymised_at ? 'Former member' : row.preferred_name || row.name || null
    return { title: buyer ? `${row.reference} · ${buyer}` : row.reference, to: `/console/box-office/orders/${id}` }
  },
}
