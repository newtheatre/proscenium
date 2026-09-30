import { listFailureFrom } from './useListFailure'
import { can, workTheTill } from '#shared/utils/abilities'
import type { ListFailure } from './useListFailure'
import type { SettledRead } from '~/utils/refusal'
import type { ResolveOutcome, SumupAttemptStatus } from '#shared/utils/sumup'
import type { EarlierTillLeftOpen } from '#shared/utils/till'

// What ended nights left open, for the Front of House Manager on tonight's till (F-102 criterion 5, issue
// 1316). Read only for the standing role, since no shift reaches back into a night.
export function useTillEarlier() {
  const request = useRequestFetch()
  const viewer = useViewer()
  const offered = computed(() => can(viewer.value, workTheTill))
  const left = ref<EarlierTillLeftOpen>({ sessions: [], attempts: [] })
  // Carries the enrol path, so a role held without its authenticator says where to set one up.
  const failure = ref<ListFailure | null>(null)
  const answering = ref<string | null>(null)
  // A charge taken and not recorded is abandoned only with a word on where the money went.
  const notes = ref<Record<string, string>>({})

  // Null for anybody but the Front of House Manager, who alone is asked.
  function read(): Promise<SettledRead<EarlierTillLeftOpen, ListFailure> | null> {
    return offered.value ? settleReadWith(() => request<EarlierTillLeftOpen>('/api/till/earlier'), listFailureFrom) : Promise.resolve(null)
  }

  function apply(answered: SettledRead<EarlierTillLeftOpen, ListFailure> | null): void {
    if (answered?.kind === 'READ') left.value = answered.value
    else if (answered) failure.value = answered.failure
  }

  async function refresh(): Promise<void> {
    apply(await read())
  }

  async function answer(id: string, outcome: ResolveOutcome): Promise<void> {
    answering.value = id
    failure.value = null
    try {
      const answered = await request<{ status: SumupAttemptStatus, error: string | null }>(`/api/till/payments/${id}/resolve`, {
        method: 'POST',
        body: { outcome, note: notes.value[id]?.trim() || null },
      })
      if (answered.status === 'MISMATCH') failure.value = { message: answered.error ?? '', enrolPath: null }
    }
    catch (refused) {
      failure.value = listFailureFrom(refused)
    }
    finally {
      answering.value = null
      // Refused or not: a charge answered on another device leaves this list too.
      await refresh()
    }
  }

  return { offered, left, failure, answering, notes, read, apply, refresh, answer }
}
