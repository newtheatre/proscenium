# 12. Decision: the emailed link signs in without a press, in the browser that asked

22 Nov 2026 · @Matthew Adcock

Status: accepted. Approved by Matt on 21 November 2026 with the rest of the account review ("I want all of these."). It amends rule 4 of "Signing in by email" in [part 3](04-states-and-rules.md) and leaves question 7 of [part 9](10-questions-for-matt.md) as answered: one email, a link and a code.

## The problem

Since the first release the link landing has waited for a press. Mail security scanners (Microsoft 365's among them) open every link in a real browser before the person sees the email, so a link used on load would be spent by the scanner, and its code with it. The press fixed that, at a price everybody pays: the commonest sign-in, on one device, is "type address, open email, press the link, press Sign in". The last press tells the person nothing and protects them from nothing, because the browser in front of them is the one that asked.

## The decision

The landing page signs the person in on arrival when, and only when, the browser opening the link is the browser that asked for it. Everywhere else it behaves exactly as before and waits for the press.

"The browser that asked" is already a fact the server holds. Asking for a sign-in email sets the cookie `__Host-proscenium-browser`, and the token row keeps a digest of its value (`browser_hash`). That is what makes the six-digit code work only where it was asked for. The same proof now decides whether the press is needed. No new cookie, column or setting is introduced.

### The cookie

| Property | Value | Why |
| --- | --- | --- |
| Name | `__Host-proscenium-browser` | The `__Host-` prefix: the browser accepts it only over HTTPS, for this host alone, path `/`, with no `Domain`, so a sibling host cannot plant or overwrite it |
| `HttpOnly` | Yes | Script on the page cannot read it, so it cannot be copied out by an injected script |
| `Secure` | Yes | Never sent in clear |
| `SameSite` | `Lax` | Sent when the person follows the link from their mail (a top-level navigation) and on the page's own request; never on a request another site makes in the background |
| Lifetime | `core.sign-in.link-lifetime` (15 minutes by default) | It outlives no link it could vouch for |
| Value | 43 random characters, nothing about the person | The server stores only a digest of it, on the token row |

### The request

1. The link carries its token in the fragment, as before, so the token reaches no server log and no `Referer`.
2. Once the landing page is running it posts the token to `/api/core/sign-in/link` with `here: true`. This is a same-origin request from the page's own script; the browser attaches the cookie.
3. The server signs the person in if all of these hold: the cookie is present; a token with that digest exists; its purpose is `sign_in`; it is unused and unexpired; it carries a `browser_hash`; and the digest of the cookie equals it, compared in constant time. The link is then spent by the same conditional write as a pressed link, so two requests racing for one link still produce one session.
4. In every other case the server answers `{ "press": true }` with status 200, writes nothing and spends nothing. The page shows the Sign in button as it always has, and the press sends the ordinary request, with the ordinary refusals.

The answer in step 4 is the same whether the link is unknown, spent, lapsed, for another purpose, or simply opened somewhere else. A request with `here` therefore learns nothing a press would not also tell it, and learns less: it is never told why.

## Who still gets the press

| Who opens the link | What happens | Why |
| --- | --- | --- |
| The person, in the browser they asked from | Signed in on arrival | The cookie matches the token |
| A mail scanner | The page loads, asks, is told to wait for a press; nothing is spent | A scanner's browser has never held the cookie. This is the case the press was introduced for, and the browser test `opening an emailed link in a browser that did not ask spends nothing until Sign in is pressed` holds it |
| The person on another device, or in another browser or a private window | The press, then signed in | No cookie there. The link still "works in any browser", as rule 4 says |
| The person after the cookie has lapsed or been cleared | The press | As above |
| Anyone opening an invitation, a claim link, a staff-issued enrolment link or an "apply for the access scheme" invitation | The press | Those rows have no `browser_hash`, and the purpose check refuses them before the cookie is looked at. Nobody asked for them from a browser, so no browser can vouch for them |
| The landings for confirming an address and confirming an erasure | The press | Unchanged. Each does something the person should mean to do, and neither is a sign-in |

## What was considered and why it is safe

- **A scanner spends the link.** It cannot: with no cookie the server does not even look the token up before answering.
- **Somebody else's link, opened here.** An attacker who asks for a link to their own address and sends it to a victim gains nothing new: the victim's browser never asked, so it gets the press, as today. To get past that the attacker would need the victim's browser to make the asking request, which is a change made from another site and is refused by the origin check every changing request passes; `SameSite=Lax` keeps the cookie off such a request as well.
- **Somebody else's cookie.** The cookie cannot be read by script (`HttpOnly`), set by another host (`__Host-`), or guessed (43 random characters, digest stored). Holding the cookie without the link signs nobody in, and holding the link without the cookie is the press, as before.
- **A link forwarded or leaked.** Exactly as strong as before: whoever holds an unused, unexpired link can press it. The cookie only removes a press; it never adds a way in.
- **Probing.** The `here` request is rate-limited with the rest of the endpoint and answers identically for every failure, so it is a worse oracle than the press.
- **A preview in the same browser.** A mail page that opens a full, script-running preview of the link in the browser that asked would sign that browser in. That is the person's own browser being signed in to the person's own account, which is what they asked for; the tab they left on the code form can be closed or reloaded.
- **Assurance is unchanged.** A link is still the weakest proof. It opens nothing privileged, and staff are still sent to add a passkey.

## Consequences

- One press fewer in the commonest sign-in. The code form the person left open in the first tab is still there; a later revision may have it notice the sign-in.
- The cookie's stated purpose on the cookies page stays true: it remembers which browser asked.
- Part 3 rule 4, the link landing row of part 5, and the test plan's `opening a link uses nothing` row are amended in the same change.
- Integration tests: `opened in the browser that asked, the link signs in with no press`, `opened anywhere else, the link spends nothing until it is pressed: a scanner cannot use it`, `with no press, an unknown, used or lapsed link says only to press, as any other does`.
