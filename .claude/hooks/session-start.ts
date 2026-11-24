// SessionStart: a fresh clone has no node_modules or generated registry, and every check needs both.
import { existsSync } from 'node:fs'
import { $ } from 'bun'

if (!existsSync('node_modules') || !existsSync('.generated')) await $`bun install`.nothrow().quiet()
