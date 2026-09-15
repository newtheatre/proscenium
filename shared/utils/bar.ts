import { z } from 'zod'

// The bar's vocabulary: what is stocked, what is sold, and how stock moves. Quantities are whole
// units of the item's own counting unit, exact for the same reason money is pence (0004).

export const STOCK_UNITS = ['ML', 'ITEM'] as const
export type StockUnit = (typeof STOCK_UNITS)[number]

export const STOCK_ITEM_STATUSES = ['ACTIVE', 'RETIRED'] as const
export type StockItemStatus = (typeof STOCK_ITEM_STATUSES)[number]

export const PRODUCT_STATUSES = ['ACTIVE', 'HIDDEN', 'RETIRED'] as const
export type ProductStatus = (typeof PRODUCT_STATUSES)[number]

// Confirmed none is a recorded answer and unknown is the absence of one, which the till has to
// tell apart rather than showing the same blank for both (F-107 criterion 3).
export const ALLERGEN_STATES = ['UNKNOWN', 'NONE', 'RECORDED'] as const
export type AllergenState = (typeof ALLERGEN_STATES)[number]

// Complete at birth: widening a CHECK is a table rebuild, and a rebuild of an append-only table
// is refused outright (0010). The kinds no screen writes yet are listed with the path that will.
export const STOCK_MOVEMENT_KINDS = [
  'DELIVERY',
  'SALE',
  'COMP',
  'STOCKTAKE',
  'WASTAGE',
  'TRANSFER',
  'ADJUST',
  'REVERSAL',
] as const
export type StockMovementKind = (typeof STOCK_MOVEMENT_KINDS)[number]

// The stock screen, or the story that owns the path instead. A kind this screen does not write is
// refused there quoting its owner, so nobody hand-posts a depletion the till answers for.
export const MOVEMENT_WRITERS: Record<StockMovementKind, string> = {
  DELIVERY: 'the stock screen',
  SALE: 'a till sale (F-105)',
  COMP: 'an approved comp (F-110)',
  STOCKTAKE: 'applying a stocktake (F-115)',
  WASTAGE: 'the stock screen',
  TRANSFER: 'a transfer between venue bars (F-202)',
  ADJUST: 'the stock screen',
  REVERSAL: 'the stock screen',
}

export const HAND_ENTERED_KINDS: readonly StockMovementKind[] = STOCK_MOVEMENT_KINDS
  .filter(kind => MOVEMENT_WRITERS[kind] === 'the stock screen')

// A vocabulary rather than free text: waste has to be reportable (F-204), and an append-only row
// cannot be scrubbed later if somebody types a name into it (0010, 0011).
export const MOVEMENT_REASONS = [
  'BREAKAGE',
  'SPILLAGE',
  'OUT_OF_DATE',
  'LINE_CLEANING',
  'QUALITY',
  'TRAINING',
  'COUNT_CORRECTION',
  'OPENING_BALANCE',
  'OTHER',
] as const
export type MovementReason = (typeof MOVEMENT_REASONS)[number]

// The kinds a person types in and therefore has to explain. A delivery explains itself.
export const KINDS_NEEDING_A_REASON: readonly StockMovementKind[] = ['WASTAGE', 'ADJUST', 'REVERSAL']

// The size a variant sells at, and the key a category default resolves on (F-121). A list rather
// than a CHECK: a new size must not need a rebuild of a table an append-only one points at.
export const SERVING_KINDS = [
  'item',
  'bottle',
  'can',
  'pint',
  'half',
  '125ml',
  '175ml',
  '250ml',
  'single',
  'double',
] as const
export type ServingKind = (typeof SERVING_KINDS)[number]

export const VARIANT_STATUSES = ['ACTIVE', 'RETIRED'] as const
export type VariantStatus = (typeof VARIANT_STATUSES)[number]

// How a product sells, read from its variants and never stored, so an edit cannot contradict the
// shape it was created under (0017, amended 15 September 2026). UNSET is a product with no sizes.
export const PRODUCT_SHAPES = ['SIMPLE', 'MEASURED', 'RECIPE'] as const
export type ProductShape = (typeof PRODUCT_SHAPES)[number] | 'UNSET'

export const MEASURE_PRESET_IDS = ['WINE', 'SPIRITS', 'DRAUGHT', 'PACKAGED'] as const
export type MeasurePresetId = (typeof MEASURE_PRESET_IDS)[number]

