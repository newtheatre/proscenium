// How a choice setting is drawn (UI-14): a dropdown of its options, searchable once the list is long
// enough that scrolling it is slower than typing. A list of choices is square checkboxes, or a
// searchable multi-select when long. Options from one of the kit's catalogues (kit/catalogues.ts)
// are standard codes, labelled here with the browser's own names in the theatre's language.

/** A list of more options than this gets a search box. */
export const SEARCHABLE_OVER = 10

export const searchable = (options: readonly unknown[]) => options.length > SEARCHABLE_OVER

export type CatalogueName = 'time-zone' | 'currency' | 'country' | 'language'

/** A catalogue value as a person reads it: "Europe/London (GMT+1)", "GBP: British Pound", "United Kingdom", "British English". */
export function catalogueLabel(catalogue: CatalogueName, value: string, language: string, now = new Date()): string {
  try {
    switch (catalogue) {
      case 'time-zone': {
        const offset = new Intl.DateTimeFormat(language, { timeZone: value, timeZoneName: 'shortOffset' }).formatToParts(now).find(p => p.type === 'timeZoneName')?.value
        const place = value.replace(/_/g, ' ')
        return offset ? `${place} (${offset})` : place
      }
      case 'currency': {
        const name = new Intl.DisplayNames([language], { type: 'currency', fallback: 'none' }).of(value)
        return name ? `${value}: ${name}` : value
      }
      case 'country': return new Intl.DisplayNames([language], { type: 'region', fallback: 'code' }).of(value) ?? value
      case 'language': return new Intl.DisplayNames([language], { type: 'language', fallback: 'code' }).of(value) ?? value
    }
  }
  catch {
    return value
  }
}
