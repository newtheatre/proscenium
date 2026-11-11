# 0260: A pass may be held on a guest record, and the browser that opened it remembers it

- Status: Proposed
- Date: 2026-11-11
- Amends: D-133 criterion 3, D-134 criterion 2, D-135 criterion 1, 0138 (a guest record at the till)

## Context

On 21 October 2026 the IT Manager decided that using or asking for a pass always needs an
account, and 0138 refused a guest record at the till on that basis. In practice that meant a
first-time visitor buying a season pass at the first show had to stop, register on their phone
and confirm an email before the reader could be used. On 11 November 2026 the IT Manager
reversed it: a pass should work without an account, kept in the browser and sent by email.

A guest booking already works without an account. `guestAccount(email, name)` makes or reuses a
guest record keyed by the address (0071), and registering on that address later sends a claim
link (0153), so everything held on the record comes with the account. Nothing new is needed to
identify a guest; what is missing is a way for a guest's own browser to prove it holds a pass
when it books.

## Decision

1. **A pass may be issued to a guest record.** The desk takes a name and an email for a new
   buyer as well as a person picked by search; the till takes the email and, where no account
   holds it, a name. An address nobody holds becomes a guest record exactly as a guest booking
   makes one. At the till the record is written in the sale's own batch, gated on its ledger
   entry, so a refused charge leaves nothing behind. An address that belongs to an anonymised or
   disabled account is still refused.
2. **The browser that opens the pass remembers it.** Opening the pass link from the email sets
   one httpOnly cookie (`nnt-passes`) holding the signed tokens of up to four passes, newest first,
   until the latest of their validity ends (capped at 400 days, the browser maximum). It replaces
   the 60-minute `nnt-pass-token`. The token is the credential the email already carries; the
   reference alone never is (D-108 criterion 4). It lives in a cookie, not localStorage, so no
   page script can read it.
3. **A remembered pass books like a signed-in holder's.** The booking page offers "Use my pass"
   for a pass in the cookie that covers the performance, and `/api/passes/{id}/redeem` accepts the
   cookie as proof of holding that pass, as well as the holder's own session. The booking and its
   email go to the pass's record, never to whoever is signed in.
4. **A guest on a new device asks for the email again.** `/passes` offers "Email me my pass": an
   address in, every live pass on it re-sent, rate-limited by address and by IP, and the same answer
   whether or not anything was found, so the form tells nobody who holds a pass.
5. **A browser can forget.** The pass page offers "Forget passes on this device", which clears the
   cookie; signing out and closing an account still clear it, as they cleared the old one.

## Consequences

- The friction 0138 accepted as the price of the account rule is gone: a buyer at the till gives
  an email and, if they are new, a name.
- A guest typing an address that belongs to somebody else puts the pass on that person's record,
  the same exposure a guest booking already has (0170). Nothing is charged online, so the cost is a
  pass somebody paid for at the reader landing on the wrong record, for the desk to sort out.
- The cookie outlives a session. On a shared computer the holder uses "Forget"; anybody else on
  that browser could book a seat on the pass, which they could also do by opening the email.
- Pass requests (D-124 criterion 3) still need an account until choosing a pass while booking
  replaces them.