export interface MeasurePresetSize {
  servingKind: ServingKind
  qty: number
}

export interface MeasurePreset {
  id: MeasurePresetId
  name: string
  unit: StockUnit
  // What the container usually holds, or null where it varies and the person has to say (a keg).
  containerMl: number | null
  sizes: readonly MeasurePresetSize[]
  // Words in a category's name that preselect this preset; matched on the start of a word.
  words: readonly string[]
}

// The sizes the bar actually pours, over the serving kinds the vocabulary already holds: a preset
// may not invent a kind, or a category's default prices would stop resolving (F-121, F-127).
export const MEASURE_PRESETS: readonly MeasurePreset[] = [
  {
    id: 'WINE',
    name: 'Wine',
    unit: 'ML',
    containerMl: 750,
    sizes: [
      { servingKind: 'bottle', qty: 750 },
      { servingKind: '250ml', qty: 250 },
      { servingKind: '175ml', qty: 175 },
      { servingKind: '125ml', qty: 125 },
    ],
    words: ['wine', 'red', 'white', 'rose', 'prosecco', 'champagne', 'fizz'],
  },
  {
    id: 'SPIRITS',
    name: 'Spirits',
    unit: 'ML',
    containerMl: 700,
    sizes: [
      { servingKind: 'single', qty: 25 },
      { servingKind: 'double', qty: 50 },
    ],
    words: ['spirit', 'gin', 'vodka', 'rum', 'whisky', 'whiskey', 'tequila', 'brandy', 'liqueur'],
  },
  {
    id: 'DRAUGHT',
    name: 'Draught',
    unit: 'ML',
    containerMl: null,
    sizes: [
      { servingKind: 'pint', qty: 568 },
      { servingKind: 'half', qty: 284 },
    ],
    words: ['draught', 'draft', 'keg', 'cask', 'tap', 'pint'],
  },
  {
    id: 'PACKAGED',
    name: 'Bottles and cans',
    unit: 'ITEM',
    containerMl: null,
    sizes: [{ servingKind: 'item', qty: 1 }],
    words: ['can', 'bottle', 'packaged', 'soft', 'mixer', 'juice', 'water'],
  },
]

export const MAX_BAR_NAME = 80
export const MAX_ALLERGEN_NOTE = 500

// A pint is pounds, not thousands, so this is what catches pounds typed into a field that takes
// pence.
export const MAX_VARIANT_PRICE_PENCE = 100_000

// A crate of mixers is hundreds, not millions, so this is what catches a quantity typed into the
// wrong field.
export const MAX_MOVEMENT_QTY = 1_000_000
export const MAX_UNIT_COST_PENCE = 1_000_000

const label = (what: string) => z.string().trim().min(1, `A ${what} needs a name`).max(MAX_BAR_NAME)
  // A name is a label, so it holds no address: the audit detail carries both names (0011).
  .refine(value => !value.includes('@'), 'A name is a label, so it holds no address')

