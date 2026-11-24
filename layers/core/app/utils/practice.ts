// The practice mark on a request (Practice mode, M1): added as a plain object, since the server
// render's fetch spreads the options' headers over the visitor's own and a Headers object spreads to nothing.
import { PRACTICE_HEADER } from '../../shared/practice'

const READS = ['GET', 'HEAD', 'OPTIONS']

/** The options with the practice mark added. */
export function withPracticeMark<T>(options: T): T {
  const o = (options ?? {}) as { headers?: HeadersInit }
  return { ...o, headers: { ...Object.fromEntries(new Headers(o.headers)), [PRACTICE_HEADER]: '1' } } as T
}

/** Whether a request's options make it a change rather than a read. */
export function isChangeRequest(options: unknown): boolean {
  return !READS.includes(((options as { method?: string } | undefined)?.method ?? 'GET').toUpperCase())
}

/** Removes every device copy and waiting write a practice tab kept, so nothing outlives the session. */
export function forgetPracticeCopies(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const name = localStorage.key(i)
      if (name?.startsWith('proscenium:') && name.includes(':practice:')) localStorage.removeItem(name)
    }
  }
  catch {
    // Storage refused: there are no copies to forget.
  }
}
