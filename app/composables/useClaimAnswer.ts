import { ref, shallowRef } from 'vue'
import { refusalData, refusalText } from '../utils/refusal'
import type { Ref, ShallowRef } from 'vue'

// Confirming or declining a queued claim, the same on the rota board and on a bar opening's slot
// (E-105 criteria 2 and 3, E-130 criterion 3). Each screen names its route and its own words.

export interface ClaimAnswerOptions<T> {
  // The claim's own route; `/approve` and `/decline` are added to it.
  route: (claim: T) => string
  id: (claim: T) => string
  confirmedTitle: (claim: T) => string
  declinedDescription: (claim: T) => string
  // Where a refusal is said when there is no decline to offer instead.
  failure: Ref<string | null>
  refresh: () => Promise<unknown>
}

export interface ClaimAnswer<T> {
  confirmingId: Ref<string | null>
  declining: ShallowRef<T | null>
  declineOffered: Ref<string | undefined>
  declineFailure: Ref<string | null>
  declineWorking: Ref<boolean>
  confirm: (claim: T) => Promise<void>
  openDecline: (claim: T, reason?: string) => void
  closeDecline: () => void
  submitDecline: (reason: string) => Promise<void>
}

export function useClaimAnswer<T>(options: ClaimAnswerOptions<T>): ClaimAnswer<T> {
  const toast = useToast()
  // One confirm at a time, so a second press is ignored rather than meeting a 409.
  const confirmingId = ref<string | null>(null)
  const declining = shallowRef<T | null>(null)
  const declineOffered = ref<string | undefined>()
  const declineFailure = ref<string | null>(null)
  const declineWorking = ref(false)

  // Every opening sets the reason, so one claimant's text never carries into another's dialogue.
  function openDecline(claim: T, reason?: string): void {
    declineFailure.value = null
    declineOffered.value = reason
    declining.value = claim
  }

  function closeDecline(): void {
    declining.value = null
    declineFailure.value = null
  }

  async function confirm(claim: T): Promise<void> {
    if (confirmingId.value) return
    confirmingId.value = options.id(claim)
    options.failure.value = null
    try {
      await $fetch(`${options.route(claim)}/approve`, { method: 'POST' })
      toast.add({ title: options.confirmedTitle(claim), icon: 'i-lucide-check', color: 'success' })
      await options.refresh()
    }
    catch (error) {
      // A claimant who no longer qualifies is offered the decline, its reason already written, and
      // the refusal is said inside that dialogue rather than behind it (issue 1302).
      const offered = refusalData<{ declineReason?: string }>(error)?.declineReason
      if (offered) {
        openDecline(claim, offered)
        declineFailure.value = refusalText(error)
      }
      else {
        options.failure.value = refusalText(error)
      }
    }
    finally {
      confirmingId.value = null
    }
  }

  async function submitDecline(reason: string): Promise<void> {
    const claim = declining.value
    if (!claim || declineWorking.value) return
    declineWorking.value = true
    declineFailure.value = null
    try {
      await $fetch(`${options.route(claim)}/decline`, { method: 'POST', body: { reason } })
      toast.add({ title: 'Declined', description: options.declinedDescription(claim), icon: 'i-lucide-x' })
      declining.value = null
      await options.refresh()
    }
    catch (error) {
      declineFailure.value = refusalText(error)
    }
    finally {
      declineWorking.value = false
    }
  }

  return { confirmingId, declining, declineOffered, declineFailure, declineWorking, confirm, openDecline, closeDecline, submitDecline }
}
