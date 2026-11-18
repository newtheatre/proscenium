// Turns a notification type's wording and the caller's variables into a subject, a plain-text body
// and an HTML body. The wording is a small part of Markdown: paragraphs, line breaks, **bold** and
// [links](...). Every value is escaped; a url variable is the only thing that can become a link.
import { refuse } from '#kit'

export type VariableKind = 'url' | 'sealed' | 'text'

// A sealed value may be a link; it becomes one only if it is a safe address.
const isLink = (kind: VariableKind | undefined) => kind === 'url' || kind === 'sealed'

/** Filled by core, never by the caller. */
export const RESERVED = ['theatre'] as const

const VARIABLE = /\{\{\s*([a-z][a-zA-Z0-9]*)\s*\}\}/g // not-policy: the variable syntax

/** The variable names a piece of wording uses. */
export function variablesIn(wording: string): string[] {
  return [...new Set([...wording.matchAll(VARIABLE)].map(m => m[1]!))]
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

export interface Rendered { subject: string, text: string, html: string }
export interface RenderOptions {
  values: Record<string, string>
  kinds: Record<string, VariableKind>
  /** Brand colour for links and the heading rule, already checked for contrast on white. */
  accent: string
  theatre: string
  footer?: string | null
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
    + `<p style="margin:0 0 16px;font-size:13px;color:#57534e;word-break:break-all">${href}</p>`
}

/** Fills the wording. Plain-text and HTML bodies are built from the same parse, so they agree. */
export function render(wording: { subject: string, body: string, action?: string }, options: RenderOptions): Rendered {
  const values: Record<string, string> = { ...options.values, theatre: options.theatre }
  const plain = (s: string) => s.replace(VARIABLE, (_, name: string) => values[name] ?? '')
  const subject = plain(wording.subject).replace(/[\r\n]+/g, ' ').trim()

  const paragraphs = wording.body.trim().split(/\n\s*\n/)
  const textParts: string[] = []
  const htmlParts: string[] = []
  for (const paragraph of paragraphs) {
    textParts.push(inlineText(paragraph, values))
    const lone = paragraph.match(LONE_LINK)
    const target = lone ? linkTarget(lone[2]!, values) : undefined
    htmlParts.push(lone && target
      ? button(fragment(lone[1]!, values, options), target, options.accent)
      : `<p style="margin:0 0 16px">${inlineHtml(paragraph, values, options)}</p>`)
  }
  if (options.action && isSafeUrl(options.action.url)) {
    const label = plain(options.action.label).trim()
    textParts.push(`${label}: ${options.action.url}`)
    htmlParts.push(button(escapeHtml(label), options.action.url, options.accent))
  }
  if (options.footer) {
    textParts.push(`--\n${options.footer}`)
    htmlParts.push(`<p style="margin:24px 0 0;font-size:13px;color:#57534e">${escapeHtml(options.footer).replace(/\n/g, '<br>')}</p>`)
  }
  const html = [
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>',
    '<body style="margin:0;padding:24px;background:#ffffff;color:#1c1917;font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif">',
    `<div style="max-width:560px;margin:0 auto"><p style="margin:0 0 24px;padding-bottom:12px;border-bottom:3px solid ${options.accent};font-weight:600">${escapeHtml(options.theatre)}</p>`,
    ...htmlParts,
    '</div></body></html>',
  ].join('')
  return { subject, text: `${textParts.join('\n\n')}\n`, html }
}

function linkTarget(raw: string, values: Record<string, string>): string | undefined {
  const variable = raw.trim().match(/^\{\{\s*([a-z][a-zA-Z0-9]*)\s*\}\}$/) // not-policy: the variable syntax
  const target = variable ? values[variable[1]!] : raw.trim()
  return target && isSafeUrl(target) ? target : undefined
}

function inlineText(paragraph: string, values: Record<string, string>): string {
  return paragraph
    .replace(LINK, (_, label: string, raw: string) => {
      const target = linkTarget(raw, values)
      const shown = label.replace(VARIABLE, (__, n: string) => values[n] ?? '')
      return target ? `${shown}: ${target}` : shown
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
    pieces.push(target ? `<a href="${escapeHtml(target)}" style="color:${options.accent};font-weight:600">${label}</a>` : label)
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
      ? `<a href="${escapeHtml(value)}" style="color:${options.accent}">${escapeHtml(value)}</a>`
      : escapeHtml(value))
    last = match.index! + match[0].length
  }
  parts.push(escapeHtml(source.slice(last)))
  return parts.join('').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>')
}
