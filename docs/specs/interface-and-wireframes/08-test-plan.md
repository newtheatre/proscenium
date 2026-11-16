# 8. Test plan

Twenty-six named cases must never regress. Each is filed under the tier that runs it in workstream 1's harness: unit (pure code), integration (the real runtime and database) or browser (a real browser against a running app).

## Who sees what

| Case | Proves | Tier |
| --- | --- | --- |
| **Audience sees no members' trace** | Signed in as an audience-only account, no page in the public shell contains a members' or console link, label or route in its markup or its loaded data | Browser |
| **One account, both sides** | A member buys a ticket and opens the members' area with one sign-in, and the order appears in the same account's tickets | Browser |
| **Lapsed member reverts** | When entitlement ends, the members' entry disappears and `/members` refuses, while tickets and orders are untouched | Integration |
| **Menu matches guard** | For each seeded role, every entry shown opens, and every entry not shown refuses by its address | Browser |
| **No orphan screens** | A page under a shell prefix with no navigation entry fails the build | Unit |
| **Empty console is impossible** | An account with no console ability is refused at `/console`; it is never shown a sidebar with nothing in it | Browser |
| **Module off means gone** | With a module off, its entries, cards, tabs, search results and addresses are all absent, and come back intact when it is switched on | Integration |
| **Tonight agrees with itself** | Account menu, on-shift bar and landing give the same answer one minute before a shift window opens, inside it, and one minute after it closes | Integration |
| **Override cannot widen** | A navigation override can hide, rename and reorder an entry but no value makes it visible to someone without its ability | Unit |

## Pages behave

| Case | Proves | Tier |
| --- | --- | --- |
| **A list is a link** | Opening a filtered, sorted, paged list's address in a fresh session shows the same rows | Browser |
| **Export equals the filter** | An export contains exactly the rows the filter matches, up to the ceiling, and says so when cut | Integration |
| **Never half a page** | When a page's data route fails, the body shows only the reason and Retry | Browser |
| **Same error both sides** | For each field type, an invalid value gives the same message from the browser and from the server | Unit |
| **Save once** | A double press, and a retry after a dropped answer, create one record | Integration |
| **No silent overwrite** | Two people edit one record; the second save is shown a conflict and nothing is lost | Browser |
| **Typed text survives** | After a refusal, a failure and a conflict, every field still holds what was typed | Browser |
| **Settings page is generated** | A module that declares a setting and writes no page gets a working, validated control with default and reset | Integration |
| **Totals must match** | A money action whose server total differs from the shown total is refused with both figures | Integration |

## Offline and live

| Case | Proves | Tier |
| --- | --- | --- |
| **Scan with no signal** | A door screen opened online admits tickets with the network off, and the server holds every admission after reconnecting | Browser |
| **Replay is harmless** | The same queued act sent three times is applied once | Integration |
| **Two doors, one ticket** | Two devices admit the same ticket offline; after both reconnect there is one admission and one reported duplicate | Integration |
| **Refused is not retried** | An act the server refuses is shown with its reason and is never sent again | Unit |
| **Sign-out warns** | Signing out with unsent acts asks first; confirming clears the device stores | Browser |
| **Stale copy is marked** | A live screen whose device copy is older than its limit says so and will not present it as current | Unit |

## Accessibility and appearance

| Case | Proves | Tier |
| --- | --- | --- |
| **Every page type passes** | Automated WCAG 2.2 AA checks pass on each of the seven page types in each shell, in light and dark, at phone and laptop width | Browser |
| **Any brand colour is readable** | For a set of awkward brand colours (pale yellow, pure red, near-black, near-white), every text and control in every shell meets 4.5:1, and status colours are unchanged | Unit and browser |

## Checked by hand before a release

- The three box-office journeys with a screen reader, and by keyboard alone.
- Door scanning on a real phone in a real foyer, in airplane mode.
- The desk sale by someone who has never used it, timed against the 30-second target.
- Checkout on a slow connection, timed against the two-minute target.
- Every shell at 200% zoom and with reduced motion.

## Design-rule checks in the build

- A string not drawn from a catalogue.
- A browser `confirm`, `alert` or `prompt`.
- A badge with no text, or an icon button with no name.
- A rule that removes the focus outline.
- An expressive-kit class in the members' area or console.
- A request to a third-party host for a font, icon or script.
