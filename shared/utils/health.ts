// J-106 criterion 5: an unhealthy check alerts once it has lasted the configured window, not on
// its first failure, because a deploy and its migration job can legitimately race for a few minutes.
export function isSustainedlyUnhealthy(unhealthySince: number | null, windowMinutes: number | null, now: number): boolean {
  if (windowMinutes === null) return false
  if (unhealthySince === null) return false
  return now - unhealthySince >= windowMinutes * 60
}
