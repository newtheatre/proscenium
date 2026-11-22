// Turns a notification type's wording and the caller's variables into a subject, a plain-text body
// and an HTML body. The wording is a small part of Markdown: paragraphs, line breaks, **bold**,
// [links](...) and `{{ qr name }}`. Every value is escaped; a url variable is the only thing that can become a link.
import { encode } from 'uqr'
import { refuse } from '#kit'

export type VariableKind = 'url' | 'sealed' | 'text'

// A sealed value may be a link; it becomes one only if it is a safe address.
const isLink = (kind: VariableKind | undefined) => kind === 'url' || kind === 'sealed'

/** Filled by core, never by the caller. */
export const RESERVED = ['theatre'] as const

const VARIABLE = /\{\{\s*([a-z][a-zA-Z0-9]*)\s*\}\}/g // not-policy: the variable syntax

// A paragraph of only `{{ qr name }}` draws that variable as a QR code in the HTML part, and is left out of the text.
const QR_PARAGRAPH = /^\s*\{\{\s*qr\s+([a-z][a-zA-Z0-9]*)\s*\}\}\s*$/ // not-policy: the QR syntax

/** The variable names a piece of wording uses. */
export function variablesIn(wording: string): string[] {
  const drawn = wording.split(/\n\s*\n/).map(p => p.match(QR_PARAGRAPH)?.[1]).filter((n): n is string => !!n)
  return [...new Set([...[...wording.matchAll(VARIABLE)].map(m => m[1]!), ...drawn])]
}

/** A url variable must be https, except on this machine while developing. */
export function isSafeUrl(value: string): boolean {
  let url: URL
  try { url = new URL(value) }
  catch { return false }
  if (url.protocol === 'https:') return true
  return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
}

/**
 * Checks the caller's variables against the type's declaration: every declared variable given, none
 * other, each a string, each url safe. The refusal names the variable, never its value.
 */
export function checkVariables(declared: Record<string, VariableKind>, given: Record<string, unknown>): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const name of Object.keys(declared)) {
    const value = given[name]
    if (typeof value !== 'string' || value === '') fields[name] = 'required'
    else if (declared[name] === 'url' && !isSafeUrl(value)) fields[name] = 'must be an https address'
  }
  for (const name of Object.keys(given)) if (!(name in declared)) fields[name] = (RESERVED as readonly string[]).includes(name) ? 'is filled by core' : 'is not declared by this type'
  if (Object.keys(fields).length) refuse('core.notifications.bad-variables', 'The message cannot be written with these variables.', { status: 422, fields })
  return given as Record<string, string>
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') // not-policy: HTML entities

const QR_PX = 180 // not-policy: how wide a QR code is drawn, in pixels, whatever its version

// Drawn as table cells, not an image, so it shows when a mail client blocks images; black on white
// with a quiet border of four. The first row fixes each column's width; the rest join runs of a colour.
function qrTable(value: string, label = 'QR code'): string {
  const { size, data } = encode(value, { border: 4, ecc: 'L' }) // not-policy: the quiet border a QR code needs; low correction keeps a ticket's long code small
  const px = Math.max(2, Math.floor(QR_PX / size)) // not-policy: no module narrower than two pixels
  const widths = `<tr>${Array.from({ length: size }, () => `<td width=${px} height=${px}></td>`).join('')}</tr>`
  const rows = data.slice(1).map((row) => {
    const runs: string[] = []
    for (let x = 0; x < row.length;) {
      let n = 1
      while (x + n < row.length && row[x + n] === row[x]) n++
      runs.push(`<td${n > 1 ? ` colspan=${n}` : ''}${row[x] ? ' bgcolor=#000' : ''}${x === 0 ? ` height=${px}` : ''}></td>`)
      x += n
    }
    return `<tr>${runs.join('')}</tr>`
  })
  return `<table role="img" aria-label="${label}" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="border-collapse:collapse;margin:0 0 16px;background:#ffffff;font-size:0;line-height:0">${widths}${rows.join('')}</table>`
}

/**
 * The QR codes a `{{ qr name }}` value draws: one for each line, and a line `caption<TAB>code` has
 * its caption written above its code. A blank value draws nothing.
 */
function qrBlock(value: string): string {
  return value.split('\n').map(line => line.split('\t')).filter(parts => parts.at(-1)!.trim()).map(parts => parts.length > 1
    ? `<p style="margin:0 0 8px;font-weight:600">${escapeHtml(parts[0]!)}</p>${qrTable(parts[1]!.trim(), `QR code: ${escapeHtml(parts[0]!)}`)}`
    : qrTable(parts[0]!.trim())).join('')
}

