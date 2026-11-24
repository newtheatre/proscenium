// Reading a calendar address (I1, I5). A read changes nothing at the other end, so it needs no
// attempt and outcome of its own: a failure is counted on the connection instead (I5).
const FETCH_SECONDS = 15 // not-policy: the outside call's timeout (part 4)
const BYTES_MAX = 5_000_000 // not-policy: a calendar file larger than this is refused rather than parsed

/** The calendar file at an address; throws when it does not answer, or answers too much. */
export async function fetchCalendar(url: string): Promise<string> {
  const response = await fetch(url, { headers: { accept: 'text/calendar' }, signal: AbortSignal.timeout(FETCH_SECONDS * 1000) }) // not-policy: seconds to milliseconds
  if (!response.ok) throw new Error(`answered ${response.status}`)
  const text = await response.text()
  if (text.length > BYTES_MAX) throw new Error('too large')
  return text
}
