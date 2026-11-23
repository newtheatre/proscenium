// The brand (C-35): one colour, a tone of grey, a font, a radius and a mode, turned into tokens for
// light and dark that every shell, email and PDF reads. Whatever colour is chosen, the derived link
// and button colours reach 4.5 to 1. Status colours are fixed, so a brand never hides a warning.
import { first, useSetting } from '#kit'
import { fillUnder, nearestShade, solidFill } from '../../shared/colour'
import { BRAND_FONTS, fontFaces, type BrandFontId } from '../../shared/brand-fonts'

const NEUTRALS = {
  slate: ['#f8fafc', '#f1f5f9', '#e2e8f0', '#cbd5e1', '#94a3b8', '#64748b', '#475569', '#334155', '#1e293b', '#0f172a', '#020617'],
  stone: ['#fafaf9', '#f5f5f4', '#e7e5e4', '#d6d3d1', '#a8a29e', '#78716c', '#57534e', '#44403c', '#292524', '#1c1917', '#0c0a09'],
  zinc: ['#fafafa', '#f4f4f5', '#e4e4e7', '#d4d4d8', '#a1a1aa', '#71717a', '#52525b', '#3f3f46', '#27272a', '#18181b', '#09090b'],
  neutral: ['#fafafa', '#f5f5f5', '#e5e5e5', '#d4d4d4', '#a3a3a3', '#737373', '#525252', '#404040', '#262626', '#171717', '#0a0a0a'],
} as const
// Positions in each list above, named as the usual 50 to 950 scale.
const [n50, n100, n200, , n400, , n600, , n800, n900, n950] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const // not-policy: indexes into the scale

const STATUS = {
  light: { success: '#15803d', warning: '#b45309', danger: '#b91c1c', info: '#1d4ed8' },
  dark: { success: '#4ade80', warning: '#fbbf24', danger: '#f87171', info: '#60a5fa' },
}
const RADIUS = { none: '0', small: '0.25rem', medium: '0.5rem', large: '1rem' }

export type Neutral = keyof typeof NEUTRALS
export interface BrandChoice {
  accent: string
  neutral: Neutral
  displayFont: BrandFontId
  bodyFont: BrandFontId
  radius: keyof typeof RADIUS
}
export interface ModeTokens {
  background: string
  surface: string
  border: string
  text: string
  muted: string
  /** The accent as text or a link on the background. */
  link: string
  /** A button's fill and the text on it. */
  solid: string
  onSolid: string
  success: string
  warning: string
  danger: string
  info: string
}
export interface BrandTokens {
  light: ModeTokens
  dark: ModeTokens
  radius: string
  displayFont: string
  /** Null for the device's own: the body keeps the site stylesheet's font. */
  bodyFont: string | null
  /** The @font-face rules for whichever chosen fonts the site serves itself. */
  fontFaces: string
  neutral: readonly string[]
}

/** Pure: the tokens for a choice. The preview and the saved brand both come from here. */
export function tokensFor(choice: BrandChoice): BrandTokens {
  const grey = NEUTRALS[choice.neutral]
  const solid = solidFill(choice.accent)
  const mode = (background: string, surface: string, border: string, text: string, muted: string, status: typeof STATUS.light): ModeTokens => ({
    background, surface, border, text, muted, link: nearestShade(choice.accent, background), solid: solid.fill, onSolid: solid.text, ...status,
  })
  return {
    light: mode('#ffffff', grey[n50], grey[n200], grey[n900], grey[n600], STATUS.light),
    dark: mode(grey[n950], grey[n900], grey[n800], grey[n100], grey[n400], STATUS.dark),
    radius: RADIUS[choice.radius],
    displayFont: BRAND_FONTS[choice.displayFont].stack,
    bodyFont: choice.bodyFont === 'system' ? null : BRAND_FONTS[choice.bodyFont].stack,
    fontFaces: fontFaces([choice.displayFont, choice.bodyFont]),
    neutral: grey,
  }
}