export interface Rendered {
  subject: string
  text: string
  html: string
  /** The message for the inbox, where it is read beside a link of its own: a link reads as its words, with no address written out. */
  inbox: string
}
export interface RenderOptions {
  values: Record<string, string>
  kinds: Record<string, VariableKind>
  /** Brand colour for links and the heading rule, already checked for contrast on white. */
  accent: string
  theatre: string
  footer?: string | null
  /** The language the wording is in, for screen readers. */
  lang?: string
  /** Colours for a reader whose mail client is in dark mode; left out, the message stays light. */
  dark?: { background: string, text: string, muted: string, link: string }
  /**
   * The button that takes the reader to what the message is about: the type's `link`, made
   * absolute. Left out when the wording already has a link of its own.
   */
  action?: { label: string, url: string } | null
}

// [label](target): the target is a variable or a literal https address.
const LINK = /\[([^\]]+)\]\(([^)]+)\)/g

/** A type's link with its variables filled in, or nothing if it would leave the app. */
export function linkPath(template: string | undefined, values: Record<string, string>): string | null {
  if (!template) return null
  const path = template.replace(VARIABLE, (_, name: string) => encodeURIComponent(values[name] ?? ''))
  return path.startsWith('/') && !path.startsWith('//') ? path : null
}

/** A paragraph that is nothing but one link becomes a button. */
const LONE_LINK = /^\s*\[([^\]]+)\]\(([^)]+)\)\s*$/

/** Whether the wording links anywhere, so a button from the type's link would repeat it. */
export function hasLink(body: string, values: Record<string, string>, kinds: Record<string, VariableKind>): boolean {
  for (const match of body.matchAll(LINK)) if (linkTarget(match[2]!, values)) return true
  for (const match of body.matchAll(VARIABLE)) if (isLink(kinds[match[1]!]) && isSafeUrl(values[match[1]!] ?? '')) return true
  return false
}

// A table-built button, the shape mail clients render most reliably, with the address underneath
// as plain text for clients that strip buttons or for copying by hand.
function button(label: string, target: string, accent: string): string {
  const href = escapeHtml(target)
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 8px"><tr><td style="border-radius:6px;background:${accent}">`
    + `<a href="${href}" style="display:inline-block;padding:12px 20px;border-radius:6px;color:#ffffff;font-weight:600;text-decoration:none">${label}</a></td></tr></table>`
    + `<p class="muted" style="margin:0 0 16px;font-size:13px;color:#57534e;word-break:break-all">${href}</p>`
}

/** Fills the wording. Plain-text and HTML bodies are built from the same parse, so they agree. */
export function render(wording: { subject: string, body: string, action?: string }, options: RenderOptions): Rendered {
  const values: Record<string, string> = { ...options.values, theatre: options.theatre }
  const plain = (s: string) => s.replace(VARIABLE, (_, name: string) => values[name] ?? '')
  const subject = plain(wording.subject).replace(/[\r\n]+/g, ' ').trim()

  const paragraphs = wording.body.trim().split(/\n\s*\n/)
  const textParts: string[] = []
  const inboxParts: string[] = []
  const htmlParts: string[] = []
  for (const paragraph of paragraphs) {
    const drawn = paragraph.match(QR_PARAGRAPH)
    if (drawn) {
      htmlParts.push(qrBlock(values[drawn[1]!] ?? ''))
      continue
    }
    textParts.push(inlineText(paragraph, values))
    inboxParts.push(inlineText(paragraph, values, false))
    const lone = paragraph.match(LONE_LINK)
    const target = lone ? linkTarget(lone[2]!, values) : undefined
    const items = listItems(paragraph, values)
    htmlParts.push(lone && target
      ? button(fragment(lone[1]!, values, options), target, options.accent)
      : items
        ? `<ul style="margin:0 0 16px;padding-left:24px">${items.map(item => `<li style="margin:0 0 4px">${escapeHtml(item)}</li>`).join('')}</ul>`
        : `<p style="margin:0 0 16px">${inlineHtml(paragraph, values, options)}</p>`)
  }
  if (options.action && isSafeUrl(options.action.url)) {
    const label = plain(options.action.label).trim()
    textParts.push(`${label}: ${options.action.url}`)
    htmlParts.push(button(escapeHtml(label), options.action.url, options.accent))
  }
  if (options.footer) {
    textParts.push(`-- \n${options.footer}`)
    htmlParts.push(`<p class="muted" style="margin:24px 0 0;font-size:13px;color:#57534e">${escapeHtml(options.footer).replace(/\n/g, '<br>')}</p>`)
  }
  const lang = escapeHtml(options.lang ?? 'en-GB')
  const html = [
    `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">`,
    `<meta name="color-scheme" content="${options.dark ? 'light dark' : 'light'}"><meta name="supported-color-schemes" content="${options.dark ? 'light dark' : 'light'}"><title>${escapeHtml(subject)}</title>${darkStyle(options)}</head>`,
    '<body class="body" style="margin:0;padding:24px;background:#ffffff;color:#1c1917;font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif">',
    `<div role="article" aria-roledescription="email" aria-label="${escapeHtml(subject)}" lang="${lang}" style="max-width:560px;margin:0 auto"><p style="margin:0 0 24px;padding-bottom:12px;border-bottom:3px solid ${options.accent};font-weight:600">${escapeHtml(options.theatre)}</p>`,
    ...htmlParts,
    '</div></body></html>',
  ].join('')
  return { subject, text: `${textParts.join('\n\n')}\n`, html, inbox: inboxParts.join('\n\n') }
}

