import { z } from 'zod'
import { isMonthDay } from './london'

// The catalogue's vocabulary and its expiry arithmetic. Nothing here stores a state: a record's
// validity is derived from its dates every time it is read, never written to a column (0018).

export const MODULE_KINDS = ['MODULE', 'CERTIFICATION', 'BRIEF'] as const
export const DELIVERY_MODES = ['IN_PERSON', 'SELF_DIRECTED', 'HYBRID'] as const
export const EXPIRY_MODES = ['NONE', 'MONTHS', 'ACADEMIC_YEAR'] as const
export const MODULE_LIFECYCLE = ['DRAFT', 'ACTIVE', 'RETIRED'] as const

export type ModuleKind = (typeof MODULE_KINDS)[number]
export type DeliveryMode = (typeof DELIVERY_MODES)[number]
export type ExpiryMode = (typeof EXPIRY_MODES)[number]
export type ModuleLifecycle = (typeof MODULE_LIFECYCLE)[number]

// The longest lifetime any policy may stamp on a record (G-123 criterion 4).
export const MAX_EXPIRY_MONTHS = 120

// A published id is quoted by members and printed on paper, so it is the key itself and is
// immutable once created (G-107 criterion 1).
export const MODULE_ID = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*$/
export const DEPARTMENT_CODE = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*$/

export const MODULE_MATERIALS_LIMIT = 20

export function saysKind(kind: string): string {
  if (kind === 'CERTIFICATION') return 'Certification'
  if (kind === 'BRIEF') return 'Brief'
  return 'Module'
}

export function saysDeliveryMode(mode: string): string {
  if (mode === 'SELF_DIRECTED') return 'Self-directed'
  if (mode === 'HYBRID') return 'Hybrid'
  return 'In person'
}

export function saysLifecycle(status: string): string {
  if (status === 'ACTIVE') return 'Active'
  if (status === 'RETIRED') return 'Retired'
  return 'Draft'
}

export interface ExpiryPolicy {
  expiryMode: ExpiryMode
  expiryMonths: number | null
}

export function describeExpiry(policy: ExpiryPolicy): string {
  if (policy.expiryMode === 'MONTHS') return `${policy.expiryMonths} months from award`
  if (policy.expiryMode === 'ACADEMIC_YEAR') return 'Ends with the academic year'
  return 'Never expires'
}

// A civil date is a London day, so its arithmetic is the calendar's and never an instant's (0014).
const CIVIL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

