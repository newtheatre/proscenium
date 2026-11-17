// Checks that a screen is built from the kit (docs/kit/interface.md) and not by hand: the patterns the
// two Nuxt UI reviews removed, so they do not come back with the next module.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, rel } from '../lib/paths.ts'
import type { Loaded } from '../lib/load.ts'
import { walk } from './source.ts'

/** The kit's own components may use what they wrap. */
const RAW_FORM = ['SettingsSections.vue', 'PageList.vue', 'ConfirmItsYouDialog.vue']
const HAND_LIST = ['RecordList.vue']
const DATE_TEXT = ['useDates.ts']
const ICON_BUTTON = ['IconButton.vue']
/** Controls app.config.ts already makes as wide as their field. */
const CONTROLS = ['UInput', 'USelect', 'USelectMenu', 'UTextarea', 'UInputNumber', 'UInputTags', 'UInputDate', 'UInputTime', 'FieldDate', 'FieldDateRange', 'FieldDateTime', 'FieldMoney']

/** The problems in one file's source, each with its line (from 1). `name` is the file's own name. */
export function interfaceProblems(name: string, source: string): { line: number, problem: string }[] {
  const problems: { line: number, problem: string }[] = []
  const lines = source.split('\n')
  let tag = ''
  lines.forEach((text, i) => {
    const line = i + 1
    const opened = /<([A-Za-z][\w-]*)/.exec(text)
    if (opened && !/^\s*<\//.test(text)) tag = opened[1]!
    if (/<form(\s|>|$)/.test(text) && !RAW_FORM.includes(name)) problems.push({ line, problem: 'a raw <form>; use UForm (or PageForm), so the form validates with its schema and shows each message beside its field' })
    const classes = /\bclass="([^"]*)"/.exec(text)?.[1]?.split(/\s+/) ?? []
    if (classes.includes('w-full') && CONTROLS.includes(tag)) problems.push({ line, problem: `w-full on ${tag}; form controls already fill their field (app.config.ts). Pass a width only to make one narrower` })
    if (classes.includes('divide-y') && classes.includes('border') && classes.some(c => c.startsWith('rounded')) && !HAND_LIST.includes(name)) problems.push({ line, problem: 'a hand-built bordered list; use RecordList and RecordListItem' })
    if (/type="(date|datetime-local|time)"|'datetime-local'/.test(text)) problems.push({ line, problem: 'a native date or time input; use FieldDate, FieldDateRange, FieldDateTime or UInputTime, which follow the theatre\'s language and time zone' })
    if (/new Intl\.DateTimeFormat\(|\.toLocale(Date|Time)String\(/.test(text) && !DATE_TEXT.includes(name)) problems.push({ line, problem: 'formats a date by hand; use useDates(), so every screen agrees on language and time zone' })
  })
  // A whole tag, since its attributes sit on lines of their own.
  // The browser's own checks show a bubble of their own, in the browser's words, away from the field.
  // A form leaves checking to its schema, which puts the message beside the field, as the server says it.
  for (const match of source.matchAll(/<(UForm|form)\b((?:[^>"]|"[^"]*")*)>/g)) {
    const [, tag, attrs] = match
    if (tag === 'form' && !RAW_FORM.includes(name)) continue // already refused as a raw form
    if (/(^|\s)nested(\s|=|$)/.test(attrs!) || /(^|\s)novalidate(\s|=|$)/.test(attrs!)) continue
    problems.push({ line: source.slice(0, match.index).split('\n').length, problem: `a ${tag} without novalidate; the browser would check it with a bubble of its own. Add novalidate and check with a schema (:schema), so the message shows beside its field` })
  }
  for (const match of source.matchAll(/<(U[A-Z]\w*|input|textarea|select)\b((?:[^>"]|"[^"]*")*)>/g)) {
    const [, tag, attrs] = match
    if (tag === 'UFormField' || !/(^|\s)required(\s|=|\/|$)/.test(attrs!)) continue
    problems.push({ line: source.slice(0, match.index).split('\n').length, problem: `a native required on ${tag}; say it in the form's schema, so the message shows beside the field (UFormField's own required only draws the mark)` })
  }
  if (!ICON_BUTTON.includes(name)) {
    for (const match of source.matchAll(/<UButton\b((?:[^>"]|"[^"]*")*?)\/>/g)) {
      const attrs = match[1]!
      if (/(^|\s):?icon=/.test(attrs) && /(^|\s):?aria-label=/.test(attrs) && !/(^|\s):?label=/.test(attrs)) {
        problems.push({ line: source.slice(0, match.index).split('\n').length, problem: 'an icon-only UButton; use IconButton (or RowActions for an ellipsis menu), whose one label is both the accessible name and a tooltip' })
      }
    }
  }
  return problems.sort((x, y) => x.line - y.line)
}

export function checkInterface(modules: Loaded[]): string[] {
  const out: string[] = []
  for (const m of modules) {
    const app = join(ROOT, m.found.root, 'app')
    if (!existsSync(app)) continue
    for (const file of walk(app)) {
      for (const p of interfaceProblems(file.split('/').pop()!, readFileSync(file, 'utf8'))) out.push(`${rel(file)}:${p.line}: ${p.problem}`)
    }
  }
  return out
}
