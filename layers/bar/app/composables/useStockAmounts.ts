// Stock amounts as people say them. Quantities are kept in base units (each, ml or g); people count in
// a count unit (a bottle of 700 ml, a pint, a keg) and take deliveries in packs. An amount names the
// count unit, with the base units as fine print: "3.46 bottles (2,425 ml)". Numbers are in the
// theatre's language, so the server and the browser write them alike.
export type StockUnit = 'each' | 'ml' | 'g'
export interface Measured { baseUnit: StockUnit, countUnitSize: number, packSize?: number, packName?: string }
/** A unit someone may type an amount in: how many base units one of it is, and its name. */
export interface EntryUnit { value: 'count' | 'pack' | 'base', size: number, label: string }

// Sizes with a name of their own. Any other size in ml is a bottle of that size.
const NAMED: Record<StockUnit, Record<number, string>> = {
  ml: { 568: 'pint', 284: 'half-pint', 1000: 'litre' }, // not-policy: an imperial pint, a half and a litre in ml
  g: { 1000: 'kg' }, // not-policy: a kilogram in grams
  each: {},
}

/** An English plural of a name typed in Admin ("keg", "case", "box"): the catalogue cannot hold these. */
function pluralOf(noun: string): string {
  if (/(s|x|z|ch|sh)$/i.test(noun)) return `${noun}es`
  if (/[^aeiou]y$/i.test(noun)) return `${noun.slice(0, -1)}ies`
  return `${noun}s`
}

export function useStockAmounts() {
  const { t } = useT()
  const { language } = useDates()

  const number = (n: number, digits = 2) => new Intl.NumberFormat(language.value, { maximumFractionDigits: digits }).format(n)
  const unitLabel = (u: StockUnit) => t(`bar.screens.stock.units.${u}`)
  const base = (i: Measured, quantity: number) => `${number(quantity, 0)} ${unitLabel(i.baseUnit)}`

  /** The word for the unit people count in, for this many: "bottle", "pints", "kegs". */
  function countWord(i: Measured, count: number): string {
    if (i.countUnitSize === 1) return unitLabel(i.baseUnit)
    if (i.packName && i.countUnitSize === i.packSize) return count === 1 ? i.packName : pluralOf(i.packName)
    const named = NAMED[i.baseUnit][i.countUnitSize] ?? (i.baseUnit === 'ml' ? 'bottle' : null)
    if (named) return t(`bar.screens.stock.count-units.${named}`, { count })
    return t('bar.screens.stock.count-units.of-size', { count, size: number(i.countUnitSize, 0), unit: unitLabel(i.baseUnit) })
  }
  /** "3.46 bottles", "72 pints", "48 each". */
  const counted = (i: Measured, count: number, digits = 2) => `${number(count, digits)} ${countWord(i, Math.abs(count))}`

  /**
   * An amount in base units as people say it: "3.46 bottles (2,425 ml)", or "48 each" for a thing
   * counted as itself. A sliver of a large count unit (one pint of a keg) is shown in base units only.
   */
  function amount(i: Measured, quantity: number): string {
    if (i.countUnitSize === 1) return base(i, quantity)
    const count = quantity / i.countUnitSize
    if (quantity !== 0 && Math.abs(count) < 0.05) return base(i, quantity) // not-policy: below a twentieth, the count rounds to nought
    return t('bar.screens.stock.counted', { count: counted(i, count), base: base(i, quantity) })
  }

  /** The units an amount may be typed in, the count unit first: bottles, cases, ml. */
  function entryUnits(i: Measured): EntryUnit[] {
    const baseUnit: EntryUnit = { value: 'base', size: 1, label: unitLabel(i.baseUnit) }
    const pack: EntryUnit[] = i.packSize && i.packName && i.packSize > 1 && i.packSize !== i.countUnitSize ? [{ value: 'pack', size: i.packSize, label: pluralOf(i.packName) }] : []
    // A thing counted as itself (a can) is counted in its base unit.
    if (i.countUnitSize === 1) return [baseUnit, ...pack]
    return [{ value: 'count', size: i.countUnitSize, label: countWord(i, 2) }, ...pack, baseUnit]
  }

  return { number, unitLabel, base, countWord, counted, amount, entryUnits }
}
