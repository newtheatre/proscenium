// The buyer's basket between pages (Box office specification, part 6): its id and the token that
// opens it, kept in this tab only. The token is shown once by the server and never stored there, so
// a closed tab or blocked storage means choosing again, which is safe: the hold simply lapses.
export interface RememberedBasket {
  orderId: string
  token: string
  back: string
  /** What was chosen, so Change tickets can fill Choose tickets in again. */
  choices?: { bandId: string, ticketTypeId: string, quantity: number }[]
  promoCode?: string
}

const KEY = 'box-office:basket'

export function rememberBasket(basket: RememberedBasket): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(basket))
  }
  catch {
    // Storage blocked: the next page says the basket was not found and offers to choose again.
  }
}

export function recallBasket(): RememberedBasket | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) as RememberedBasket : null
    return parsed && typeof parsed.orderId === 'string' && typeof parsed.token === 'string' ? parsed : null
  }
  catch {
    return null
  }
}

export function forgetBasket(): void {
  try {
    sessionStorage.removeItem(KEY)
  }
  catch {
    // Nothing to forget.
  }
}
