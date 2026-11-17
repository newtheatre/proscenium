// What a form still needs, said beside each field rather than by greying out its button
// (docs/kit/interface.md, "Checking a form"). A form with no schema of its own passes its needed
// values by field name: `:validate="() => needs({ name: form.name, reasonTermId: form.reasonTermId })"`.
// A value is missing when it is empty: undefined, null, '', blank text, an empty list, or false.
// Pass `true` for a field that is not needed just now (`{ note: paid ? form.note : true }`).
export function needs(values: Record<string, unknown>): { name: string, message: string }[] {
  const empty = (v: unknown) => v === undefined || v === null || v === false || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length)
  return Object.entries(values).filter(([, v]) => empty(v)).map(([name]) => ({ name, message: translate('core.form.invalid.required') }))
}
