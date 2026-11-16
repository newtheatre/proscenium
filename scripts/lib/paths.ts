// Paths the build scripts share.
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const KIT = join(ROOT, 'layers/core/kit')
export const GENERATED = join(ROOT, '.generated')
export const rel = (path: string) => relative(ROOT, path).split('\\').join('/')
export const abs = (path: string) => join(ROOT, path)
