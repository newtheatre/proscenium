// A record's history panel (UI-12): who changed what and when, from the audit trail. Entries hold
// ids, codes and numbers, never a person's words, so the panel shows no free text.
import { z } from 'zod'
import { all, defineRoute } from '#kit'

const MOST_ENTRIES = 50 // not-policy: one page of history

export default defineRoute({
  ability: 'core.history.view',
  rateLimit: 'default',
  input: z.object({ type: z.string().max(100), id: z.string().max(100) }), // not-policy: sane lengths for a record's type and id
}, async (_event, { input }) => {
  const rows = await all<{ at: number, actor_name: string | null, actor_kind: string, action: string, ability: string | null, detail: string | null }>(
    `SELECT at, actor_name, actor_kind, action, ability, detail FROM core_audit
      WHERE record_type = ? AND record_id = ? ORDER BY at DESC LIMIT ${MOST_ENTRIES}`, input.type, input.id)
  return {
    entries: rows.map(r => ({ at: r.at, who: r.actor_name, kind: r.actor_kind, action: r.action, ability: r.ability, detail: r.detail ? JSON.parse(r.detail) as Record<string, unknown> : {} })),
  }
})