export async function brandChoice(): Promise<BrandChoice> {
  return {
    accent: await useSetting('core.brand.accent') as string,
    neutral: await useSetting('core.brand.neutral') as Neutral,
    displayFont: await useSetting('core.brand.display-font') as BrandFontId,
    bodyFont: await useSetting('core.brand.body-font') as BrandFontId,
    radius: await useSetting('core.brand.radius') as BrandChoice['radius'],
  }
}

export async function brandTokens(): Promise<BrandTokens> {
  return tokensFor(await brandChoice())
}

export interface Logo { url: string, width: number | null, height: number | null, alt: string, mediaType: string }

async function logo(key: 'core.brand.logo' | 'core.brand.logo-dark'): Promise<Logo | null> {
  const id = await useSetting(key) as string | null
  if (!id) return null
  const row = await first<{ id: string, width: number | null, height: number | null, alt_text: string | null, media_type: string }>(
    "SELECT id, width, height, alt_text, media_type FROM core_files WHERE id = ? AND state = 'ready'", id,
  )
  return row ? { url: `/files/${row.id}`, width: row.width, height: row.height, alt: row.alt_text ?? '', mediaType: row.media_type } : null
}

/** Everything a shell, an email or a PDF needs to look like the theatre. Public. */
export async function getBrand() {
  const choice = await brandChoice()
  return {
    revision: await useSetting('core.brand.revision') as number,
    name: await useSetting('core.site.name') as string | null,
    choice,
    tokens: tokensFor(choice),
    /** The tokens as the stylesheet the shells put in the page's head (themeCss). */
    css: themeCss(tokensFor(choice)),
    logo: await logo('core.brand.logo'),
    logoDark: await logo('core.brand.logo-dark'),
    creditLine: await useSetting('core.brand.credit-line') as boolean,
  }
}

function block(t: ModeTokens, grey: readonly string[], inverted: string): string {
  return [
    `--brand-background:${t.background}`, `--brand-surface:${t.surface}`, `--brand-border:${t.border}`,
    `--brand-text:${t.text}`, `--brand-muted:${t.muted}`, `--brand-link:${t.link}`,
    `--brand-solid:${t.solid}`, `--brand-on-solid:${t.onSolid}`,
    `--brand-success:${t.success}`, `--brand-warning:${t.warning}`, `--brand-danger:${t.danger}`, `--brand-info:${t.info}`,
    // Nuxt UI uses its primary both as text on the page and as a fill under its inverted text
    // (white in light mode, the grey at 900 in dark), and a filled button under the pointer is the
    // fill at 90% over the page (app.config.ts). The shade reaches 4.5 to 1 against the inverted
    // text in both states, and so against the page too. Its greys are the brand's.
    `--ui-primary:${fillUnder(t.link, inverted, t.background, HOVER_ALPHA)}`,
    ...SCALE.map((step, i) => `--ui-color-neutral-${step}:${grey[i]}`),
  ].join(';')
}

// The tint of a filled button under the pointer, as app.config.ts draws it.
const HOVER_ALPHA = 0.9 // not-policy: app.config.ts draws the hover tint
const SCALE = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']

/**
 * The stylesheet the shells load: tokens for light on :root and for dark on .dark, the class Nuxt
 * UI's colour mode sets. Which mode a visitor starts in is the interface's (core.appearance.*).
 */
export function themeCss(tokens: BrandTokens): string {
  const shared = `--brand-radius:${tokens.radius};--ui-radius:${tokens.radius};--brand-display-font:${tokens.displayFont}`
  const faces = tokens.fontFaces ? `${tokens.fontFaces}\n` : ''
  // The body font is the public shell's alone, as the heading font is (main.css); the device's own sets nothing.
  const body = tokens.bodyFont ? `body.public-shell{font-family:${tokens.bodyFont}}\n` : ''
  // html:root and html.dark outrank the bundled stylesheet's :root and .dark, whatever the order.
  return `${faces}html:root{${shared};${block(tokens.light, tokens.neutral, '#ffffff')}}\nhtml.dark{${block(tokens.dark, tokens.neutral, tokens.neutral[n900]!)}}\n${body}`
}
