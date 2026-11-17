// A refusal is one body everywhere: { code, reason, remedy?, fields? }. This turns whatever a
// failed request threw into that shape, and a key or a sentence into words for the screen.
export interface RefusalView {
  status: number
  code: string
  reason: string
  remedy?: string
  fields?: Record<string, string>
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
