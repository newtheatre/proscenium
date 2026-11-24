// @ts-check
import sonarjs from 'eslint-plugin-sonarjs'
import withNuxt from './.nuxt/eslint.config.mjs'

// Quality ratchets (CONTRIBUTING.md, "Rules as code"): code written before these rules is listed in
// eslint-suppressions.json; new code meets them. Fixing a listed place and running
// `bun run lint:prune` shrinks the list.
const SIZE_AND_COMPLEXITY = {
  'complexity': ['error', 15],
  'sonarjs/cognitive-complexity': ['error', 15],
  'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
  'max-lines-per-function': ['error', { max: 80, skipBlankLines: true, skipComments: true }],
  'max-params': ['error', 4],
  'max-depth': ['error', 4],
}

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
}, {
  files: ['layers/**/*.{ts,vue}', 'site/**/*.{ts,vue}', 'scripts/**/*.ts'],
  ignores: ['**/tests/**'],
  plugins: { sonarjs },
  rules: {
    ...SIZE_AND_COMPLEXITY,
    // Outside the kit, a value's type is known; say it, or use unknown and narrow.
    '@typescript-eslint/no-explicit-any': 'error',
    // A component's contract is typed: defineProps<{...}>() and defineEmits<{...}>().
    'vue/define-props-declaration': ['error', 'type-based'],
    'vue/define-emits-declaration': ['error', 'type-based'],
    // A template past 200 lines holds a part that deserves its own component.
    'vue/max-lines-per-block': ['error', { template: 200, script: 250, skipBlankLines: true }],
    'vue/no-unused-properties': 'error',
    'vue/no-unused-refs': 'error',
    'vue/require-explicit-emits': 'error',
  },
}, {
  files: ['layers/core/kit/**/*.ts'],
  rules: { '@typescript-eslint/no-explicit-any': 'off' },
})
