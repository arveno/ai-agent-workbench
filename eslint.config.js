import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'
import dataContract from './tools/eslint-rules/data-contract/index.js'

export default defineConfig([
  globalIgnores(['dist', '.cloudbase-packages']),
  {
    files: ['src/**/*.{ts,tsx,js,jsx}', 'tencent/functions/**/*.js', 'scripts/**/*.{js,mjs,cjs}'],
    plugins: {
      'data-contract': dataContract,
    },
    rules: {
      'data-contract/no-forbidden-fields': 'error',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
])
