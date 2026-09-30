import { saysMoney } from './bar'

// The words for an act refused because it is the officer's own, each naming who does it instead.
// The rule itself rides the write (0116); these only say why that write changed nothing.

export const OWN_TAB_VOID = 'Nobody voids a charge on their own tab: someone else holding the Front of House Manager\'s or the IT Manager\'s role voids it'

export const OWN_BOOKING_REFUND = 'Nobody refunds a booking in their own name: someone else holding the Front of House Manager\'s or the IT Manager\'s role refunds it at the desk'

export const OWN_ACCESS_DECISION = 'Nobody decides their own access requirements: someone else holding the Secretary and Welfare Officer\'s or the IT Manager\'s role decides them'

export function ownTabCapOverride(holderName: string, outstandingPence: number, chargePence: number, capPence: number): string {
  return `${holderName}'s tab is at ${saysMoney(outstandingPence)}; this charge of ${saysMoney(chargePence)} `
    + `would take it past the ${saysMoney(capPence)} cap. Nothing has been charged: nobody overrides the cap on their own tab, `
    + 'so tonight\'s duty manager or someone else holding the Front of House Manager\'s role puts it through.'
}