// A cleared field arrives as an empty string, which is a colour nobody chose rather than a
// malformed one, so it becomes null instead of a refusal.
const hexColour = z.string().trim()
  .transform(value => value || null)
  .refine(value => value === null || /^#[0-9a-f]{6}$/i.test(value), 'A colour is six hexadecimal characters after a hash')

export const categoryForm = z.object({
  name: label('category'),
  sort: z.number().int().min(0).max(999).default(0),
  colour: hexColour.nullish(),
})

export const productForm = z.object({
  name: label('product'),
  categoryId: z.string().trim().min(1, 'A product belongs to a category'),
  sort: z.number().int().min(0).max(999).default(0),
  staffedOnly: z.boolean().default(false),
  ageRestricted: z.boolean().default(false),
  allergenState: z.enum(ALLERGEN_STATES).default('UNKNOWN'),
  allergenNote: z.string().trim().max(MAX_ALLERGEN_NOTE).nullish(),
}).refine(
  value => value.allergenState !== 'RECORDED' || Boolean(value.allergenNote),
  { message: 'Recorded allergens need the note that records them', path: ['allergenNote'] },
).refine(
  value => value.allergenState !== 'UNKNOWN' || !value.allergenNote,
  { message: 'A note is information, so it cannot be filed as unknown', path: ['allergenState'] },
)

export const productStatusForm = z.object({ status: z.enum(PRODUCT_STATUSES) })

export const stockItemForm = z.object({
  name: label('stocked item'),
  unit: z.enum(STOCK_UNITS),
  containerMl: z.number().int().positive().max(100_000).nullish(),
  parQty: z.number().int().nonnegative().max(MAX_MOVEMENT_QTY).nullish(),
  category: z.string().trim().max(MAX_BAR_NAME).nullish(),
  ageRestricted: z.boolean().default(true),
  allergenNotes: z.string().trim().max(MAX_ALLERGEN_NOTE).nullish(),
}).refine(
  value => value.unit === 'ML' || !value.containerMl,
  { message: 'A container size belongs to something measured in millilitres', path: ['containerMl'] },
)

export const stockItemStatusForm = z.object({ status: z.enum(STOCK_ITEM_STATUSES) })

// Signed: a delivery adds and wastage takes away, and the sign is the caller's to state rather
// than something inferred from the kind (F-114 criterion 3).
export const movementForm = z.object({
  itemId: z.string().trim().min(1, 'A movement is about a stocked item'),
  kind: z.enum(STOCK_MOVEMENT_KINDS),
  qty: z.number().int().refine(value => value !== 0, 'A movement of nothing is not a movement')
    .refine(value => Math.abs(value) <= MAX_MOVEMENT_QTY, 'That quantity is larger than the bar holds'),
  reason: z.enum(MOVEMENT_REASONS).nullish(),
  unitCostPence: z.number().int().nonnegative().max(MAX_UNIT_COST_PENCE).nullish(),
  reversesId: z.string().trim().min(1, 'Say which movement it reverses').nullish(),
})

// What the stock screen's own modal holds. A form validates its whole state, so a screen that is
// not about one stocked item cannot be validated against the schema that names one.
export const movementEntryForm = movementForm.omit({ itemId: true, reversesId: true }).refine(
  value => !KINDS_NEEDING_A_REASON.includes(value.kind) || Boolean(value.reason),
  { message: 'That needs a reason', path: ['reason'] },
)

export const variantForm = z.object({
  productId: z.string().trim().min(1, 'A serving size belongs to a product'),
  servingKind: z.enum(SERVING_KINDS),
  label: z.string().trim().min(1, 'A serving size needs a label').max(MAX_BAR_NAME),
  sort: z.number().int().min(0).max(999).default(0),
})

// An edit does not move a variant between products: its price series and its sales belong to the
// product it was sold under (F-112 criterion 5).
export const variantEditForm = variantForm.omit({ productId: true })

export const variantStatusForm = z.object({ status: z.enum(VARIANT_STATUSES) })

// What pouring one of these consumes, stated in the stocked item's own units and validated
// positive. Quantity is independent of price (F-112 criterion 2).
export const componentForm = z.object({
  itemId: z.string().trim().min(1, 'A recipe line is about a stocked item'),
  qty: z.number().int().positive('A depletion is a quantity of something').max(MAX_MOVEMENT_QTY),
})

export const componentsForm = z.object({
  components: z.array(componentForm).max(20),
}).refine(
  value => new Set(value.components.map(component => component.itemId)).size === value.components.length,
  { message: 'A stocked item appears once in a recipe, at the quantity a serving uses', path: ['components'] },
)

// A choice's own option: a stocked item at its own quantity, same shape as a recipe line
// (F-113 criterion 2).
export const choiceGroupOptionForm = z.object({
  itemId: z.string().trim().min(1, 'An option is about a stocked item'),
  qty: z.number().int().positive('An option is a quantity of something').max(MAX_MOVEMENT_QTY),
})

export const choiceGroupForm = z.object({
  name: label('choice group'),
  options: z.array(choiceGroupOptionForm).min(1, 'A choice group needs at least one option').max(20),
}).refine(
  value => new Set(value.options.map(option => option.itemId)).size === value.options.length,
  { message: 'A stocked item appears once per choice group, at the quantity a choice uses', path: ['options'] },
)

// Attaches or clears a variant's one choice group. `includedInPrice` is the free mixer (0017):
// meaningless with no group attached, so it is dropped rather than validated when clearing.
export const variantChoiceForm = z.object({
  choiceGroupId: z.string().trim().min(1, 'Say which choice group you mean').nullable(),
  qty: z.number().int().positive('A depletion is a quantity of something').max(MAX_MOVEMENT_QTY).default(1),
  includedInPrice: z.boolean().default(false),
})

// A civil date, the Europe/London day a price takes effect on. A past one is allowed and already
// applies; a future one waits (F-116 criterion 5).
const civilDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'A date reads as YYYY-MM-DD')

