// Words for a performance's or a run's wheelchair spaces: "2 wheelchair spaces, each in place of 2 seats".
export function useWheelchairWords() {
  const { t } = useT()
  function numbers(spaces: number, each: number): string {
    if (!spaces) return t('box-office.layouts.choice.no-spaces')
    const counted = t('box-office.layouts.spaces', { count: spaces })
    return each ? t('box-office.layouts.spaces-taking', { spaces: counted, seats: t('box-office.layouts.seats', { count: each }) }) : t('box-office.layouts.spaces-apart', { spaces: counted })
  }
  /** "End-on: 2 wheelchair spaces, …", or the numbers alone where they were typed in. */
  function arrangement(a: { name: string | null, wheelchairSpaces: number, seatsPerSpace: number } | null): string {
    if (!a) return t('box-office.layouts.choice.none')
    const said = numbers(a.wheelchairSpaces, a.seatsPerSpace)
    return a.name ? t('box-office.layouts.choice.named', { name: a.name, numbers: said }) : said
  }
  return { numbers, arrangement }
}
