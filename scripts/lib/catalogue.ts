// The subcommittee's draft catalogue, read from data/catalogue.csv. Ported from the training app
// so the two describe the same 57 modules; an unparseable cell is a hard failure naming the cell.

export interface ParsedModule {
  id: string
  department: string
  kind: 'MODULE' | 'CERTIFICATION' | 'BRIEF'
  name: string
  description: string | null
  notes: string | null
  materialsUrl: string | null
  expiryMode: 'NONE' | 'MONTHS' | 'ACADEMIC_YEAR'
  expiryMonths: number | null
  safetyCritical: boolean
  signoffRequired: boolean
  grantsSupervisor: boolean
  grantsTrainer: boolean
  status: 'DRAFT' | 'ACTIVE' | 'RETIRED'
  sort: number
  prerequisites: string[]
}

// The DEPT half of the DEPT-LCT id scheme, so the departments live in code and the modules in the
// spreadsheet the subcommittee actually edits.
export const DEPARTMENTS = [
  { code: 'NNT', name: 'Whole Theatre', sort: 1 },
  { code: 'SFTY', name: 'Safety', sort: 2 },
  { code: 'TECH', name: 'Technical', sort: 3 },
  { code: 'STGE', name: 'Stage, Set and Workshop', sort: 4 },
  { code: 'MGMT', name: 'Stage Management', sort: 5 },
  { code: 'COST', name: 'Costume', sort: 6 },
  { code: 'PROD', name: 'Producing', sort: 7 },
  { code: 'ADMN', name: 'Administration and Front of House', sort: 8 },
  { code: 'LEAD', name: 'Leadership and Training', sort: 9 },
] as const

export class CatalogueParseError extends Error {
  constructor(source: string, line: number, id: string, column: string, detail: string) {
    super(`${source} line ${line}${id ? ` (${id})` : ''}, column "${column}": ${detail}`)
    this.name = 'CatalogueParseError'
  }
}

// Minimal RFC 4180 reader: quoted fields, escaped quotes, embedded newlines.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  // Strip a UTF-8 BOM: Excel and Google Sheets both like to add one.
  if (text.charCodeAt(0) === 0xFEFF) i = 1

  for (; i < text.length; i++) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        }
        else {
          inQuotes = false
        }
      }
      else {
        field += char
      }
      continue
    }

    if (char === '"') inQuotes = true
    else if (char === ',') {
      row.push(field)
      field = ''
    }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    }
    else field += char
  }

  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows
}

function splitIds(cell: string): string[] {
  return cell
    .split(/[,;\n]/)
    .map(part => part.trim())
    .filter(part => part.length > 0 && !/^(n\/?a|none|-)$/i.test(part))
}

const EXPIRY_NEVER = /^(never|no|none|n\/?a|-)$/i
const EXPIRY_ACADEMIC = /^academic[ -]?year$/i
const EXPIRY_MONTHS = /^(\d+)\s*months?$/i
const EXPIRY_YEARS = /^(\d+)\s*years?$/i
const EXPIRY_EXTERNAL = /^external([ -]cert(ificate)?([ -]date)?)?$/i
const EXPIRY_BRIEF = /^brief(\s*\(recurring\))?$/i

interface ExpiryResult {
  expiryMode: ParsedModule['expiryMode']
  expiryMonths: number | null
  isBrief: boolean
}

// "External cert date" is NONE: the module imposes no lifetime because each external record
// carries the certificate's own (G-121 criterion 3).
export function parseExpiry(raw: string): ExpiryResult | null {
  const value = raw.trim()
  if (value === '' || EXPIRY_NEVER.test(value)) return { expiryMode: 'NONE', expiryMonths: null, isBrief: false }
  if (EXPIRY_ACADEMIC.test(value)) return { expiryMode: 'ACADEMIC_YEAR', expiryMonths: null, isBrief: false }
  if (EXPIRY_BRIEF.test(value)) return { expiryMode: 'NONE', expiryMonths: null, isBrief: true }
  if (EXPIRY_EXTERNAL.test(value)) return { expiryMode: 'NONE', expiryMonths: null, isBrief: false }

  const months = value.match(EXPIRY_MONTHS)
  if (months) {
    const count = Number(months[1])
    return count > 0 ? { expiryMode: 'MONTHS', expiryMonths: count, isBrief: false } : null
  }
  const years = value.match(EXPIRY_YEARS)
  if (years) {
    const count = Number(years[1])
    return count > 0 ? { expiryMode: 'MONTHS', expiryMonths: count * 12, isBrief: false } : null
  }
  return null
}

// A certification prefix is the subcommittee's shorthand and need not match a department code:
// the column names the department.
const MODULE_ID = /^[A-Z]{2,4}-([0-9]{3}|CERT)$/
const REQUIRED_COLUMNS = ['Department', 'ID', 'Name']

