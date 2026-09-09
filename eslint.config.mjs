// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  rules: {
    // The workaround 0053 refuses: it discards route-literal and response-type checking
    // together. An explicit generic on the call keeps the route checked (0053).
    'no-restricted-syntax': ['error', {
      selector: 'TSAsExpression[typeAnnotation.type=\'TSFunctionType\'] > TSAsExpression[typeAnnotation.type=\'TSUnknownKeyword\']',
      message: 'Give the call an explicit response generic instead (0053), not a cast through unknown to a function type.',
    }],
  },
})
