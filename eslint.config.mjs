import js from '@eslint/js'
import vue from 'eslint-plugin-vue'
import ts from 'typescript-eslint'

export default ts.config(
  {
    ignores: [
      '.nuxt/**',
      '.output/**',
      'dist/**',
      'node_modules/**',
      'tmp/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'assignment/**',
      'bruno/**',
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...vue.configs['flat/essential'],
  { files: ['**/*.ts', '**/*.vue'], rules: { 'no-undef': 'off' } },
  { files: ['**/*.vue'], languageOptions: { parserOptions: { parser: ts.parser } } },
)
