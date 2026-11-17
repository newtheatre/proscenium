// The kit's fixed lists of values, for a choice setting that names one (`catalogue: 'time-zone'`)
// instead of listing its own options. Their values are standard codes, so the screen labels them
// with the browser's own names (shared/choices.ts) rather than through the catalogue of strings.

export const CATALOGUES = ['time-zone', 'currency', 'country', 'language'] as const
export type Catalogue = typeof CATALOGUES[number]

/**
 * The languages the site can be written in: the languages every module has a catalogue for.
 * British English is the source language and so far the only one.
 */
export const LANGUAGES = ['en-GB'] as const

// ISO 3166-1 alpha-2, the officially assigned codes.
const COUNTRIES = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ')

const cache = new Map<Catalogue, readonly string[]>()

/** Every value a catalogue allows, in the order the screen lists them. */
export function catalogueValues(catalogue: Catalogue): readonly string[] {
  let values = cache.get(catalogue)
  if (!values) {
    values = build(catalogue)
    cache.set(catalogue, values)
  }
  return values
}

export const isCatalogue = (name: unknown): name is Catalogue => CATALOGUES.includes(name as Catalogue)

function build(catalogue: Catalogue): readonly string[] {
  switch (catalogue) {
    // The runtime's IANA zones; UTC is added where the runtime lists only places.
    case 'time-zone': {
      const zones = Intl.supportedValuesOf('timeZone')
      return zones.includes('UTC') ? zones : [...zones, 'UTC']
    }
    case 'currency': return Intl.supportedValuesOf('currency')
    case 'country': return COUNTRIES
    case 'language': return LANGUAGES
  }
}