function partsOf(date: string): [number, number, number] {
  const match = CIVIL_DATE.exec(date)
  if (!match) throw new TypeError('a training date is a London civil date, written YYYY-MM-DD')
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function civilDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function daysBetween(from: string, to: string): number {
  const [fromYear, fromMonth, fromDay] = partsOf(from)
  const [toYear, toMonth, toDay] = partsOf(to)
  const span = Date.UTC(toYear, toMonth - 1, toDay) - Date.UTC(fromYear, fromMonth - 1, fromDay)
  return Math.round(span / 86_400_000)
}

// The last day of the target month when the award's day does not exist in it, so a policy can
// never stamp a date that is not a day.
export function addMonths(date: string, months: number): string {
  const [year, month, day] = partsOf(date)
  const moved = (year * 12) + (month - 1) + months
  const targetYear = Math.floor(moved / 12)
  const targetMonth = (moved % 12) + 1
  return civilDate(targetYear, targetMonth, Math.min(day, daysInMonth(targetYear, targetMonth)))
}

export interface AcademicYear {
  boundary: string
  carryOverDays: number
}

// The boundary on or after the award, rolled on a year when the award falls inside the carry-over
// window: a late-summer award is never worth less than a term (G-123 criterion 2).
export function academicYearEnd(awardedOn: string, year: AcademicYear): string {
  if (!isMonthDay(year.boundary)) {
    throw new TypeError('the academic year boundary is a day that exists in every year, written MM-DD')
  }
  const [awardYear] = partsOf(awardedOn)
  let ends = `${String(awardYear).padStart(4, '0')}-${year.boundary}`
  if (ends < awardedOn) ends = `${String(awardYear + 1).padStart(4, '0')}-${year.boundary}`
  if (daysBetween(awardedOn, ends) <= year.carryOverDays) {
    ends = `${String(partsOf(ends)[0] + 1).padStart(4, '0')}-${year.boundary}`
  }
  return ends
}

// What a record earned today would expire on. Stamped at award and never recomputed by a later
// policy change; G-124's previewed recalculation is the only retroactive path (G-123 criterion 3).
export function expiryFor(policy: ExpiryPolicy, awardedOn: string, year: AcademicYear): string | null {
  switch (policy.expiryMode) {
    case 'NONE': return null
    case 'ACADEMIC_YEAR': return academicYearEnd(awardedOn, year)
    case 'MONTHS':
      if (policy.expiryMonths === null) throw new TypeError('a months policy carries a number of months')
      return addMonths(awardedOn, policy.expiryMonths)
    // A mode nobody taught this function is refused rather than defaulted: the next mode added
    // would otherwise stamp an academic year onto every record silently (G-123 criterion 3).
    default: throw new TypeError(`${policy.expiryMode} is not an expiry mode this system can compute`)
  }
}

// The cap is a lifetime rather than a policy number, so an explicit expiry has to fit it too.
export function exceedsExpiryCap(awardedOn: string, expiresOn: string): boolean {
  return expiresOn > addMonths(awardedOn, MAX_EXPIRY_MONTHS)
}

export const RECORD_SOURCES = ['SESSION', 'SIGNOFF', 'EXTERNAL', 'SELF', 'LEGACY'] as const
export const RECORD_STATES = ['VALID', 'EXPIRING', 'EXPIRED'] as const

export type RecordSource = (typeof RECORD_SOURCES)[number]
export type RecordState = (typeof RECORD_STATES)[number]

// Worked out from the dates every time it is asked for, never stored (0018, G-101 criterion 1).
// A record expires on its expiry date: on the day itself it no longer counts (criterion 2).
export function stateOf(expiresOn: string | null, today: string, warningDays: number): RecordState {
  if (expiresOn === null) return 'VALID'
  if (today >= expiresOn) return 'EXPIRED'
  return daysBetween(today, expiresOn) <= warningDays ? 'EXPIRING' : 'VALID'
}

// Expiring counts as held at every gate, so an ability never flickers off before its date
// (G-101 criterion 3, G-108 criterion 5, G-120 criterion 2).
export function countsAsHeld(state: RecordState): boolean {
  return state !== 'EXPIRED'
}

export function saysState(state: RecordState): string {
  if (state === 'EXPIRING') return 'Expiring'
  if (state === 'EXPIRED') return 'Expired'
  return 'Valid'
}

export interface HeldRecord {
  id: string
  moduleId: string
  awardedOn: string
  createdAt: number
}

// A renewal is a newer record rather than an edit, so which one is current is derived too
// (G-120 criterion 6). Ties break on createdAt, because an award date is a day, not an instant.
export function supersededIn(records: HeldRecord[]): Set<string> {
  const newest = new Map<string, HeldRecord>()
  for (const record of records) {
    const held = newest.get(record.moduleId)
    const later = !held
      || record.awardedOn > held.awardedOn
      || (record.awardedOn === held.awardedOn && record.createdAt > held.createdAt)
    if (later) newest.set(record.moduleId, record)
  }

  const current = new Set([...newest.values()].map(record => record.id))
  return new Set(records.filter(record => !current.has(record.id)).map(record => record.id))
}

export interface LeadAssignment {
  department: string
  expiresAt: number | null
}

// Read at every leads-only surface rather than swept, so an assignment that lapsed overnight
// confers nothing on the next request (G-110 criteria 3 and 4).
export function isLeadLive(lead: LeadAssignment, now: Date): boolean {
  return lead.expiresAt === null || lead.expiresAt * 1000 > now.getTime()
}

export function leadsDepartment(leads: LeadAssignment[], department: string, now: Date): boolean {
  return leads.some(lead => lead.department === department && isLeadLive(lead, now))
}

// Blank is no answer rather than an empty answer, the way a profile field is.
const text = (max: number) => z.string().trim().max(max).nullish()
  .transform(value => (value ?? '').trim() || null)

// A link is followed by a member, so a scheme that executes rather than navigates is refused.
const link = z.string().trim().max(500).refine(
  value => /^https?:\/\//i.test(value) && URL.canParse(value),
  'A material link is an http or https address',
)

export const materialForm = z.object({
  label: z.string().trim().min(1).max(120),
  url: link,
})

export type MaterialInput = z.output<typeof materialForm>

export const departmentForm = z.object({
  name: z.string().trim().min(1).max(120),
  description: text(2000),
  isActive: z.boolean().default(true),
  sort: z.number().int().nonnegative().max(9999).default(0),
})

export type DepartmentInput = z.output<typeof departmentForm>

export const newDepartmentForm = departmentForm.extend({
  code: z.string().trim().regex(DEPARTMENT_CODE, 'A department code is uppercase letters, digits and hyphens').max(40),
})

const moduleFields = z.object({
  department: z.string().trim().min(1).max(40),
  kind: z.enum(MODULE_KINDS),
  name: z.string().trim().min(1).max(160),
  description: text(2000),
  notes: text(2000),
  deliveryMode: z.enum(DELIVERY_MODES).default('IN_PERSON'),
  expiryMode: z.enum(EXPIRY_MODES).default('NONE'),
  expiryMonths: z.number().int().positive().max(MAX_EXPIRY_MONTHS).nullish().transform(value => value ?? null),
  allowsExternal: z.boolean().default(false),
  externalEvidence: text(500),
  safetyCritical: z.boolean().default(false),
  signoffRequired: z.boolean().default(false),
  grantsTrainer: z.boolean().default(false),
  grantsSupervisor: z.boolean().default(false),
  selfRegistrable: z.boolean().default(false),
  status: z.enum(MODULE_LIFECYCLE).default('DRAFT'),
  sort: z.number().int().nonnegative().max(9999).default(0),
  // Absent means leave the links alone. A default of none would let an edit that never mentions
  // them delete every one, which is the shape of an accident rather than of an instruction.
  materials: z.array(materialForm).max(MODULE_MATERIALS_LIMIT).optional(),
})

type ModuleFields = z.output<typeof moduleFields>

// Each refusal is an acceptance criterion, and each is checked here as well as by the database:
// the form is what names the field, and the constraint is what makes it a guarantee.
function refuseImpossibleModules(input: ModuleFields, context: z.RefinementCtx): void {
  if (input.safetyCritical && input.deliveryMode === 'SELF_DIRECTED') {
    context.addIssue({
      code: 'custom',
      path: ['deliveryMode'],
      message: 'A safety-critical module cannot be delivered fully self-directed',
    })
  }
  if ((input.expiryMode === 'MONTHS') !== (input.expiryMonths !== null)) {
    context.addIssue({
      code: 'custom',
      path: ['expiryMonths'],
      message: 'A months policy carries a number of months, and nothing else does',
    })
  }
  if (input.kind !== 'BRIEF') {
    if (input.selfRegistrable) {
      context.addIssue({
        code: 'custom',
        path: ['selfRegistrable'],
        message: 'Only a brief can be self-registrable',
      })
    }
    return
  }
  if (input.expiryMode !== 'NONE') {
    context.addIssue({
      code: 'custom',
      path: ['expiryMode'],
      message: 'A brief carries no expiry policy',
    })
  }
  if (input.grantsTrainer || input.grantsSupervisor) {
    context.addIssue({
      code: 'custom',
      path: ['kind'],
      message: 'A brief cannot grant trainer or supervisor standing',
    })
  }
}

export const moduleForm = moduleFields.superRefine(refuseImpossibleModules)

export type ModuleInput = z.output<typeof moduleForm>

export const newModuleForm = moduleFields.extend({
  id: z.string().trim().regex(MODULE_ID, 'A module id is uppercase letters, digits and hyphens').max(32),
}).superRefine(refuseImpossibleModules)

export const leadForm = z.object({
  userId: z.string().trim().min(1).max(64),
  // Blank takes the next handover; an explicit null is a permanent assignment (G-110 criterion 3).
  expiresAt: z.number().int().positive().nullish(),
})

export type LeadInput = z.output<typeof leadForm>