// A paragraph that is one variable whose every line starts with a bullet is drawn as a list.
const BULLET = /^\s*•\s+/ // not-policy: the bullet a caller writes
const LONE_VARIABLE = /^\s*\{\{\s*([a-z][a-zA-Z0-9]*)\s*\}\}\s*$/ // not-policy: the variable syntax

function listItems(paragraph: string, values: Record<string, string>): string[] | null {
  const name = paragraph.match(LONE_VARIABLE)?.[1]
  const lines = name ? (values[name] ?? '').split('\n').filter(line => line.trim()) : []
  return lines.length && lines.every(line => BULLET.test(line)) ? lines.map(line => line.replace(BULLET, '')) : null
}

// Clients that honour prefers-color-scheme repaint the page; the rest keep the light inline colours.
// A QR code keeps its white ground and a button its fill, so both stay readable either way.
function darkStyle(options: RenderOptions): string {
  const d = options.dark
  if (!d) return ''
  return `<style>@media (prefers-color-scheme: dark){.body{background:${d.background}!important;color:${d.text}!important}.muted{color:${d.muted}!important}a.link{color:${d.link}!important}}</style>`
}

function linkTarget(raw: string, values: Record<string, string>): string | undefined {
  const variable = raw.trim().match(/^\{\{\s*([a-z][a-zA-Z0-9]*)\s*\}\}$/) // not-policy: the variable syntax
  const target = variable ? values[variable[1]!] : raw.trim()
  return target && isSafeUrl(target) ? target : undefined
}

function inlineText(paragraph: string, values: Record<string, string>, addresses = true): string {
  return paragraph
    .replace(LINK, (_, label: string, raw: string) => {
      const target = linkTarget(raw, values)
      const shown = label.replace(VARIABLE, (__, n: string) => values[n] ?? '')
      return target && addresses ? `${shown}: ${target}` : shown
    })
    .replace(VARIABLE, (_, name: string) => values[name] ?? '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
}

function inlineHtml(paragraph: string, values: Record<string, string>, options: RenderOptions): string {
  const pieces: string[] = []
  let last = 0
  for (const match of paragraph.matchAll(LINK)) {
    pieces.push(fragment(paragraph.slice(last, match.index), values, options))
    const target = linkTarget(match[2]!, values)
    const label = fragment(match[1]!, values, options)
    pieces.push(target ? `<a class="link" href="${escapeHtml(target)}" style="color:${options.accent};font-weight:600">${label}</a>` : label)
    last = match.index! + match[0].length
  }
  pieces.push(fragment(paragraph.slice(last), values, options))
  return pieces.join('')
}

function fragment(source: string, values: Record<string, string>, options: RenderOptions): string {
  const parts: string[] = []
  let last = 0
  for (const match of source.matchAll(VARIABLE)) {
    parts.push(escapeHtml(source.slice(last, match.index)))
    const name = match[1]!
    const value = values[name] ?? ''
    parts.push(isLink(options.kinds[name]) && isSafeUrl(value)
      ? `<a class="link" href="${escapeHtml(value)}" style="color:${options.accent}">${escapeHtml(value)}</a>`
      : escapeHtml(value))
    last = match.index! + match[0].length
  }
  parts.push(escapeHtml(source.slice(last)))
  return parts.join('').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>')
}
