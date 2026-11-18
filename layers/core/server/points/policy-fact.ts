// Contract for core.policy-fact: a value a policy quotes or tests that no setting holds. It is
// shown to everybody, so it says nothing that is not already public. `text` is what a
// :fact{name="..."} token shows; `value` is what a condition compares.
export interface PolicyFact {
  value: () => Promise<{ value: unknown, text: string }>
}
