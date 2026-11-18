// What a verification list's form still needs, said beside each field (docs/kit/interface.md,
// "Checking a form"). The field text of a list of references must be a whole question, as the server
// requires, so it is checked here with a message that says what to write. Pass `referenceLabel` as
// undefined for a list of addresses, which has none.
export function listErrors(values: { name: string, referenceLabel?: string }): { name: string, message: string }[] {
  const errors = needs({ name: values.name })
  if (values.referenceLabel === undefined) return errors
  const label = values.referenceLabel.trim()
  if (label.length < 10) errors.push({ name: 'referenceLabel', message: translate('membership.screens.list.label-short') }) // not-policy: the route's least length for a whole question
  return errors
}
