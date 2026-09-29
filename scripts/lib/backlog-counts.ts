// The backlog index's counting rule, stated beside its table in docs/backlog/README.md. Pure, so
// `check docs` and its tests read the same rule.

export interface PhaseCounts {
  mvp: number
  v2: number
  later: number
  resolved: number
  total: number
}

export interface ModuleCount {
  counts: PhaseCounts
  resolved: string[]
  problems: string[]
}

const COLUMNS = [
  ['mvp', 'MVP'],
  ['v2', 'V2'],
  ['later', 'Later'],
  ['resolved', 'Resolved'],
  ['total', 'Total'],
] as const

const PHASES: Record<string, 'mvp' | 'v2' | 'later'> = { MVP: 'mvp', V2: 'v2', Later: 'later' }

const empty = (): PhaseCounts => ({ mvp: 0, v2: 0, later: 0, resolved: 0, total: 0 })

export function countModule(source: string): ModuleCount {
  const counts = empty()
  const resolved: string[] = []
  const problems: string[] = []
  const stories = source.split(/^(?=## )/m).filter(block => /^## [A-Z]-\d{3}:/.test(block))

  for (const block of stories) {
    const id = block.slice(3, 8)
    const phase = block.match(/^- Phase:\s*([^\s,]+)/m)?.[1]
    counts.total += 1
    if (!phase) problems.push(`${id} has no Phase line`)
    else if (phase === 'Resolved') {
      counts.resolved += 1
      resolved.push(id)
    }
    else if (PHASES[phase]) counts[PHASES[phase]] += 1
    else problems.push(`${id} phase "${phase}" is not MVP, V2, Later or Resolved`)
  }
  return { counts, resolved, problems }
}

function cells(line: string): string[] {
  return line.split('|').slice(1, -1).map(cell => cell.replace(/[`*]/g, '').trim())
}

function compare(label: string, table: PhaseCounts, files: PhaseCounts, holder: string): string[] {
  return COLUMNS
    .filter(([key]) => table[key] !== files[key])
    .map(([key, name]) => `${label} ${name}: the table says ${table[key]}, ${holder} ${files[key]}`)
}

// An unreadable figure reads as NaN, which equals nothing, so it fails rather than passing as zero.
function rowCounts(row: string[], header: string[]): PhaseCounts {
  const counts = empty()
  for (const [key, name] of COLUMNS) counts[key] = Number(row[header.indexOf(name)] || Number.NaN)
  return counts
}

export function backlogProblems(readme: string, modules: Record<string, string>): string[] {
  const problems: string[] = []
  const lines = readme.split('\n')
  const header = cells(lines.find(line => /^\|\s*File\s*\|/.test(line)) ?? '')
  for (const [, name] of COLUMNS) {
    if (!header.includes(name)) problems.push(`the table has no ${name} column`)
  }
  if (problems.length) return problems

  const rows = new Map<string, PhaseCounts>()
  let total: PhaseCounts | null = null
  for (const line of lines.filter(line => line.startsWith('|'))) {
    const row = cells(line)
    if (/^[A-Z]-[\w-]+\.md$/.test(row[0] ?? '')) rows.set(row[0]!, rowCounts(row, header))
    else if (row[0] === 'Total') total = rowCounts(row, header)
  }

  const sum = empty()
  const files = Object.keys(modules).sort()
  for (const file of files) {
    const counted = countModule(modules[file]!)
    for (const [key] of COLUMNS) sum[key] += counted.counts[key]
    problems.push(...counted.problems.map(problem => `${file} ${problem}`))
    for (const id of counted.resolved) {
      if (!new RegExp(`\\b${id}\\b`).test(readme)) problems.push(`${id} is resolved in ${file} but the index does not name it`)
    }
    const row = rows.get(file)
    if (row) problems.push(...compare(file, row, counted.counts, 'the file holds'))
    else problems.push(`${file} has no row in the table`)
  }
  for (const file of rows.keys()) {
    if (!(file in modules)) problems.push(`${file} has a row but no module file`)
  }

  if (total) problems.push(...compare('Total', total, sum, 'the files hold'))
  else problems.push('the table has no Total row')

  const opening = readme.match(/^(\d+) stories across (\d+) modules/m)
  if (opening && Number(opening[1]) !== sum.total) problems.push(`the opening count says ${opening[1]} stories, the files hold ${sum.total}`)
  if (opening && Number(opening[2]) !== files.length) problems.push(`the opening count says ${opening[2]} modules, there are ${files.length} module files`)
  return problems
}
