// Contract for core.erasure-hold: given an account, the hold codes that pause its erasure (ID-16).
// A hold delays, it never refuses: the request waits and runs once every hold has cleared. Each
// code has a sentence for staff and one for the person in the contributing module's catalogue, at
// "<code>.staff" and "<code>.person".
export interface ErasureHold {
  holds: (accountId: string) => Promise<string[]>
}
