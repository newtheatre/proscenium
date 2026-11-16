// What a file really is, judged from its bytes and never from its name or the browser (C-23), and
// how to clean it (C-36): raster images lose their metadata, an SVG keeps only drawing. Pure
// functions over bytes, with no dependencies, so they run in the Worker and in tests alike.

export type FileKind = 'png' | 'jpeg' | 'webp' | 'svg' | 'pdf'
export const MEDIA_TYPES: Record<FileKind, string> = {
  png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', pdf: 'application/pdf',
}

export class Rejected extends Error {
  constructor(readonly reason: string) {
    super(reason)
    this.name = 'Rejected'
  }
}

const startsWith = (b: Uint8Array, bytes: number[], at = 0) => bytes.every((v, i) => b[at + i] === v)
const ascii = (b: Uint8Array, at: number, length: number) => String.fromCharCode(...b.subarray(at, at + length))
const u16be = (b: Uint8Array, at: number) => (b[at]! << 8) | b[at + 1]! // not-policy: byte arithmetic
const u32be = (b: Uint8Array, at: number) => ((b[at]! << 24) >>> 0) + (b[at + 1]! << 16) + (b[at + 2]! << 8) + b[at + 3]! // not-policy: byte arithmetic
const u24le = (b: Uint8Array, at: number) => b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16) // not-policy: byte arithmetic
const u32le = (b: Uint8Array, at: number) => (b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16) | (b[at + 3]! << 24)) >>> 0 // not-policy: byte arithmetic

/** The kind of file, from its first bytes. Undefined when it is none we take. */
export function sniff(bytes: Uint8Array): FileKind | undefined {
  if (startsWith(bytes, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) return 'png' // not-policy: the PNG signature
  if (startsWith(bytes, [0xFF, 0xD8, 0xFF])) return 'jpeg' // not-policy: the JPEG signature
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'webp' // not-policy: the RIFF header
  if (ascii(bytes, 0, 5) === '%PDF-') return 'pdf' // not-policy: the PDF signature
  const head = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, 1024)).replace(/^\uFEFF/, '').trimStart() // not-policy: enough of the start to find the root element
  if (/^(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(head)) return 'svg'
  return undefined
}

export interface Cleaned { bytes: Uint8Array, width: number | null, height: number | null }

/** Cleans a file of the given kind. Throws Rejected with a reason code when it cannot be made safe. */
export function clean(kind: FileKind, bytes: Uint8Array, options: { clean: boolean }): Cleaned {
  switch (kind) {
    case 'png': return options.clean ? cleanPng(bytes) : { bytes, ...pngSize(bytes) }
    case 'jpeg': return options.clean ? cleanJpeg(bytes) : { bytes, ...jpegScan(bytes, false).size }
    case 'webp': return options.clean ? cleanWebp(bytes) : { bytes, ...webpSize(bytes) }
    // An SVG is always cleaned: it is a document that can run code, whatever the slot says.
    case 'svg': return cleanSvg(bytes)
    case 'pdf': return { bytes, width: null, height: null }
  }
}

// PNG: keep every chunk but the textual and time ones, which carry authors, software and dates.
const PNG_DROP = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME'])

function pngSize(b: Uint8Array) {
  if (ascii(b, 12, 4) !== 'IHDR') throw new Rejected('damaged') // not-policy: IHDR's offset
  return { width: u32be(b, 16), height: u32be(b, 20) } // not-policy: IHDR's layout
}

function cleanPng(b: Uint8Array): Cleaned {
  const size = pngSize(b)
  const parts: Uint8Array[] = [b.subarray(0, 8)] // not-policy: the signature's length
  let at = 8 // not-policy: the signature's length
  while (at + 12 <= b.length) { // not-policy: a chunk's fixed overhead
    const length = u32be(b, at)
    const type = ascii(b, at + 4, 4) // not-policy: a chunk's layout
    const end = at + 12 + length // not-policy: a chunk's fixed overhead
    if (end > b.length) throw new Rejected('damaged')
    if (!PNG_DROP.has(type)) parts.push(b.subarray(at, end))
    at = end
    if (type === 'IEND') break
  }
  return { bytes: concat(parts), ...size }
}

// JPEG: keep JFIF (APP0), the colour profile (APP2) and Adobe's colour marker (APP14); drop the
// rest of the application segments (EXIF, XMP, IPTC and makers' notes) and comments.
const JPEG_KEEP_APP = new Set([0xE0, 0xE2, 0xEE]) // not-policy: JPEG marker numbers

