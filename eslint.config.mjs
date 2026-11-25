// G2: lint sem erro e sem warning em api/ e web/.
// noInlineConfig desliga comentários eslint-disable: violação não se esconde.
import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**'] },
  {
    files: ['api/**/*.{ts,mts,cts,js,mjs}', 'web/**/*.{ts,tsx,js,mjs}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    linterOptions: {
      noInlineConfig: true,
      reportUnusedDisableDirectives: 'error',
    },
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { args: 'all', argsIgnorePattern: '^_', caughtErrors: 'all', ignoreRestSiblings: false }],
      'no-unused-vars': 'off',
    },
  },
)