export const priceForm = z.object({
  pricePence: z.number().int().nonnegative().max(MAX_VARIANT_PRICE_PENCE),
  effectiveFrom: civilDate,
})

// A category's own default, per serving kind, dated and append-only the same way (0017, F-121
// criterion 1). Resolution reads it only when the variant has no price row of its own.
export const categoryPriceForm = z.object({
  servingKind: z.enum(SERVING_KINDS),
  pricePence: z.number().int().nonnegative().max(MAX_VARIANT_PRICE_PENCE),
  effectiveFrom: civilDate,
})

// One serving a price hangs off. A null price leaves it to the category default, which is what
// lets a size the bar has not priced yet hold the product HIDDEN rather than refuse the set-up.
const setupServingForm = z.object({
  servingKind: z.enum(SERVING_KINDS),
  label: z.string().trim().min(1, 'A serving size needs a label').max(MAX_BAR_NAME),
  pricePence: z.number().int().nonnegative().max(MAX_VARIANT_PRICE_PENCE).nullish(),
})

const setupSizeForm = setupServingForm.extend({
  qty: z.number().int().positive('A serving depletes a quantity of something').max(MAX_MOVEMENT_QTY),
})

// The stocked item a product pours: one already on the list, or one created in the same
// submission, which is what turns a can of cider from four screens into one (F-127 criterion 4).
const setupItemForm = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('EXISTING'),
    itemId: z.string().trim().min(1, 'Say which stocked item it pours'),
  }),
  z.object({ mode: z.literal('NEW'), item: stockItemForm }),
])

const setupDeliveryForm = z.object({
  qty: z.number().int().positive('A delivery is a quantity of something').max(MAX_MOVEMENT_QTY),
  unitCostPence: z.number().int().nonnegative().max(MAX_UNIT_COST_PENCE).nullish(),
})

const setupChoiceForm = z.object({
  group: choiceGroupForm,
  qty: z.number().int().positive('A depletion is a quantity of something').max(MAX_MOVEMENT_QTY).default(1),
  includedInPrice: z.boolean().default(false),
})

const DEFAULT_SERVING = { servingKind: 'item', label: 'Each', pricePence: null } as const

// What the set-up wizard submits, discriminated on the shape the person chose (F-127). The
// product, item and recipe halves are the existing forms: a wizard accepts nothing a screen would not.
export const productSetupForm = z.discriminatedUnion('shape', [
  z.object({
    shape: z.literal('SIMPLE'),
    product: productForm,
    item: setupItemForm,
    serving: setupSizeForm.default({ ...DEFAULT_SERVING, qty: 1 }),
    opening: setupDeliveryForm.nullish(),
  }),
  z.object({
    shape: z.literal('MEASURED'),
    product: productForm,
    item: setupItemForm,
    sizes: z.array(setupSizeForm).min(1, 'Tick at least one serving size').max(SERVING_KINDS.length),
    opening: setupDeliveryForm.nullish(),
  }),
  z.object({
    shape: z.literal('RECIPE'),
    product: productForm,
    serving: setupServingForm.default(DEFAULT_SERVING),
    components: z.array(componentForm).min(1, 'A recipe is made of at least one stocked item').max(20),
    choice: setupChoiceForm.nullish(),
  }),
]).superRefine((value, ctx) => {
  if (value.shape === 'MEASURED') {
    const kinds = value.sizes.map(size => size.servingKind)
    if (new Set(kinds).size !== kinds.length) {
      ctx.addIssue({ code: 'custom', message: 'Each serving size is set up once, at the quantity it pours', path: ['sizes'] })
    }
  }
  if (value.shape === 'RECIPE') {
    const items = value.components.map(component => component.itemId)
    if (new Set(items).size !== items.length) {
      ctx.addIssue({ code: 'custom', message: 'A stocked item appears once in a recipe, at the quantity a serving uses', path: ['components'] })
    }
  }
})

export type ProductSetupInput = z.output<typeof productSetupForm>