function jpegScan(b: Uint8Array, strip: boolean): { parts: Uint8Array[], size: { width: number | null, height: number | null } } {
  const parts: Uint8Array[] = [b.subarray(0, 2)] // not-policy: the SOI marker
  let size: { width: number | null, height: number | null } = { width: null, height: null }
  let at = 2 // not-policy: after SOI
  while (at + 4 <= b.length) { // not-policy: a marker and its length
    if (b[at] !== 0xFF) throw new Rejected('damaged') // not-policy: JPEG marker prefix
    const marker = b[at + 1]!
    if (marker === 0xFF) { // not-policy: fill bytes
      at++
      continue
    }
    const length = u16be(b, at + 2)
    const end = at + 2 + length
    if (end > b.length) throw new Rejected('damaged')
    if (marker >= 0xC0 && marker <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(marker)) { // not-policy: the SOF markers
      size = { height: u16be(b, at + 5), width: u16be(b, at + 7) } // not-policy: SOF's layout
    }
    const isApp = marker >= 0xE0 && marker <= 0xEF // not-policy: APPn markers
    const drop = strip && ((isApp && !JPEG_KEEP_APP.has(marker)) || marker === 0xFE) // not-policy: COM marker
    if (!drop) parts.push(b.subarray(at, end))
    if (marker === 0xDA) { // not-policy: start of scan: the rest is image data
      parts.push(b.subarray(end))
      return { parts, size }
    }
    at = end
  }
  throw new Rejected('damaged')
}

function cleanJpeg(b: Uint8Array): Cleaned {
  const { parts, size } = jpegScan(b, true)
  return { bytes: concat(parts), ...size }
}

// WebP: drop the EXIF and XMP chunks and clear their flags in the extended header.
function webpChunks(b: Uint8Array): { type: string, at: number, end: number, data: Uint8Array }[] {
  const chunks = []
  let at = 12 // not-policy: after the RIFF header
  while (at + 8 <= b.length) { // not-policy: a chunk header
    const type = ascii(b, at, 4) // not-policy: a chunk header
    const length = u32le(b, at + 4) // not-policy: a chunk header
    const dataEnd = at + 8 + length // not-policy: a chunk header
    if (dataEnd > b.length) throw new Rejected('damaged')
    const end = dataEnd + (length % 2) // not-policy: chunks are padded to an even length
    chunks.push({ type, at, end: Math.min(end, b.length), data: b.subarray(at + 8, dataEnd) }) // not-policy: a chunk header
    at = end
  }
  return chunks
}

function webpSize(b: Uint8Array) {
  for (const c of webpChunks(b)) {
    if (c.type === 'VP8X') return { width: u24le(c.data, 4) + 1, height: u24le(c.data, 7) + 1 } // not-policy: VP8X's layout
    if (c.type === 'VP8 ') return { width: u16le(c.data, 6) & 0x3FFF, height: u16le(c.data, 8) & 0x3FFF } // not-policy: VP8's layout
    if (c.type === 'VP8L') {
      const bits = u32le(c.data, 1)
      return { width: (bits & 0x3FFF) + 1, height: ((bits >>> 14) & 0x3FFF) + 1 } // not-policy: VP8L's layout
    }
  }
  throw new Rejected('damaged')
}
const u16le = (b: Uint8Array, at: number) => b[at]! | (b[at + 1]! << 8) // not-policy: byte arithmetic

