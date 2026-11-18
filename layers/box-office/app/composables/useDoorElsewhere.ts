// What the door says about a ticket or booking for another performance (D1, box office review): the
// show, the date and the time on it, so the steward has something to tell the customer, and
// "earlier tonight" or "later tonight" when it is the same day as the performance at this door.

export interface DoorElsewhere { id: string, title: string, label: string | null, startsAt: number, venue: string }

export function useDoorElsewhere() {
  const { t } = useT()
  const { day, dayNamed, time } = useDates()
  /** The line under "Wrong performance": `here` is when the performance at this door starts. */
  return (there: DoorElsewhere | undefined, here: number | undefined): string => {
    if (!there) return t('box-office.door.scan.result.wrong_performance')
    const show = [there.title, there.label].filter(Boolean).join(', ')
    if (here !== undefined && day(there.startsAt) === day(here))
      return t(there.startsAt < here ? 'box-office.door.elsewhere.earlier' : 'box-office.door.elsewhere.later', { show, time: time(there.startsAt) })
    return t('box-office.door.elsewhere.other-day', { show, day: dayNamed(there.startsAt), time: time(there.startsAt) })
  }
}
