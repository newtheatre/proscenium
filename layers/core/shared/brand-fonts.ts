// The fonts a brand may choose for headings and body text (C-35). The first three are stacks the
// device already has; the rest the site serves itself from public/fonts, so no page asks another
// site for a font. Each served font is under the SIL Open Font License 1.1, with OFL.txt beside it.

interface Served {
  /** The family the stack names, and the folder and file prefix under public/fonts. */
  family: string
  folder: string
  /** The variable font's weight range, as @font-face writes it. */
  weight: string
}
export interface BrandFont { stack: string, served?: Served }

const served = (family: string, folder: string, weight: string, fallback: string): BrandFont => ({
  stack: `"${family}", ${fallback}`,
  served: { family, folder, weight },
})
const SANS = 'ui-sans-serif, system-ui, sans-serif'

export const BRAND_FONTS = {
  'system': { stack: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  'serif': { stack: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif' },
  'rounded': { stack: 'ui-rounded, "SF Pro Rounded", "Hiragino Maru Gothic ProN", Quicksand, Comfortaa, sans-serif' },
  'bricolage-grotesque': served('Bricolage Grotesque Variable', 'bricolage-grotesque', '200 800', SANS),
  'figtree': served('Figtree Variable', 'figtree', '300 900', SANS),
  'inter': served('Inter Variable', 'inter', '100 900', SANS),
  'fraunces': served('Fraunces Variable', 'fraunces', '100 900', 'Georgia, serif'),
} as const satisfies Record<string, BrandFont>

export type BrandFontId = keyof typeof BRAND_FONTS
export const BRAND_FONT_IDS = Object.keys(BRAND_FONTS) as [BrandFontId, ...BrandFontId[]]

// Fontsource's latin and latin-ext subsets: a browser fetches a file only for characters on the page.
const SUBSETS = {
  'latin': 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  'latin-ext': 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
}

/** The @font-face rules for the served fonts among `ids`; a device font needs none. */
export function fontFaces(ids: readonly BrandFontId[]): string {
  const rules: string[] = []
  for (const id of new Set(ids)) {
    const font: BrandFont = BRAND_FONTS[id]
    if (!font.served) continue
    const { family, folder, weight } = font.served
    for (const [subset, range] of Object.entries(SUBSETS)) {
      rules.push(`@font-face{font-family:"${family}";font-style:normal;font-display:swap;font-weight:${weight};src:url(/fonts/${folder}/${folder}-${subset}-wght-normal.woff2) format("woff2-variations");unicode-range:${range}}`)
    }
  }
  return rules.join('\n')
}
