// Posts the answer to a module's question about a change (ChangeHeld), then asks again: several
// performances may each need the same answer. Answers what still holds the change, or null.
import type { HeldRefusal } from '../components/ChangeHeld.vue'

const MOST = 500 // not-policy: a guard against asking for ever, far above any run's length

export async function settleChange(held: HeldRefusal | null, answer: string | undefined, recheck: () => Promise<HeldRefusal | null>): Promise<HeldRefusal | null> {
  const { $api } = useNuxtApp()
  let now = held
  for (let i = 0; now?.question && answer && now.question.options.some(o => o.value === answer) && i < MOST; i++) {
    await $api(now.question.post, { method: 'POST', body: { [now.question.field]: answer } })
    now = await recheck()
  }
  return now
}