export type CategoryInput = z.output<typeof categoryForm>
export type ProductInput = z.output<typeof productForm>
export type StockItemInput = z.output<typeof stockItemForm>
export type MovementInput = z.output<typeof movementForm>

// What the console reads. Nothing public is built from these: the bar's two surfaces are the
// console and the till, and both are signed in.
export interface BarCategory {
  id: string
  name: string
  sort: number
  colour: string | null
  productCount: number
}

export interface BarProduct {
  id: string
  name: string
  categoryId: string
  categoryName: string
  sort: number
  status: ProductStatus
  staffedOnly: boolean
  ageRestricted: boolean
  allergenState: AllergenState
  allergenNote: string | null
  everSold: boolean
}

export interface VariantComponent {
  id: string
  itemId: string | null
  itemName: string | null
  unit: StockUnit | null
  choiceGroupId: string | null
  choiceGroupName: string | null
  qty: number
  includedInPrice: boolean
}

export interface ChoiceGroupOption {
  id: string
  itemId: string
  itemName: string
  unit: StockUnit
  qty: number
  sort: number
}

// A choice a variant can offer, such as a spirit's mixer (0017). Options are stocked items, so a
// chosen one depletes at its own quantity (F-113 criterion 2).
export interface ChoiceGroup {
  id: string
  name: string
  options: ChoiceGroupOption[]
}

// Which level supplied a variant's resolved price, so a stray variant override hiding a category
// change is visible at a glance (F-121 criterion 5). Null means neither prices it: refuse to sell.
export type BarPriceSource = 'variant' | 'category' | null

export interface ProductVariant {
  id: string
  productId: string
  servingKind: ServingKind
  label: string
  status: VariantStatus
  sort: number
  // Variant price first, category default second: an explicit variant price always wins, and null
  // means neither prices it, so the till has nothing to charge (0017, F-121 criterion 2).
  pricePence: number | null
  priceSource: BarPriceSource
  // A future-dated row makes this true while `pricePence` still reads null: append-only, so it
  // can only be retired (F-112 criterion 5).
  everPriced: boolean
  everSold: boolean
  components: VariantComponent[]
}

export interface VariantPrice {
  id: string
  variantId: string
  pricePence: number
  effectiveFrom: string
  createdAt: number
  createdBy: string | null
  // Insertion order (the row's `rowid`), the tiebreak when two share a `createdAt` second.
  seq: number
  // True for the row that wins today, so the history says which one the till is reading.
  effective: boolean
}

export interface CategoryPrice {
  id: string
  categoryId: string
  servingKind: ServingKind
  pricePence: number
  effectiveFrom: string
  createdAt: number
  createdBy: string | null
  seq: number
  // True for the row that wins today, grouped within its own serving kind (F-121 criterion 1).
  effective: boolean
}

// The contract `ledger_lines.price_ref` is written under: which row resolved a sale line's price,
// so a later default change never restates it (F-121 criterion 4, consumed by F-105).
export function priceRef(source: Exclude<BarPriceSource, null>, priceId: string): string {
  return `${source}:${priceId}`
}

export interface StockItem {
  id: string
  name: string
  unit: StockUnit
  containerMl: number | null
  parQty: number | null
  category: string | null
  ageRestricted: boolean
  allergenNotes: string | null
  status: StockItemStatus
  onHand: number
  hasMovements: boolean
}

export interface StockMovement {
  id: string
  itemId: string
  itemName: string
  unit: StockUnit
  qty: number
  kind: StockMovementKind
  reason: MovementReason | null
  unitCostPence: number | null
  refTable: string | null
  refId: string | null
  reversesId: string | null
  actorId: string | null
  createdAt: number
  // Whether a later movement cancels this one, so a screen does not offer to reverse it twice.
  reversed: boolean
}

