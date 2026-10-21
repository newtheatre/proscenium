import type { Ref } from 'vue'

// `status` is the response's own, absent when no response came: a 403 is a refusal, not a blip.
export interface ListFailure { message: string, enrolPath: string | null, status?: number }

// The one sentence a console alert adds under a read that did not finish, so no screen writes
// its own (K-128, issue 1151 item 12).
export const READ_AGAIN = 'Try again. If it keeps happening, tell the IT Manager.'

// A refusal read into what a console list's alert shows, so the enrol link (issue 897) reaches every
// caller the same way whether the error came from useAsyncData or a page's own try/catch.
export function listFailureFrom(error: unknown, fallback?: string): ListFailure {
  return { message: refusalText(error, fallback), enrolPath: enrolPath(error), status: refusalStatus(error) }
}

// Watches a useAsyncData error ref and turns it into an alert-ready failure, so a table stops
// showing a refusal as an empty estate (issue 898) rather than the thing it actually is.
export function useListFailure(error: Ref<unknown>, fallback?: string): Ref<ListFailure | null> {
  const failure = ref<ListFailure | null>(null)
  watch(error, (raised) => {
    failure.value = raised ? listFailureFrom(raised, fallback) : null
  }, { immediate: true })
  return failure
}
