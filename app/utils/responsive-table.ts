// A secondary column at 390px pushes every row action off-screen behind a horizontal scroll
// (issue 922). Hidden below sm, its content moves into the primary cell's own sm:hidden line.
export const HIDE_BELOW_SM = 'hidden sm:table-cell'

// A UTable column's own `meta` for a money or quantity column (0032, K-101): one shape, not a
// copy in every screen that has one.
export const RIGHT_ALIGNED = { class: { td: 'text-right whitespace-nowrap' } }
