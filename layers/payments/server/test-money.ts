// Test money: what a provider account in test mode took. It posts nothing and settles only
// Payments' own test payment, except on a test instance (payments.test-mode.takes-sales).
import { first, useSetting } from '#kit'

interface AttemptRef { id: string }

/**
 * Whether any payment on the intent, or this one, was taken on a test-mode account. Test money posts
 * nothing. On a test instance (payments.test-mode.takes-sales) test money paying for a real sale is
 * treated as live money, so the sale settles and posts; only Payments' own test payment stays test.
 */
export async function isTestMoney(intentId: string, including?: AttemptRef): Promise<boolean> {
  const row = await first<{ n: number }>(`SELECT count(*) AS n FROM payments_attempts a JOIN payments_provider_accounts p ON p.id = a.provider_account_id
    WHERE p.mode = 'test' AND (a.id = ? OR (a.intent_id = ? AND a.state = 'succeeded'))`, including?.id ?? '', intentId)
  if (!row?.n) return false
  return !(await testMoneyTakesSales() && await paysForSales(intentId))
}

/** The test instance setting: test-mode accounts may take payment for real sales. */
export async function testMoneyTakesSales(): Promise<boolean> {
  return await useSetting('payments.test-mode.takes-sales') === true
}

/** Whether anything other than Payments' own test payment is being paid for. */
export async function paysForSales(intentId: string): Promise<boolean> {
  const real = await first<{ n: number }>("SELECT count(*) AS n FROM payments_intent_parts WHERE intent_id = ? AND owner_module <> 'payments'", intentId)
  return (real?.n ?? 0) > 0
}
