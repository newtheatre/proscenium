// Every refusal these screens show is written by the route that raised it, so the wording stays
// in one place and a screen cannot soften a security message by rephrasing it.
export function refusalText(error: unknown, fallback = 'That did not work. Try again.'): string {
  const data = (error as { data?: { statusMessage?: string, message?: string } }).data
  return data?.statusMessage ?? data?.message ?? fallback
}

export function refusalData<T>(error: unknown): T | undefined {
  return (error as { data?: { data?: T } }).data?.data
}
