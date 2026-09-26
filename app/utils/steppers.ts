// A public quantity stepper is thumbed on a phone, so the field and each button are at least 44px
// (issue 1329, K-101). Spread onto a `UInputNumber` with `v-bind`.
export const TOUCH_STEPPER = {
  class: 'w-36',
  size: 'xl',
  increment: { class: 'size-11 justify-center' },
  decrement: { class: 'size-11 justify-center' },
  ui: { base: 'min-h-11', increment: 'pe-0', decrement: 'ps-0' },
} as const