const WORDS: Record<string, string> = {
  'ML': 'Millilitres',
  'ITEM': 'Whole items',
  'ACTIVE': 'On the till',
  'HIDDEN': 'Hidden',
  'RETIRED': 'Retired',
  'UNKNOWN': 'No information recorded',
  'NONE': 'Confirmed no allergens',
  'RECORDED': 'Allergens recorded',
  'DELIVERY': 'Delivery',
  'SALE': 'Sale',
  'COMP': 'Comp',
  'STOCKTAKE': 'Stocktake adjustment',
  'WASTAGE': 'Wastage',
  'TRANSFER': 'Transfer',
  'ADJUST': 'Adjustment',
  'REVERSAL': 'Reversal',
  'BREAKAGE': 'Breakage',
  'SPILLAGE': 'Spillage',
  'OUT_OF_DATE': 'Out of date',
  'LINE_CLEANING': 'Line cleaning',
  'QUALITY': 'Quality',
  'TRAINING': 'Training',
  'COUNT_CORRECTION': 'Count correction',
  'OPENING_BALANCE': 'Opening balance',
  'OTHER': 'Other',
  'item': 'Each',
  'bottle': 'Bottle',
  'can': 'Can',
  'pint': 'Pint',
  'half': 'Half',
  '125ml': '125ml',
  '175ml': '175ml',
  '250ml': '250ml',
  'single': 'Single',
  'double': 'Double',
}

// The latest row on or before the day; `seq` (insertion order) breaks a tie within one second.
// `effectivePriceColumn` orders identically (F-116 criteria 1 and 3).
export function effectivePriceRow<T extends { effectiveFrom: string, createdAt: number, seq: number }>(
  prices: T[],
  on: string,
): T | null {
  const eligible = prices.filter(price => price.effectiveFrom <= on)
  if (eligible.length === 0) return null
  return eligible.reduce((winner, price) => {
    if (price.effectiveFrom !== winner.effectiveFrom) return price.effectiveFrom > winner.effectiveFrom ? price : winner
    if (price.createdAt !== winner.createdAt) return price.createdAt > winner.createdAt ? price : winner
    return price.seq > winner.seq ? price : winner
  })
}

export function measurePreset(id: MeasurePresetId): MeasurePreset | null {
  return MEASURE_PRESETS.find(preset => preset.id === id) ?? null
}

// A suggestion, not a rule: the wizard preselects a preset from the category's name and the person
// can pick another. Nothing matched means nothing preselected, never a guessed set of sizes.
export function presetForCategory(name: string): MeasurePresetId | null {
  const words = name.toLowerCase().split(/[^a-z]+/).filter(Boolean)
  const found = MEASURE_PRESETS.find(preset =>
    words.some(word => preset.words.some(match => word.startsWith(match))))
  return found?.id ?? null
}

// Shape is a reading of the variants, so nothing stores it and an edit cannot contradict it (0017,
// amended 15 September 2026). A choice group is a choice, not a second ingredient.
export function productShape(variants: readonly {
  status: VariantStatus
  components: readonly { itemId: string | null }[]
}[]): ProductShape {
  const live = variants.filter(variant => variant.status === 'ACTIVE')
  if (live.length === 0) return 'UNSET'
  const items = new Set<string>()
  let severalPerServing = false
  for (const variant of live) {
    const poured = variant.components.filter(component => component.itemId !== null)
    if (poured.length > 1) severalPerServing = true
    for (const component of poured) items.add(component.itemId!)
  }
  if (severalPerServing || items.size > 1) return 'RECIPE'
  return live.length > 1 ? 'MEASURED' : 'SIMPLE'
}

export function says(value: string | null): string {
  return value === null ? '' : WORDS[value] ?? value
}

// A display of a sum. On-hand is never a stored figure, so nothing here rounds or caches one
// (F-114 criterion 2).
export function saysQuantity(qty: number, unit: StockUnit): string {
  return unit === 'ML' ? `${qty} ml` : `${qty}`
}

// Negative reads as minus-sign-before-currency, never a bare hyphen glued to the pound sign (#908).
export function saysMoney(pence: number): string {
  return pence < 0 ? `−£${(-pence / 100).toFixed(2)}` : `£${(pence / 100).toFixed(2)}`
}

export type StockStatus = 'OUT' | 'BELOW_PAR' | 'OK'

// The par-comparison signal a manager scans the list for (#907). Par is advisory (F-120): an
// item with none set carries no status, matching the order list's own "unconfigured" treatment.
export function stockStatus(onHand: number, parQty: number | null): StockStatus | null {
  if (onHand <= 0) return 'OUT'
  if (parQty === null) return null
  return onHand < parQty ? 'BELOW_PAR' : 'OK'
}

export function saysStockStatus(status: StockStatus): string {
  return status === 'OUT' ? 'Out' : status === 'BELOW_PAR' ? 'Below par' : 'OK'
}
