// The bindings a practice request runs with (Practice mode, part 2, "The other bindings"): the store
// as DB, files and cache keys under the person's own prefix, and no queue, mail or mail reports.
import type { KitEnv } from '../context'
import { storeDatabase, type StoreStub } from './database'

/** The Durable Object stub of a person's store, by the name every caller uses. */
export function practiceStore(env: KitEnv, accountId: string): StoreStub & PracticeStoreControl {
  const namespace = env.PRACTICE as DurableObjectNamespace | undefined
  if (!namespace) throw new Error('No PRACTICE binding: practice mode needs the PracticeStore Durable Object')
  return namespace.get(namespace.idFromName(`practice:${accountId}`)) as unknown as StoreStub & PracticeStoreControl
}

/** What core asks of a store beyond statements. */
export interface PracticeStoreControl {
  /** Deletes the store's storage, files and cache keys now. */
  destroy: () => Promise<void>
  /** The session row, or null for a store never made. */
  sessionRow: () => Promise<Record<string, unknown> | null>
  /** When the store deletes itself if nothing moves it on, in UTC milliseconds. */
  endAt: (at: number) => Promise<void>
}

export const filesPrefix = (accountId: string) => `practice/${accountId}/`
export const cachePrefix = (accountId: string) => `practice:${accountId}:`
/** Where the Ended screen learns why a session ended, kept after the store itself is gone. */
export const endedKey = (accountId: string) => `practice-ended:${accountId}`

/** R2 for a practice store: writes under the person's prefix; reads fall back to the theatre's files. */
function practiceFiles(bucket: R2Bucket, accountId: string): R2Bucket {
  const own = (key: string) => `${filesPrefix(accountId)}${key}`
  return {
    put: (key: string, value: never, options?: R2PutOptions) => bucket.put(own(key), value, options),
    get: async (key: string, options?: R2GetOptions) => (await bucket.get(own(key), options as never)) ?? bucket.get(key, options as never),
    head: async (key: string) => (await bucket.head(own(key))) ?? bucket.head(key),
    delete: (keys: string | string[]) => bucket.delete(Array.isArray(keys) ? keys.map(own) : own(keys)),
    list: (options?: R2ListOptions) => bucket.list({ ...options, prefix: own(options?.prefix ?? '') }),
  } as unknown as R2Bucket
}

/** KV for a practice store: every key under the person's prefix, gone by the time the session can last. */
function practiceCache(kv: KVNamespace, accountId: string, endsBy: number): KVNamespace {
  const own = (key: string) => `${cachePrefix(accountId)}${key}`
  return {
    get: (key: string, options?: never) => kv.get(own(key), options),
    getWithMetadata: (key: string, options?: never) => kv.getWithMetadata(own(key), options),
    put: (key: string, value: never, options?: KVNamespacePutOptions) => {
      const now = Math.ceil(Date.now() / 1000) // not-policy: milliseconds to seconds
      const asked = Math.min(options?.expiration ?? Infinity, options?.expirationTtl ? now + options.expirationTtl : Infinity)
      const expiration = Math.max(now + 60, Math.min(asked, Math.ceil(endsBy / 1000))) // not-policy: KV's shortest expiry; milliseconds to seconds
      return kv.put(own(key), value, { metadata: options?.metadata, expiration })
    },
    delete: (key: string) => kv.delete(own(key)),
    list: (options?: KVNamespaceListOptions) => kv.list({ ...options, prefix: own(options?.prefix ?? '') }),
  } as unknown as KVNamespace
}

/** The bindings of a request in this person's store. */
export function practiceEnv(env: KitEnv, accountId: string, endsBy: number): KitEnv {
  const { JOBS_PROMPT: _prompt, JOBS_BULK: _bulk, EMAIL: _email, EMAIL_EVENTS: _events, ...kept } = env
  const practice: KitEnv = { ...kept, DB: storeDatabase(practiceStore(env, accountId)) }
  if (env.FILES) practice.FILES = practiceFiles(env.FILES, accountId)
  if (env.CACHE) practice.CACHE = practiceCache(env.CACHE, accountId, endsBy)
  return practice
}
