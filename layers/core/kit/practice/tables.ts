// The four tables that exist only inside a practice store (Practice mode, part 2), never in D1: made
// after the migration bundle when a store is made, so no migration ever carries them.

/** Their id prefixes, held in the registry's index so no module's table takes one. */
export const PRACTICE_PREFIXES: [string, string][] = [['pss', 'core_practice_session'], ['pob', 'core_practice_outbox'], ['pca', 'core_practice_calls']]

export const PRACTICE_TABLES: readonly string[] = [
  `CREATE TABLE core_practice_session (
    id TEXT PRIMARY KEY NOT NULL,
    account_id TEXT NOT NULL,
    scenario_id TEXT NOT NULL,
    scenario_version INTEGER NOT NULL CHECK (scenario_version >= 1),
    bundle_hash TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    last_active_at INTEGER NOT NULL,
    night_ends_at INTEGER NOT NULL,
    ends_at INTEGER NOT NULL,
    reasserted_at INTEGER,
    results TEXT NOT NULL DEFAULT '{}'
  )`,
  `CREATE TABLE core_practice_outbox (
    id TEXT PRIMARY KEY NOT NULL,
    type_key TEXT NOT NULL,
    channel TEXT NOT NULL CHECK (channel IN ('email', 'inbox', 'push')),
    to_label TEXT NOT NULL CHECK (length(to_label) <= 200),
    subject TEXT CHECK (subject IS NULL OR length(subject) <= 300),
    body_html TEXT,
    body_text TEXT,
    at INTEGER NOT NULL
  )`,
  `CREATE TABLE core_practice_calls (
    id TEXT PRIMARY KEY NOT NULL,
    attempt_id TEXT NOT NULL,
    call TEXT NOT NULL,
    reference TEXT NOT NULL,
    answer TEXT NOT NULL CHECK (answer IN ('succeeded', 'failed', 'unknown', 'waiting')),
    chosen_by TEXT NOT NULL CHECK (chosen_by IN ('scenario', 'trainee', 'default')),
    at INTEGER NOT NULL
  )`,
  'CREATE TRIGGER core_practice_calls_append_only_update BEFORE UPDATE ON core_practice_calls BEGIN SELECT RAISE(ABORT, \'append-only: core_practice_calls\'); END',
  `CREATE TABLE core_practice_task_results (
    task_id TEXT PRIMARY KEY NOT NULL,
    passed_at INTEGER NOT NULL
  )`,
]
