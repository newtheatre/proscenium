// Thin wrappers over the file store and the cache, so a module never holds a binding. Workstream 3
// specifies files fully; live screens (workstream 6) arrive with the interface.
import { useContext } from './context'

function bucket(): R2Bucket {
  const files = useContext().env.FILES
  if (!files) throw new Error('No FILES binding')
  return files
}

function kv(): KVNamespace {
  const cache = useContext().env.CACHE
  if (!cache) throw new Error('No CACHE binding')
  return cache
}

export const files = {
  put: (key: string, body: ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob, options?: R2PutOptions) => bucket().put(key, body as any, options),
  get: (key: string) => bucket().get(key),
  head: (key: string) => bucket().head(key),
  delete: (key: string) => bucket().delete(key),
}

export const cache = {
  async get<T>(key: string): Promise<T | null> {
    return (await kv().get(key, 'json')) as T | null
  },
  async put(key: string, value: unknown, options: { ttl?: number } = {}): Promise<void> {
    await kv().put(key, JSON.stringify(value), options.ttl ? { expirationTtl: Math.max(60, options.ttl) } : undefined) // not-policy: KV's shortest expiry
  },
  delete: (key: string) => kv().delete(key),
}
