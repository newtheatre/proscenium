# Accounts: audience and members

One person has one account, and that account shows two clearly separate experiences: an audience one that everybody gets, and a members' one that appears only for members. This answers a known pain point at NNT, where the line between the two is unclear.

## The two rules

1. **An audience member never meets member features.** No member menus, no member questions at sign-up, no member jargon.
2. **A member never manages two accounts.** The account they buy tickets with is the account they volunteer, train and book rooms with.

## How it works

|  | Audience experience | Members' experience |
| --- | --- | --- |
| Who gets it | Everyone, including members | Only people with a current membership, role, shift or production place |
| Where it lives | The public site and a small "My account" area | A separate members' area with its own navigation |
| What it holds | Tickets, orders, passes, gift vouchers, saved details, marketing preferences | Shifts, training, room bookings, productions, notices, member profile |
| Sign-up asks for | Name and email, or nothing at all for guest checkout | Whatever the theatre's joining form asks |
| Tone | A customer of the theatre | A colleague in the theatre |

- **One link joins them.** A member on the public site sees one extra entry, "Members' area". An audience member never sees it.
- **Member benefits follow the person.** A member buying a ticket gets member prices automatically, in the audience flow, without switching anything.
- **Joining upgrades the account.** Someone who has bought tickets for years joins as a member with the same sign-in, and their ticket history stays.
- **Leaving reverts it.** When a membership lapses the members' area disappears and the audience account carries on untouched.

## One person, several addresses

The usual cause of duplicate accounts is two email addresses: a personal one used for tickets and an organisation one used for the society.

- An account holds several verified email addresses and several sign-in methods.
- A theatre can require its own domain's sign-in for the members' area while the same person keeps a personal address for tickets and receipts.
- Each kind of message goes to the address the person chooses for it.
- When someone adds an address that another account already holds, the system offers to merge the two. Staff can merge two accounts in the first release, and a person merging their own two accounts comes later. Matching on names or address patterns is out of scope.

## Separate data, separate consent

- **Audience data and member data are classed apart.** Box-office staff see a customer's orders, not their training record. A training officer sees records, not purchases.
- **Consent is separate.** Agreeing to hear about shows is not agreeing to member notices, and the reverse. Each has its own preferences page.
- **Security scales with what the account can do.** An audience account can sign in by email link. An account with privileged abilities must use a passkey or a second factor for those actions.
- **Erasure is asked once** and covers both sides, with the theatre's retention rules applied to each.

## What this means for the modules

- Box office, passes, donations and the public site work with the audience experience only, and never assume a membership.
- Every other module lives in the members' area or the staff console.
- A theatre with no membership at all (a small venue with paid staff) simply never switches the members' area on.
