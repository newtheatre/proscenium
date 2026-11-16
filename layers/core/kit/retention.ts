// How long a table keeps its rows, for a module's sweep: its retention setting's value, or the fixed
// duration a table about nobody may declare (Data-class registry, the retention row).
import { tableMeta } from './db'
import { parseDuration } from './duration'
import { useSetting } from './settings-store'

/** The table's retention in seconds, or null when it declares none. */
export async function retentionSeconds(table: unknown): Promise<number | null> {
  const retention = tableMeta(table)?.options.retention
  if (retention === undefined) return null
  return typeof retention === 'string' ? await useSetting(retention as never) as number : parseDuration(retention.fixed)
}
