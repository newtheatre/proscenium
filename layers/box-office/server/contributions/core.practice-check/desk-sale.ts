// The desk practice's tasks (BO-77): two tickets sold at the desk and paid for, and one reserved
// for its buyer to pay later.
import { all, definePracticeChecks } from '#kit'

const any = async (sql: string, ...params: unknown[]) => (await all(sql, ...params)).length > 0

export default definePracticeChecks({
  'card-two': ({ results }) => any(`SELECT 1 FROM box_office_orders o WHERE o.channel IN ('desk', 'phone') AND o.state = 'confirmed' AND o.total_minor > 0
    AND (SELECT count(*) FROM box_office_order_lines l WHERE l.order_id = o.id AND l.kind = 'ticket' AND l.state = 'live' AND l.performance_id = ?) >= 2 LIMIT 1`, results.tonight), // not-policy: the task's two tickets
  'reserve': () => any("SELECT 1 FROM box_office_orders WHERE channel IN ('desk', 'phone') AND state = 'reserved' LIMIT 1"),
})
