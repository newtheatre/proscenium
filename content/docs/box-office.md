---
title: Box office
description: Running the desk, the programme and season reporting.
module: Ticketing
updatedOn: 2026-09-10
updatedBy: The seed and tooling stream
---

## The desk

`/box-office/desk` finds a booking by reference, a QR scan or a name search, scoped to today's
performance with previous and next either side. Collection is the payment boundary: before it a
booking is editable, after it changes are refunds, never both. The desk always sends the total it
believes the booking costs; if that disagrees with what the server computes, collection is
refused and both figures are shown, because a human is about to type the smaller one into the
SumUp reader.

**The theatre takes no cash and no online payment.** Every collection is CARD on the physical
reader or COMP, recorded after the fact, never initiated from here.

## The programme

`/box-office/ticket-types`, `/box-office/shows` and `/box-office/pass-types` are the standing
configuration: what a seat is sold as, what it costs, and what a pass covers. None of this is
operational, so none of it derives from tonight's shift; holding it needs the `ticketing.write`
or `ticketing.manage` permission, granted like any other standing role.

## Access and companion tickets

`/box-office/access-profiles` is where a declared access profile is verified, one screen gated on
`access.verify` rather than any box office permission. General box office cannot see the
declaration itself: only whether it is verified, and the door wording that follows from it.

## Season reporting

`/admin/tickets/export` (`ticketing.export`) downloads one row per seat: reference, performance,
type, price, source, and whether it was collected and refunded. It is filtered by show,
performance, a date range, or a season (1 August to 31 July, taken from the `SEASON_START` and
`SEASON_END` settings), and by source. It refuses outright past 20,000 rows rather than sending a
silently short file: narrow the filter and ask again. Nothing it carries can re-identify an
erased booker, so it stays usable after someone has closed their account.
