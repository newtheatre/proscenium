# 0004: Money is integer pence in one append-only ledger

- Status: Accepted
- Date: 2026-08-26

## Context

The old estate recorded money well where it recorded it at all, but in per-app tables: ticket
transactions in one place, bar sales in another, pass sales nowhere (a documented defect), and
no single view the treasurer could trust without joins across four databases.

## Decision

One ledger table receives an entry for every monetary fact: ticket collection, refund, bar
sale, tab charge and settlement, comp (zero-value, foregone amount recorded), pass sale.
Entries are integer pence, append-only (trigger-enforced), carry source, actor, references and
the London day, and are never edited: corrections are reversing entries. Every dashboard,
report and export is a query over this table.

## Consequences

- Reconciliation, season statistics and SU exports need no per-module knowledge.
- The migration imports six years of historical money as opening ledger history (module K).
- A module that takes money without posting an entry is a defect by definition; CI carries a
  check that every money-writing path posts.