export function parseCatalogue(text: string, source = 'catalogue.csv'): ParsedModule[] {
  const rows = parseCsv(text).filter(row => row.some(cell => cell.trim() !== ''))
  if (rows.length === 0) throw new Error(`${source}: file is empty`)

  const header = rows[0]!.map(name => name.trim())
  const index = new Map(header.map((name, at) => [name.toLowerCase(), at]))

  for (const required of REQUIRED_COLUMNS) {
    if (!index.has(required.toLowerCase())) {
      throw new Error(`${source}: missing required column "${required}" (found: ${header.join(', ')})`)
    }
  }

  const cell = (row: string[], column: string): string => {
    const at = index.get(column.toLowerCase())
    return at === undefined ? '' : (row[at] ?? '').trim()
  }

  const modules: ParsedModule[] = []
  const seen = new Set<string>()

  rows.slice(1).forEach((row, offset) => {
    // One for the header and one for counting from one, so the number matches what the
    // spreadsheet and a text editor both show.
    const line = offset + 2
    const id = cell(row, 'ID').toUpperCase()
    if (id === '') return

    if (!MODULE_ID.test(id)) {
      throw new CatalogueParseError(source, line, id, 'ID', `"${id}" is not a DEPT-LCT or DEPT-CERT id`)
    }
    if (seen.has(id)) throw new CatalogueParseError(source, line, id, 'ID', 'duplicate id')
    seen.add(id)

    const isCertification = id.endsWith('-CERT')
    const department = cell(row, 'Department').toUpperCase()
    if (department === '') throw new CatalogueParseError(source, line, id, 'Department', 'is empty')
    if (!isCertification && !id.startsWith(`${department}-`)) {
      throw new CatalogueParseError(source, line, id, 'Department', `"${department}" does not match the id prefix`)
    }

    const name = cell(row, 'Name')
    if (name === '') throw new CatalogueParseError(source, line, id, 'Name', 'is empty')

    const expiryRaw = cell(row, 'Proposed Expiry')
    const expiry = parseExpiry(expiryRaw)
    if (!expiry) {
      throw new CatalogueParseError(
        source, line, id, 'Proposed Expiry',
        `unrecognised value "${expiryRaw}" (expected Never, Academic year, N months, External cert date, or Brief (recurring))`,
      )
    }

    const statusRaw = cell(row, 'Status') || 'DRAFT'
    const status = statusRaw.toUpperCase()
    if (status !== 'DRAFT' && status !== 'ACTIVE' && status !== 'RETIRED') {
      throw new CatalogueParseError(source, line, id, 'Status', `unrecognised value "${statusRaw}"`)
    }

    const materialsUrl = cell(row, 'Materials Link')
    if (materialsUrl !== '' && !/^https:\/\//i.test(materialsUrl)) {
      throw new CatalogueParseError(source, line, id, 'Materials Link', `"${materialsUrl}" is not an https:// URL`)
    }

    const grantsRaw = cell(row, 'Grants').toLowerCase()
    const grantsSupervisor = grantsRaw.includes('supervisor')
    const grantsTrainer = grantsRaw.includes('trainer')
    if (grantsRaw !== '' && !grantsSupervisor && !grantsTrainer) {
      throw new CatalogueParseError(source, line, id, 'Grants', `unrecognised value "${grantsRaw}" (expected supervisor and/or trainer)`)
    }

    const safetyRaw = cell(row, 'Safety Critical').toLowerCase()
    if (safetyRaw !== '' && !/^(yes|no|true|false|y|n|1|0)$/.test(safetyRaw)) {
      throw new CatalogueParseError(source, line, id, 'Safety Critical', `unrecognised value "${safetyRaw}" (expected yes or no)`)
    }

    const kind = isCertification ? 'CERTIFICATION' : expiry.isBrief ? 'BRIEF' : 'MODULE'
    if (kind !== 'CERTIFICATION' && (grantsSupervisor || grantsTrainer)) {
      throw new CatalogueParseError(source, line, id, 'Grants', 'only a certification confers standing')
    }

    const brief = kind === 'BRIEF'
    modules.push({
      id,
      department,
      kind,
      name,
      description: cell(row, 'Description') || null,
      notes: cell(row, 'Notes') || null,
      materialsUrl: materialsUrl || null,
      // A brief carries no lifetime, so the table's CHECK and this agree before the insert.
      expiryMode: brief ? 'NONE' : expiry.expiryMode,
      expiryMonths: brief ? null : expiry.expiryMonths,
      safetyCritical: /^(yes|true|y|1)$/.test(safetyRaw),
      signoffRequired: isCertification,
      grantsSupervisor: isCertification && grantsSupervisor,
      grantsTrainer: isCertification && grantsTrainer,
      status: status as ParsedModule['status'],
      sort: modules.length,
      prerequisites: splitIds(cell(row, 'Prerequisites')).map(need => need.toUpperCase()),
    })
  })

  // A dangling reference would otherwise fail at insert with a far less helpful message.
  const ids = new Set(modules.map(module => module.id))
  for (const module of modules) {
    for (const need of module.prerequisites) {
      if (!ids.has(need)) throw new Error(`${source}: ${module.id} lists unknown prerequisite "${need}"`)
      if (need === module.id) throw new Error(`${source}: ${module.id} lists itself as a prerequisite`)
    }
  }

  return modules
}

export async function readCatalogue(path = 'data/catalogue.csv'): Promise<ParsedModule[]> {
  return parseCatalogue(await Bun.file(path).text(), path)
}
