import { db, schema } from '@nuxthub/db'
import { and, isNotNull, isNull, lt } from 'drizzle-orm'

/** Free text is chatter, not record. Presets are the timing record and stay. */
const FREE_TEXT_RETENTION_DAYS = 30

export default defineTask({
  meta: {
    name: 'backstage:sweep',
    description: 'Delete backstage free text older than 30 days (docs/11 §5.5)',
  },
  async run() {
    const cutoff = new Date(Date.now() - FREE_TEXT_RETENTION_DAYS * 24 * 60 * 60 * 1000)

    // Only free text: a preset carries the milestone the end-of-night report
    // and the curtain-up record are built from, so it is kept.
    const removed = await db.delete(schema.backstageMessages)
      .where(and(
        isNull(schema.backstageMessages.presetId),
        isNotNull(schema.backstageMessages.body),
        lt(schema.backstageMessages.createdAt, cutoff),
      ))
      .returning({ id: schema.backstageMessages.id })

    console.log(`[backstage:sweep] deleted ${removed.length} free-text messages older than ${FREE_TEXT_RETENTION_DAYS} days`)
    return { result: `deleted ${removed.length}` }
  },
})
