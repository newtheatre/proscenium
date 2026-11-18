// How an award's date reads: a year alone (an imported "1998") stays a year, never "1 Jan 1998".
export function useAwardDate() {
  const { day } = useDates()
  return (award: { awardedOn: string, awardedPrecision?: 'day' | 'year' }) => award.awardedPrecision === 'year' ? award.awardedOn.slice(0, 4) : day(award.awardedOn) // not-policy: the year of a date
}
