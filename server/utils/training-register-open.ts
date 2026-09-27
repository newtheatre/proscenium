import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

// G-115 criterion 4. The stamp is a conditional write, so two devices opening at once produce one
// open register: the loser's update matches nothing, and so writes no audit row (0049).
export function openRegisterStatement(sessionId: string, actorId: string, at: number): SQL {
  return sql`
    UPDATE training_sessions
    SET register_opened_at = ${at}, register_opened_by = ${actorId}, updated_at = ${at}
    WHERE id = ${sessionId} AND register_opened_at IS NULL
    RETURNING id
  `
}
