// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  // A worktree is a checkout of this repo inside itself. Linting it fails on
  // its unbuilt .nuxt and would double-report every file.
  { ignores: ['.claude/worktrees/**'] },
)
