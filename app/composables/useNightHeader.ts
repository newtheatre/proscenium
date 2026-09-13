import { onScopeDispose, watchEffect } from 'vue'
import type { Ref } from 'vue'

// What a show-night screen puts in the shell's header. Everything imported rather than
// auto-imported, because the unit test runs this outside Nuxt (as useNightCache is).

export interface NightSubject { title: string, meta: string | null }

export interface NightHeaderState {
  eyebrow: string
  // What the screen itself named, and what the shell knows about tonight when it named nothing.
  subject: NightSubject | null
  fallback: NightSubject | null
}

export const DEFAULT_EYEBROW = 'Show night'
export const DEFAULT_SUBJECT: NightSubject = { title: 'Tonight', meta: null }

// Each binding writes its own field and reads none of the others: one that spread the whole
// state into a new object woke every other binding on each write, without end (issue 1018).
export function bindNightEyebrow(header: Ref<NightHeaderState>, eyebrow: () => string): void {
  // Eagerly as well as reactively: a watcher does not run during a server render, and a header
  // filled in only on the client is a hydration mismatch on every show-night screen.
  header.value.eyebrow = eyebrow()
  watchEffect(() => {
    header.value.eyebrow = eyebrow()
  })
  onScopeDispose(() => {
    header.value.eyebrow = DEFAULT_EYEBROW
  })
}

export function bindNightSubject(header: Ref<NightHeaderState>, subject: () => NightSubject): void {
  // Eagerly as well, for the same reason `bindNightEyebrow` is.
  header.value.subject = subject()
  watchEffect(() => {
    header.value.subject = subject()
  })
  onScopeDispose(() => {
    header.value.subject = null
  })
}

export function bindNightFallbackSubject(header: Ref<NightHeaderState>, fallback: () => NightSubject | null): void {
  watchEffect(() => {
    header.value.fallback = fallback()
  })
}
