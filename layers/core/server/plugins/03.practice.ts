// Installs core's practice gate (Practice mode, part 3), so a marked request runs in the person's
// practice store, and the guard that stops any server fetch made inside a store (O2).
import { defineNitroPlugin } from 'nitropack/runtime'
import { guardOutsideCalls, setPracticeGate } from '#kit/practice/gate'
import { practiceGate } from '../practice/gate'

export default defineNitroPlugin(() => {
  setPracticeGate(practiceGate)
  guardOutsideCalls()
})
