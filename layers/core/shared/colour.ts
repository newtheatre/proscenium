// Colour arithmetic for the brand (C-35): whatever colour a theatre picks, text on it and text in it
// meet 4.5 to 1. Pure functions, so the screen's preview and the server agree.

/** WCAG's minimum for normal text. */
export const MINIMUM_CONTRAST = 4.5

export interface Rgb { r: number, g: number, b: number }
interface Hsl { h: number, s: number, l: number }

export function parseHex(hex: string): Rgb {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) throw new Error(`Not a colour: ${hex}`)
  const n = Number.parseInt(m[1]!, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function toHex({ r, g, b }: Rgb): string {
  const part = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')
  return `#${part(r)}${part(g)}${part(b)}`
}

function channel(v: number): number {
  const c = v / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** Relative luminance, as WCAG defines it. */
export function luminance(hex: string): number {
  const { r, g, b } = parseHex(hex)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number]
  return (x + 0.05) / (y + 0.05)
}

function toHsl({ r, g, b }: Rgb): Hsl {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255]
  const max = Math.max(rr, gg, bb)
  const min = Math.min(rr, gg, bb)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === rr) h = (gg - bb) / d + (gg < bb ? 6 : 0)
  else if (max === gg) h = (bb - rr) / d + 2
  else h = (rr - gg) / d + 4
  return { h: h / 6, s, l }
}

function fromHsl({ h, s, l }: Hsl): Rgb {
  if (s === 0) return { r: l * 255, g: l * 255, b: l * 255 }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hue = (t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return { r: hue(h + 1 / 3) * 255, g: hue(h) * 255, b: hue(h - 1 / 3) * 255 }
}

/**
 * The shade of `hex` nearest to it in lightness that reaches `minimum` against `against`. Keeps
 * hue and saturation, so the theatre's colour stays recognisably theirs.
 */
export function nearestShade(hex: string, against: string, minimum = MINIMUM_CONTRAST): string {
  if (contrast(hex, against) >= minimum) return hex.toLowerCase()
  const hsl = toHsl(parseHex(hex))
  const darker = luminance(against) > 0.5
  for (let step = 1; step <= 100; step++) {
    const l = darker ? hsl.l - step / 100 : hsl.l + step / 100
    if (l < 0 || l > 1) break
    const candidate = toHex(fromHsl({ ...hsl, l }))
    if (contrast(candidate, against) >= minimum) return candidate
  }
  return darker ? '#000000' : '#ffffff'
}

/** White or near-black, whichever reads better on the colour. */
export function textOn(hex: string): string {
  return contrast('#ffffff', hex) >= contrast('#0c0a09', hex) ? '#ffffff' : '#0c0a09'
}

/**
 * A solid fill for buttons: the nearest shade whose own text (white or near-black) reaches the
 * minimum. Starts from the chosen colour, so a dark brand keeps white text and a pale one dark text.
 */
export function solidFill(hex: string): { fill: string, text: string } {
  const text = textOn(hex)
  return { fill: nearestShade(hex, text), text }
}
