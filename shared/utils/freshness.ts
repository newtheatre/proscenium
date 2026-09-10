// Whether a credential proved at signedInAt is still fresh enough to skip re-authentication
// (A-109, A-110, A-128 criterion 5).
export function isFresh(signedInAt: number, windowMinutes: number, now: number): boolean {
  return now - signedInAt <= windowMinutes * 60
}
