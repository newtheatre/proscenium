export default (error: unknown, fallback: string) => {
  if (error && typeof error === 'object') {
    const fetchError = error as { data?: { statusMessage?: string }, message?: string }
    return fetchError.data?.statusMessage || fetchError.message || fallback
  }

  return fallback
}