function cleanWebp(b: Uint8Array): Cleaned {
  const size = webpSize(b)
  const parts: Uint8Array[] = []
  for (const c of webpChunks(b)) {
    if (c.type === 'EXIF' || c.type === 'XMP ') continue
    const chunk = b.slice(c.at, c.end)
    if (c.type === 'VP8X') chunk[8] = chunk[8]! & ~(0x08 | 0x04) // not-policy: the EXIF and XMP flags
    parts.push(chunk)
  }
  const body = concat(parts)
  const out = new Uint8Array(12 + body.length) // not-policy: the RIFF header
  out.set(b.subarray(0, 12)) // not-policy: the RIFF header
  new DataView(out.buffer).setUint32(4, 4 + body.length, true) // not-policy: RIFF size counts 'WEBP' and the chunks
  out.set(body, 12) // not-policy: the RIFF header
  return { bytes: out, ...size }
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

// SVG: an allowlist. Drawing elements stay; editors' metadata goes; anything that could run code,
// fetch something or reach outside the file refuses the whole file, with the reason.
const SVG_ELEMENTS = new Set([
  'svg', 'g', 'defs', 'symbol', 'use', 'title', 'desc', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'text', 'tspan', 'textPath', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'pattern', 'marker', 'style',
  'filter', 'feBlend', 'feColorMatrix', 'feComponentTransfer', 'feComposite', 'feFlood', 'feGaussianBlur', 'feMerge',
  'feMergeNode', 'feMorphology', 'feOffset', 'feFuncA', 'feFuncR', 'feFuncG', 'feFuncB', 'feDropShadow', 'switch',
])
const SVG_DROP_WITH_CONTENT = new Set(['metadata'])
const EDITOR_PREFIXES = ['sodipodi:', 'inkscape:', 'rdf:', 'cc:', 'dc:', 'sketch:', 'serif:', 'i:', 'x:', 'a:', 'graph:']
const DANGEROUS = new Set(['script', 'foreignObject', 'iframe', 'embed', 'object', 'image', 'feImage', 'animate', 'animateMotion', 'animateTransform', 'set', 'a', 'audio', 'video', 'handler', 'listener'])

const TOKEN = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\/\s*([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|[^<]+|</g
const ATTRIBUTE = /([^\s=/>]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16))) // not-policy: hexadecimal
    .replace(/&#(\d+);?/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&colon;/gi, ':').replace(/&tab;/gi, '\t').replace(/&newline;/gi, '\n').replace(/&amp;/gi, '&')
}

/** True when a reference stays inside the file: a fragment such as #gradient. */
const internalRef = (value: string) => /^#[\w.:-]*$/.test(value.trim())

function checkStyle(css: string) {
  const text = decodeEntities(css).replace(/\\/g, '')
  if (/@import|expression\s*\(|javascript:|behaviou?r\s*:|-moz-binding/i.test(text)) throw new Rejected('svg-external-reference')
  for (const [, target] of text.matchAll(/url\(\s*['"]?([^'")]*)/gi)) if (!internalRef(target!)) throw new Rejected('svg-external-reference')
}

export function cleanSvg(bytes: Uint8Array): Cleaned {
  let source: string
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '') }
  catch { throw new Rejected('damaged') }
  const out: string[] = []
  const stack: string[] = []
  let dropping = 0
  let width: number | null = null
  let height: number | null = null
  let sawRoot = false

  for (const match of source.matchAll(TOKEN)) {
    const token = match[0]
    if (token.startsWith('<!--') || token.startsWith('<?')) continue
    if (token.startsWith('<![CDATA[')) {
      if (stack.at(-1) !== 'style') throw new Rejected('svg-unsupported-content')
      checkStyle(token)
      if (!dropping) out.push(token)
      continue
    }
    if (token.startsWith('<!')) throw new Rejected('svg-doctype')
    if (token === '<') throw new Rejected('damaged')
    const closing = match[1]
    const opening = match[2]
    if (closing) {
      const name = closing
      if (stack.pop() !== name) throw new Rejected('damaged')
      if (dropping) {
        dropping--
        continue
      }
      out.push(`</${name}>`)
      continue
    }
    if (opening) {
      const name = opening
      const selfClosing = match[4] === '/' // not-policy: the token's capture groups
      const editor = EDITOR_PREFIXES.some(p => name.startsWith(p))
      if (dropping || editor || SVG_DROP_WITH_CONTENT.has(name)) {
        if (!selfClosing) {
          stack.push(name)
          dropping++
        }
        continue
      }
      if (DANGEROUS.has(name)) throw new Rejected(name === 'script' ? 'svg-script' : 'svg-external-reference')
      if (!SVG_ELEMENTS.has(name)) throw new Rejected('svg-unsupported-content')
      if (name === 'svg' && !sawRoot && stack.length === 0) sawRoot = true
      const kept: string[] = []
      for (const [, attr, raw] of (match[3] ?? '').matchAll(ATTRIBUTE)) { // not-policy: the token's capture groups
        const key = attr!
        const value = raw === undefined ? '' : raw.replace(/^["']|["']$/g, '')
        const lower = key.toLowerCase()
        if (EDITOR_PREFIXES.some(p => lower.startsWith(p)) || (lower.startsWith('xmlns:') && EDITOR_PREFIXES.includes(`${lower.slice(6)}:`))) continue
        if (lower.startsWith('on')) throw new Rejected('svg-script')
        const decoded = decodeEntities(value)
        if (/javascript:|vbscript:|data:/i.test(decoded.replace(/\s/g, ''))) throw new Rejected('svg-external-reference')
        if ((lower === 'href' || lower === 'xlink:href' || lower === 'src') && !internalRef(decoded)) throw new Rejected('svg-external-reference')
        if (lower === 'style') checkStyle(value)
        if (/url\(/i.test(decoded)) checkStyle(decoded)
        kept.push(raw === undefined ? key : `${key}="${value.replace(/"/g, '&quot;')}"`)
        if (name === 'svg' && stack.length === 0) {
          if (lower === 'width') width = pixels(value)
          if (lower === 'height') height = pixels(value)
          if (lower === 'viewbox' && (width === null || height === null)) {
            const box = value.trim().split(/[\s,]+/).map(Number)
            if (box.length === 4 && box.every(Number.isFinite)) { // not-policy: a viewBox has four numbers
              width ??= Math.round(box[2]!) // not-policy: viewBox's layout
              height ??= Math.round(box[3]!) // not-policy: viewBox's layout
            }
          }
        }
      }
      if (name === 'style') {
        const close = source.indexOf('</style>', match.index! + token.length)
        if (close === -1) throw new Rejected('damaged')
        checkStyle(source.slice(match.index! + token.length, close))
      }
      out.push(`<${name}${kept.length ? ` ${kept.join(' ')}` : ''}${selfClosing ? '/' : ''}>`)
      if (!selfClosing) stack.push(name)
      continue
    }
    // Text between elements.
    if (!dropping) {
      if (stack.at(-1) === 'style') checkStyle(token)
      out.push(token)
    }
  }
  if (!sawRoot || stack.length) throw new Rejected('damaged')
  return { bytes: new TextEncoder().encode(out.join('').trim()), width, height }
}

function pixels(value: string): number | null {
  const m = /^\s*([\d.]+)\s*(px)?\s*$/.exec(value)
  return m ? Math.round(Number(m[1])) : null
}
