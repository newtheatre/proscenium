#!/usr/bin/env node
// Enforces ADR-0025: every column referencing users.id is wired into the
// estate hooks, and its erasure and export handling has been thought about.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const SCHEMA_DIR = 'server/db/schema'
const MERGE_FILE = 'server/utils/mergeUser.ts'

// Every users.id reference and what was decided about it. Kinds are `subject`
// and `attribution`; the classification table is ADR-0025.

const REVIEWED = {
  'reservations.userId': { kind: 'subject', note: 'Booking history. Notes scrubbed on erasure; the row survives (ADR-0014).' },
  'passes.userId': { kind: 'subject', note: 'The holder. Pass survives erasure attached to the anonymised mirror row.' },
  'passes.issuedByUserId': { kind: 'attribution', note: 'Which staff member sold it.' },
  'passAdmissions.redeemedByUserId': { kind: 'attribution', note: 'Which staff member admitted them.' },
  'performanceShifts.userId': { kind: 'subject', note: 'Who worked. Survives erasure via the anonymised mirror row; the rota is a record.' },
  'performanceShifts.assignedByUserId': { kind: 'attribution', note: 'Which manager assigned or confirmed it.' },
  'venueEmergencyInfo.updatedByUserId': { kind: 'attribution', note: 'Who last edited the emergency card.' },
  'incidentLog.authorUserId': { kind: 'attribution', note: 'Who wrote the entry. Append-only, so it survives as written.' },
  'backstageNights.lastResetByUserId': { kind: 'attribution', note: 'Who last used the kill switch.' },
  'backstageMessages.senderUserId': { kind: 'attribution', note: 'Which FOH member sent the call. Backstage senders are devices, not users.' },
  'ageChecks.checkedByUserId': { kind: 'attribution', note: 'Who ran the ID check. Append-only, so it survives as written (ADR-0027).' },
  'accessProfiles.userId': { kind: 'subject', note: 'Special category data. DELETED on erasure, not anonymised (ADR-0022).' },
  'accessProfiles.verifiedByUserId': { kind: 'attribution', note: 'Which FOH manager verified it.' },
  'barPrices.createdByUserId': { kind: 'attribution', note: 'Who set the price. The row history is the audit trail.' },
}

/** Columns deliberately not re-pointed by a merge, each with a reason. */
const MERGE_EXCLUSIONS = {}

const REF = /^\s*(\w+)\s*:\s*text\([^)]*\)[^,\n]*\.references\(\(\)\s*=>\s*users\.id/
const TABLE = /^export const (\w+) = sqliteTable\(/

function references() {
  const found = []
  for (const file of readdirSync(SCHEMA_DIR).filter(f => f.endsWith('.ts'))) {
    let table = null
    for (const line of readFileSync(join(SCHEMA_DIR, file), 'utf8').split('\n')) {
      const t = line.match(TABLE)
      if (t) {
        table = t[1]
        continue
      }
      const r = line.match(REF)
      if (r && table) found.push({ key: `${table}.${r[1]}`, file })
    }
  }
  return found
}

const merge = readFileSync(MERGE_FILE, 'utf8')
const problems = []

for (const { key, file } of references()) {
  const decision = REVIEWED[key]
  if (!decision) {
    problems.push(`${file}: ${key} references users.id but is not in REVIEWED in this script.\n`
      + '  Decide whether it is the subject of the row or staff attribution, then wire it into\n'
      + `  ${MERGE_FILE}. See docs/decisions/0025-every-user-reference-joins-the-estate-hooks.md`)
    continue
  }
  if (!merge.includes(`schema.${key}`) && !(key in MERGE_EXCLUSIONS)) {
    problems.push(`${file}: ${key} is not re-pointed by mergeUser.\n`
      + `  An account merge would orphan these rows. Add it to ${MERGE_FILE}, or to\n`
      + '  MERGE_EXCLUSIONS in this script with a reason.')
  }
}

for (const key of Object.keys(REVIEWED)) {
  if (!references().some(r => r.key === key)) {
    problems.push(`${key} is listed in REVIEWED but no longer exists in the schema. Remove it.`)
  }
}

if (problems.length) {
  console.error(`\n${problems.length} user-reference problem(s):\n`)
  for (const p of problems) console.error(`  ${p}\n`)
  process.exit(1)
}

console.log(`check-user-references: ${Object.keys(REVIEWED).length} user references, all wired.`)
