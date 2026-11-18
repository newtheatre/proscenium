// How the door names a booking (D9, box office review): the buyer, or for a sale at the desk with no
// name given, "Desk sale, 3 tickets, 19:02", so rows without details can be told apart.

export interface DoorNamed { buyer: string | null, channel?: string, tickets: number, at?: number }

export function useDoorName() {
  const { t } = useT()
  const { time } = useDates()
  return (row: DoorNamed): string => {
    if (row.buyer) return row.buyer
    if (row.channel === 'desk' && row.at) return t('box-office.door.desk-sale', { count: row.tickets, time: time(row.at) })
    return t('box-office.orders.no-buyer')
  }
}
