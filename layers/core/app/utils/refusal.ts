// A refusal is one body everywhere: { code, reason, remedy?, fields?, detail? }. This turns whatever a
// failed request threw into that shape, and a key or a sentence into words for the screen.
export interface RefusalView {
  status: number
  code: string
  reason: string
  remedy?: string
  fields?: Record<string, string>
  /** Facts to link to or act on, such as the id of the record in the way. */
  detail?: Record<string, string>
}

/** The refusal of someone who holds the ability but has no two-step sign-in set up, and where they set it up. */
export const TWO_STEP_NOT_SET_UP = 'core.access.two-step-not-set-up'
export const TWO_STEP_SET_UP_AT = '/account/sign-in'

/** What a refusal offers to do about it, when the answer is somewhere to go: "Set it up" for two-step sign-in. */
export function refusalAction(refusal: { code?: string } | null | undefined): { label: string, to: string } | undefined {
  return refusal?.code === TWO_STEP_NOT_SET_UP ? { label: translate('core.two-step.set-up'), to: TWO_STEP_SET_UP_AT } : undefined
}

const KEY = /^[a-z][a-z0-9-]*(\.[a-z0-9-]+){2,}$/

/** Reasons and remedies are translation keys or plain sentences; both end up as words. */
export function phrase(text: string | undefined): string | undefined {
  if (!text) return undefined
  return KEY.test(text) && hasMessage(text) ? translate(text) : text
}

export function toRefusal(error: unknown): RefusalView {
  const e = error as { statusCode?: number, status?: number, data?: Partial<RefusalView> | null, message?: string }
  const data = e?.data && typeof e.data === 'object' ? e.data : {}
  const status = e?.statusCode ?? e?.status ?? 0
  return {
    status,
    code: data.code ?? (status ? `core.http.${status}` : 'core.network'),
    reason: phrase(data.reason) ?? (status === 0 ? translate('core.failed.offline') : translate('core.failed.reason')),
    remedy: phrase(data.remedy),
    fields: data.fields,
    detail: data.detail,
  }
}

/**
 * A refusal's field problems as a UForm's errors, so each shows beside its field rather than only in
 * the notice at the top: `form.value?.setErrors(fieldErrors(refusal))`. Each UFormField needs the
 * `name` the server checks (the body's key).
 */
export function fieldErrors(refusal: Pick<RefusalView, 'fields'> | null | undefined): { name: string, message: string }[] {
  return Object.entries(refusal?.fields ?? {}).map(([name, message]) => ({ name, message: phrase(message) ?? message }))
}
