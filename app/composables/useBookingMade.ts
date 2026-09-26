// What a booking, a claim or a redemption hands the booking page it lands on (issue 1329). Held in
// memory only: a reload or a shared link shows the booking plainly, and no address reaches a URL.
export interface BookingMade {
  emailedTo: string | null
}

export function useBookingMade() {
  return useState<BookingMade | null>('booking-made', () => null)
}
