import { sql } from 'drizzle-orm'
import { isMonthDay } from './london'
import type { AuditRow } from './audit'
import type { AcademicYear, ExpiryPolicy } from './training'
import type { SQL } from 'drizzle-orm'

// Recalculation is the only retroactive path to a stamped expiry (G-124 criterion 1). Every
// statement here scopes by predicate, so nothing binds a parameter per record it covers (0003).

const AWARDED = sql`training_records.awarded_on`

// What the module's policy would stamp on a record awarded that day, computed in SQL so a run of
// any size is one statement. The twin of expiryFor, and tested against it row for row.
export function expirySql(policy: ExpiryPolicy, year: AcademicYear): SQL {
  switch (policy.expiryMode) {
    case 'NONE':
      return sql`null`

    case 'MONTHS': {
      const months = policy.expiryMonths
      if (months === null) throw new TypeError('a months policy carries a number of months')
      // Clamped to the last day of the target month the way addMonths clamps: adding a month to
      // 31 January otherwise lands in March, and the smaller of two civil dates is the clamped one.
      return sql`min(
        date(${AWARDED}, 'start of month', ${`+${months} months`},
             '+' || (cast(strftime('%d', ${AWARDED}) as integer) - 1) || ' days'),
        date(${AWARDED}, 'start of month', ${`+${months + 1} months`}, '-1 day')
      )`
    }

    case 'ACADEMIC_YEAR': {
      if (!isMonthDay(year.boundary)) {
        throw new TypeError('the academic year boundary is a day that exists in every year, written MM-DD')
      }
      // The boundary on or after the award, then rolled again when the award falls inside the
      // carry-over window: a late-summer award is never worth less than a term (G-123 criterion 2).
      const reached = sql`cast(strftime('%Y', ${AWARDED}) as integer)
        + (case when substr(${AWARDED}, 6) > ${year.boundary} then 1 else 0 end)`
      const boundary = sql`printf('%04d-%s', ${reached}, ${year.boundary})`
      return sql`printf('%04d-%s',
        ${reached} + (case when julianday(${boundary}) - julianday(${AWARDED}) <= ${year.carryOverDays}
                      then 1 else 0 end),
        ${year.boundary})`
    }

    // A mode nobody taught this function is refused rather than defaulted, exactly as expiryFor
    // refuses it: a silent default here would restate every record in the module.
    default:
      throw new TypeError(`${policy.expiryMode} is not an expiry mode this system can compute`)
  }
}

// Which records a run may restate: this module's, on the policy rather than an override, neither
// revoked nor superseded, and standing at something other than what the policy says (criterion 4).
export function restatableSql(moduleId: string, policy: ExpiryPolicy, year: AcademicYear): SQL {
  return sql`training_records.module_id = ${moduleId}
    and training_records.revoked_at is null
    and training_records.expiry_overridden = 0
    and ${expirySql(policy, year)} is not training_records.expires_on
    and not exists (
      select 1 from training_records newer
      where newer.user_id = training_records.user_id
        and newer.module_id = training_records.module_id
        and newer.revoked_at is null
        and (newer.awarded_on > training_records.awarded_on
          or (newer.awarded_on = training_records.awarded_on
              and newer.created_at > training_records.created_at)))`
}

export function restatableCount(moduleId: string, policy: ExpiryPolicy, year: AcademicYear): SQL {
  return sql`select count(*) as n from training_records where ${restatableSql(moduleId, policy, year)}`
}

// The preview a confirmation is typed against: person, module, the date standing and the date the
// policy would put there (criterion 2). Ordered so paging through it is stable.
export function previewStatement(
  moduleId: string,
  policy: ExpiryPolicy,
  year: AcademicYear,
  limit: number,
  offset: number,
): SQL {
  return sql`
    select training_records.id as id,
           training_records.user_id as "userId",
           users.name as name,
           training_records.awarded_on as "awardedOn",
           training_records.expires_on as "expiresOn",
           ${expirySql(policy, year)} as becomes
    from training_records
    join users on users.id = training_records.user_id
    where ${restatableSql(moduleId, policy, year)}
    order by users.name, training_records.awarded_on, training_records.id
    limit ${limit} offset ${offset}
  `
}

export interface PreviewRow {
  id: string
  userId: string
  name: string
  awardedOn: string
  expiresOn: string | null
  becomes: string | null
}

export interface Recalculation {
  moduleId: string
  policy: ExpiryPolicy
  year: AcademicYear
  // What the administrator typed back from the preview, checked again here against the count as
  // it stands when the batch runs (criterion 3).
  expectedCount: number
  entry: AuditRow
}

// The two statements a run commits together (criterion 5). The entry goes first and carries the
// count guard; the update rides on the entry existing, so no row moves without one.
export function recalculationStatements(input: Recalculation): SQL[] {
  const restatable = restatableSql(input.moduleId, input.policy, input.year)
  const { entry } = input

  return [
    sql`
      insert into audit_log (id, actor_id, action, target, detail)
      select ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target},
             ${entry.detail === null ? null : JSON.stringify(entry.detail)}
      where (select count(*) from training_records where ${restatable}) = ${input.expectedCount}
    `,
    sql`
      update training_records
      set expires_on = ${expirySql(input.policy, input.year)}
      where ${restatable} and exists (select 1 from audit_log where id = ${entry.id})
    `,
  ]
}
