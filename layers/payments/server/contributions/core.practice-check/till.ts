// The till practice's tasks (PAY-10): a card declined and then one taken, cash taken with change
// given where the theatre takes cash, and the till closed with the count it expected.
import { all, definePracticeChecks } from '#kit'

const any = async (sql: string) => (await all(sql)).length > 0

export default definePracticeChecks({
  'declined-then-good': () => any(`SELECT 1 FROM payments_attempts f JOIN payments_attempts s ON s.method = 'card_reader' AND s.state = 'succeeded' AND s.started_at >= f.started_at
    WHERE f.method = 'card_reader' AND f.state = 'failed' LIMIT 1`),
  'cash-change': () => any("SELECT 1 FROM payments_attempts WHERE method = 'cash' AND state = 'succeeded' AND tendered_minor > amount_minor LIMIT 1"),
  'close-right': () => any("SELECT 1 FROM payments_sessions WHERE state = 'closed' AND counted_cash_minor = expected_cash_minor LIMIT 1"),
})
