import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

// Which requests a reader answers, over `modules m`: every department for an officer, a lead's own
// by subquery, so no parameter count grows with how many they steward (0003). The overview counts by it.
export function demandScope(leadOf: string | undefined): SQL {
  return leadOf === undefined
    ? sql`1 = 1`
    : sql`m.department in (
        select department from department_leads
        where user_id = ${leadOf} and (expires_at is null or expires_at > unixepoch()))`
}
