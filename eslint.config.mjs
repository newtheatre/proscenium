// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  ignores: ['.generated/**', 'migrations/**', 'site/migrations/**', 'tests/fixtures/migrations/**'],
}, {
  rules: {
    // SQL is written in double quotes so its own single-quoted strings read naturally.
    '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
    // The kit and its scripts handle declarations whose shapes come from manifests at run time.
    '@typescript-eslint/no-explicit-any': 'off',
    // A short try { ... } catch { ... } on one line reads better than four.
    '@stylistic/max-statements-per-line': ['error', { max: 2 }],
    // UI-19: the browser's own dialogs cannot be styled, translated or tested. Use useConfirm or useUndo.
    'no-alert': 'error',
  },
}, {
  // Pages are named for their address (list, form), as Nuxt's router wants them.
  files: ['**/app/pages/**/*.vue'],
  rules: { 'vue/multi-word-component-names': 'off' },
})
